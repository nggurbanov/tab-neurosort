# NeuroSort

<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/zen%20browser-compatible-purple.svg" alt="Zen Browser">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</div>

**AI-powered tab organization for Zen Browser**

NeuroSort automatically organizes your tabs into smart groups using OpenAI-compatible APIs. Inspired by Arc Browser's "Tidy Tabs" feature.

## ✨ Features

- 🧹 **Arc-style Broom Button** - Click to tidy all ungrouped tabs
- 🤖 **Multi-Provider AI Support** - OpenAI, Google Gemini, Ollama (local), or any custom endpoint
- 🔄 **Auto-Tidy** - Automatically organize when tabs exceed a threshold
- 🎨 **Advanced Tab Groups Integration** - Works with [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups)
- 📝 **Smart Context** - Fetches page descriptions for better categorization
- 🎯 **Existing Group Awareness** - AI prefers existing group names

## 📦 Installation

### Prerequisites

1. **Zen Browser** - [Download here](https://zen-browser.app/)
2. **Sine** - Theme/mod manager for Firefox-based browsers - [Installation Guide](https://github.com/CosmoCreeper/Sine/wiki/Installation)
3. **Advanced Tab Groups** - Install via Sine marketplace

### Method 1: Via Sine (Recommended)

1. Open Zen Browser Settings
2. Go to Sine → Mods
3. Add repository: `tyrell/tab-neurosort` (or your fork URL)
4. Install and enable

### Method 2: Manual Installation

1. Navigate to your Zen Browser profile folder:
   - **Linux**: `~/.zen/` or `~/.var/app/app.zen_browser.zen/`
   - **macOS**: `~/Library/Application Support/Zen/`
   - **Windows**: `%APPDATA%\Zen\`

2. Locate or create the `chrome` folder

3. Copy the following files:
   ```
   neurosort.uc.js → chrome/JS/
   userChrome.css → chrome/
   preferences.json → chrome/
   theme.json → chrome/
   ```

4. Restart Zen Browser

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

## 🎯 Usage

### Manual Tidy

1. Open tabs as usual
2. Hover over the workspace button area (top of sidebar)
3. Click the 🧹 broom icon
4. Tabs are automatically organized into logical groups

### Auto-Tidy

1. Enable "Auto-tidy when ungrouped tabs exceed threshold"
2. Set threshold (default: 6 tabs)
3. Tabs will automatically organize when threshold is exceeded

### Selective Sorting

To sort specific tabs:
1. Multi-select tabs (Ctrl/Cmd + click)
2. Click the broom button
3. Only selected tabs will be organized

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
| Debug mode | Log to browser console | `false` |

## 🐛 Troubleshooting

### Button Not Appearing

1. Ensure Sine is properly installed
2. Check that Advanced Tab Groups is installed
3. Verify `neurosort.enabled` is `true` in preferences
4. Try restarting Zen Browser

### API Errors

1. **401 Unauthorized**: Check your API key
2. **Network Error**: Verify endpoint URL is correct
3. **Timeout**: Large tab counts may take longer; try smaller batches

### Groups Not Created

1. Ensure Advanced Tab Groups is installed and enabled
2. Check `browser.tabs.groups.enabled` is `true` in `about:config`
3. Verify tabs aren't already in groups

### Debug Mode

Enable debug logging in NeuroSort preferences to see detailed logs in the browser console (F12 → Console).

## 🏗️ Architecture

```
NeuroSort
├── NeuroSortAPIClient    # Unified API client for all providers
├── GroupManager          # Tab group creation and management
├── NeuroSortUI           # Broom button and toast notifications
├── AutoTidyObserver      # Monitors tab count for auto-tidy
└── NeuroSort             # Main orchestrator
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Arc Browser](https://arc.net/) - Inspiration for Tidy Tabs
- [Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups) - Foundation for tab group management
- [Sine](https://github.com/CosmoCreeper/Sine) - Mod distribution system
- [AI-TabGroups-ZenBrowser](https://github.com/Darsh-A/Ai-TabGroups-ZenBrowser) - Reference implementation

---

<div align="center">
  Made with ❤️ for Zen Browser
</div>
