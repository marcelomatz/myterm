# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [0.5.3] — 2026-04-23

### 🐛 Correções
- Corrigido problema ao iniciar `cmd` e `powershell` no Windows que resultava em erro *file does not exist*, forçando a resolução por caminhos absolutos (`exec.LookPath`).
- Atualizadas as sequências de escape OSC no script de integração para garantir suporte e formatação corretos no prompt do **Windows PowerShell 5.1** (`powershell.exe`).
- Tornada a correspondência de nomes de executáveis de shell *case-insensitive* no Windows para prevenir falhas de validação estritas de segurança (`contains`).
- Melhorado o repasse de erros do backend Go para o frontend (Wails) para que falhas de `NewSession` exibam o motivo exato em vez de um erro genérico.

---

## [0.5.2] — 2026-04-23

### ✨ Adicionado
- Instalação automatizada via linha de comando para Windows (`install.ps1`), macOS e Linux (`install.sh`).
- DownloadCard com suporte à cópia de atalho em 1-clique (bypass de SmartScreen/Gatekeeper).
- Scripts integrados diretamente nas placas de download do site.
- Criação de atalho automático no Desktop (Windows) e menu `.desktop` (Linux) via scripts.

### 🎨 Melhorias Visuais
- Texto do hero atualizado para melhor alinhamento do myTerm como emulador de terminal moderno e rápido.
- UI aprimorada na caixa de comando de terminal do DownloadCard com destaque visual, hover interativo e badge de recomendação.

---

## [0.5.1] — 2026-04-23

### 🐛 Correções de Bugs
- **CI/CD Build**: Correção do caminho do `CurrentVersion` no workflow de release do GitHub Actions (`-ldflags`) que causava a compilação mostrar a versão como `dev` ao invés da versão real, em decorrência da refatoração da Clean Architecture.

---

## [0.5.0] — 2026-04-23

### ✨ Funcionalidades
- **Arquitetura Open Core**: implementação da fundação para suporte isolado de funcionalidades da versão Enterprise.
- **Configuração de Diretório Inicial**: opção para o usuário definir o diretório inicial (cwd) padrão de novas sessões.
- **Suporte i18n**: refatoração da arquitetura e suporte à internacionalização em todos os componentes da interface.
- **Atalhos Inteligentes**: Ajustes em alguns atalhos de teclado que estavam conflitando com outros recursos.
- **Popup de IA**: Integração inicial (em desenvolvimento) do assistente de IA para ajuda com erros no terminal (Prompt Assist) via Ollama.
- **Clean Architecture**: profunda refatoração tanto no backend (Go) quanto no frontend (Svelte) garantindo desacoplamento.

### 🐛 Correções de Bugs
- Prevenção de vazamento (leaks) de memória em ações que ficavam rodando no terminal.
- Ajustes finos no atalho `Ctrl+Tab` e gerenciamento de telas divididas.
- Correção no redimensionamento automático do layout via `ResizeObserver` ao alterar o tamanho da janela.
- Auto-fechamento do modal de erro após 5 segundos se ignorado.
- Escopo do CSS da pré-visualização ao vivo corrigido para não interferir na aplicação global.

### 🛠️ Manutenção
- Renomeação oficial e consistente do app para "myTerm".
- Atualização geral das dependências do frontend (Svelte 5, xterm.js, etc).

---

## [0.4.0] — Não lançada (Consolidada na 0.5.0)

---

## [0.3.1] — 2026-03-24

### 🔧 Corrigido
- **CI — Detecção do instalador NSIS**: a varredura recursiva de `build/` capturava o `MicrosoftEdgeWebview2Setup.exe` (baixado pelo Wails durante o build) no lugar do instalador real do myTerm. A busca agora exige `myterm` E `installer` no nome do arquivo e exclui explicitamente qualquer arquivo com `webview`, `edge` ou `microsoft` no nome.

---

## [0.3.0] — 2026-03-23


### 🚀 Adicionado
- **Verificador de atualizações automático**: ao iniciar, o app consulta a API do GitHub e notifica quando há uma release mais nova
  - Na **WelcomeScreen**: exibe `▲ update available v0.3.0` integrado ao visual retro amber, com link pontilhado e ✕ para dispensar
  - Com **terminal aberto**: exibe o toast `UpdateToast` no canto inferior direito com botão `[ download ]` e ✕
  - Falha silenciosa em caso de rede indisponível (timeout de 5 s)
- **`UpdateToast.svelte`**: componente novo com estética idêntica ao WelcomeScreen (fundo `#0a0a00`, amber `#ffb300`, scanlines, JetBrains Mono, animação flicker)

### 🔧 Alterado
- `WelcomeScreen.svelte`: aceita props opcionais `updateVersion`, `updateUrl` e `onDismissUpdate`; versão exibida atualizada para `0.3.0`
- `App.svelte`: integração do `UpdateInfo` reativo; roteamento do aviso entre WelcomeScreen e toast conforme estado da UI
- `api/app.go`: nova constante `CurrentVersion`, struct `UpdateInfo`, método `(App).CheckForUpdates()`
- `bridge/backend.ts`: exporta `CheckForUpdates()` e interface `UpdateInfo`
- `wails.json` / `WelcomeScreen`: `productVersion` `0.2.0` → `0.3.0`

---

## [0.2.0] — 2026-03-23

### 🚀 Adicionado

- **Suporte cross-platform**: builds para macOS (Universal — Apple Silicon + Intel) e Linux (amd64 tar.gz)
- **CI/CD cross-platform**: GitHub Actions com matrix `ubuntu-22.04 / macos-latest / windows-latest`
- **Instalador Windows NSIS**: `myterm-amd64-installer.exe` gerado pelo Wails Build Action
- **Binário portátil Windows**: `myterm-amd64.exe` disponível como asset alternativo
- **DMG Universal macOS**: `myterm-darwin-universal.pkg` para Apple Silicon e Intel
- **Pacote Linux**: `myterm-linux-amd64.tar.gz`

### 🔧 Alterado
- `wails.json`: `productVersion` `0.1.0` → `0.2.0`; comentário atualizado para "Windows, macOS & Linux"
- Workflow `.github/workflows/release.yml` reescrito com jobs por plataforma e artefatos nomeados corretamente

---

## [0.1.0] — 2026-03-20

### 🚀 Adicionado
- Lançamento inicial do **myTerm** — terminal emulator nativo usando Wails v2 + Go + Svelte 5
- Suporte a múltiplas abas (sessions)
- Prompt PS1 customizável
- Histórico de comandos com seta ↑ / ↓
- Atalhos de teclado: `Ctrl+T` (nova aba), `Ctrl+W` (fechar aba), `Ctrl+Shift+C/V` (copiar/colar)
- Tema escuro com accent amarelo (#ffd700)
- Build para **Windows** (`.exe` portátil)

[Unreleased]: https://github.com/marcelomatz/myterm/compare/v0.5.3...HEAD
[0.5.3]: https://github.com/marcelomatz/myterm/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/marcelomatz/myterm/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/marcelomatz/myterm/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/marcelomatz/myterm/releases/tag/v0.5.0
[0.3.1]: https://github.com/marcelomatz/myterm/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/marcelomatz/myterm/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/marcelomatz/myterm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marcelomatz/myterm/releases/tag/v0.1.0
