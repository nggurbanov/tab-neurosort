// ==UserScript==
// @name           NeuroSort
// @ignorecache
// ==/UserScript==
// VERSION 1.1.0 - NeuroSort - AI-powered tab organization for Zen Browser
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

  const getTabData = async (tab) => {
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

      if (getPref(PREF.FETCH_DESCRIPTIONS, true)) {
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

    buildPrompt(tabsData, existingGroups = []) {
      const existingGroupsList = existingGroups.length > 0
        ? existingGroups.map(g => `- ${g}`).join('\n')
        : 'None';

      const frequentDomains = this.getDomainFrequency(tabsData);
      const frequentDomainsList = frequentDomains.length > 0
        ? frequentDomains.join(', ')
        : 'None';

      const tabsList = tabsData.map((data, i) => {
        const parts = [`${i + 1}. Title: "${data.title}"`];
        const domain = this.extractDomain(data.url);
        if (domain) {
          parts.push(`   Domain: "${domain}"`);
        }
        if (data.description && data.description.length > 10) {
          parts.push(`   Desc: "${data.description.substring(0, 80)}"`);
        }
        return parts.join('\n');
      }).join('\n\n');

      let prompt = `Analyze the following tabs and assign each to a logical category.

EXISTING CATEGORIES (use these exact names if a tab fits):
${existingGroupsList}

FREQUENT DOMAINS: ${frequentDomainsList}

TABS TO CATEGORIZE:
${tabsList}

INSTRUCTIONS:
1. Assign each tab to a concise category (1-3 words, Title Case)
2. Prefer existing categories when appropriate - use the EXACT same name
3. For new categories, prioritize the website/domain name or main topic
4. Be consistent - similar tabs should get the same category
5. Examples: "GitHub", "YouTube", "Documentation", "News", "Shopping", "Social Media"

OUTPUT FORMAT:
- Output exactly ONE category per line
- Match the number of tabs above
- No numbering, no explanations, no extra text
- Just the category names, one per line`;

      return this.truncatePrompt(prompt, 2000);
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
      const url = `${this.config.endpoint}/chat/completions`;
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

      const tabsData = await Promise.all(tabs.map(tab => getTabData(tab)));
      log('Tab data collected:', tabsData);

      const prompt = this.buildPrompt(tabsData, existingGroups);
      log('Prompt length:', prompt.length);

      let categories;
      try {
        this.lastApiCallTime = Date.now();
        const response = await this.makeRequest(prompt);
        log('AI Response:', response);
        categories = this.parseResponse(response, tabs.length);
        log('Parsed categories:', categories);
      } catch (error) {
        logError('API call failed, using fallback categorization:', error);
        categories = this.fallbackCategorize(tabsData);
        log('Fallback categories:', categories);
      }

      return tabs.map((tab, i) => ({
        tab,
        category: categories[i]
      }));
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

    async findOrCreateGroup(category, workspaceId) {
      const safeName = category.replace(/"/g, '\\"');
      const selector = `tab-group[label="${safeName}"]:has(tab[zen-workspace-id="${workspaceId}"])`;
      
      let group = document.querySelector(selector);
      
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

    async organizeTabs(tabs) {
      if (!tabs || tabs.length === 0) {
        log('No tabs to organize');
        return { success: false, reason: 'No tabs to organize' };
      }

      const minGroupSize = getPref(PREF.MIN_GROUP_SIZE, 2);
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;

      const existingGroups = getPref(PREF.USE_EXISTING_GROUPS, true)
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
      for (const [category, groupTabs] of validGroups) {
        try {
          const group = await this.findOrCreateGroup(category, workspaceId);
          await this.addTabsToGroup(group, groupTabs);
          
          undoEntry.createdGroupIds.push(group.id);
          const tabIds = groupTabs.map(tab => ({
            tab: tab,
            tabId: generateTabId(tab),
            originalIndex: Array.from(gBrowser.tabs).indexOf(tab),
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

      sortHistory.push(undoEntry);

      return {
        success: true,
        groupsCreated: createdGroups.length,
        groups: createdGroups,
        ungrouped: tabs.length - validGroups.reduce((sum, [_, t]) => sum + t.length, 0),
        undoEntry
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
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.style.width = '16px';
      svg.style.height = '16px';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z');
      
      svg.appendChild(path);
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

      const menu = document.createElement('menupopup');
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
      undoItem.label = 'Undo Last Sort (Ctrl/Cmd+Z)';
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

      const existing = document.getElementById('neurosort-broom');
      if (existing) {
        existing.remove();
      }

      const button = this.createBroomButton();

      const insertionPoint = this.findInsertionPoint();
      if (!insertionPoint) {
        log(`Could not find insertion point for broom button (retry ${retryCount}/3)`);
        
        if (retryCount < 3) {
          const delay = retryCount === 0 ? 500 : 1500;
          log(`Retrying injection after ${delay}ms...`);
          setTimeout(() => this.injectBroomButton(retryCount + 1), delay);
        } else {
          log('Max retries reached, attempting fallback injection');
          this.injectBroomButtonFallback(button);
        }
        return;
      }

      if (window.getComputedStyle(insertionPoint).position === 'static') {
        insertionPoint.style.position = 'relative';
      }

      insertionPoint.appendChild(button);
      log('Broom button injected successfully at:', insertionPoint.id || insertionPoint.className || insertionPoint.tagName);

      this.startBadgeUpdates();

      const parent = insertionPoint;
      parent.addEventListener('mouseenter', () => {
        this.isParentHovered = true;
        this.updateBadge();
        this.updateDynamicTooltip();
      });
      parent.addEventListener('mouseleave', () => {
        this.isParentHovered = false;
      });
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

    async handleTidyClick(event) {
      if (this.isSorting) {
        log('Already sorting, ignoring click');
        return;
      }

      const validation = this.groupManager.apiClient.validateConfig();
      if (!validation.valid) {
        this.showToast('Please configure your API key in settings', 'error');
        return;
      }

      const isCtrlShiftClick = event?.ctrlKey && event?.shiftKey;
      const isAltShiftClick = event?.altKey && event?.shiftKey;
      
      let tabs;
      let mode = 'normal';
      
      if (isAltShiftClick) {
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
        tabs = this.getUngroupedTabs();
      }
      
      if (tabs.length < 2) {
        this.showToast('Not enough tabs to tidy', 'info');
        return;
      }

      this.isSorting = true;
      this.setLoading(true);
      this.broomButton?.classList.add('sorting');
      if (mode === 'all') {
        this.broomButton?.classList.add('neurosort-tidy-all');
      } else if (mode === 'selected') {
        this.broomButton?.classList.add('neurosort-tidy-selected');
      }
      this.setTabsSorting(tabs, true);

      try {
        const result = await this.groupManager.organizeTabs(tabs);

        if (result.rateLimited) {
          this.showToast(`Rate limited, please wait ${Math.ceil(result.waitTime / 1000)}s...`, 'info');
          return;
        }

        if (result.success) {
          let message;
          if (mode === 'all') {
            message = `Tidied ALL ${tabs.length} tabs into ${result.groupsCreated} groups`;
          } else if (mode === 'selected') {
            message = `Tidied ${tabs.length} selected tabs into ${result.groupsCreated} groups`;
          } else {
            message = `Tidied ${tabs.length} tabs into ${result.groupsCreated} groups`;
          }
          this.showToast(message, 'success');
        } else {
          this.showToast(result.reason || 'Nothing to tidy', 'info');
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
        this.setTabsSorting(tabs, false);
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

        this.ui.handleTidyClick();

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
    }

    async init() {
      if (this.initialized) {
        return;
      }

      console.log('[NeuroSort] Initializing v1.1.0...');

      await this.waitForDependencies();

      this.injectStyles();

      this.ui.injectBroomButton();

      this.setupKeyboardShortcut();

      this.autoTidy = new AutoTidyObserver(this.ui);
      this.autoTidy.start();

      this.setupPreferenceListener();

      this.initialized = true;
      console.log('[NeuroSort] Initialized successfully');
    }

    setupKeyboardShortcut() {
      window.addEventListener('keydown', (e) => {
        if (this.ui.isSorting) return;

        const shortcut = getPref(PREF.KEYBOARD_SHORTCUT, 'ctrl+shift+t');
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
          isUndoShortcut = e.metaKey && !e.shiftKey && !e.ctrlKey;
        } else {
          isUndoShortcut = e.ctrlKey && !e.shiftKey && !e.metaKey;
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

  console.log('[NeuroSort] Script loaded v1.1.0');

})();
