# myterm

A fast, modern terminal emulator for Windows built with [Wails](https://wails.io), [xterm.js](https://xtermjs.org), and Go.

## Features

- **Tabs** — open multiple shells side-by-side
- **Split panes** — horizontal and vertical splits with drag-to-resize
- **Shell picker** — auto-detects PowerShell, pwsh, cmd, WSL, Git Bash, MSYS2, Cygwin and more
- **Themes** — multiple colour presets with live preview in settings
- **GPU-accelerated rendering** — WebGL renderer with automatic Canvas fallback
- **Copy-on-select** — optional clipboard copy when text is selected
- **Keyboard-first** — everything reachable without a mouse

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+T` | New tab (same shell) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+Shift+D` | Split horizontally |
| `Ctrl+Shift+E` | Split vertically |
| `Ctrl+Shift+W` | Close active pane |
| `Ctrl+,` | Open/close settings |
| `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+V` | Paste from clipboard |

## Requirements

- Windows 10 1903+ (ConPTY)
- WebView2 runtime (ships with Windows 11; auto-installed on Windows 10 by the installer)

## Development

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Run in dev mode (hot reload)
wails dev

# Build production binary
wails build
```

# Build installer

```powershell
powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
```

## License

MIT — © Marcelo Matzembacher
