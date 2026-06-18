# NeuroSort

<div align="center">
  <img src="https://img.shields.io/badge/version-1.1.20-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/zen%20browser-compatible-purple.svg" alt="Zen Browser">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</div>

**AI-powered tab organization for Zen Browser**

NeuroSort automatically organizes your tabs into smart groups using OpenAI-compatible APIs. Inspired by Arc Browser's "Tidy Tabs" feature.

---

## ⚠️ IMPORTANT PREREQUISITE

**You MUST enable "Allow unsafe JS" in Sine settings for this mod to work!**

> **Why is this needed?** Sine blocks scripts from external sources (like GitHub) by default for security. Only mods from the official Sine store are auto-trusted. Since NeuroSort is installed from GitHub, you must explicitly allow unsafe JS.

### How to Enable

1. Open Zen Browser Settings
2. Navigate to **Settings → Sine → Allow unsafe JS from external sources**
3. Toggle it **ON**
4. Restart Zen Browser

**Without this setting enabled, the broom button will NOT appear and the mod will not load.**

---

## 📦 Installation

### Prerequisites

- **Zen Browser** - [Download here](https://zen-browser.app/)
- **Sine** - Theme/mod manager for Firefox-based browsers - [Installation Guide](https://github.com/CosmoCreeper/Sine/wiki/Installation)
- **Tab group support** - NeuroSort uses Zen/Sine tab group capabilities when available. Advanced Tab Groups is optional historical compatibility, not a hard install requirement.

### Step 1: Enable "Allow unsafe JS"

**This is required before installation!**

1. Open Zen Browser Settings
2. Go to **Settings → Sine → Allow unsafe JS from external sources**
3. Enable the toggle
4. Restart Zen Browser if needed

### Step 2: Install from GitHub

1. Open Zen Browser Settings
2. Go to **Sine → Mods**
3. Click "Add repository" or paste the GitHub repository path
4. Enter: `nggurbanov/tab-neurosort`
5. Install and enable the mod

NeuroSort is installed from the canonical GitHub repository above. It is not currently documented as a Sine store listing.

### Step 3: Configure Privacy And API Settings

1. Open Zen Browser Settings
2. Go to **Sine → NeuroSort preferences**
3. Leave Provider set to `disabled` until you are ready to send tab data to an AI provider
4. Select a provider, fill the required fields, and grant data-sending consent before using AI sorting

---

## ✨ Features

### Core Features
- 🧹 **Arc-style Broom Button** - Click to tidy all ungrouped tabs
- 🤖 **Multi-Provider AI Support** - OpenAI, Google Gemini, Ollama (local), or any custom endpoint
- 🔄 **Auto-Tidy** - Automatically organize when tabs exceed a threshold
- 🎨 **Zen/Sine Tab Group Integration** - Uses available tab group APIs and fails closed if grouping support is unavailable
- 📝 **Optional Smart Context** - Page description fetching is off by default and only runs when enabled
- 🎯 **Existing Group Awareness** - AI prefers existing group names

### User Experience
- 🎬 **Welcome/Setup Screen** - First-time users see a guided setup wizard
- 📋 **Context Menu** - Right-click the broom button for more options
- ↩️ **Undo** - Alt+Shift+Z or the context menu undo the last tidy operation for this browser session
- 🔢 **Selected Tab Sorting** - Explicitly choose selected tabs from the context menu or configured UI action
- 🧹 **Tidy All** - Alt+Shift+Click to sort all tabs (including grouped)
- ⚙️ **Quick Settings** - Quick settings popup accessible from context menu
- 🔔 **Status Badge** - Shows ungrouped tabs count on the broom button
- ⌨️ **Keyboard Shortcuts** - Configurable global shortcuts (defaults: Alt+Shift+T for tidy, Alt+Shift+Z for undo)
- 📊 **Group Stats** - View group statistics in the context menu

### Reliability
- 🛡️ **Fallback Categorization** - Domain-based fallback when API fails
- ⏱️ **Rate Limiting** - Protection against API spam
- ⏳ **Loading Indicator** - Spinner animation during sorting operations

---

## ⚙️ Configuration

NeuroSort is privacy-first by default. The provider starts as `disabled`, data-sending consent starts off, and page description fetching starts off. No network request is made until you choose a provider, fill the required provider fields, and grant consent in NeuroSort preferences. There is no hidden default remote endpoint.

### OpenAI Setup

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. In Zen Settings → Sine → NeuroSort preferences:
   - Provider: `OpenAI`
   - API Key: `sk-...`
   - Model: `gpt-4o-mini` (recommended for cost) or `gpt-4o`

### Google Gemini Setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com/)
2. In NeuroSort preferences:
   - Provider: `Google Gemini`
   - API Key: `AIza...`
   - Model: `gemini-2.0-flash` (recommended, free tier available)

### Ollama Setup (Local, Free)

1. Install [Ollama](https://ollama.com/)
2. Pull a model: `ollama pull llama3.2`
3. In NeuroSort preferences:
   - Provider: `Ollama (Local)`
   - Endpoint: `http://localhost:11434`
   - Model: `llama3.2`

### Custom Endpoint

For self-hosted APIs or alternative providers:

- **Endpoint URL**: Your API base URL (e.g., `https://api.example.com/v1`)
- **API Key**: Your authentication key
- **Model**: Model identifier
- **Request Format**: `OpenAI-compatible` or `Ollama format`

Works with:
- [LM Studio](https://lmstudio.ai/)
- [vLLM](https://github.com/vllm-project/vllm)
- [LocalAI](https://localai.io/)
- [OpenRouter](https://openrouter.ai/)
- Any OpenAI-compatible API server

---

## 🎯 Usage

### Manual Tidy

1. Open tabs as usual
2. Hover over the workspace button area (top of sidebar)
3. Click the 🧹 broom icon
4. Ungrouped tabs in the current workspace are organized into logical groups

### Context Menu

Right-click the broom button to access:
- **Sort Ungrouped Tabs** - Organize only ungrouped tabs
- **Sort All Tabs** - Reorganize all tabs (including grouped)
- **Sort Selected Tabs** - Organize only selected tabs
- **Undo Last Sort** - Best-effort restore of the previous tidy operation in this browser session
- **Quick Settings** - Adjust common settings without opening preferences
- **Group Stats** - View current tab group statistics

### Multi-Select Sorting

To sort specific tabs:
1. Select tabs using Ctrl/Cmd + click
2. Choose **Sort Selected Tabs** from the context menu or configured UI action
3. Only selected tabs will be organized

### Tidy All Tabs

To reorganize all tabs (including already grouped):
- Alt+Shift+Click the broom button
- Or choose **Sort All Tabs** from the context menu

### Auto-Tidy

1. Enable "Auto-tidy when ungrouped tabs exceed threshold"
2. Set threshold (default: 6 tabs)
3. Tabs will automatically organize when threshold is exceeded

### Undo

- Press **Alt+Shift+Z** to undo the last tidy operation
- Or use **Undo Last Sort** from the context menu
- Undo is session-local and best effort: it restores original group membership and order first, but can degrade if tabs or groups were closed or changed after the tidy

### Status Badge

The broom button displays a badge showing the count of ungrouped tabs, giving you quick visibility into how many tabs need organizing.

---

## 🔧 Preferences

| Setting | Description | Default |
|---------|-------------|---------|
| Enable NeuroSort | Master toggle | `true` |
| Auto-tidy | Automatically organize tabs | `false` |
| Auto-tidy threshold | Number of tabs to trigger | `6` |
| Auto-tidy cooldown | Seconds between auto-tidies | `30` |
| Provider | AI provider selection | `disabled` |
| Data-sending consent | Allows sending tab metadata to the selected provider | `false` |
| Minimum group size | Tabs needed to form group | `2` |
| Preserve pinned tabs | Never group pinned tabs | `true` |
| Use existing groups | Prefer existing group names | `true` |
| Fetch descriptions | Get meta descriptions for context | `false` |
| Keyboard shortcut | Global shortcut for sorting | `alt+shift+t` |
| Show status badge | Display ungrouped tab count | `true` |
| Enable fallback | Use domain-based fallback on API failure | `true` |
| Rate limit cooldown | Seconds between API calls | `5` |
| Debug mode | Log to browser console | `false` |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+T` | Sort ungrouped tabs (configurable) |
| `Alt+Shift+Z` | Undo last tidy operation |
| `Alt+Shift+Click` | Sort all tabs (including grouped) |
| Right-click broom | Open context menu |

---

## 🔐 Privacy And Logging

- Provider is `disabled` by default, and tab metadata is not sent until provider settings are complete and data-sending consent is enabled.
- Description fetching is off by default. When enabled, page descriptions may be included in prompt context.
- Debug logging is off by default. When enabled, NeuroSort redacts sensitive details and must not log API keys, Authorization headers, request bodies, raw prompts, full URLs, or response bodies.
- Remote providers receive tab titles, domains, and eligible tab metadata needed for grouping. Use Ollama or another local endpoint if you do not want tab metadata sent to a hosted provider.

---

## 🧩 Compatibility

- Targeted Zen/Sine QA facts for this redesign: Zen stable `1.21.1b`, Zen Twilight `1.22t` via `twilight-1`, Sine stable `v2.3.3`, and Cosine prerelease `v2.3.3c`.
- NeuroSort uses Zen/Sine tab group capabilities when available and fails closed with a setup message if required group APIs are missing.
- Advanced Tab Groups compatibility is optional and historical. It is not a hard install requirement.
- Zen folders, split views, pinned tabs, and tab groups are treated as distinct browser concepts.

---

## 🐛 Troubleshooting

### Button Not Appearing

**Most common cause: "Allow unsafe JS" is disabled**

1. Go to **Settings → Sine → Allow unsafe JS from external sources**
2. Make sure it's **ENABLED**
3. Restart Zen Browser
4. If still not working, ensure Sine is properly installed and the current Zen/Sine build exposes tab group APIs
5. Verify `neurosort.enabled` is `true` in preferences

### No Console Logs / Script Not Loading

**This confirms "Allow unsafe JS" is disabled!**

Sine blocks scripts from GitHub by default. The script won't load at all without this setting.

1. Go to **Settings → Sine → Allow unsafe JS from external sources**
2. Enable it
3. Restart Zen Browser
4. Check browser console (F12) for NeuroSort logs

### API Errors

1. **401 Unauthorized**: Check your API key is correct
2. **Network Error**: Verify endpoint URL is correct
3. **Timeout**: Large tab counts may take longer; try smaller batches
4. **Invalid endpoint**: Make sure the URL includes the API version (e.g., `/v1` for OpenAI-compatible)
5. **Rate Limited**: Wait a few seconds between sort operations; adjust rate limit cooldown in preferences

### Fallback Categorization Used

If you see "Using fallback categorization" in the console or groups don't look AI-generated:

1. Check your API key is valid
2. Verify the API endpoint is reachable
3. Check the browser console for error details
4. The fallback uses domain-based grouping which is less accurate than AI

### Undo Not Working

1. Undo only works for the most recent sort operation
2. Undo history is not persisted across browser sessions
3. If you've closed tabs or groups, undo may not fully restore the previous state

### Keyboard Shortcut Not Working

1. Check if another extension is using the same shortcut
2. Verify the shortcut is configured in preferences
3. Try changing to a different key combination

### Status Badge Not Showing

1. Enable "Show status badge" in preferences
2. If count shows "0", all tabs are already grouped

### Groups Not Created

1. Ensure the current Zen/Sine build exposes tab group APIs
2. Check `browser.tabs.groups.enabled` is `true` in `about:config`
3. Advanced Tab Groups can help with older setups, but it is optional compatibility rather than a required dependency
4. Verify tabs aren't already in groups

### Debug Mode

Enable debug logging in NeuroSort preferences to see redacted diagnostic logs in the browser console (F12 → Console). Debug logs must not include API keys, Authorization headers, request bodies, raw prompts, full URLs, or response bodies.

---

## 🏗️ Architecture

```
NeuroSort
├── NeuroSortAPIClient    # Unified API client for all providers
├── GroupManager          # Tab group creation and management
├── NeuroSortUI           # Broom button and toast notifications
├── AutoTidyObserver      # Monitors tab count for auto-tidy
└── NeuroSort             # Main orchestrator
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Arc Browser](https://arc.net/) - Inspiration for Tidy Tabs
- [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) - Historical compatibility reference
- [Sine](https://github.com/CosmoCreeper/Sine) - Mod distribution system
- [AI-TabGroups-ZenBrowser](https://github.com/Darsh-A/AI-TabGroups-ZenBrowser) - Reference implementation

---

<div align="center">
  Made with ❤️ for Zen Browser
</div>
