---
title: "Backend Go — myTerm"
description: "Documentação do backend Go: main.go, api/app.go, core/terminal.go, core/session_manager.go e core/shells.go."
---

# Backend Go

O backend do myTerm é composto por **2 pacotes Go**: `api` e `core`. O pacote `api` é o único exposto ao Wails (o único struct vinculado ao runtime). O pacote `core` é puro — não conhece Wails no sentido de UI, apenas usa `runtime.EventsEmit` para enviar dados ao frontend.

**Dependências diretas** (`go.mod`):

| Pacote | Versão | Papel |
|---|---|---|
| `github.com/wailsapp/wails/v2` | v2.11.0 | Framework desktop híbrido |
| `github.com/aymanbagabas/go-pty` | v0.2.2 | PTY multiplataforma (ConPTY / `/dev/ptmx`) |
| `github.com/google/uuid` | v1.6.0 | IDs únicos de sessão |

---

## `main.go` — Entry Point

`main.go` tem 67 linhas e uma única responsabilidade: configurar e lançar `wails.Run`.

```go
// main.go:19-61
func main() {
    app := api.NewApp()

    err := wails.Run(&options.App{
        Title:     "MyTerm",
        Width:     1300,
        Height:    700,
        MinWidth:  400,
        MinHeight: 300,
        Frameless: true,
        BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 255},

        OnStartup:     app.Startup,
        OnShutdown:    app.Shutdown,
        OnBeforeClose: app.ConfirmClose,

        Bind: []interface{}{ app },

        Windows: &windows.Options{
            DisableWindowIcon: true,
            DisablePinchZoom:  true,
        },
        Mac: &mac.Options{
            TitleBar: mac.TitleBarHiddenInset(),
        },
    })
}
```

**Pontos notáveis:**

- `Frameless: true` — desativa a decoração nativa da janela; a barra de título é renderizada pelo Svelte (`TitleBar.svelte`)
- `BackgroundColour: RGBA{30, 30, 30}` — cor de fundo pura que bate com o tema xterm.js padrão (Cyber Noir `#09090b` é muito próximo)
- `//go:embed all:frontend/dist` — os assets do Svelte são embutidos no binário em tempo de compilação; nenhum servidor HTTP externo é necessário
- `OnBeforeClose: app.ConfirmClose` — hook crucial para o fluxo de confirmação de fechamento com múltiplas sessões

---

## `api/app.go` — Camada de API

Esse arquivo é o **único struct vinculado ao Wails** (`Bind: []interface{}{app}`). Ele expõe métodos Go como funções JavaScript chamáveis via `window.go.api.App.*`.

### Constantes

```go
// api/app.go:17-30
const (
    CurrentVersion = "v0.3.1"     // comparado contra GitHub Releases
    maxWriteBytes  = 64 * 1024    // 64 KiB — limite de payload PTY stdin
    minCols, maxCols = 2, 1024    // dimensões PTY defensivas
    minRows, maxRows = 1, 512
)
```

`maxWriteBytes` previne flooding do stdin do PTY. Os limites de cols/rows evitam travamentos em alguns terminais que não lidam bem com dimensões absurdas.

### `App` struct

```go
// api/app.go:84-90
type App struct {
    ctx       context.Context
    sessions  *core.SessionManager
    forceQuit atomic.Bool // set by ForceQuit() to break the OnBeforeClose loop
}
```

O campo `forceQuit atomic.Bool` é a peça central do protocolo de fechamento seguro.

### Métodos expostos ao Wails

| Método | Assinatura | O que faz |
|---|---|---|
| `DetectShells` | `() []string` | Delega para `core.DetectShells()` |
| `NewSession` | `(shell string) string` | Valida shell, cria sessão PTY, retorna UUID |
| `CloseSession` | `(id string) error` | Encerra PTY e remove da sessão map |
| `Write` | `(id, data string) error` | Injeta keystrokes no PTY (limite 64KiB) |
| `Resize` | `(id string, cols, rows int) error` | Ajusta dimensões PTY (clamped) |
| `ForceQuit` | `()` | Seta `forceQuit=true`, chama `runtime.Quit` |
| `CheckForUpdates` | `() UpdateInfo` | Consulta GitHub Releases API |

### Validação de Shell em `NewSession`

```go
// api/app.go:157-171
func (a *App) NewSession(shell string) string {
    if shell != "" {
        allowed := core.DetectShells()
        if !contains(allowed, shell) {
            log.Printf("NewSession rejected unknown shell %q", shell)
            return ""
        }
    }
    // ...
}
```

Shell vazio auto-detecta via `core.BestShell()`. Shell não-vazio é validado contra `DetectShells()` — isso previne execução arbitrária de binários via a ponte RPC.

### Protocolo de Fechamento (`ConfirmClose` + `ForceQuit`)

```go
// api/app.go:124-145
func (a *App) ConfirmClose(_ context.Context) (prevent bool) {
    if a.forceQuit.Load() { return false }  // segunda chamada do Wails → deixa fechar
    n := a.sessions.Count()
    if n < 2 { return false }               // uma sessão → fecha sem perguntar
    wailsRuntime.EventsEmit(a.ctx, "confirm-close", n)
    return true                              // previne OS close
}

func (a *App) ForceQuit() {
    a.forceQuit.Store(true)
    wailsRuntime.Quit(a.ctx)
}
```

O detalhe crítico: `runtime.Quit` faz com que o Wails chame `OnBeforeClose` **novamente**. Sem o `atomic.Bool`, haveria um loop infinito.

### `CheckForUpdates`

```go
// api/app.go:42-82
func (a *App) CheckForUpdates() UpdateInfo {
    const apiURL = "https://api.github.com/repos/marcelomatz/myterm/releases/latest"
    client := &http.Client{Timeout: 5 * time.Second}
    // ...
    return UpdateInfo{
        HasUpdate: latest != "" && latest != current,
        Version:   latest,
        URL:       release.HTMLURL,
    }
}
```

Retorna `HasUpdate: false` em qualquer erro de rede — o app arranca normalmente mesmo offline.

---

## `core/terminal.go` — PTY e Processo Shell

`Terminal` encapsula um processo shell rodando dentro de um PTY.

```go
// core/terminal.go:16-20
type Terminal struct {
    ctx    context.Context
    ptm    pty.Pty
    closed atomic.Bool
}
```

### `StartWithID`

```go
// core/terminal.go:30-71
func (t *Terminal) StartWithID(ctx context.Context, id, shell string) error {
    ptm, err := pty.New()
    // ...
    cmd := ptm.Command(shell, args...)
    cmd.Env = append(os.Environ(), "TERM=xterm-256color")
    cmd.Start()

    go func() {
        buf := make([]byte, 32768) // 32 KiB
        for {
            n, err := ptm.Read(buf)
            if n > 0 {
                wailsRuntime.EventsEmit(t.ctx, "terminal-output:"+id, string(buf[:n]))
            }
            if err != nil {
                if err != io.EOF && !t.closed.Load() {
                    wailsRuntime.EventsEmit(t.ctx, "terminal-exit:"+id, err.Error())
                }
                return
            }
        }
    }()
    return nil
}
```

- Buffer de 32 KiB balanceia throughput (telas full-screen com muitos caracteres) e latência IPC
- `TERM=xterm-256color` garante saída ANSI correta de programas como `vim`, `htop`
- A goroutine de leitura só emite `terminal-exit` se o processo morreu sozinho; se `Close()` foi chamado primeiro (`t.closed == true`), o `SessionManager` já emitiu o evento

### `Close`

```go
// core/terminal.go:92-97
func (t *Terminal) Close() {
    if t.ptm != nil {
        t.closed.Store(true) // sinaliza goroutine de leitura
        t.ptm.Close()
    }
}
```

O `atomic.Bool` evita que a goroutine emita `terminal-exit` com mensagem de erro genérica quando o fechamento foi intencional.

---

## `core/session_manager.go` — Registro de Sessões

`SessionManager` mantém um mapa `UUID → *Terminal` protegido por `sync.RWMutex`.

```go
// core/session_manager.go:12-18
type SessionManager struct {
    mu       sync.RWMutex
    sessions map[string]*Terminal
    ctx      context.Context
}
```

### `NewSession`

```go
id := uuid.NewString()
t := NewTerminal()
t.StartWithID(s.ctx, id, shell)
s.mu.Lock()
s.sessions[id] = t
s.mu.Unlock()
```

UUID garante que eventos Wails sejam namespaced (`terminal-output:550e8400-...`) — múltiplas sessões simultâneas nunca colidem.

### `CloseSession`

```go
// core/session_manager.go:50-66
func (s *SessionManager) CloseSession(id string) error {
    s.mu.Lock()
    t, ok := s.sessions[id]
    if ok { delete(s.sessions, id) }
    s.mu.Unlock()

    t.Close()
    wailsRuntime.EventsEmit(s.ctx, "terminal-exit:"+id, "closed")
    return nil
}
```

Remove da map com lock, depois opera no Terminal sem lock — evita deadlock.

### `CloseAll` (Shutdown)

```go
// core/session_manager.go:93-105
func (s *SessionManager) CloseAll() {
    s.mu.Lock()
    sessions := make(map[string]*Terminal, len(s.sessions))
    for id, t := range s.sessions { sessions[id] = t }
    s.sessions = make(map[string]*Terminal)
    s.mu.Unlock()

    for _, t := range sessions { t.Close() }
}
```

Snapshot do mapa com lock, depois fecha tudo sem lock — permite que `Close()` seja paralelo e previne deadlock ao emitir eventos do Wails (que precisam de contexto não bloqueado).

---

## `core/shells.go` — Detecção de Shells

`DetectShells()` usa `runtime.GOOS` para retornar a lista de shells disponíveis no sistema atual.

### Windows

1. PATH candidates: `wsl.exe`, `pwsh.exe`, `powershell.exe`, `cmd.exe`
2. Git Bash em caminhos fixos (Program Files, MSYS64, Cygwin) — inclui `%PROGRAMFILES%` custom
3. Apenas o primeiro `bash.exe` encontrado é adicionado (prioridade Program Files)

### Unix (macOS / Linux)

1. Candidates fixos: `/bin/zsh`, `/bin/bash`, `/bin/sh`, `/usr/bin/fish`
2. `$SHELL` é adicionado ao início se não estiver na lista
3. Verifica existência real com `os.Stat` (não PATH)

### Fallback absoluto

`powershell.exe` no Windows, `/bin/sh` em outros.

### `ShellArgs`

```go
// core/shells.go:84-98
func ShellArgs(shell string) []string {
    switch shell {
    case "powershell.exe", "pwsh.exe":
        return []string{"-NoLogo", "-NoProfile"}
    default:
        if strings.HasSuffix(shell, `\bash.exe`) || strings.HasSuffix(shell, `/bash`) {
            return []string{"--login", "-i"}
        }
        return nil
    }
}
```

Git Bash / MSYS2 precisa de `--login -i` para que `.bash_profile` execute e configure `PATH` corretamente. PowerShell recebe `-NoLogo -NoProfile` para inicialização mais rápida.
