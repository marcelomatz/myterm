---
title: "myTerm — Terminal Moderno para Desenvolvedores"
description: "Documentação oficial do myTerm: terminal multiplexado de código aberto construído com Wails v2, Go e Svelte."
---

# myTerm

> **Terminal multiplexado de código aberto** construído sobre [Wails v2](https://wails.io), Go 1.23 e Svelte 5.  
> Roda em Windows, macOS e Linux como um binário nativo portátil — sem Electron, sem Node.js em tempo de execução.

## Por que myTerm existe?

A maioria dos terminais modernos usa Electron, consumindo 200-500 MB de RAM só de overhead de processo. myTerm usa WebView2 (Windows), WKWebView (macOS) ou WebKit (Linux) como camada de renderização, alojando um backend Go puro. O resultado é um executável de ~10 MB com consumo de memória comparável a terminais nativos.

## O que ele faz

| Recurso | Detalhe |
|---|---|
| **Multi-tab** | Número ilimitado de abas independentes |
| **Painéis divididos** | Split horizontal e vertical por aba, redimensionável por arrasto |
| **Multi-shell** | Detecta e lista todos os shells disponíveis no sistema |
| **Temas de cor** | 5 presets (Cyber Noir, Pampulha Night, Espresso Code, Gopher's Forge, Phosphor) |
| **Fontes** | Qualquer web font; padrão `Cascadia Code` |
| **GPU Renderer** | WebGL → Canvas → DOM como fallback automático |
| **Auto-update** | Compara `CurrentVersion` com a GitHub Releases API |
| **Janela frameless** | Barra de título customizada em Svelte |
| **Copy-on-select** | Cópia automática opcional ao selecionar texto |

## Estrutura da documentação

| Página | Conteúdo |
|---|---|
| [Arquitetura Geral](./architecture.md) | Visão de alto nível, fluxo de dados e diagramas |
| [Backend Go](./backend-go.md) | `main.go`, `api/app.go`, `core/` — PTY, sessions, shells |
| [Frontend Svelte](./frontend-svelte.md) | App.svelte, panes, sessions, bridge, domain, settings |
| [Website SvelteKit](./website.md) | Landing page, download dinâmico, GitHub Releases API |

## Início rápido

### Desenvolvimento local

```bash
# Pré-requisitos: Go 1.23+, Node.js 20+, Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

git clone https://github.com/marcelomatz/myterm.git
cd myterm
wails dev
```

### Build de produção

```bash
# Windows (portátil .exe)
wails build -platform windows/amd64

# macOS (DMG universal)
wails build -platform darwin/universal

# Linux (tarball)
wails build -platform linux/amd64
```

### Instalador Windows (NSIS)

```powershell
.\build-installer.ps1
```

## Licença

MIT — veja [LICENSE](https://github.com/marcelomatz/myterm/blob/main/LICENSE).

## Links

- [GitHub](https://github.com/marcelomatz/myterm)
- [Releases](https://github.com/marcelomatz/myterm/releases)
- [CHANGELOG](https://github.com/marcelomatz/myterm/blob/main/CHANGELOG.md)
- [Website](https://myterm.vercel.app)
