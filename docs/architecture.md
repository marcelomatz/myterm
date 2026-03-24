---
title: "Arquitetura — myTerm"
description: "Visão geral da arquitetura do myTerm: Wails IPC bridge, PTY sessions, pane tree e fluxo de dados."
---

# Arquitetura do myTerm

O myTerm é um **aplicativo desktop híbrido**: o backend é um processo Go rodando em modo nativo, e o frontend é uma SPA Svelte renderizada dentro do WebView do sistema operacional. A comunicação entre os dois lados acontece exclusivamente via **Wails IPC** — chamadas RPC e eventos via WebSocket interno.

Por que essa escolha? Go oferece acesso direto a PTY (pseudoterminal) via ConPTY (Windows) ou `/dev/ptmx` (Unix), algo impossível de se fazer em JavaScript puro. Svelte oferece reatividade eficiente sem o overhead de um framework completo.

## Visão Geral em Diagrama

```mermaid
graph TD
  subgraph OS["Sistema Operacional"]
    style OS fill:#161b22,stroke:#30363d,color:#e6edf3
    PTY["PTY / ConPTY"]
    SHELL["Shell Process\nwsl.exe / pwsh / bash / zsh"]
    SHELL <-->|stdin/stdout| PTY
  end

  subgraph GO["Backend Go (core + api)"]
    style GO fill:#161b22,stroke:#30363d,color:#e6edf3
    TERMINAL["Terminal struct\ncore/terminal.go"]
    SM["SessionManager\ncore/session_manager.go"]
    APP["App struct\napi/app.go"]
    PTY <-->|go-pty| TERMINAL
    TERMINAL -->|uuid-keyed map| SM
    SM --> APP
  end

  subgraph WAILS["Wails v2 IPC Layer"]
    style WAILS fill:#161b22,stroke:#30363d,color:#e6edf3
    RPC["RPC Bridge\nBind: []interface{}{app}"]
    EVENTS["EventsEmit /\nEventsOn"]
  end

  subgraph SVELTE["Frontend Svelte 5"]
    style SVELTE fill:#161b22,stroke:#30363d,color:#e6edf3
    BRIDGE["bridge/backend.ts"]
    SESSION["ui/session.ts\ncreateSession / destroySession"]
    PANE["ui/pane.ts\nrenderPane / splitLeaf"]
    APPSVELTE["App.svelte\n$state: tabs, activeTabId"]
    XTERM["xterm.js Terminal\n+ FitAddon + WebGL/Canvas"]
    BRIDGE --> SESSION
    SESSION --> XTERM
    SESSION --> PANE
    PANE --> APPSVELTE
  end

  APP <-->|Wails Bind| RPC
  RPC <-->|window.go.api.App.*| BRIDGE
  EVENTS -->|terminal-output:id| APPSVELTE
  TERMINAL -->|EventsEmit| EVENTS
```

## Camadas e Responsabilidades

| Camada | Pacote / Arquivo | Responsabilidade |
|---|---|---|
| Entry point | `main.go` | Configura `wails.Run` com opções de plataforma |
| API layer | `api/app.go` | Único struct exposto ao Wails; valida e delega |
| PTY | `core/terminal.go` | Abre PTY, lê output, faz write/resize |
| Session registry | `core/session_manager.go` | Mapa `UUID → *Terminal` com RWMutex |
| Shell detection | `core/shells.go` | Detecta shells por plataforma |
| IPC bridge (TS) | `frontend/src/bridge/` | Re-exporta bindings Wails gerados |
| Domain types | `frontend/src/domain/` | Tipos TS, settings, font-loader |
| UI logic | `frontend/src/ui/` | Session lifecycle, pane tree, GPU renderer |
| UI components | `frontend/src/` | App.svelte, TabBar, WelcomeScreen, etc. |
| Website | `website/` | SvelteKit landing page + download dinâmico |

## Fluxo de Dados: Keystroke → PTY → Display

```mermaid
sequenceDiagram
  autonumber
  participant User as Usuário
  participant XTerm as xterm.js
  participant Bridge as bridge/backend.ts
  participant GoApp as api/App.Write()
  participant SM as SessionManager.Write()
  participant PTY as Terminal.Write() / PTY
  participant Shell as Shell Process

  User->>XTerm: tecla pressionada
  XTerm->>XTerm: attachCustomKeyEventHandler() verifica atalhos
  XTerm->>Bridge: onData(data) → Write(sessionId, data)
  Bridge->>GoApp: Wails RPC call
  GoApp->>GoApp: valida len(data) ≤ 64KiB
  GoApp->>SM: sessions.Write(id, data)
  SM->>PTY: ptm.Write([]byte(data))
  PTY->>Shell: stdin
  Shell-->>PTY: stdout (output)
  PTY-->>GoApp: goroutine lê buf[32KiB]
  GoApp-->>Bridge: EventsEmit("terminal-output:id", output)
  Bridge-->>XTerm: EventsOn → term.write(data)
  XTerm-->>User: renderiza na tela
```

## Gestão de Sessões e Tabs

Cada **tab** contém uma árvore de nós (`PaneNode`), que pode ser:

- `PaneLeaf` — uma sessão PTY única com seu `Terminal` xterm.js
- `PaneSplit` — divisão horizontal ou vertical de dois sub-nós, com `ratio` (0.0–1.0)

A árvore é imutável por função — operações como `splitLeaf` e `removeLeaf` retornam uma nova raiz, preservando referências a nós inalterados (`frontend/src/ui/pane.ts:204`).

```mermaid
stateDiagram-v2
  [*] --> WelcomeScreen : app inicializa
  WelcomeScreen --> SingleTab : usuário escolhe shell
  SingleTab --> MultiTab : Ctrl+T (nova aba)
  SingleTab --> SplitPane : Ctrl+Shift+D (horiz) / Ctrl+Shift+E (vert)
  SplitPane --> SplitPane : novo split
  MultiTab --> SingleTab : fecha aba
  SingleTab --> ConfirmClose : fechar janela (≥2 sessões)
  ConfirmClose --> [*] : ForceQuit()
  SingleTab --> [*] : fechar (1 sessão)
```

## Fluxo de Encerramento

Fechar a janela com 2+ sessões ativas aciona um protocolo de dois passos (`api/app.go:124-145`):

1. `ConfirmClose()` — emite evento `confirm-close` para o frontend e retorna `true` (previne fechamento imediato)
2. Frontend exibe modal de confirmação
3. Usuário confirma → `ForceQuit()` seta `forceQuit` atomicamente → `runtime.Quit()`
4. Wails chama `ConfirmClose()` novamente (comportamento interno) → `forceQuit.Load()` retorna `false` → janela fecha

A flag `atomic.Bool` evita condição de corrida entre a goroutine do Wails e a chamada RPC do frontend.

## Atualização Automática

`CheckForUpdates()` (`api/app.go:42`) consulta `https://api.github.com/repos/marcelomatz/myterm/releases/latest` com timeout de 5 segundos. Se `tag_name != CurrentVersion`, retorna `HasUpdate: true` com URL. O frontend exibe um toast via `ui/UpdateToast.svelte` sem bloquear o arranque.

## Multi-plataforma

| Plataforma | WebView | PTY | Shell padrão |
|---|---|---|---|
| Windows | WebView2 | ConPTY (`go-pty`) | wsl.exe → pwsh.exe → powershell.exe → cmd.exe |
| macOS | WKWebView | `/dev/ptmx` | `$SHELL` → zsh → bash |
| Linux | WebKit | `/dev/ptmx` | `$SHELL` → zsh → bash → sh |

Configurações de plataforma em `main.go:46-60`: Windows desativa ícone e pinch-zoom; macOS usa `TitleBarHiddenInset` com janela frameless.
