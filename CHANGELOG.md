# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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

[0.2.0]: https://github.com/marcelomatz/myterm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marcelomatz/myterm/releases/tag/v0.1.0
