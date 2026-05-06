// ==UserScript==
// @name           NeuroSort
// @ignorecache
// ==/UserScript==
// VERSION 1.1.13 - NeuroSort - AI-powered tab organization for Zen Browser
// Features: Undo support, context menu, history, group stats, domain-based categorization fallback, rate limiting
(() => {
  'use strict';

  // ============================================================================
  // PREFERENCE KEYS
  // ============================================================================

  const PREF = {
    ENABLED: 'extensions.neurosort.enabled',
    AUTO_TIDY: 'extensions.neurosort.auto_tidy',
    AUTO_TIDY_THRESHOLD: 'extensions.neurosort.auto_tidy_threshold',
    AUTO_TIDY_COOLDOWN: 'extensions.neurosort.auto_tidy_cooldown',
    PROVIDER: 'extensions.neurosort.provider',
    MIN_GROUP_SIZE: 'extensions.neurosort.min_group_size',
    PRESERVE_PINNED: 'extensions.neurosort.preserve_pinned',
    USE_EXISTING_GROUPS: 'extensions.neurosort.use_existing_groups',
    FETCH_DESCRIPTIONS: 'extensions.neurosort.fetch_descriptions',
    DEBUG: 'extensions.neurosort.debug',

    // OpenAI
    OPENAI_API_KEY: 'extensions.neurosort.openai.api_key',
    OPENAI_MODEL: 'extensions.neurosort.openai.model',
    OPENAI_ENDPOINT: 'extensions.neurosort.openai.endpoint',

    // Gemini
    GEMINI_API_KEY: 'extensions.neurosort.gemini.api_key',
    GEMINI_MODEL: 'extensions.neurosort.gemini.model',

    // Ollama
    OLLAMA_ENDPOINT: 'extensions.neurosort.ollama.endpoint',
    OLLAMA_MODEL: 'extensions.neurosort.ollama.model',

    // Custom
    CUSTOM_ENDPOINT: 'extensions.neurosort.custom.endpoint',
    CUSTOM_API_KEY: 'extensions.neurosort.custom.api_key',
    CUSTOM_MODEL: 'extensions.neurosort.custom.model',
    CUSTOM_FORMAT: 'extensions.neurosort.custom.format',

    // Keyboard Shortcut
    KEYBOARD_SHORTCUT: 'extensions.neurosort.keyboard_shortcut',

    // Setup
    SETUP_COMPLETE: 'extensions.neurosort.setup_complete',
  };

  const AI_CHUNK_SIZE = 60;
  const LARGE_BATCH_THRESHOLD = 80;
  const METADATA_BATCH_SIZE = 40;
  const DEFAULT_MAX_GROUP_SIZE = 24;
  const STRICT_MAX_GROUP_SIZE = 18;
  const YOUTUBE_MAX_GROUP_SIZE = 12;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const chunkArray = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  };

  // ============================================================================
  // LOGGING
  // ============================================================================

  const log = (...args) => {
    if (getPref(PREF.DEBUG, false)) {
      console.log('[NeuroSort]', ...args);
    }
  };

  const logError = (...args) => {
    console.error('[NeuroSort]', ...args);
  };

  // ============================================================================
  // PREFERENCE HELPERS
  // ============================================================================

  const getPref = (prefName, defaultValue = null) => {
    try {
      const prefService = Services.prefs;
      if (prefService.prefHasUserValue(prefName)) {
        switch (prefService.getPrefType(prefName)) {
          case prefService.PREF_STRING:
            return prefService.getStringPref(prefName);
          case prefService.PREF_INT:
            return prefService.getIntPref(prefName);
          case prefService.PREF_BOOL:
            return prefService.getBoolPref(prefName);
        }
      }
    } catch (e) {
      log(`Error reading preference ${prefName}:`, e);
    }
    return defaultValue;
  };

  const parseKeyboardShortcut = (shortcut) => {
    if (!shortcut || typeof shortcut !== 'string') {
      return null;
    }

    const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
    const modifiers = {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    let key = null;

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') {
        modifiers.ctrl = true;
      } else if (part === 'alt') {
        modifiers.alt = true;
      } else if (part === 'shift') {
        modifiers.shift = true;
      } else if (part === 'meta' || part === 'cmd' || part === 'command') {
        modifiers.meta = true;
      } else if (part.length === 1) {
        key = part;
      } else if (part.length > 1) {
        key = part;
      }
    }

    if (!key) return null;

    return { modifiers, key };
  };

  const formatShortcutForDisplay = (shortcut) => {
    if (!shortcut) return '';

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const parts = shortcut.toLowerCase().split('+').map(p => p.trim());

    return parts.map(part => {
      if (part === 'ctrl' || part === 'control') {
        return isMac ? '\u2318' : 'Ctrl';
      } else if (part === 'alt') {
        return isMac ? '\u2325' : 'Alt';
      } else if (part === 'shift') {
        return isMac ? '\u21E7' : 'Shift';
      } else if (part === 'meta' || part === 'cmd' || part === 'command') {
        return '\u2318';
      } else {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
    }).join(isMac ? '' : '+');
  };

  const matchesKeyboardEvent = (shortcut, event) => {
    const parsed = parseKeyboardShortcut(shortcut);
    if (!parsed) return false;

    const { modifiers, key } = parsed;
    const isMac = navigator.platform.toLowerCase().includes('mac');

    const eventKey = event.key.toLowerCase();
    const shortcutKey = key.toLowerCase();

    if (eventKey !== shortcutKey && eventKey !== shortcutKey.charAt(0)) {
      return false;
    }

    if (isMac) {
      if (modifiers.ctrl !== event.metaKey) return false;
    } else {
      if (modifiers.ctrl !== event.ctrlKey) return false;
    }

    if (modifiers.alt !== event.altKey) return false;
    if (modifiers.shift !== event.shiftKey) return false;
    if (modifiers.meta !== event.metaKey && !isMac) return false;

    return true;
  };

  // ============================================================================
  // GROUP COLORS
  // ============================================================================

  const GROUP_COLORS = [
    'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'orange', 'cyan', 'gray'
  ];

  let colorIndex = 0;

  const getNextGroupColor = () => {
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    colorIndex++;
    return color;
  };

  const generateTabId = (tab) => {
    return tab.linkedBrowser?.browserId ||
      tab.getAttribute('tabbrowser-tab') ||
      `tab-${Array.from(gBrowser.tabs).indexOf(tab)}-${Date.now()}`;
  };

  class SortHistory {
    constructor(maxSize = 5) {
      this.history = [];
      this.maxSize = maxSize;
    }

    push(entry) {
      this.history.push(entry);
      if (this.history.length > this.maxSize) {
        this.history.shift();
      }
      log('Sort history pushed, size:', this.history.length);
    }

    pop() {
      return this.history.pop();
    }

    peek() {
      return this.history.length > 0 ? this.history[this.history.length - 1] : null;
    }

    isEmpty() {
      return this.history.length === 0;
    }

    clear() {
      this.history = [];
    }

    getLength() {
      return this.history.length;
    }
  }

  const sortHistory = new SortHistory(5);

  // ============================================================================
  // TAB DATA COLLECTION
  // ============================================================================

  const getTabData = async (tab, options = {}) => {
    if (!tab || !tab.isConnected) {
      return { title: 'Invalid Tab', url: '', description: '', hostname: '' };
    }

    const browser = tab.linkedBrowser || gBrowser?.getBrowserForTab?.(tab);
    let title = '';
    let url = '';
    let hostname = '';
    let description = '';

    try {
      if (browser?.currentURI?.spec) {
        url = browser.currentURI.spec;
        try {
          const urlObj = new URL(url);
          hostname = urlObj.hostname.replace(/^www\./, '');
        } catch (e) {
          const keyName = /alt\+shift\+t/i.test(shortcut) ? 'Alt+Shift+T' : 'Custom key';
          hostname = url.startsWith('about:') ? 'Internal Page' : 'Invalid URL';
        }
      }

      title = tab.getAttribute('label') ||
        tab.querySelector('.tab-label, .tab-text')?.textContent ||
        hostname || 'Untitled';

      if (url.startsWith('about:') || url.startsWith('chrome://')) {
        title = title || 'Internal Page';
        return { title, url, description, hostname };
      }

      const fetchDescriptions = options.fetchDescriptions ?? getPref(PREF.FETCH_DESCRIPTIONS, true);
      if (fetchDescriptions) {
        try {
          if (browser?.contentDocument) {
            const metaDesc = browser.contentDocument.querySelector('meta[name="description"]');
            if (metaDesc) {
              description = (metaDesc.getAttribute('content') || '').substring(0, 200);
            }
          }
        } catch (e) {
        }
      }
    } catch (e) {
      logError('Error getting tab data:', e);
    }

    return { title, url, description, hostname };
  };

  const collectTabsData = async (tabs, options = {}) => {
    const results = [];
    const batches = chunkArray(tabs, options.batchSize || METADATA_BATCH_SIZE);
    const fetchDescriptions = options.fetchDescriptions ?? true;

    for (const batch of batches) {
      const batchData = await Promise.all(batch.map(tab => getTabData(tab, { fetchDescriptions })));
      results.push(...batchData);
      if (batches.length > 1) {
        await sleep(0);
      }
    }

    return results;
  };

  // ============================================================================
  // API CLIENT
  // ============================================================================

  class NeuroSortAPIClient {
    constructor() {
      this.provider = getPref(PREF.PROVIDER, 'custom');
      this.cacheConfig();
      this.lastApiCallTime = 0;
      this.minApiDelay = 500;
    }

    cacheConfig() {
      this.provider = getPref(PREF.PROVIDER, 'custom');
      switch (this.provider) {
        case 'openai':
          this.config = {
            endpoint: getPref(PREF.OPENAI_ENDPOINT, 'https://api.openai.com/v1'),
            apiKey: getPref(PREF.OPENAI_API_KEY, ''),
            model: getPref(PREF.OPENAI_MODEL, 'gpt-4o-mini'),
            format: 'openai'
          };
          break;
        case 'gemini':
          this.config = {
            apiKey: getPref(PREF.GEMINI_API_KEY, ''),
            model: getPref(PREF.GEMINI_MODEL, 'gemini-2.0-flash'),
            format: 'gemini'
          };
          break;
        case 'ollama':
          this.config = {
            endpoint: getPref(PREF.OLLAMA_ENDPOINT, 'http://localhost:11434'),
            model: getPref(PREF.OLLAMA_MODEL, 'llama3.2'),
            format: 'ollama'
          };
          break;
        case 'custom':
        default:
          this.config = {
            endpoint: getPref(PREF.CUSTOM_ENDPOINT, 'https://ai.redivo.ru/v1'),
            apiKey: getPref(PREF.CUSTOM_API_KEY, ''),
            model: getPref(PREF.CUSTOM_MODEL, 'cx/gpt-5.1-codex-mini'),
            format: getPref(PREF.CUSTOM_FORMAT, 'openai')
          };

          logError('--------- API DEBUG INFO ---------');
          logError('Provider loaded:', this.provider);
          logError('Endpoint loaded:', this.config.endpoint);
          logError('API Key loaded length:', this.config.apiKey ? this.config.apiKey.length : 0);
          logError('Model loaded:', this.config.model);
          logError('Format loaded:', this.config.format);
          logError('---------------------------------');
          break;
      }
      this._validState = this._computeValidation();
    }

    _computeValidation() {
      switch (this.provider) {
        case 'openai':
          if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            return { valid: false, message: 'OpenAI API key not configured' };
          }
          return { valid: true, message: '' };
        case 'gemini':
          if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            return { valid: false, message: 'Gemini API key not configured' };
          }
          return { valid: true, message: '' };
        case 'ollama':
          return { valid: true, message: '' };
        case 'custom':
        default:
          if (!this.config.apiKey || this.config.apiKey.trim() === '') {
            return { valid: false, message: 'Custom API key not configured' };
          }
          return { valid: true, message: '' };
      }
    }

    hasValidConfig() {
      return this._validState?.valid ?? false;
    }

    validateConfig() {
      return this._validState ?? { valid: false, message: 'Config not loaded' };
    }

    async withTimeout(promise, ms = 30000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ms);

      try {
        const result = await promise;
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds');
        }
        throw error;
      }
    }

    async withRetry(fn, maxRetries = 2) {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;
          const isNetworkError = error.message?.includes('network') ||
            error.message?.includes('fetch') ||
            error.message?.includes('Network') ||
            error.name === 'TypeError';
          const isTimeout = error.message?.includes('timed out');

          if (attempt < maxRetries && (isNetworkError || isTimeout)) {
            const delay = Math.pow(2, attempt) * 1000;
            log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        }
      }
      throw lastError;
    }

    extractDomain(url) {
      if (!url || url.startsWith('about:') || url.startsWith('chrome://')) {
        return null;
      }
      try {
        const urlObj = new URL(url);
        let domain = urlObj.hostname.replace(/^www\./, '');
        const parts = domain.split('.');
        if (parts.length >= 2) {
          domain = parts[parts.length - 2];
        }
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      } catch (e) {
        return null;
      }
    }

    getDomainFrequency(tabsData) {
      const domainCount = {};
      for (const data of tabsData) {
        const domain = this.extractDomain(data.url);
        if (domain) {
          domainCount[domain] = (domainCount[domain] || 0) + 1;
        }
      }
      const sorted = Object.entries(domainCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => `${domain}(${count})`);
      return sorted;
    }

    getHostname(url) {
      if (!url || url.startsWith('about:') || url.startsWith('chrome://')) {
        return '';
      }
      try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      } catch (e) {
        return '';
      }
    }

    getDomainKey(label) {
      return (label || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    normalizeCategoryKey(category) {
      return (category || '')
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    }

    stripCategoryNumericSuffix(category) {
      return (category || '')
        .replace(/\s*(?:#?\d+|\(\d+\))\s*$/i, '')
        .trim();
    }

    isGenericYouTubeCategory(category) {
      const key = this.normalizeCategoryKey(this.stripCategoryNumericSuffix(category));
      return key === 'youtube' ||
        key === 'you tube' ||
        key === 'youtube videos' ||
        key === 'you tube videos' ||
        key === 'yt' ||
        key === 'yt videos';
    }

    isYouTubeTabData(data) {
      const hostname = this.getHostname(data?.url || '');
      return hostname === 'youtube.com' ||
        hostname.endsWith('.youtube.com') ||
        hostname === 'youtu.be';
    }

    getMaxGroupSize(category) {
      const key = this.getDomainKey(category);
      if (key.includes('youtube') || key.includes('video')) return YOUTUBE_MAX_GROUP_SIZE;
      return DEFAULT_MAX_GROUP_SIZE;
    }

    youtubeTopicSignal(data) {
      const text = `${data.title || ''} ${data.url || ''}`.toLowerCase();

      if (/music|song|album|mix|playlist|live set|concert|remix|dj/.test(text)) return 'youtube:music';
      if (/podcast|interview|talk|conversation|lex fridman|joe rogan/.test(text)) return 'youtube:podcasts';
      if (/review|vs\b|comparison|hands on|unboxing|benchmark/.test(text)) return 'youtube:reviews';
      if (/cooking|recipe|food|kitchen|chef|cook\b/.test(text)) return 'youtube:cooking';
      if (/game|gaming|minecraft|elden|valorant|league of legends|stream/.test(text)) return 'youtube:gaming';
      if (/documentary|history|science|space|physics|biology/.test(text)) return 'youtube:documentary';
      if (/coding|programming|developer|javascript|typescript|python|react|agent|ai coding|cursor|claude code|github|openai|llm/.test(text)) return 'youtube:coding-ai';
      if (/news|analysis|politics|economy|market|war|breaking/.test(text)) return 'youtube:news';
      if (/workout|fitness|gym|yoga|health|nutrition/.test(text)) return 'youtube:fitness';
      if (/movie|film|trailer|cinema|scene|anime|show/.test(text)) return 'youtube:film';
      if (/tutorial|guide|how to|course|lesson|explained|learn/.test(text)) return 'youtube:tutorials';

      const channelMatch = (data.title || '').match(/\|\s*([^|]+)$/) || (data.title || '').match(/-\s*([^-]+)$/);
      if (channelMatch && channelMatch[1]) {
        const channel = channelMatch[1]
          .replace(/youtube|official|channel/ig, '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9а-яё]+/gi, '-');
        if (channel && channel.length > 2 && channel.length < 24) {
          return `youtube:${channel}`;
        }
      }

      const channelPathMatch = (data.url || '').match(/youtube\.com\/(?:@|c\/|user\/)([^/?#]+)/i);
      if (channelPathMatch && channelPathMatch[1]) {
        const channel = channelPathMatch[1]
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9а-яё]+/gi, '-');
        if (channel && channel.length > 2 && channel.length < 24) {
          return `youtube:${channel}`;
        }
      }

      return 'youtube:videos';
    }

    collectCategorySignals(data) {
      const text = `${data.title || ''} ${data.hostname || ''} ${data.url || ''}`.toLowerCase();
      const signals = new Set();

      if (/logo|animation|design|image|video generation/.test(text)) {
        signals.add('creative-work');
      }
      if (/gemini|chatgpt|claude|perplexity|copilot|ai studio/.test(text)) {
        signals.add('ai-tools');
      }
      if (/sheets|spreadsheet|таблиц|плат[её]ж|invoice|billing|payment/.test(text)) {
        signals.add('spreadsheets');
      }
      if (/gmail|mail\.google|inbox|email|почт/.test(text)) {
        signals.add('email');
      }
      if (/search|google search|поиск|query|results|nano banana|banana/.test(text)) {
        signals.add('search');
      }
      if (/baidu|文心|assistant|助手/.test(text)) {
        signals.add('baidu');
      }
      if (/hostvds|timeweb|server|vps|hosting|сервер|прокси|proxy/.test(text)) {
        signals.add('hosting');
      }

      const repoMatch = text.match(/github\.com\/([^\s/?#]+)\/([^\s/?#]+)/i);
      if (repoMatch) {
        signals.add(`github:${repoMatch[1]}/${repoMatch[2]}`.toLowerCase());
      }
      if (/pull\/\d+|\/pulls\b|pull request|\bpr\b/.test(text)) {
        signals.add('pull-requests');
      }
      if (/issues\/\d+|\/issues\b|\bissue\b/.test(text)) {
        signals.add('issues');
      }
      if (/docs|documentation|reference|api/.test(text)) {
        signals.add('docs');
      }
      if (/youtube\.com|youtu\.be/.test(text)) {
        signals.add(this.youtubeTopicSignal(data));
      }
      if (/watch\?|playlist|shorts\//.test(text)) {
        signals.add('video-content');
      }
      const hostname = this.getHostname(data.url);
      if (hostname) {
        signals.add(`host:${hostname}`);
      }

      return signals;
    }

    shouldSplitLargeCategory(category, items) {
      const maxSize = this.getMaxGroupSize(category);
      if (items.length <= maxSize) return false;

      return true;
    }

    isBroadDomainCategory(category, items) {
      const key = this.getDomainKey(category);
      if (!key) return false;

      return items.some(item => {
        const domain = this.extractDomain(item.data?.url || '');
        return this.getDomainKey(domain) === key;
      });
    }

    primarySignalForItem(item) {
      const signals = Array.from(this.collectCategorySignals(item.data));
      return signals.find(value => value.startsWith('youtube:')) ||
        signals.find(value => value.startsWith('github:')) ||
        signals.find(value => value === 'pull-requests') ||
        signals.find(value => value === 'issues') ||
        signals.find(value => value === 'spreadsheets') ||
        signals.find(value => value === 'email') ||
        signals.find(value => value === 'ai-tools') ||
        signals.find(value => value === 'creative-work') ||
        signals.find(value => value === 'hosting') ||
        signals.find(value => value === 'baidu') ||
        signals.find(value => value === 'search') ||
        signals.find(value => value === 'docs') ||
        signals.find(value => value.startsWith('host:')) ||
        'misc';
    }

    groupByDomain(tabsData) {
      const groups = {};
      tabsData.forEach((data, i) => {
        const domain = this.extractDomain(data.url) || 'Other';
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(i);
      });
      return groups;
    }

    truncatePrompt(prompt, maxLength = 2000) {
      if (prompt.length <= maxLength) return prompt;
      const lines = prompt.split('\n');
      let result = [];
      let currentLength = 0;
      for (const line of lines) {
        if (currentLength + line.length + 1 <= maxLength) {
          result.push(line);
          currentLength += line.length + 1;
        } else {
          break;
        }
      }
      if (result.length < lines.length) {
        result.push('... (truncated for length)');
      }
      return result.join('\n');
    }

    buildPrompt(tabsData, existingGroups = [], context = {}) {
      const existingGroupsList = existingGroups.length > 0
        ? existingGroups.map(g => `- ${g}`).join('\n')
        : 'None';

      const frequentDomains = this.getDomainFrequency(tabsData);
      const frequentDomainsList = frequentDomains.length > 0
        ? frequentDomains.join(', ')
        : 'None';

      const tabsList = tabsData.map((data, i) => {
        const tabNumber = context.startIndex ? context.startIndex + i + 1 : i + 1;
        const parts = [`${i + 1}. Title: "${data.title}"`];
        const domain = this.extractDomain(data.url);
        if (domain) {
          parts.push(`   Domain: "${domain}"`);
        }
        if (data.hostname) {
          parts.push(`   Host: "${data.hostname}"`);
        }
        if (data.description && data.description.length > 10) {
          parts.push(`   Desc: "${data.description.substring(0, 80)}"`);
        }
        parts.push(`   Global Tab #: ${tabNumber}`);
        return parts.join('\n');
      }).join('\n\n');

      let prompt = `Analyze the following tabs and assign each to a logical category.

EXISTING CATEGORIES (use these exact names if a tab fits):
${existingGroupsList}

FREQUENT DOMAINS (context only; do not use as category names unless the task is truly the same): ${frequentDomainsList}

TABS TO CATEGORIZE:
${tabsList}

INSTRUCTIONS:
1. Assign each tab to a concise category (1-4 words, Title Case)
2. Prefer intent/topic groups over website-owner groups.
3. Avoid generic categories like "Google", "GitHub", "Cloudflare", "Reddit", or "Misc" when tabs are about different tasks.
4. Split Google tabs by task/product/topic, e.g. "AI Tools", "Spreadsheets", "Search", "Email", "Design Research".
5. GitHub tabs should be split by repo, PRs, issues, docs, or project when possible. Avoid a giant "GitHub" group.
6. YouTube tabs must be split by topic, channel, series, or intent. Avoid generic "YouTube" unless there are only a few miscellaneous videos.
7. Prefer existing categories only when the tab genuinely fits the exact topic.
8. Examples: "AI Coding Videos", "Music", "Tech Reviews", "Tutorials", "Podcasts", "Repo PRs", "Project Docs"

OUTPUT FORMAT:
- Output exactly ONE category per line
- Match the number of tabs above
- Just the category names, one per line`;

      // Return the full prompt instead of truncating it, so all tabs are sent to the LLM
      return prompt;
    }

    parseResponse(responseText, tabsCount) {
      const lines = responseText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

      const categories = lines.map(line => {
        return line
          .replace(/^[\d.\-*\s]+/, '')
          .replace(/["'*]/g, '')
          .replace(/^(Category:?\s*|The category is:?\s*)/i, '')
          .trim();
      }).filter(line => line.length > 0);

      if (categories.length < tabsCount) {
        log(`Warning: AI returned ${categories.length} categories for ${tabsCount} tabs. Padding with "Misc".`);
        while (categories.length < tabsCount) {
          categories.push('Misc');
        }
      } else if (categories.length > tabsCount) {
        log(`Warning: AI returned ${categories.length} categories for ${tabsCount} tabs. Truncating.`);
        categories.length = tabsCount;
      }

      return categories.map(cat => {
        return cat.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .substring(0, 30);
      });
    }

    async categorizeChunk(tabsData, existingGroups, startIndex) {
      const prompt = this.buildPrompt(tabsData, existingGroups, { startIndex });
      log('Prompt length:', prompt.length, 'chunk size:', tabsData.length);
      const response = await this.makeRequest(prompt);
      log('AI Response:', response);
      return this.parseResponse(response, tabsData.length);
    }

    regroupGenericYouTubeCategories(categorizations, tabsData) {
      const nextCategories = new Map();

      categorizations.forEach((item, index) => {
        const data = tabsData[index];
        if (!this.isGenericYouTubeCategory(item.category) || !this.isYouTubeTabData(data)) {
          return;
        }

        const signal = this.youtubeTopicSignal(data);
        nextCategories.set(index, this.labelForYouTubeSignal(signal));
      });

      if (nextCategories.size === 0) {
        return categorizations;
      }

      return categorizations.map((item, index) => ({
        ...item,
        category: nextCategories.get(index) || item.category
      }));
    }

    splitLargeCategories(categorizations, tabsData) {
      categorizations = this.regroupGenericYouTubeCategories(categorizations, tabsData);

      const grouped = new Map();
      categorizations.forEach((item, index) => {
        if (!grouped.has(item.category)) {
          grouped.set(item.category, []);
        }
        grouped.get(item.category).push({ ...item, index, data: tabsData[index] });
      });

      const nextCategories = new Map();
      for (const [category, items] of grouped.entries()) {
        const shouldSplit = this.shouldSplitLargeCategory(category, items) || this.isBroadDomainCategory(category, items);
        if (!shouldSplit) continue;

        const signalBuckets = new Map();
        for (const item of items) {
          const signal = this.primarySignalForItem(item);

          if (!signalBuckets.has(signal)) {
            signalBuckets.set(signal, []);
          }
          signalBuckets.get(signal).push(item);
        }

        if (signalBuckets.size <= 1) {
          const onlySignal = Array.from(signalBuckets.keys())[0];
          const label = onlySignal?.startsWith('youtube:')
            ? this.labelForSignal(category, onlySignal)
            : category;
          const maxSize = this.getMaxGroupSize(label);
          items.forEach((item, i) => {
            const suffix = Math.floor(i / maxSize) + 1;
            nextCategories.set(item.index, suffix === 1 ? label : `${label} ${suffix}`);
          });
          continue;
        }

        for (const [signal, bucket] of signalBuckets.entries()) {
          const maxSize = signal.startsWith('youtube:') ? YOUTUBE_MAX_GROUP_SIZE : STRICT_MAX_GROUP_SIZE;
          bucket.forEach((item, i) => {
            const suffix = Math.floor(i / maxSize) + 1;
            const label = this.labelForSignal(category, signal);
            nextCategories.set(item.index, suffix === 1 ? label : `${label} ${suffix}`);
          });
        }
      }

      if (nextCategories.size === 0) {
        return categorizations;
      }

      return categorizations.map((item, index) => ({
        ...item,
        category: nextCategories.get(index) || item.category
      }));
    }

    labelForSignal(category, signal) {
      if (signal.startsWith('github:')) {
        const repo = signal.slice('github:'.length).split('/').pop();
        return repo ? `GitHub ${repo}`.substring(0, 30) : 'GitHub Repo';
      }
      if (signal === 'pull-requests') return `${category} PRs`.substring(0, 30);
      if (signal === 'issues') return `${category} Issues`.substring(0, 30);
      if (signal === 'docs') return `${category} Docs`.substring(0, 30);
      if (signal.startsWith('youtube:')) return this.labelForYouTubeSignal(signal);
      if (signal === 'ai-tools') return 'AI Tools';
      if (signal === 'spreadsheets') return 'Spreadsheets';
      if (signal === 'email') return 'Email';
      if (signal === 'creative-work') return 'Creative Work';
      if (signal === 'hosting') return 'Hosting';
      if (signal === 'baidu') return 'Baidu';
      if (signal === 'search') return 'Search';
      if (signal.startsWith('host:')) {
        const host = signal.slice('host:'.length).split('.')[0];
        return host ? this.titleFromHost(host) : category;
      }
      return category;
    }

    labelForYouTubeSignal(signal) {
      const topic = signal.slice('youtube:'.length);
      const labels = {
        'coding-ai': 'AI Coding Videos',
        music: 'Music Videos',
        podcasts: 'Podcasts',
        reviews: 'Reviews',
        tutorials: 'Tutorials',
        news: 'News Videos',
        fitness: 'Fitness Videos',
        cooking: 'Cooking Videos',
        gaming: 'Gaming Videos',
        film: 'Film Videos',
        documentary: 'Documentaries',
        videos: 'Misc Videos'
      };

      if (labels[topic]) return labels[topic];
      return this.titleFromHost(topic).replace(/\bVideos?$/i, '').trim().substring(0, 24) || 'Misc Videos';
    }

    titleFromHost(host) {
      return host
        .split(/[-_]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
        .substring(0, 30) || 'Web';
    }

    async makeRequest(prompt) {
      return this.withRetry(async () => {
        return this.withTimeout(this._makeRequestInternal(prompt), 30000);
      }, 2);
    }

    async _makeRequestInternal(prompt) {
      switch (this.config.format) {
        case 'gemini':
          return this.geminiRequest(prompt);
        case 'ollama':
          return this.ollamaRequest(prompt);
        case 'openai':
        default:
          return this.openaiRequest(prompt);
      }
    }

    parseStreamingResponse(text) {
      const lines = text.split('\n');
      let fullContent = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') break;

          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta?.content ||
              data.choices?.[0]?.message?.content || '';
            fullContent += delta;
          } catch (e) {
          }
        }
      }

      return fullContent.trim();
    }

    async openaiRequest(prompt) {
      const baseUrl = this.config.endpoint.replace(/\/+$/, '');
      const url = `${baseUrl}/chat/completions`;
      const headers = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const body = {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a tab organization assistant. Categorize tabs concisely and consistently. Output ONLY category names, one per line, no numbering or explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: Math.max(256, prompt.length / 4),
        stream: false
      };

      logError('--------- FETCH DEBUG INFO ---------');
      logError('Attempting to fetch URL:', url);
      logError('Attempting to fetch with headers:', JSON.stringify(headers));
      logError('Attempting to fetch with body:', JSON.stringify(body));
      logError('-----------------------------------');

      log('OpenAI request to:', url, 'with model:', this.config.model);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logError('API Error Response:', errorText);
        throw new Error(`API Error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const responseText = await response.text();
      log('Raw response (first 500 chars):', responseText.substring(0, 500));

      if (responseText.trim().startsWith('data:')) {
        log('Detected streaming response format, parsing...');
        const content = this.parseStreamingResponse(responseText);
        if (!content) {
          throw new Error('Empty content from streaming response');
        }
        return content;
      }

      try {
        const data = JSON.parse(responseText);
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('Empty response from API');
        }

        return content.trim();
      } catch (e) {
        log('JSON parse failed, trying streaming parse:', e.message);
        const content = this.parseStreamingResponse(responseText);
        if (!content) {
          throw new Error('Could not parse API response');
        }
        return content;
      }
    }

    async geminiRequest(prompt) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

      const body = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: Math.max(256, prompt.length / 4),
        }
      };

      log('Gemini request to:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      return content.trim();
    }

    async ollamaRequest(prompt) {
      const url = `${this.config.endpoint}/api/generate`;

      const body = {
        model: this.config.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: Math.max(256, prompt.length / 4),
        }
      };

      log('Ollama request to:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.response;

      if (!content) {
        throw new Error('Empty response from Ollama');
      }

      return content.trim();
    }

    checkRateLimit() {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastApiCallTime;
      if (timeSinceLastCall < this.minApiDelay) {
        return { allowed: false, waitTime: this.minApiDelay - timeSinceLastCall };
      }
      return { allowed: true, waitTime: 0 };
    }

    fallbackCategorize(tabsData) {
      return tabsData.map(data => {
        const domain = this.extractDomain(data.url);
        if (domain) {
          return domain;
        }
        if (data.title) {
          const words = data.title.split(/\s+/).slice(0, 2);
          return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
        return 'Misc';
      });
    }

    async categorize(tabs, existingGroups = []) {
      this.cacheConfig();

      const rateLimit = this.checkRateLimit();
      if (!rateLimit.allowed) {
        return { rateLimited: true, waitTime: rateLimit.waitTime };
      }

      const largeBatch = tabs.length >= LARGE_BATCH_THRESHOLD;
      const fetchDescriptions = !largeBatch && getPref(PREF.FETCH_DESCRIPTIONS, true);
      const tabsData = await collectTabsData(tabs, { fetchDescriptions });
      log('Tab data collected:', tabsData);

      let categories;
      let fallbackUsed = false;
      try {
        this.lastApiCallTime = Date.now();
        const chunks = chunkArray(tabsData, AI_CHUNK_SIZE);
        categories = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkCategories = await this.categorizeChunk(chunks[i], existingGroups, i * AI_CHUNK_SIZE);
          categories.push(...chunkCategories);
          if (i < chunks.length - 1) {
            await sleep(250);
          }
        }
        log('Parsed categories:', categories);
      } catch (error) {
        logError('API call failed, using fallback categorization:', error);
        categories = this.fallbackCategorize(tabsData);
        log('Fallback categories:', categories);
        fallbackUsed = true;
      }

      const result = tabs.map((tab, i) => ({
        tab,
        category: categories[i]
      }));
      const splitResult = this.splitLargeCategories(result, tabsData);
      splitResult.fallbackUsed = fallbackUsed;
      return splitResult;
    }
  }

  // ============================================================================
  // GROUP MANAGEMENT
  // ============================================================================

  class GroupManager {
    constructor() {
      this.apiClient = new NeuroSortAPIClient();
    }

    getGroupStats() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const selector = workspaceId
        ? `tab-group:has(tab[zen-workspace-id="${workspaceId}"])`
        : 'tab-group';

      const groups = [];
      let totalTabsInGroups = 0;

      document.querySelectorAll(selector).forEach(group => {
        if (group.hasAttribute?.('zen-folder') ||
          group.hasAttribute?.('split-view-group')) {
          return;
        }
        const tabs = group.querySelectorAll('tab');
        const tabCount = tabs.length;
        totalTabsInGroups += tabCount;
        groups.push({
          name: group.getAttribute?.('label') || group.label || 'Unnamed',
          tabCount
        });
      });

      const totalTabs = gBrowser?.tabs?.length || 0;
      const ungroupedTabs = totalTabs - totalTabsInGroups;
      const avgTabsPerGroup = groups.length > 0
        ? (totalTabsInGroups / groups.length).toFixed(1)
        : 0;

      return {
        totalGroups: groups.length,
        tabsInGroups: totalTabsInGroups,
        tabsUngrouped: ungroupedTabs,
        avgTabsPerGroup: parseFloat(avgTabsPerGroup),
        groups
      };
    }

    getExistingGroups() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const groups = [];

      const selector = workspaceId
        ? `tab-group:has(tab[zen-workspace-id="${workspaceId}"])`
        : 'tab-group';

      document.querySelectorAll(selector).forEach(group => {
        if (group.hasAttribute?.('zen-folder') ||
          group.hasAttribute?.('split-view-group')) {
          return;
        }
        const label = group.getAttribute?.('label') || group.label;
        if (label) {
          groups.push(label);
        }
      });

      log('Existing groups:', groups);
      return groups;
    }

    async findOrCreateGroup(category, workspaceId, options = {}) {
      const safeName = category.replace(/"/g, '\\"');
      const selector = `tab-group[label="${safeName}"]:has(tab[zen-workspace-id="${workspaceId}"])`;

      let group = options.forceNew ? null : document.querySelector(selector);

      if (group) {
        log(`Found existing group: ${category}`);
        return group;
      }

      log(`Creating new group: ${category}`);

      group = document.createXULElement('tab-group');
      group.id = `neurosort-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      group.label = category;
      group.color = getNextGroupColor();

      const container = window.gZenWorkspaces?.activeWorkspaceStrip ||
        gBrowser.tabContainer.querySelector('tabs') ||
        gBrowser.tabContainer;

      container.insertBefore(group, container.firstChild);

      await new Promise(resolve => setTimeout(resolve, 50));

      return group;
    }

    removeEmptyGroups(excludedGroupIds = new Set()) {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const selector = workspaceId
        ? `tab-group:has(tab[zen-workspace-id="${workspaceId}"])`
        : 'tab-group';
      let removed = 0;

      document.querySelectorAll(selector).forEach(group => {
        if (excludedGroupIds.has(group.id) ||
          group.hasAttribute?.('zen-folder') ||
          group.hasAttribute?.('split-view-group')) {
          return;
        }

        if (group.querySelectorAll('tab').length === 0) {
          group.remove();
          removed++;
        }
      });

      return removed;
    }

    async addTabsToGroup(group, tabs) {
      if (!group || !tabs || tabs.length === 0) return;

      log(`Adding ${tabs.length} tabs to group: ${group.label}`);

      if (typeof group.addTabs === 'function') {
        group.addTabs(tabs);
      } else {
        for (const tab of tabs) {
          try {
            gBrowser.moveTabToGroup(tab, group);
          } catch (e) {
            logError('Error moving tab to group:', e);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      if (typeof group._useFaviconColor === 'function') {
        try {
          await group._useFaviconColor();
        } catch (e) {
          log('Could not apply favicon color:', e);
        }
      }
    }

    async organizeTabs(tabs, options = {}) {
      if (!tabs || tabs.length === 0) {
        log('No tabs to organize');
        return { success: false, reason: 'No tabs to organize' };
      }

      const minGroupSize = getPref(PREF.MIN_GROUP_SIZE, 2);
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;

      const useExistingGroups = options.useExistingGroups === true;
      const existingGroups = useExistingGroups && getPref(PREF.USE_EXISTING_GROUPS, false)
        ? this.getExistingGroups()
        : [];

      const result = await this.apiClient.categorize(tabs, existingGroups);

      if (result.rateLimited) {
        return {
          success: false,
          reason: 'Rate limited',
          rateLimited: true,
          waitTime: result.waitTime
        };
      }

      const categorizations = result;

      const groups = {};
      for (const { tab, category } of categorizations) {
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(tab);
      }

      const validGroups = Object.entries(groups).filter(
        ([_, tabs]) => tabs.length >= minGroupSize
      );

      log(`Creating ${validGroups.length} groups (filtered ${Object.keys(groups).length - validGroups.length} small groups)`);

      const undoEntry = {
        timestamp: Date.now(),
        groupMappings: [],
        createdGroupIds: [],
        tabsSorted: tabs.length
      };

      const createdGroups = [];
      const tabIndexMap = new Map(Array.from(gBrowser.tabs).map((tab, index) => [tab, index]));
      for (const [category, groupTabs] of validGroups) {
        try {
          const group = await this.findOrCreateGroup(category, workspaceId, {
            forceNew: options.forceNewGroups === true
          });
          await this.addTabsToGroup(group, groupTabs);

          undoEntry.createdGroupIds.push(group.id);
          const tabIds = groupTabs.map(tab => ({
            tab: tab,
            tabId: generateTabId(tab),
            originalIndex: tabIndexMap.get(tab) ?? -1,
            originalParent: tab.parentElement
          }));
          undoEntry.groupMappings.push({
            groupId: group.id,
            groupName: category,
            tabs: tabIds
          });

          createdGroups.push({ name: category, tabCount: groupTabs.length });
        } catch (e) {
          logError(`Error creating group ${category}:`, e);
        }
      }

      const removedEmptyGroups = options.cleanupEmptyGroups
        ? this.removeEmptyGroups(new Set(undoEntry.createdGroupIds))
        : 0;

      sortHistory.push(undoEntry);

      return {
        success: true,
        groupsCreated: createdGroups.length,
        groups: createdGroups,
        ungrouped: tabs.length - validGroups.reduce((sum, [_, t]) => sum + t.length, 0),
        removedEmptyGroups,
        undoEntry,
        fallbackUsed: result.fallbackUsed
      };
    }

    async undoLastSort() {
      const entry = sortHistory.pop();

      if (!entry) {
        return { success: false, reason: 'Nothing to undo' };
      }

      log('Undoing sort from:', new Date(entry.timestamp));

      let tabsUngrouped = 0;
      let groupsRemoved = 0;
      const errors = [];

      for (const mapping of entry.groupMappings) {
        const group = document.getElementById(mapping.groupId) ||
          document.querySelector(`tab-group[id="${mapping.groupId}"]`);

        if (!group) {
          log('Group not found:', mapping.groupId);
          continue;
        }

        const tabsToUngroup = [];
        for (const tabInfo of mapping.tabs) {
          let tab = tabInfo.tab;

          if (!tab || tab.closing || !tab.parentNode) {
            const allTabs = Array.from(gBrowser.tabs);
            tab = allTabs.find(t => generateTabId(t) === tabInfo.tabId);
          }

          if (tab && !tab.closing && tab.parentNode) {
            tabsToUngroup.push({ tab, originalIndex: tabInfo.originalIndex });
          }
        }

        for (const { tab, originalIndex } of tabsToUngroup) {
          try {
            if (typeof gBrowser.ungroupTab === 'function') {
              gBrowser.ungroupTab(tab);
            } else if (typeof tab.ungroup === 'function') {
              tab.ungroup();
            } else {
              const tabContainer = gBrowser.tabContainer;
              tabContainer.appendChild(tab);
            }
            tabsUngrouped++;
          } catch (e) {
            logError('Error ungrouping tab:', e);
            errors.push(e.message);
          }
        }

        try {
          const remainingTabs = group.querySelectorAll('tab');
          if (remainingTabs.length === 0) {
            group.remove();
            groupsRemoved++;
          }
        } catch (e) {
          logError('Error removing group:', e);
        }
      }

      const result = {
        success: true,
        tabsUngrouped,
        groupsRemoved,
        errors: errors.length > 0 ? errors : undefined
      };

      log('Undo complete:', result);
      return result;
    }
  }

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

  class NeuroSortUI {
    constructor(groupManager) {
      this.groupManager = groupManager;
      this.broomButton = null;
      this.broomIcon = null;
      this.spinner = null;
      this.isSorting = false;
      this.toastContainer = null;
      this.contextMenu = null;
      this.badge = null;
      this.badgeUpdateInterval = null;
      this.isParentHovered = false;
      this.quickSettingsPopup = null;
    }

    createSpinner() {
      const spinner = document.createElement('div');
      spinner.className = 'neurosort-spinner';
      return spinner;
    }

    createBadge() {
      const badge = document.createElement('span');
      badge.className = 'neurosort-badge';
      badge.style.display = 'none';
      return badge;
    }

    updateBadge() {
      if (!this.badge || !this.broomButton) return;

      const stats = this.groupManager.getGroupStats();
      const ungroupedCount = stats.tabsUngrouped;
      const threshold = getPref(PREF.AUTO_TIDY_THRESHOLD, 6);

      this.badge.textContent = ungroupedCount;

      if (ungroupedCount >= threshold) {
        this.badge.classList.add('neurosort-badge-highlight');
      } else {
        this.badge.classList.remove('neurosort-badge-highlight');
      }

      this.badge.style.display = ungroupedCount > 0 ? 'flex' : 'none';
    }

    updateDynamicTooltip() {
      if (!this.broomButton) return;

      const stats = this.groupManager.getGroupStats();
      const shortcut = getPref(PREF.KEYBOARD_SHORTCUT, 'ctrl+shift+t');
      const shortcutDisplay = formatShortcutForDisplay(shortcut);
      const apiConfigured = this.groupManager.apiClient.hasValidConfig();

      let title = `${stats.tabsUngrouped} ungrouped tabs - Click to tidy`;
      if (shortcutDisplay) {
        title += `\nShortcut: ${shortcutDisplay}`;
      }
      title += `\nAPI: ${apiConfigured ? 'Configured' : 'Not configured'}`;
      title += '\nCtrl+Shift+Click: Tidy selected tabs';
      title += '\nAlt+Shift+Click: Tidy ALL tabs';
      title += '\nRight-click: Options menu';

      this.broomButton.title = title;
    }

    startBadgeUpdates() {
      if (this.badgeUpdateInterval) return;

      this.updateBadge();
      this.updateDynamicTooltip();

      this.badgeUpdateInterval = setInterval(() => {
        if (this.isParentHovered) {
          this.updateBadge();
          this.updateDynamicTooltip();
        }
      }, 5000);
    }

    stopBadgeUpdates() {
      if (this.badgeUpdateInterval) {
        clearInterval(this.badgeUpdateInterval);
        this.badgeUpdateInterval = null;
      }
    }

    createBroomIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 28 28');
      svg.setAttribute('class', 'broom-icon');

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('fill-rule', 'evenodd');

      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', 'M19.9132 21.3765C19.8875 21.0162 19.6455 20.7069 19.3007 20.5993L7.21755 16.8291C6.87269 16.7215 6.49768 16.8384 6.27165 17.1202C5.73893 17.7845 4.72031 19.025 3.78544 19.9965C2.4425 21.392 3.01177 22.4772 4.66526 22.9931C4.82548 23.0431 5.78822 21.7398 6.20045 21.7398C6.51906 21.8392 6.8758 23.6828 7.26122 23.8031C7.87402 23.9943 8.55929 24.2081 9.27891 24.4326C9.59033 24.5298 10.2101 23.0557 10.5313 23.1559C10.7774 23.2327 10.7236 24.8834 10.9723 24.961C11.8322 25.2293 12.699 25.4997 13.5152 25.7544C13.868 25.8645 14.8344 24.3299 15.1637 24.4326C15.496 24.5363 15.191 26.2773 15.4898 26.3705C16.7587 26.7664 17.6824 27.0546 17.895 27.1209C19.5487 27.6369 20.6333 27.068 20.3226 25.1563C20.1063 23.8255 19.9737 22.2258 19.9132 21.3765Z');
      path1.setAttribute('stroke', 'none');
      path1.setAttribute('fill', 'currentColor');

      const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path2.setAttribute('d', 'M16.719 1.7134C17.4929-0.767192 20.7999 0.264626 20.026 2.74523C19.2521 5.22583 18.1514 8.75696 17.9629 9.36C17.7045 10.1867 16.1569 15.1482 15.899 15.9749L19.2063 17.0068C20.8597 17.5227 20.205 19.974 18.4514 19.4268L8.52918 16.331C6.87208 15.8139 7.62682 13.3938 9.28426 13.911L12.5916 14.9429C12.8495 14.1163 14.3976 9.15491 14.6555 8.32807C14.9135 7.50122 15.9451 4.19399 16.719 1.7134Z');
      path2.setAttribute('stroke', 'none');
      path2.setAttribute('fill', 'currentColor');

      g.appendChild(path1);
      g.appendChild(path2);
      svg.appendChild(g);

      this.broomIcon = svg;
      return svg;
    }

    setLoading(loading) {
      if (!this.broomButton) return;

      if (loading) {
        if (this.broomIcon && this.broomIcon.parentElement) {
          this.broomIcon.style.display = 'none';
        }
        if (!this.spinner) {
          this.spinner = this.createSpinner();
          this.broomButton.appendChild(this.spinner);
        }
        this.spinner.style.display = 'block';
        this.broomButton.classList.add('loading');
      } else {
        if (this.spinner) {
          this.spinner.style.display = 'none';
        }
        if (this.broomIcon) {
          this.broomIcon.style.display = 'block';
        }
        this.broomButton.classList.remove('loading');
      }
    }

    updateButtonTitle() {
      this.updateDynamicTooltip();
    }

    createContextMenu() {
      if (this.contextMenu) {
        return this.contextMenu;
      }

      const menu = document.createXULElement('menupopup');
      menu.id = 'neurosort-context-menu';
      menu.className = 'neurosort-menu';

      const statsItem = document.createXULElement('menuitem');
      statsItem.id = 'neurosort-stats-menu-item';
      statsItem.className = 'neurosort-menu-item neurosort-stats-item';
      statsItem.label = 'Loading stats...';
      statsItem.disabled = true;
      menu.appendChild(statsItem);

      menu.appendChild(document.createXULElement('menuseparator'));

      const tidyItem = document.createXULElement('menuitem');
      tidyItem.label = 'Tidy Tabs';
      tidyItem.className = 'neurosort-menu-item';
      tidyItem.addEventListener('command', () => {
        this.handleTidyClick({ ctrlKey: false, shiftKey: false, altKey: false });
      });
      menu.appendChild(tidyItem);

      const tidySelectedLabel = `Tidy Selected Tabs (${formatShortcutForDisplay('ctrl+shift+click')})`;
      const tidySelected = document.createXULElement('menuitem');
      tidySelected.label = tidySelectedLabel;
      tidySelected.className = 'neurosort-menu-item';
      tidySelected.addEventListener('command', () => {
        const selectedTabs = gBrowser.selectedTabs || [];
        if (selectedTabs.length > 1) {
          this.handleTidyClick({ ctrlKey: true, shiftKey: true, altKey: false });
        } else {
          this.showToast('Select multiple tabs first (Ctrl+Click)', 'info');
        }
      });
      menu.appendChild(tidySelected);

      const tidyAll = document.createXULElement('menuitem');
      tidyAll.label = 'Tidy ALL Tabs';
      tidyAll.className = 'neurosort-menu-item';
      tidyAll.addEventListener('command', () => {
        this.handleTidyClick({ ctrlKey: false, shiftKey: true, altKey: true });
      });
      menu.appendChild(tidyAll);

      menu.appendChild(document.createXULElement('menuseparator'));

      const undoItem = document.createXULElement('menuitem');
      undoItem.id = 'neurosort-undo-menu-item';
      undoItem.label = 'Undo Last Sort (Alt+Shift+Z)';
      undoItem.className = 'neurosort-menu-item';
      undoItem.addEventListener('command', () => {
        this.handleUndo();
      });
      menu.appendChild(undoItem);

      const clearHistory = document.createXULElement('menuitem');
      clearHistory.label = 'Clear Undo History';
      clearHistory.className = 'neurosort-menu-item';
      clearHistory.addEventListener('command', () => {
        sortHistory.clear();
        this.showToast('Undo history cleared', 'info');
        this.updateUndoMenuItem();
      });
      menu.appendChild(clearHistory);

      menu.appendChild(document.createXULElement('menuseparator'));

      const quickSettingsItem = document.createXULElement('menuitem');
      quickSettingsItem.label = 'Quick Settings';
      quickSettingsItem.className = 'neurosort-menu-item';
      quickSettingsItem.addEventListener('command', () => {
        this.showQuickSettings();
      });
      menu.appendChild(quickSettingsItem);

      menu.addEventListener('popupshowing', () => {
        this.updateUndoMenuItem();
        this.updateStatsMenuItem();
      });

      document.getElementById('mainPopupSet')?.appendChild(menu) ||
        document.body.appendChild(menu);

      this.contextMenu = menu;
      return menu;
    }

    updateStatsMenuItem() {
      const statsItem = document.getElementById('neurosort-stats-menu-item');
      if (!statsItem) return;

      const stats = this.groupManager.getGroupStats();
      statsItem.label = `Groups: ${stats.totalGroups} | Grouped: ${stats.tabsInGroups} | Ungrouped: ${stats.tabsUngrouped} | Avg: ${stats.avgTabsPerGroup}`;
    }

    updateUndoMenuItem() {
      const undoItem = document.getElementById('neurosort-undo-menu-item');
      if (undoItem) {
        const hasHistory = !sortHistory.isEmpty();
        undoItem.disabled = !hasHistory;
        undoItem.label = hasHistory
          ? `Undo Last Sort (${sortHistory.getLength()} in history)`
          : 'Nothing to undo';
      }
    }

    async handleUndo() {
      if (sortHistory.isEmpty()) {
        this.showToast('Nothing to undo', 'info');
        return;
      }

      this.isSorting = true;
      this.setLoading(true);

      try {
        const result = await this.groupManager.undoLastSort();

        if (result.success) {
          this.showToast(
            `Undone: ${result.tabsUngrouped} tabs ungrouped, ${result.groupsRemoved} groups removed`,
            'success'
          );
        } else {
          this.showToast(result.reason || 'Nothing to undo', 'info');
        }
      } catch (error) {
        logError('Error during undo:', error);
        this.showToast(`Undo error: ${error.message}`, 'error');
      } finally {
        this.isSorting = false;
        this.setLoading(false);
        this.updateUndoMenuItem();
        this.updateBadge();
        this.updateDynamicTooltip();
      }
    }

    createBroomButton() {
      if (this.broomButton) {
        return this.broomButton;
      }

      const button = document.createElement('button');
      button.id = 'neurosort-broom';
      button.className = 'neurosort-broom-button';
      button.setAttribute('role', 'button');

      button.appendChild(this.createBroomIcon());

      this.badge = this.createBadge();
      button.appendChild(this.badge);

      this.updateButtonTitle();

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 0) {
          this.handleTidyClick(e);
        }
      });

      button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e);
      });

      button.addEventListener('mouseenter', () => {
        this.isParentHovered = true;
        this.updateBadge();
        this.updateDynamicTooltip();
      });

      button.addEventListener('mouseleave', () => {
        this.isParentHovered = false;
      });

      this.broomButton = button;
      return button;
    }

    showContextMenu(event) {
      const menu = this.createContextMenu();
      this.updateUndoMenuItem();

      menu.openPopupAtScreen(
        event.screenX,
        event.screenY,
        true
      );
    }

    findInsertionPoint() {
      const selectors = [
        '.pinned-tabs-container-separator',
        '#zen-workspaces-button',
        '.zen-sidebar-top',
        '#zen-sidebar',
        '.zen-vertical-tabs',
        '#TabsToolbar',
        '#tabbrowser-tabs',
        '#navigator-toolbox',
        'tabbox',
      ];

      log('Searching for insertion point, trying selectors:', selectors);

      for (const selector of selectors) {
        log('Trying selector:', selector);
        const el = document.querySelector(selector);
        if (el) {
          log('Found insertion point:', selector, el);
          return el;
        }
        log('Selector not found:', selector);
      }

      log('No insertion point found among all selectors');
      return null;
    }

    async injectBroomButton(retryCount = 0) {
      if (!getPref(PREF.ENABLED, true)) {
        log('NeuroSort disabled, not injecting button');
        return;
      }

      // Zen creates multiple workspace separators dynamically. We need to attach to all of them.
      const separators = document.querySelectorAll('.pinned-tabs-container-separator');

      if (separators.length === 0) {
        log(`Could not find any pinned tab separators (retry ${retryCount}/3)`);

        if (retryCount < 3) {
          const delay = retryCount === 0 ? 500 : 1500;
          log(`Retrying injection after ${delay}ms...`);
          setTimeout(() => this.injectBroomButton(retryCount + 1), delay);
        } else {
          log('Max retries reached, attempting fallback injection');
          const button = this.createBroomButton();
          this.injectBroomButtonFallback(button);
        }
        return;
      }

      separators.forEach((separator, index) => {
        // Build a unique button for each separator to avoid moving existing ones around
        const existing = separator.querySelector('#neurosort-broom');
        if (existing) {
          return; // Already injected
        }

        const button = this.createBroomButton().cloneNode(true);
        // The cloned node doesn't copy event listeners, so we must attach them manually

        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.button === 0) {
            this.handleTidyClick(e);
          }
        });

        button.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showContextMenu(e);
        });

        const nativeClearButton = separator.querySelector('.zen-workspace-close-unpinned-tabs-button');

        if (window.getComputedStyle(separator).position === 'static') {
          separator.style.position = 'relative';
        }

        if (nativeClearButton) {
          separator.insertBefore(button, nativeClearButton);
        } else {
          separator.appendChild(button);
        }

        log(`Broom button injected successfully at separator ${index + 1}`);

        separator.addEventListener('mouseenter', () => {
          this.isParentHovered = true;
          this.updateBadge();
          this.updateDynamicTooltip();
        });
        separator.addEventListener('mouseleave', () => {
          this.isParentHovered = false;
        });
      });

      this.startBadgeUpdates();
      // Ensure we track future separators as Zen workspaces changes (handled by MutationObserver later in the file ideally)
    }

    injectBroomButtonFallback(button) {
      const fallbackContainers = [
        document.querySelector('#browser'),
        document.querySelector('#appcontent'),
        document.querySelector('#main-window'),
        document.body
      ];

      for (const container of fallbackContainers) {
        if (container) {
          log('Using fallback container:', container.id || container.tagName);

          button.style.position = 'fixed';
          button.style.top = '10px';
          button.style.right = '10px';
          button.style.opacity = '0.8';
          button.style.zIndex = '999999';

          container.appendChild(button);
          log('Broom button injected via fallback');
          return;
        }
      }

      logError('Could not inject broom button - no suitable container found');
    }

    async handleTidyClick(event = null, isAuto = false) {
      if (this.isSorting) {
        if (!isAuto) log('Already sorting, ignoring click');
        return;
      }

      const validation = this.groupManager.apiClient.validateConfig();
      if (!validation.valid) {
        if (!isAuto) this.showToast('Please configure your API key in settings', 'error');
        return;
      }

      const isCtrlShiftClick = event?.ctrlKey && event?.shiftKey;
      const isAltShiftClick = event?.altKey && event?.shiftKey;

      let tabs;
      let mode = 'normal';

      if (isAuto) {
        mode = 'normal';
        tabs = this.getUngroupedTabs();
      } else if (isAltShiftClick) {
        mode = 'all';
        tabs = this.getAllTabsForTidy();
        this.showToast(`Tidying ALL ${tabs.length} tabs...`, 'info');
      } else if (isCtrlShiftClick) {
        const selectedTabs = gBrowser.selectedTabs || [];
        if (selectedTabs.length > 1) {
          mode = 'selected';
          tabs = selectedTabs.filter(tab =>
            tab && !tab.closing && !tab.hidden && !tab.pinned
          );
          this.showToast(`Tidying ${tabs.length} selected tabs...`, 'info');
        } else {
          mode = 'normal';
          tabs = this.getUngroupedTabs();
          this.showToast(`Tidying ${tabs.length} ungrouped tabs...`, 'info');
        }
      } else {
        mode = 'all';
        tabs = this.getAllTabsForTidy();
        this.showToast(`Tidying ALL ${tabs.length} tabs...`, 'info');
      }

      if (tabs.length < 2) {
        if (!isAuto) this.showToast('Not enough tabs to tidy', 'info');
        return;
      }

      const largeBatch = tabs.length >= LARGE_BATCH_THRESHOLD;
      if (largeBatch && !isAuto) {
        this.showToast(`Large tidy: processing ${tabs.length} tabs in fast mode...`, 'info');
      }

      this.isSorting = true;
      this.setLoading(true);
      this.broomButton?.classList.add('sorting');
      if (mode === 'all') {
        this.broomButton?.classList.add('neurosort-tidy-all');
      } else if (mode === 'selected') {
        this.broomButton?.classList.add('neurosort-tidy-selected');
      }
      if (!largeBatch) {
        this.setTabsSorting(tabs, true);
      }

      try {
        const result = await this.groupManager.organizeTabs(tabs, {
          useExistingGroups: false,
          forceNewGroups: mode === 'all',
          cleanupEmptyGroups: mode === 'all'
        });

        if (result.rateLimited) {
          if (!isAuto) this.showToast(`Rate limited, please wait ${Math.ceil(result.waitTime / 1000)}s...`, 'info');
          return;
        }

        if (result.success) {
          let message;
          if (mode === 'all') {
            message = `Tidied ALL ${tabs.length} tabs into ${result.groupsCreated} groups`;
            if (result.removedEmptyGroups) {
              message += `, removed ${result.removedEmptyGroups} empty old groups`;
            }
          } else if (mode === 'selected') {
            message = `Tidied ${tabs.length} selected tabs into ${result.groupsCreated} groups`;
          } else {
            message = `Tidied ${tabs.length} tabs into ${result.groupsCreated} groups`;
          }

          if (!isAuto) {
            if (result.fallbackUsed) {
              message += ' (Local Fallback Used. Check API settings)';
              this.showToast(message, 'warning');
            } else if (result.groupsCreated === 0) {
              this.showToast('0 groups created. Tabs may be too dissimilar or API rejected prompt.', 'warning');
            } else {
              this.showToast(message, 'success');
            }
          }
        } else {
          if (!isAuto) this.showToast(result.reason || 'Nothing to tidy', 'info');
        }
      } catch (error) {
        logError('Error during tidy:', error);
        let errorMessage = error.message;
        if (errorMessage.includes('timed out')) {
          errorMessage = 'Request timed out. Please try again.';
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection.';
        }
        this.showToast(`Error: ${errorMessage}`, 'error');
      } finally {
        this.isSorting = false;
        this.setLoading(false);
        this.broomButton?.classList.remove('sorting');
        this.broomButton?.classList.remove('neurosort-tidy-all');
        this.broomButton?.classList.remove('neurosort-tidy-selected');
        if (!largeBatch) {
          this.setTabsSorting(tabs, false);
        }
        this.updateBadge();
        this.updateDynamicTooltip();
      }
    }

    getUngroupedTabs() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const preservePinned = getPref(PREF.PRESERVE_PINNED, true);

      const tabs = [];

      const allTabs = gBrowser.tabs;

      for (const tab of allTabs) {
        if (preservePinned && tab.pinned) {
          continue;
        }

        if (workspaceId) {
          const tabWorkspace = tab.getAttribute('zen-workspace-id');
          if (tabWorkspace && tabWorkspace !== workspaceId) {
            continue;
          }
        }

        const group = tab.parentElement?.closest?.('tab-group');
        if (group) {
          continue;
        }

        if (tab.hidden || tab.getAttribute('hidden')) {
          continue;
        }

        if (tab.closing) {
          continue;
        }

        tabs.push(tab);
      }

      log(`Found ${tabs.length} ungrouped tabs`);
      return tabs;
    }

    getAllTabsForTidy() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const preservePinned = getPref(PREF.PRESERVE_PINNED, true);

      const tabs = [];

      for (const tab of gBrowser.tabs) {
        if (preservePinned && tab.pinned) {
          continue;
        }

        if (workspaceId) {
          const tabWorkspace = tab.getAttribute('zen-workspace-id');
          if (tabWorkspace && tabWorkspace !== workspaceId) {
            continue;
          }
        }

        if (tab.hidden || tab.getAttribute('hidden')) {
          continue;
        }

        if (tab.closing) {
          continue;
        }

        tabs.push(tab);
      }

      log(`Found ${tabs.length} total tabs for tidy-all`);
      return tabs;
    }

    setTabsSorting(tabs, sorting) {
      for (const tab of tabs) {
        if (sorting) {
          tab.classList.add('neurosort-sorting');
        } else {
          tab.classList.remove('neurosort-sorting');
        }
      }
    }

    showToast(message, type = 'info') {
      if (!this.toastContainer) {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'neurosort-toast-container';
        document.body.appendChild(this.toastContainer);
      }

      const toast = document.createElement('div');
      toast.className = `neurosort-toast neurosort-toast-${type}`;
      toast.textContent = message;

      this.toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('neurosort-toast-fade');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    showQuickSettings() {
      if (this.quickSettingsPopup) {
        this.quickSettingsPopup.remove();
        this.quickSettingsPopup = null;
        return;
      }

      const popup = document.createElement('div');
      popup.id = 'neurosort-quick-settings';
      popup.className = 'neurosort-quick-settings';

      const currentProvider = getPref(PREF.PROVIDER, 'custom');
      const enabled = getPref(PREF.ENABLED, true);
      const autoTidy = getPref(PREF.AUTO_TIDY, false);
      const autoTidyThreshold = getPref(PREF.AUTO_TIDY_THRESHOLD, 6);
      const debug = getPref(PREF.DEBUG, false);

      let apiKeyPref, apiKeyValue;
      switch (currentProvider) {
        case 'openai':
          apiKeyPref = PREF.OPENAI_API_KEY;
          apiKeyValue = getPref(PREF.OPENAI_API_KEY, '');
          break;
        case 'gemini':
          apiKeyPref = PREF.GEMINI_API_KEY;
          apiKeyValue = getPref(PREF.GEMINI_API_KEY, '');
          break;
        case 'ollama':
          apiKeyPref = null;
          apiKeyValue = '';
          break;
        case 'custom':
        default:
          apiKeyPref = PREF.CUSTOM_API_KEY;
          apiKeyValue = getPref(PREF.CUSTOM_API_KEY, '');
          break;
      }

      popup.innerHTML = `
        <div class="neurosort-quick-settings-header">
          <span class="neurosort-quick-settings-title">Quick Settings</span>
          <button class="neurosort-quick-settings-close" title="Close">&times;</button>
        </div>
        <div class="neurosort-quick-settings-content">
          <label class="neurosort-quick-settings-row">
            <span class="neurosort-quick-settings-label">Enabled</span>
            <input type="checkbox" id="neurosort-qs-enabled" ${enabled ? 'checked' : ''}>
          </label>
          
          <label class="neurosort-quick-settings-row">
            <span class="neurosort-quick-settings-label">Provider</span>
            <select id="neurosort-qs-provider" class="neurosort-quick-settings-select">
              <option value="openai" ${currentProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
              <option value="gemini" ${currentProvider === 'gemini' ? 'selected' : ''}>Gemini</option>
              <option value="ollama" ${currentProvider === 'ollama' ? 'selected' : ''}>Ollama</option>
              <option value="custom" ${currentProvider === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
          </label>
          
          <label class="neurosort-quick-settings-row" id="neurosort-qs-apikey-row">
            <span class="neurosort-quick-settings-label">API Key</span>
            <input type="password" id="neurosort-qs-apikey" class="neurosort-quick-settings-input" 
                   value="${apiKeyValue}" placeholder="Enter API key" autocomplete="off">
          </label>
          
          <label class="neurosort-quick-settings-row">
            <span class="neurosort-quick-settings-label">Auto-tidy</span>
            <input type="checkbox" id="neurosort-qs-autotidy" ${autoTidy ? 'checked' : ''}>
          </label>
          
          <label class="neurosort-quick-settings-row">
            <span class="neurosort-quick-settings-label">Auto-tidy threshold</span>
            <input type="number" id="neurosort-qs-threshold" class="neurosort-quick-settings-input" 
                   value="${autoTidyThreshold}" min="2" max="50">
          </label>
          
          <label class="neurosort-quick-settings-row">
            <span class="neurosort-quick-settings-label">Debug mode</span>
            <input type="checkbox" id="neurosort-qs-debug" ${debug ? 'checked' : ''}>
          </label>
          
          <div class="neurosort-quick-settings-footer">
            <a href="about:preferences#neurosort" class="neurosort-quick-settings-link" target="_blank">
              Open full settings
            </a>
          </div>
        </div>
      `;

      const buttonRect = this.broomButton?.getBoundingClientRect();
      if (buttonRect) {
        popup.style.position = 'fixed';
        popup.style.top = `${buttonRect.bottom + 8}px`;
        popup.style.right = `${window.innerWidth - buttonRect.right}px`;
      }

      document.body.appendChild(popup);

      popup.querySelector('.neurosort-quick-settings-close').addEventListener('click', () => {
        popup.remove();
        this.quickSettingsPopup = null;
      });

      popup.querySelector('#neurosort-qs-enabled').addEventListener('change', (e) => {
        Services.prefs.setBoolPref(PREF.ENABLED, e.target.checked);
        this.showToast(`NeuroSort ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
      });

      popup.querySelector('#neurosort-qs-provider').addEventListener('change', (e) => {
        Services.prefs.setStringPref(PREF.PROVIDER, e.target.value);
        this.groupManager.apiClient.cacheConfig();
        this.updateQuickSettingsApiKey(e.target.value, popup);
        this.showToast(`Provider changed to ${e.target.value}`, 'info');
      });

      popup.querySelector('#neurosort-qs-apikey').addEventListener('change', (e) => {
        const provider = popup.querySelector('#neurosort-qs-provider').value;
        const keyPref = this.getApiKeyPrefForProvider(provider);
        if (keyPref) {
          Services.prefs.setStringPref(keyPref, e.target.value.trim());
          this.groupManager.apiClient.cacheConfig();
          this.showToast('API key saved', 'success');
        }
      });

      popup.querySelector('#neurosort-qs-autotidy').addEventListener('change', (e) => {
        Services.prefs.setBoolPref(PREF.AUTO_TIDY, e.target.checked);
        this.showToast(`Auto-tidy ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
      });

      popup.querySelector('#neurosort-qs-threshold').addEventListener('change', (e) => {
        const value = Math.max(2, Math.min(50, parseInt(e.target.value) || 6));
        Services.prefs.setIntPref(PREF.AUTO_TIDY_THRESHOLD, value);
        e.target.value = value;
      });

      popup.querySelector('#neurosort-qs-debug').addEventListener('change', (e) => {
        Services.prefs.setBoolPref(PREF.DEBUG, e.target.checked);
      });

      const closeOnOutsideClick = (e) => {
        if (!popup.contains(e.target) && !this.broomButton?.contains(e.target)) {
          popup.remove();
          this.quickSettingsPopup = null;
          document.removeEventListener('click', closeOnOutsideClick);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);

      this.quickSettingsPopup = popup;
      this.updateQuickSettingsApiKeyRow(currentProvider, popup);
    }

    getApiKeyPrefForProvider(provider) {
      switch (provider) {
        case 'openai': return PREF.OPENAI_API_KEY;
        case 'gemini': return PREF.GEMINI_API_KEY;
        case 'custom': return PREF.CUSTOM_API_KEY;
        default: return null;
      }
    }

    updateQuickSettingsApiKey(provider, popup) {
      const keyPref = this.getApiKeyPrefForProvider(provider);
      const apikeyInput = popup.querySelector('#neurosort-qs-apikey');

      if (!keyPref || provider === 'ollama') {
        apikeyInput.value = '';
        apikeyInput.disabled = true;
        apikeyInput.placeholder = 'Not required';
      } else {
        apikeyInput.value = getPref(keyPref, '');
        apikeyInput.disabled = false;
        apikeyInput.placeholder = 'Enter API key';
      }

      this.updateQuickSettingsApiKeyRow(provider, popup);
    }

    updateQuickSettingsApiKeyRow(provider, popup) {
      const row = popup.querySelector('#neurosort-qs-apikey-row');
      if (row) {
        row.style.display = provider === 'ollama' ? 'none' : 'flex';
      }
    }
  }

  // ============================================================================
  // WELCOME MODAL
  // ============================================================================

  class WelcomeModal {
    constructor() {
      this.modal = null;
      this.overlay = null;
      this.selectedProvider = 'openai';
    }

    show() {
      if (this.modal) return;

      this.createModal();
      document.body.appendChild(this.overlay);
      document.body.appendChild(this.modal);

      requestAnimationFrame(() => {
        this.modal.classList.add('neurosort-welcome-visible');
        this.overlay.classList.add('neurosort-overlay-visible');
      });
    }

    createModal() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'neurosort-welcome-overlay';
      this.overlay.className = 'neurosort-welcome-overlay';
      this.overlay.addEventListener('click', () => this.dismiss());

      this.modal = document.createElement('div');
      this.modal.id = 'neurosort-welcome-modal';
      this.modal.className = 'neurosort-welcome-modal';
      this.modal.innerHTML = `
        <button class="neurosort-welcome-close" title="Close">&times;</button>
        <div class="neurosort-welcome-header">
          <div class="neurosort-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <h1>Welcome to NeuroSort</h1>
          <p class="neurosort-welcome-subtitle">AI-powered tab organization for Zen Browser</p>
        </div>
        
        <div class="neurosort-welcome-content">
          <p class="neurosort-welcome-description">
            NeuroSort uses AI to automatically organize your tabs into logical groups.
            Select your preferred AI provider to get started.
          </p>
          
          <div class="neurosort-welcome-field">
            <label for="neurosort-provider-select">AI Provider</label>
            <select id="neurosort-provider-select" class="neurosort-welcome-select">
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>
          
          <div id="neurosort-provider-config" class="neurosort-provider-config">
            <!-- Provider-specific fields will be inserted here -->
          </div>
          
          <div class="neurosort-welcome-links">
            <a href="https://github.com/neurosort/docs" target="_blank" rel="noopener" class="neurosort-welcome-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Documentation
            </a>
          </div>
        </div>
        
        <div class="neurosort-welcome-footer">
          <button id="neurosort-get-started" class="neurosort-welcome-button">
            Get Started
          </button>
        </div>
      `;

      this.modal.querySelector('.neurosort-welcome-close').addEventListener('click', () => this.dismiss());
      this.modal.querySelector('#neurosort-provider-select').addEventListener('change', (e) => {
        this.selectedProvider = e.target.value;
        this.updateProviderConfig();
      });
      this.modal.querySelector('#neurosort-get-started').addEventListener('click', () => this.saveAndClose());

      this.updateProviderConfig();
    }

    updateProviderConfig() {
      const configContainer = this.modal.querySelector('#neurosort-provider-config');

      const configs = {
        openai: `
          <div class="neurosort-welcome-field">
            <label for="neurosort-openai-key">API Key</label>
            <input type="password" id="neurosort-openai-key" class="neurosort-welcome-input" 
                   placeholder="sk-..." autocomplete="off">
          </div>
          <div class="neurosort-welcome-field">
            <label for="neurosort-openai-model">Model</label>
            <input type="text" id="neurosort-openai-model" class="neurosort-welcome-input" 
                   value="gpt-4o-mini" placeholder="gpt-4o-mini">
          </div>
        `,
        gemini: `
          <div class="neurosort-welcome-field">
            <label for="neurosort-gemini-key">API Key</label>
            <input type="password" id="neurosort-gemini-key" class="neurosort-welcome-input" 
                   placeholder="AIza..." autocomplete="off">
          </div>
          <div class="neurosort-welcome-field">
            <label for="neurosort-gemini-model">Model</label>
            <input type="text" id="neurosort-gemini-model" class="neurosort-welcome-input" 
                   value="gemini-2.0-flash" placeholder="gemini-2.0-flash">
          </div>
        `,
        ollama: `
          <div class="neurosort-welcome-field">
            <label for="neurosort-ollama-endpoint">Endpoint</label>
            <input type="text" id="neurosort-ollama-endpoint" class="neurosort-welcome-input" 
                   value="http://localhost:11434" placeholder="http://localhost:11434">
          </div>
          <div class="neurosort-welcome-field">
            <label for="neurosort-ollama-model">Model</label>
            <input type="text" id="neurosort-ollama-model" class="neurosort-welcome-input" 
                   value="llama3.2" placeholder="llama3.2">
          </div>
          <p class="neurosort-welcome-hint">Make sure Ollama is running locally with the specified model.</p>
        `,
        custom: `
          <div class="neurosort-welcome-field">
            <label for="neurosort-custom-endpoint">Endpoint</label>
            <input type="text" id="neurosort-custom-endpoint" class="neurosort-welcome-input" 
                   value="" placeholder="https://api.example.com/v1">
          </div>
          <div class="neurosort-welcome-field">
            <label for="neurosort-custom-key">API Key</label>
            <input type="password" id="neurosort-custom-key" class="neurosort-welcome-input" 
                   placeholder="Your API key" autocomplete="off">
          </div>
          <div class="neurosort-welcome-field">
            <label for="neurosort-custom-model">Model</label>
            <input type="text" id="neurosort-custom-model" class="neurosort-welcome-input" 
                   value="" placeholder="model-name">
          </div>
        `
      };

      configContainer.innerHTML = configs[this.selectedProvider] || '';
    }

    saveAndClose() {
      this.savePreferences();

      try {
        Services.prefs.setBoolPref(PREF.SETUP_COMPLETE, true);
      } catch (e) {
        logError('Failed to save setup_complete preference:', e);
      }

      this.dismiss();

      setTimeout(() => {
        const toastContainer = document.getElementById('neurosort-toast-container');
        if (!toastContainer) {
          const container = document.createElement('div');
          container.id = 'neurosort-toast-container';
          document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'neurosort-toast neurosort-toast-success';
        toast.textContent = 'NeuroSort is ready! Click the broom icon to organize your tabs.';
        document.getElementById('neurosort-toast-container').appendChild(toast);

        setTimeout(() => {
          toast.classList.add('neurosort-toast-fade');
          setTimeout(() => toast.remove(), 300);
        }, 4000);
      }, 300);
    }

    savePreferences() {
      try {
        Services.prefs.setStringPref(PREF.PROVIDER, this.selectedProvider);

        switch (this.selectedProvider) {
          case 'openai': {
            const key = this.modal.querySelector('#neurosort-openai-key')?.value?.trim();
            const model = this.modal.querySelector('#neurosort-openai-model')?.value?.trim();
            if (key) Services.prefs.setStringPref(PREF.OPENAI_API_KEY, key);
            if (model) Services.prefs.setStringPref(PREF.OPENAI_MODEL, model);
            break;
          }
          case 'gemini': {
            const key = this.modal.querySelector('#neurosort-gemini-key')?.value?.trim();
            const model = this.modal.querySelector('#neurosort-gemini-model')?.value?.trim();
            if (key) Services.prefs.setStringPref(PREF.GEMINI_API_KEY, key);
            if (model) Services.prefs.setStringPref(PREF.GEMINI_MODEL, model);
            break;
          }
          case 'ollama': {
            const endpoint = this.modal.querySelector('#neurosort-ollama-endpoint')?.value?.trim();
            const model = this.modal.querySelector('#neurosort-ollama-model')?.value?.trim();
            if (endpoint) Services.prefs.setStringPref(PREF.OLLAMA_ENDPOINT, endpoint);
            if (model) Services.prefs.setStringPref(PREF.OLLAMA_MODEL, model);
            break;
          }
          case 'custom': {
            const endpoint = this.modal.querySelector('#neurosort-custom-endpoint')?.value?.trim();
            const key = this.modal.querySelector('#neurosort-custom-key')?.value?.trim();
            const model = this.modal.querySelector('#neurosort-custom-model')?.value?.trim();
            if (endpoint) Services.prefs.setStringPref(PREF.CUSTOM_ENDPOINT, endpoint);
            if (key) Services.prefs.setStringPref(PREF.CUSTOM_API_KEY, key);
            if (model) Services.prefs.setStringPref(PREF.CUSTOM_MODEL, model);
            break;
          }
        }

        log('Welcome modal preferences saved for provider:', this.selectedProvider);
      } catch (e) {
        logError('Failed to save preferences:', e);
      }
    }

    dismiss() {
      this.modal?.classList.remove('neurosort-welcome-visible');
      this.overlay?.classList.remove('neurosort-overlay-visible');

      setTimeout(() => {
        this.modal?.remove();
        this.overlay?.remove();
        this.modal = null;
        this.overlay = null;
      }, 300);
    }

    injectStyles() {
      if (document.getElementById('neurosort-welcome-styles')) return;

      const style = document.createElement('style');
      style.id = 'neurosort-welcome-styles';
      style.textContent = `
        .neurosort-welcome-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 999998;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .neurosort-overlay-visible {
          opacity: 1;
        }

        .neurosort-welcome-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.95);
          background: var(--zen-bgcolor, #1a1a1a);
          border: 1px solid var(--zen-border, #333);
          border-radius: 16px;
          padding: 0;
          width: 420px;
          max-width: 90vw;
          max-height: 85vh;
          overflow: hidden;
          z-index: 999999;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: var(--zen-text-primary, #fff);
        }

        .neurosort-welcome-visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }

        .neurosort-welcome-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--zen-text-secondary, #888);
          font-size: 20px;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .neurosort-welcome-close:hover {
          background: var(--zen-button-hover-bg, rgba(255,255,255,0.1));
          color: var(--zen-text-primary, #fff);
        }

        .neurosort-welcome-header {
          padding: 24px 24px 16px;
          text-align: center;
          border-bottom: 1px solid var(--zen-border, #333);
        }

        .neurosort-welcome-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 12px;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .neurosort-welcome-icon svg {
          width: 28px;
          height: 28px;
          color: #fff;
        }

        .neurosort-welcome-header h1 {
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 600;
          color: var(--zen-text-primary, #fff);
        }

        .neurosort-welcome-subtitle {
          margin: 0;
          font-size: 14px;
          color: var(--zen-text-secondary, #888);
        }

        .neurosort-welcome-content {
          padding: 20px 24px;
        }

        .neurosort-welcome-description {
          margin: 0 0 20px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--zen-text-secondary, #aaa);
        }

        .neurosort-welcome-field {
          margin-bottom: 16px;
        }

        .neurosort-welcome-field label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--zen-text-secondary, #bbb);
        }

        .neurosort-welcome-input,
        .neurosort-welcome-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--zen-border, #444);
          border-radius: 8px;
          background: var(--zen-input-bg, rgba(0, 0, 0, 0.3));
          color: var(--zen-text-primary, #fff);
          font-size: 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }

        .neurosort-welcome-input:focus,
        .neurosort-welcome-select:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
        }

        .neurosort-welcome-input::placeholder {
          color: var(--zen-text-secondary, #666);
        }

        .neurosort-welcome-hint {
          margin: 8px 0 0;
          font-size: 12px;
          color: var(--zen-text-secondary, #888);
          font-style: italic;
        }

        .neurosort-welcome-links {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--zen-border, #333);
        }

        .neurosort-welcome-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #8b5cf6;
          text-decoration: none;
          font-size: 13px;
          transition: color 0.2s ease;
        }

        .neurosort-welcome-link:hover {
          color: #a78bfa;
        }

        .neurosort-welcome-footer {
          padding: 16px 24px 24px;
        }

        .neurosort-welcome-button {
          width: 100%;
          padding: 12px 24px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .neurosort-welcome-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
        }

        .neurosort-welcome-button:active {
          transform: translateY(0);
        }

        .neurosort-provider-config {
          animation: neurosort-fade-in 0.2s ease;
        }

        @keyframes neurosort-fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;

      document.head.appendChild(style);
    }
  }

  // ============================================================================
  // AUTO-TIDY OBSERVER
  // ============================================================================

  class AutoTidyObserver {
    constructor(ui) {
      this.ui = ui;
      this.cooldown = false;
      this.lastCheck = 0;
      this.observer = null;
    }

    start() {
      if (!getPref(PREF.AUTO_TIDY, false)) {
        log('Auto-tidy disabled');
        return;
      }

      log('Starting auto-tidy observer');

      this.observer = new MutationObserver(() => {
        this.check();
      });

      const tabContainer = gBrowser.tabContainer;
      if (tabContainer) {
        this.observer.observe(tabContainer, {
          childList: true,
          subtree: true
        });
      }

      this.check();
    }

    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }

    check() {
      if (this.cooldown) {
        return;
      }

      const enabled = getPref(PREF.ENABLED, true) && getPref(PREF.AUTO_TIDY, false);
      if (!enabled) {
        return;
      }

      const threshold = getPref(PREF.AUTO_TIDY_THRESHOLD, 6);
      const cooldownSeconds = getPref(PREF.AUTO_TIDY_COOLDOWN, 30);

      const ungroupedCount = this.ui.getUngroupedTabs().length;

      log(`Auto-tidy check: ${ungroupedCount} ungrouped tabs (threshold: ${threshold})`);

      if (ungroupedCount >= threshold) {
        log('Triggering auto-tidy');
        this.cooldown = true;

        this.ui.handleTidyClick(null, true);

        setTimeout(() => {
          this.cooldown = false;
        }, cooldownSeconds * 1000);
      }
    }
  }

  // ============================================================================
  // MAIN CLASS
  // ============================================================================

  class NeuroSort {
    constructor() {
      this.groupManager = new GroupManager();
      this.ui = new NeuroSortUI(this.groupManager);
      this.autoTidy = null;
      this.initialized = false;
      this.welcomeModal = new WelcomeModal();
    }

    async init() {
      if (this.initialized) {
        return;
      }

      console.log('[NeuroSort] Initializing v1.1.13...');

      await this.waitForDependencies();

      this.injectStyles();

      this.welcomeModal.injectStyles();
      this.checkFirstTimeSetup();

      this.ui.injectBroomButton();
      this.setupWorkspaceObserver();

      this.setupKeyboardShortcut();

      this.autoTidy = new AutoTidyObserver(this.ui);
      this.autoTidy.start();

      this.setupPreferenceListener();

      this.initialized = true;
      console.log('[NeuroSort] Initialized successfully');
    }

    setupWorkspaceObserver() {
      // Watch for new workspace separators being created in the vertical tabs container
      const container = document.querySelector('#tabbrowser-tabpanels') ||
        document.querySelector('#navigator-toolbox') ||
        document.body;

      this.workspaceObserver = new MutationObserver((mutations) => {
        let shouldReinjeect = false;

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              // If a new separator is added, or a container that might hold one is added
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList?.contains('pinned-tabs-container-separator') ||
                  node.querySelector?.('.pinned-tabs-container-separator')) {
                  shouldReinjeect = true;
                  break;
                }
              }
            }
          }
          if (shouldReinjeect) break;
        }

        if (shouldReinjeect) {
          log('New workspace container detected, re-injecting button...');
          this.ui.injectBroomButton();
        }
      });

      this.workspaceObserver.observe(container, {
        childList: true,
        subtree: true
      });
    }

    checkFirstTimeSetup() {
      const setupComplete = getPref(PREF.SETUP_COMPLETE, false);
      if (!setupComplete) {
        log('First-time user detected, showing welcome modal');
        setTimeout(() => this.welcomeModal.show(), 500);
      }
    }

    setupKeyboardShortcut() {
      window.addEventListener('keydown', (e) => {
        if (this.ui.isSorting) return;

        const shortcut = getPref(PREF.KEYBOARD_SHORTCUT, 'alt+shift+t');
        if (!shortcut) return;

        if (matchesKeyboardEvent(shortcut, e)) {
          e.preventDefault();
          e.stopPropagation();
          log('Keyboard shortcut triggered:', shortcut);
          this.ui.handleTidyClick();
        }
      }, true);

      window.addEventListener('keydown', (e) => {
        if (this.ui.isSorting) return;

        const isMac = navigator.platform.toLowerCase().includes('mac');
        const isUndoKey = e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'ж';

        if (!isUndoKey) return;

        let isUndoShortcut = false;
        if (isMac) {
          isUndoShortcut = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
        } else {
          isUndoShortcut = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
        }

        if (isUndoShortcut) {
          const activeElement = document.activeElement;
          const isInputField = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
          );

          if (isInputField) return;

          e.preventDefault();
          e.stopPropagation();
          log('Undo keyboard shortcut triggered');
          this.ui.handleUndo();
        }
      }, true);
    }

    async waitForDependencies() {
      return new Promise((resolve) => {
        const check = () => {
          if (window.gBrowser && window.gBrowser.tabs) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    injectStyles() {
      if (document.getElementById('neurosort-styles')) {
        return;
      }

      const style = document.createElement('style');
      style.id = 'neurosort-styles';
      style.textContent = `
        /* Broom Button Styles */
        #neurosort-broom {
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          padding: 4px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--zen-text-secondary, #888);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #neurosort-broom:hover {
          opacity: 1;
          background: var(--zen-button-hover-bg, rgba(255,255,255,0.1));
          color: var(--zen-text-primary, #fff);
        }

        #neurosort-broom.sorting {
          opacity: 1;
          animation: neurosort-pulse 1s ease-in-out infinite;
        }

        #neurosort-broom.loading {
          opacity: 1;
        }

        .neurosort-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: var(--zen-text-secondary, #888);
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s ease, background 0.2s ease;
        }

        #neurosort-broom:hover .neurosort-badge {
          opacity: 1;
        }

        .neurosort-badge-highlight {
          background: #ef4444 !important;
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
        }

        #zen-workspaces-button:hover .neurosort-badge,
        .zen-sidebar-top:hover .neurosort-badge,
        #TabsToolbar:hover .neurosort-badge {
          opacity: 1;
        }

        #neurosort-broom.neurosort-tidy-all {
          border: 2px solid #f59e0b;
          box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
        }

        #neurosort-broom.neurosort-tidy-selected {
          border: 2px solid #8b5cf6;
          box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
        }

        .neurosort-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--zen-text-secondary, #888);
          border-top-color: transparent;
          border-radius: 50%;
          animation: neurosort-spin 0.8s linear infinite;
        }

        @keyframes neurosort-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes neurosort-pulse {
          0%, 100% { 
            opacity: 0.6; 
            transform: translateY(-50%) scale(1); 
          }
          50% { 
            opacity: 1; 
            transform: translateY(-50%) scale(1.1); 
          }
        }

        /* Show button on parent hover */
        #zen-workspaces-button:hover #neurosort-broom,
        .zen-sidebar-top:hover #neurosort-broom,
        #TabsToolbar:hover #neurosort-broom {
          opacity: 0.7;
        }

        /* Tab Sorting Animation */
        .neurosort-sorting .tab-icon-image,
        .neurosort-sorting .tab-label {
          animation: neurosort-tab-pulse 1.5s ease-in-out infinite;
        }

        @keyframes neurosort-tab-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* Toast Notifications */
        #neurosort-toast-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .neurosort-toast {
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #fff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: neurosort-toast-in 0.3s ease;
          max-width: 300px;
        }

        .neurosort-toast-success {
          background: linear-gradient(135deg, #10b981, #059669);
        }

        .neurosort-toast-error {
          background: linear-gradient(135deg, #ef4444, #dc2626);
        }

        .neurosort-toast-info {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
        }

        .neurosort-toast-warning {
          background: linear-gradient(135deg, #f59e0b, #d97706);
        }

        .neurosort-toast-fade {
          animation: neurosort-toast-out 0.3s ease forwards;
        }

        @keyframes neurosort-toast-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes neurosort-toast-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }

        /* Dark mode adjustments */
        @media (prefers-color-scheme: dark) {
          #neurosort-broom {
            color: var(--zen-text-secondary, #aaa);
          }
          #neurosort-broom:hover {
            color: var(--zen-text-primary, #eee);
          }
        }

        /* Context Menu Styles */
        #neurosort-context-menu {
          background: var(--zen-bgcolor, #1a1a1a);
          border: 1px solid var(--zen-border, #333);
          border-radius: 8px;
          padding: 4px 0;
          min-width: 200px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }

        .neurosort-menu-item {
          padding: 8px 16px !important;
          color: var(--zen-text-primary, #fff) !important;
          font-size: 13px !important;
          cursor: pointer;
        }

        .neurosort-menu-item:hover {
          background: var(--zen-button-hover-bg, rgba(255,255,255,0.1)) !important;
        }

        .neurosort-menu-item[disabled="true"] {
          color: var(--zen-text-secondary, #666) !important;
          pointer-events: none;
        }

        .neurosort-stats-item {
          font-style: italic;
          font-size: 12px !important;
          color: var(--zen-text-secondary, #888) !important;
        }

        #neurosort-context-menu menuseparator {
          margin: 4px 8px;
          border-top: 1px solid var(--zen-border, #333);
        }

        /* Quick Settings Popup */
        .neurosort-quick-settings {
          position: fixed;
          width: 280px;
          max-width: 280px;
          background: var(--zen-bgcolor, #1a1a1a);
          border: 1px solid var(--zen-border, #333);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          color: var(--zen-text-primary, #fff);
          animation: neurosort-qs-in 0.2s ease;
        }

        @keyframes neurosort-qs-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .neurosort-quick-settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--zen-border, #333);
        }

        .neurosort-quick-settings-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--zen-text-primary, #fff);
        }

        .neurosort-quick-settings-close {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: var(--zen-text-secondary, #888);
          font-size: 18px;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .neurosort-quick-settings-close:hover {
          background: var(--zen-button-hover-bg, rgba(255, 255, 255, 0.1));
          color: var(--zen-text-primary, #fff);
        }

        .neurosort-quick-settings-content {
          padding: 10px 14px 14px;
        }

        .neurosort-quick-settings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          cursor: pointer;
        }

        .neurosort-quick-settings-row:hover {
          background: var(--zen-button-hover-bg, rgba(255, 255, 255, 0.05));
          border-radius: 6px;
          margin: 0 -6px;
          padding: 8px 6px;
        }

        .neurosort-quick-settings-label {
          color: var(--zen-text-secondary, #bbb);
          font-size: 13px;
        }

        .neurosort-quick-settings-input {
          width: 100px;
          padding: 6px 8px;
          border: 1px solid var(--zen-border, #444);
          border-radius: 6px;
          background: var(--zen-input-bg, rgba(0, 0, 0, 0.3));
          color: var(--zen-text-primary, #fff);
          font-size: 12px;
          transition: border-color 0.2s ease;
          box-sizing: border-box;
        }

        .neurosort-quick-settings-input:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .neurosort-quick-settings-input[type="number"] {
          width: 60px;
          text-align: center;
        }

        .neurosort-quick-settings-select {
          width: 100px;
          padding: 6px 8px;
          border: 1px solid var(--zen-border, #444);
          border-radius: 6px;
          background: var(--zen-input-bg, rgba(0, 0, 0, 0.3));
          color: var(--zen-text-primary, #fff);
          font-size: 12px;
          cursor: pointer;
        }

        .neurosort-quick-settings-select:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .neurosort-quick-settings-row input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #8b5cf6;
          cursor: pointer;
        }

        .neurosort-quick-settings-footer {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--zen-border, #333);
          text-align: center;
        }

        .neurosort-quick-settings-link {
          color: #8b5cf6;
          text-decoration: none;
          font-size: 12px;
          transition: color 0.2s ease;
        }

        .neurosort-quick-settings-link:hover {
          color: #a78bfa;
          text-decoration: underline;
        }
      `;

      document.head.appendChild(style);
      log('Styles injected');
    }

    setupPreferenceListener() {
      Services.prefs.addObserver(PREF.ENABLED, () => {
        log('Preference changed, re-initializing');
        this.ui.injectBroomButton();
      });

      Services.prefs.addObserver(PREF.AUTO_TIDY, () => {
        if (getPref(PREF.AUTO_TIDY, false)) {
          this.autoTidy?.start();
        } else {
          this.autoTidy?.stop();
        }
      });

      Services.prefs.addObserver(PREF.KEYBOARD_SHORTCUT, () => {
        log('Keyboard shortcut preference changed');
        this.ui.updateButtonTitle();
      });
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  const neurosort = new NeuroSort();

  if (document.readyState === 'complete') {
    neurosort.init();
  } else {
    window.addEventListener('load', () => neurosort.init(), { once: true });
  }

  setTimeout(() => neurosort.init(), 1000);
  setTimeout(() => neurosort.init(), 3000);

  console.log('[NeuroSort] Script loaded v1.1.13');

})();
