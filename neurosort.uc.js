// ==UserScript==
// @name           NeuroSort
// @ignorecache
// ==/UserScript==
// VERSION 1.0.2 - NeuroSort - AI-powered tab organization for Zen Browser
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
      log(\`Error reading preference \${prefName}:\`, e);
    }
    return defaultValue;
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

  // ============================================================================
  // TAB DATA COLLECTION
  // ============================================================================

  /**
   * Extract data from a tab for AI analysis
   */
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
      // Get URL
      if (browser?.currentURI?.spec) {
        url = browser.currentURI.spec;
        try {
          const urlObj = new URL(url);
          hostname = urlObj.hostname.replace(/^www\./, '');
        } catch (e) {
          hostname = url.startsWith('about:') ? 'Internal Page' : 'Invalid URL';
        }
      }

      // Get title
      title = tab.getAttribute('label') || 
              tab.querySelector('.tab-label, .tab-text')?.textContent || 
              hostname || 'Untitled';

      // Skip internal pages
      if (url.startsWith('about:') || url.startsWith('chrome://')) {
        title = title || 'Internal Page';
        return { title, url, description, hostname };
      }

      // Fetch meta description if enabled
      if (getPref(PREF.FETCH_DESCRIPTIONS, true)) {
        try {
          if (browser?.contentDocument) {
            const metaDesc = browser.contentDocument.querySelector('meta[name="description"]');
            if (metaDesc) {
              description = (metaDesc.getAttribute('content') || '').substring(0, 200);
            }
          }
        } catch (e) {
          // Cross-origin or permission error - ignore
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
    }

    /**
     * Build the prompt for the AI
     */
    buildPrompt(tabsData, existingGroups = []) {
      const existingGroupsList = existingGroups.length > 0
        ? existingGroups.map(g => \`- \${g}\`).join('\\n')
        : 'None';

      const tabsList = tabsData.map((data, i) => {
        const parts = [\`\${i + 1}. Title: "\${data.title}"\`];
        if (data.url && !data.url.startsWith('about:')) {
          parts.push(\`   URL: "\${data.url}"\`);
        }
        if (data.description) {
          parts.push(\`   Description: "\${data.description}"\`);
        }
        return parts.join('\\n');
      }).join('\\n\\n');

      return \`Analyze the following tabs and assign each to a logical category.

EXISTING CATEGORIES (use these exact names if a tab fits):
\${existingGroupsList}

TABS TO CATEGORIZE:
\${tabsList}

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
- Just the category names, one per line\`;
    }

    /**
     * Parse the AI response into categories
     */
    parseResponse(responseText, tabsCount) {
      const lines = responseText
        .split('\\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

      // Clean up category names
      const categories = lines.map(line => {
        // Remove numbering, quotes, markdown formatting
        return line
          .replace(/^[\\d.\\-*\\s]+/, '')
          .replace(/["'*]/g, '')
          .replace(/^(Category:?\\s*|The category is:?\\s*)/i, '')
          .trim();
      }).filter(line => line.length > 0);

      // Handle mismatch in count
      if (categories.length < tabsCount) {
        log(\`Warning: AI returned \${categories.length} categories for \${tabsCount} tabs. Padding with "Misc".\`);
        while (categories.length < tabsCount) {
          categories.push('Misc');
        }
      } else if (categories.length > tabsCount) {
        log(\`Warning: AI returned \${categories.length} categories for \${tabsCount} tabs. Truncating.\`);
        categories.length = tabsCount;
      }

      // Title case conversion
      return categories.map(cat => {
        return cat.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .substring(0, 30);
      });
    }

    /**
     * Make API request based on provider format
     */
    async makeRequest(prompt) {
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

    /**
     * Parse streaming SSE response
     */
    parseStreamingResponse(text) {
      // Handle streaming format: "data: {...}\\n\\ndata: {...}\\n\\ndata: [DONE]"
      const lines = text.split('\\n');
      let fullContent = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') break;
          
          try {
            const data = JSON.parse(dataStr);
            // Handle both streaming delta format and regular response format
            const delta = data.choices?.[0]?.delta?.content || 
                         data.choices?.[0]?.message?.content || '';
            fullContent += delta;
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
      
      return fullContent.trim();
    }

    /**
     * OpenAI-compatible request (works for OpenAI and custom endpoints)
     * Handles both streaming and non-streaming responses
     */
    async openaiRequest(prompt) {
      const url = \`\${this.config.endpoint}/chat/completions\`;
      const headers = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = \`Bearer \${this.config.apiKey}\`;
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
        throw new Error(\`API Error \${response.status}: \${errorText.substring(0, 200)}\`);
      }

      const responseText = await response.text();
      log('Raw response (first 500 chars):', responseText.substring(0, 500));

      // Check if response is streaming format (starts with "data:")
      if (responseText.trim().startsWith('data:')) {
        log('Detected streaming response format, parsing...');
        const content = this.parseStreamingResponse(responseText);
        if (!content) {
          throw new Error('Empty content from streaming response');
        }
        return content;
      }

      // Parse as regular JSON
      try {
        const data = JSON.parse(responseText);
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          throw new Error('Empty response from API');
        }
        
        return content.trim();
      } catch (e) {
        // If JSON parse fails, try to extract content from streaming-like format
        log('JSON parse failed, trying streaming parse:', e.message);
        const content = this.parseStreamingResponse(responseText);
        if (!content) {
          throw new Error('Could not parse API response');
        }
        return content;
      }
    }

    /**
     * Gemini API request
     */
    async geminiRequest(prompt) {
      const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${this.config.model}:generateContent?key=\${this.config.apiKey}\`;

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
        throw new Error(\`Gemini API Error \${response.status}: \${errorText}\`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      return content.trim();
    }

    /**
     * Ollama API request
     */
    async ollamaRequest(prompt) {
      const url = \`\${this.config.endpoint}/api/generate\`;

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
        throw new Error(\`Ollama API Error \${response.status}: \${errorText}\`);
      }

      const data = await response.json();
      const content = data.response;

      if (!content) {
        throw new Error('Empty response from Ollama');
      }

      return content.trim();
    }

    /**
     * Main method: categorize tabs
     */
    async categorize(tabs, existingGroups = []) {
      // Refresh config
      this.cacheConfig();

      // Collect tab data
      const tabsData = await Promise.all(tabs.map(tab => getTabData(tab)));
      log('Tab data collected:', tabsData);

      // Build prompt
      const prompt = this.buildPrompt(tabsData, existingGroups);
      log('Prompt length:', prompt.length);

      // Make request
      const response = await this.makeRequest(prompt);
      log('AI Response:', response);

      // Parse response
      const categories = this.parseResponse(response, tabs.length);
      log('Parsed categories:', categories);

      // Return tab->category mappings
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

    /**
     * Get all existing groups in the current workspace
     */
    getExistingGroups() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const groups = [];

      // Query for tab groups in active workspace
      const selector = workspaceId
        ? \`tab-group:has(tab[zen-workspace-id="\${workspaceId}"])\`
        : 'tab-group';

      document.querySelectorAll(selector).forEach(group => {
        // Skip folders and split-view groups
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

    /**
     * Find or create a group by name
     */
    async findOrCreateGroup(category, workspaceId) {
      // First, try to find existing group with this name
      const safeName = category.replace(/"/g, '\\"');
      const selector = \`tab-group[label="\${safeName}"]:has(tab[zen-workspace-id="\${workspaceId}"])\`;
      
      let group = document.querySelector(selector);
      
      if (group) {
        log(\`Found existing group: \${category}\`);
        return group;
      }

      // Create new group
      log(\`Creating new group: \${category}\`);
      
      group = document.createXULElement('tab-group');
      group.id = \`neurosort-\${Date.now()}-\${Math.random().toString(36).substring(2, 9)}\`;
      group.label = category;
      group.color = getNextGroupColor();

      // Find container
      const container = window.gZenWorkspaces?.activeWorkspaceStrip || 
                        gBrowser.tabContainer.querySelector('tabs') ||
                        gBrowser.tabContainer;

      // Insert group
      container.insertBefore(group, container.firstChild);

      // Wait for group to be ready
      await new Promise(resolve => setTimeout(resolve, 50));

      return group;
    }

    /**
     * Add tabs to a group
     */
    async addTabsToGroup(group, tabs) {
      if (!group || !tabs || tabs.length === 0) return;

      log(\`Adding \${tabs.length} tabs to group: \${group.label}\`);

      // Use ATG's addTabs method if available
      if (typeof group.addTabs === 'function') {
        group.addTabs(tabs);
      } else {
        // Fallback: move tabs individually
        for (const tab of tabs) {
          try {
            gBrowser.moveTabToGroup(tab, group);
          } catch (e) {
            logError('Error moving tab to group:', e);
          }
        }
      }

      // Apply favicon color if ATG method available
      await new Promise(resolve => setTimeout(resolve, 100));
      if (typeof group._useFaviconColor === 'function') {
        try {
          await group._useFaviconColor();
        } catch (e) {
          log('Could not apply favicon color:', e);
        }
      }
    }

    /**
     * Main method: organize tabs into groups
     */
    async organizeTabs(tabs) {
      if (!tabs || tabs.length === 0) {
        log('No tabs to organize');
        return { success: false, reason: 'No tabs to organize' };
      }

      const minGroupSize = getPref(PREF.MIN_GROUP_SIZE, 2);
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;

      // Get existing groups for context
      const existingGroups = getPref(PREF.USE_EXISTING_GROUPS, true)
        ? this.getExistingGroups()
        : [];

      // Categorize using AI
      const categorizations = await this.apiClient.categorize(tabs, existingGroups);

      // Group tabs by category
      const groups = {};
      for (const { tab, category } of categorizations) {
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(tab);
      }

      // Filter out groups that are too small
      const validGroups = Object.entries(groups).filter(
        ([_, tabs]) => tabs.length >= minGroupSize
      );

      log(\`Creating \${validGroups.length} groups (filtered \${Object.keys(groups).length - validGroups.length} small groups)\`);

      // Create groups and add tabs
      const createdGroups = [];
      for (const [category, groupTabs] of validGroups) {
        try {
          const group = await this.findOrCreateGroup(category, workspaceId);
          await this.addTabsToGroup(group, groupTabs);
          createdGroups.push({ name: category, tabCount: groupTabs.length });
        } catch (e) {
          logError(\`Error creating group \${category}:\`, e);
        }
      }

      return {
        success: true,
        groupsCreated: createdGroups.length,
        groups: createdGroups,
        ungrouped: tabs.length - validGroups.reduce((sum, [_, t]) => sum + t.length, 0)
      };
    }
  }

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

  class NeuroSortUI {
    constructor(groupManager) {
      this.groupManager = groupManager;
      this.broomButton = null;
      this.isSorting = false;
      this.toastContainer = null;
    }

    /**
     * Create the broom button SVG icon
     */
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

      // Broom/wrench icon
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z');
      
      svg.appendChild(path);
      return svg;
    }

    /**
     * Create and inject the broom button
     */
    createBroomButton() {
      if (this.broomButton) {
        return this.broomButton;
      }

      // Create button
      const button = document.createElement('button');
      button.id = 'neurosort-broom';
      button.className = 'neurosort-broom-button';
      button.title = 'Tidy Tabs with AI';
      button.setAttribute('role', 'button');

      // Add icon
      button.appendChild(this.createBroomIcon());

      // Add click handler
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleTidyClick();
      });

      this.broomButton = button;
      return button;
    }

    /**
     * Find the insertion point for the broom button
     */
    findInsertionPoint() {
      // Try multiple selectors for different Zen versions
      const selectors = [
        '#zen-workspaces-button',  // Workspace button area
        '.zen-sidebar-top',         // Sidebar top area
        '#TabsToolbar',            // Tab toolbar
        '#tabbrowser-tabs',        // Tab container
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          log('Found insertion point:', selector);
          return el;
        }
      }

      return null;
    }

    /**
     * Inject the broom button into the DOM
     */
    injectBroomButton() {
      if (!getPref(PREF.ENABLED, true)) {
        log('NeuroSort disabled, not injecting button');
        return;
      }

      // Remove existing button if any
      const existing = document.getElementById('neurosort-broom');
      if (existing) {
        existing.remove();
      }

      // Create new button
      const button = this.createBroomButton();

      // Find insertion point
      const insertionPoint = this.findInsertionPoint();
      if (!insertionPoint) {
        log('Could not find insertion point for broom button');
        return;
      }

      // Style the parent for positioning
      if (window.getComputedStyle(insertionPoint).position === 'static') {
        insertionPoint.style.position = 'relative';
      }

      // Insert button
      insertionPoint.appendChild(button);
      log('Broom button injected');
    }

    /**
     * Handle tidy button click
     */
    async handleTidyClick() {
      if (this.isSorting) {
        log('Already sorting, ignoring click');
        return;
      }

      // Get tabs to sort
      const tabs = this.getUngroupedTabs();
      
      if (tabs.length < 2) {
        this.showToast('Not enough tabs to tidy', 'info');
        return;
      }

      this.isSorting = true;
      this.broomButton?.classList.add('sorting');
      this.setTabsSorting(tabs, true);

      try {
        const result = await this.groupManager.organizeTabs(tabs);
        
        if (result.success) {
          const message = \`Tidied \${tabs.length} tabs into \${result.groupsCreated} groups\`;
          this.showToast(message, 'success');
        } else {
          this.showToast(result.reason || 'Nothing to tidy', 'info');
        }
      } catch (error) {
        logError('Error during tidy:', error);
        this.showToast(\`Error: \${error.message}\`, 'error');
      } finally {
        this.isSorting = false;
        this.broomButton?.classList.remove('sorting');
        this.setTabsSorting(tabs, false);
      }
    }

    /**
     * Get all ungrouped tabs in current workspace
     */
    getUngroupedTabs() {
      const workspaceId = window.gZenWorkspaces?.activeWorkspace;
      const preservePinned = getPref(PREF.PRESERVE_PINNED, true);
      const tabs = [];

      // Get all tabs
      const allTabs = gBrowser.tabs;

      for (const tab of allTabs) {
        // Skip pinned tabs if configured
        if (preservePinned && tab.pinned) {
          continue;
        }

        // Skip tabs not in current workspace
        if (workspaceId) {
          const tabWorkspace = tab.getAttribute('zen-workspace-id');
          if (tabWorkspace && tabWorkspace !== workspaceId) {
            continue;
          }
        }

        // Skip tabs already in a group
        const group = tab.parentElement?.closest?.('tab-group');
        if (group) {
          continue;
        }

        // Skip hidden tabs
        if (tab.hidden || tab.getAttribute('hidden')) {
          continue;
        }

        // Skip closing tabs
        if (tab.closing) {
          continue;
        }

        tabs.push(tab);
      }

      log(\`Found \${tabs.length} ungrouped tabs\`);
      return tabs;
    }

    /**
     * Set sorting visual state on tabs
     */
    setTabsSorting(tabs, sorting) {
      for (const tab of tabs) {
        if (sorting) {
          tab.classList.add('neurosort-sorting');
        } else {
          tab.classList.remove('neurosort-sorting');
        }
      }
    }

    /**
     * Show a toast notification
     */
    showToast(message, type = 'info') {
      // Create container if needed
      if (!this.toastContainer) {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'neurosort-toast-container';
        document.body.appendChild(this.toastContainer);
      }

      // Create toast
      const toast = document.createElement('div');
      toast.className = \`neurosort-toast neurosort-toast-\${type}\`;
      toast.textContent = message;

      // Add to container
      this.toastContainer.appendChild(toast);

      // Remove after delay
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

      // Observe tab changes
      this.observer = new MutationObserver(() => {
        this.check();
      });

      // Watch for tab additions
      const tabContainer = gBrowser.tabContainer;
      if (tabContainer) {
        this.observer.observe(tabContainer, {
          childList: true,
          subtree: true
        });
      }

      // Initial check
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

      log(\`Auto-tidy check: \${ungroupedCount} ungrouped tabs (threshold: \${threshold})\`);

      if (ungroupedCount >= threshold) {
        log('Triggering auto-tidy');
        this.cooldown = true;

        // Trigger tidy
        this.ui.handleTidyClick();

        // Set cooldown
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

      console.log('[NeuroSort] Initializing v1.0.2...');

      // Wait for dependencies
      await this.waitForDependencies();

      // Inject styles
      this.injectStyles();

      // Inject UI
      this.ui.injectBroomButton();

      // Start auto-tidy observer
      this.autoTidy = new AutoTidyObserver(this.ui);
      this.autoTidy.start();

      // Listen for preference changes
      this.setupPreferenceListener();

      // Mark initialized
      this.initialized = true;
      console.log('[NeuroSort] Initialized successfully');
    }

    async waitForDependencies() {
      return new Promise((resolve) => {
        const check = () => {
          // Wait for gBrowser and basic tab functionality
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
      // Check if styles already injected
      if (document.getElementById('neurosort-styles')) {
        return;
      }

      const style = document.createElement('style');
      style.id = 'neurosort-styles';
      style.textContent = \`
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
      \`;

      document.head.appendChild(style);
      log('Styles injected');
    }

    setupPreferenceListener() {
      // Re-inject button when preferences change
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
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Create and initialize when DOM is ready
  const neurosort = new NeuroSort();

  // Wait for window load
  if (document.readyState === 'complete') {
    neurosort.init();
  } else {
    window.addEventListener('load', () => neurosort.init(), { once: true });
  }

  // Also try after a delay as backup
  setTimeout(() => neurosort.init(), 1000);
  setTimeout(() => neurosort.init(), 3000);

  console.log('[NeuroSort] Script loaded v1.0.2');

})();
