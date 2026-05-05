# NeuroSort

<div align="center">
  <img src="https://img.shields.io/badge/version-1.1.10-blue.svg" alt="Version">
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
- **Advanced Tab Groups** - Install via Sine marketplace

### Step 1: Enable "Allow unsafe JS"

**This is required before installation!**

1. Open Zen Browser Settings
2. Go to **Settings → Sine → Allow unsafe JS from external sources**
3. Enable the toggle
4. Restart Zen Browser if needed

### Step 2: Install from GitHub

1. Open Zen Browser Settings
2. Go to **Sine → Mods**
3. Click "Add repository" or paste the GitHub URL in the marketplace
4. Enter: `tyrell/tab-neurosort` (or your fork URL)
5. Install and enable the mod

### Step 3: Configure API Settings

1. Open Zen Browser Settings
2. Go to **Sine → NeuroSort preferences**
3. Configure your AI provider (see Configuration section below)

---

## ✨ Features

### Core Features
- 🧹 **Arc-style Broom Button** - Click to tidy all ungrouped tabs
- 🤖 **Multi-Provider AI Support** - OpenAI, Google Gemini, Ollama (local), or any custom endpoint
- 🔄 **Auto-Tidy** - Automatically organize when tabs exceed a threshold
- 🎨 **Advanced Tab Groups Integration** - Works with [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups)
- 📝 **Smart Context** - Fetches page descriptions for better categorization
- 🎯 **Existing Group Awareness** - AI prefers existing group names

### User Experience
- 🎬 **Welcome/Setup Screen** - First-time users see a guided setup wizard
- 📋 **Context Menu** - Right-click the broom button for more options
- ↩️ **Undo** - Ctrl/Cmd+Z to undo the last sort operation
- 🔢 **Multi-Select Sorting** - Ctrl+Shift+Click to sort only selected tabs
- 🧹 **Tidy All** - Alt+Shift+Click to sort all tabs (including grouped)
- ⚙️ **Quick Settings** - Quick settings popup accessible from context menu
- 🔔 **Status Badge** - Shows ungrouped tabs count on the broom button
- ⌨️ **Keyboard Shortcut** - Configurable global shortcut (default Ctrl+Shift+T)
- 📊 **Group Stats** - View group statistics in the context menu

### Reliability
- 🛡️ **Fallback Categorization** - Domain-based fallback when API fails
- ⏱️ **Rate Limiting** - Protection against API spam
- ⏳ **Loading Indicator** - Spinner animation during sorting operations

---

## ⚙️ Configuration

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
4. Tabs are automatically organized into logical groups

### Context Menu

Right-click the broom button to access:
- **Sort Ungrouped Tabs** - Organize only ungrouped tabs
- **Sort All Tabs** - Reorganize all tabs (including grouped)
- **Sort Selected Tabs** - Organize only selected tabs
- **Undo Last Sort** - Revert the previous sort operation
- **Quick Settings** - Adjust common settings without opening preferences
- **Group Stats** - View current tab group statistics

### Multi-Select Sorting

To sort specific tabs:
1. Select tabs using Ctrl/Cmd + click
2. Ctrl+Shift+Click the broom button
3. Only selected tabs will be organized

### Tidy All Tabs

To reorganize all tabs (including already grouped):
- Alt+Shift+Click the broom button

### Auto-Tidy

1. Enable "Auto-tidy when ungrouped tabs exceed threshold"
2. Set threshold (default: 6 tabs)
3. Tabs will automatically organize when threshold is exceeded

### Undo

- Press **Ctrl/Cmd+Z** to undo the last sort operation
- Or use **Undo Last Sort** from the context menu

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
| Provider | AI provider selection | `custom` |
| Minimum group size | Tabs needed to form group | `2` |
| Preserve pinned tabs | Never group pinned tabs | `true` |
| Use existing groups | Prefer existing group names | `true` |
| Fetch descriptions | Get meta descriptions for context | `true` |
| Keyboard shortcut | Global shortcut for sorting | `Ctrl+Shift+T` |
| Show status badge | Display ungrouped tab count | `true` |
| Enable fallback | Use domain-based fallback on API failure | `true` |
| Rate limit cooldown | Seconds between API calls | `5` |
| Debug mode | Log to browser console | `false` |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` (Windows/Linux) | Sort ungrouped tabs (configurable) |
| `Cmd+Shift+T` (macOS) | Sort ungrouped tabs (configurable) |
| `Ctrl/Cmd+Z` | Undo last sort operation |
| `Ctrl+Shift+Click` | Sort selected tabs only |
| `Alt+Shift+Click` | Sort all tabs (including grouped) |
| Right-click broom | Open context menu |

---

## 🐛 Troubleshooting

### Button Not Appearing

**Most common cause: "Allow unsafe JS" is disabled**

1. Go to **Settings → Sine → Allow unsafe JS from external sources**
2. Make sure it's **ENABLED**
3. Restart Zen Browser
4. If still not working, ensure Sine is properly installed and Advanced Tab Groups is installed
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

1. Ensure Advanced Tab Groups is installed and enabled
2. Check `browser.tabs.groups.enabled` is `true` in `about:config`
3. Verify tabs aren't already in groups

### Debug Mode

Enable debug logging in NeuroSort preferences to see detailed logs in the browser console (F12 → Console).

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
- [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) - Foundation for tab group management
- [Sine](https://github.com/CosmoCreeper/Sine) - Mod distribution system
- [AI-TabGroups-ZenBrowser](https://github.com/Darsh-A/AI-TabGroups-ZenBrowser) - Reference implementation

---

<div align="center">
  Made with ❤️ for Zen Browser
</div>
