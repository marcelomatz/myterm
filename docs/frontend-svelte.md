---
title: "Frontend Svelte — myTerm"
description: "Documentação do frontend Svelte 5: arquitetura de componentes, pane tree, session lifecycle, settings e GPU renderer."
---

# Frontend Svelte

O frontend do myTerm é uma **SPA Svelte 5** empacotada pelo Vite. Ele roda dentro do WebView do sistema operacional, se comunica com o backend Go via Wails IPC, e renderiza terminais usando **xterm.js** com renderer de GPU.

## Estrutura de arquivos

```
frontend/src/
├── App.svelte                # Raiz da aplicação — state global, atalhos, event routing
├── TabBar.svelte             # Barra de abas + botão nova aba
├── TitleBar.svelte           # Barra de título frameless (drag, botões de janela)
├── WelcomeScreen.svelte      # Tela inicial (seleção de shell)
├── SettingsPanel.svelte      # Painel de configurações
├── bridge/
│   ├── backend.ts            # Re-exporta bindings Wails Go
│   └── events.ts             # Wrappers de EventsOn / EventsOff
├── domain/
│   ├── types.ts              # PaneLeaf, PaneSplit, Tab, AppState
│   ├── settings.ts           # AppSettings, COLOR_PRESETS, load/save
│   ├── shell-meta.ts         # Metadados de exibição dos shells
│   └── font-loader.ts        # Pré-carrega web fonts antes de term.open()
└── ui/
    ├── session.ts            # createSession, destroySession, attachGpuRenderer
    ├── pane.ts               # renderPane, splitLeaf, removeLeaf, wireLeaf
    ├── settings-apply.ts     # Aplica settings a todas as sessões abertas
    ├── shell-picker.ts       # Lógica do shell picker na tela de boas-vindas
    ├── welcome-screen.ts     # Lógica da tela de boas-vindas
    └── UpdateToast.svelte    # Toast de atualização disponível
```

---

## `bridge/backend.ts` — Ponto de Contato com o Go

```typescript
// bridge/backend.ts — re-exporta os bindings gerados pelo Wails
export { DetectShells, NewSession, CloseSession, Write, Resize }
  from '../../wailsjs/go/api/App';

export function ForceQuit(): Promise<void> {
  return (window as any).go.api.App.ForceQuit();
}

export function CheckForUpdates(): Promise<UpdateInfo> {
  return (window as any).go.api.App.CheckForUpdates();
}
```

`ForceQuit` e `CheckForUpdates` usam `window.go.api.App.*` diretamente porque não aparecem nos `.d.ts` gerados até o primeiro build (problema de bootstrapping do `wailsjs`).

Todos os outros módulos importam de `bridge/backend.ts` — nunca dos paths `wailsjs/go/…` diretamente. Isso centraliza a abstração e facilita mocks em testes.

---

## `domain/types.ts` — Árvore de Painéis

```typescript
// domain/types.ts
export interface PaneLeaf {
  kind: 'leaf';
  sessionId: string;
  shell: string;
  term: Terminal;      // instância xterm.js
  fit: FitAddon;
  renderer: WebglAddon | CanvasAddon | null;
}

export interface PaneSplit {
  kind: 'split';
  dir: 'h' | 'v';     // 'h' = lado a lado, 'v' = cima/baixo
  ratio: number;       // 0.0–1.0, fração para filho `a`
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activeLeafId: string;
}
```

**Nota importante**: o elemento DOM do leaf (`<div class="pane">`) não está em `PaneLeaf` — ele vive em `ui/pane.ts:leafElMap`. Isso é proposital: DOM refs dentro do `$state` do Svelte causam loops infinitos de `$effect` (`effect_update_depth_exceeded`).

---

## `domain/settings.ts` — Configurações e Temas

### 5 Presets de Cor

| ID | Nome | Background | Cursor |
|---|---|---|---|
| `cyber-noir` | Cyber Noir | `#09090b` | `#22d3ee` (cyan) |
| `pampulha-night` | Pampulha Night | `#0f172a` | `#fbbf24` (amber) |
| `espresso-code` | Espresso Code | `#1c1917` | `#d97706` (amber) |
| `gophers-forge` | Gopher's Forge | `#121212` | `#00add8` (Go blue) |
| `sysadmin-phosphor` | Phosphor | `#020b05` | `#22c55e` (green) |

### `AppSettings`

```typescript
export interface AppSettings {
  fontFamily: string;          // padrão: '"Cascadia Code", monospace'
  fontSize: number;            // 8–28, padrão: 14
  lineHeight: number;          // 1.0–2.0, padrão: 1.2
  cursorBlink: boolean;        // padrão: true
  cursorStyle: 'block' | 'bar' | 'underline'; // padrão: 'block'
  colorPresetId: string;       // padrão: 'cyber-noir'
  scrollback: number;          // 500–10000, padrão: 1000
  defaultShell: string;        // '' = auto-detect
  copyOnSelect: boolean;       // padrão: false
}
```

Settings são persistidas em `localStorage` com a chave `myterm.settings`. Um singleton em memória (`_settings`) evita múltiplas leituras do storage:

```typescript
// domain/settings.ts:128-133
let _settings: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (!_settings) _settings = loadSettings();
  return _settings;
}
```

`loadSettings` faz spread de `DEFAULT_SETTINGS` com os dados do storage — garante que novos campos com defaults apareçam mesmo em settings salvas anteriormente.

---

## `ui/session.ts` — Lifecycle de Sessão

### `createSession`

```typescript
// ui/session.ts:75-163
export async function createSession(shell = ''): Promise<PaneLeaf> {
  const s = getSettings();
  const sessionId = await NewSession(shell || s.defaultShell || '');

  const term = new Terminal({
    fontFamily: s.fontFamily, fontSize: s.fontSize,
    lineHeight: s.lineHeight, cursorBlink: s.cursorBlink,
    cursorStyle: s.cursorStyle, scrollback: s.scrollback,
    allowProposedApi: true,
    theme: getPreset(s.colorPresetId).theme,
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  await ensureFont(s.fontFamily);       // pré-carrega a web font

  // Manejador de teclado customizado para atalhos  
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.ctrlKey && !ev.shiftKey && ev.key === 'v' && !ev.repeat) {
      navigator.clipboard.readText().then(text => term.paste(text));
      return false;                    // previne \x16 sendo enviado ao PTY
    }
    // Ctrl+Shift+W/D/E/T/Tab → re-dispara em document para App.svelte
    if (isOurShortcut(ev)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { ...ev }));
      return false;
    }
    return true;
  });

  EventsOn('terminal-output:' + sessionId, data => term.write(data));

  if (s.copyOnSelect) {
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });
  }

  return { kind: 'leaf', sessionId, shell: shell, term, fit, renderer: null };
}
```

`term.open()` **não** é chamado aqui. Ele acontece de forma lazy em `renderPane()` quando o leaf é colocado em um container DOM vivo. Isso evita falha ao adquirir contexto WebGL em elemento detached.

### `attachGpuRenderer`

```typescript
// ui/session.ts:27-60
export async function attachGpuRenderer(
  term: Terminal,
  onRendererChange: (r: WebglAddon | CanvasAddon | null) => void,
): Promise<void> {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      // NÃO chamar webgl.dispose() aqui — xterm já limpa internamente
      attachCanvas();
    });
    term.loadAddon(webgl);
    onRendererChange(webgl);
  } catch { attachCanvas(); }
}
```

A cascata **WebGL → Canvas → DOM** é totalmente automática. O callback `onRendererChange` mantém `leaf.renderer` atualizado — importante porque `destroySession` precisa dispor o renderer correto.

Browsers limitam ~16 contextos WebGL ativos. A recuperação de context loss sem chamar `dispose()` manualmente evita o crash `"Cannot read properties of undefined (reading '_isDisposed')"`.

### `destroySession`

```typescript
// ui/session.ts:173-180
export async function destroySession(leaf: PaneLeaf): Promise<void> {
  EventsOff('terminal-output:' + leaf.sessionId);
  EventsOff('terminal-exit:' + leaf.sessionId);
  try { await CloseSession(leaf.sessionId); } catch { /* already closed */ }
  try { leaf.renderer?.dispose(); } catch { /* ignore */ }
  leaf.term.dispose();  // renderer deve ser disposed ANTES do term
}
```

A ordem `renderer.dispose()` antes de `term.dispose()` é obrigatória para evitar bug interno do xterm.

---

## `ui/pane.ts` — Árvore de Painéis e DOM

### Map não-reativo de elementos DOM

```typescript
// ui/pane.ts:17
const leafElMap = new Map<string, HTMLElement>();
```

Cada sessão tem **um único `<div class="pane">` persistente**. `renderPane` apenas move esse div — nunca faz `innerHTML = ''` no container do terminal. Isso previne que a destruição de um painel apague acidentalmente o `.xterm` de outro.

### `renderPane`

Para um `PaneLeaf`:
- Se o terminal já foi aberto (→ `.xterm` existe no DOM), apenas re-faz `fit()` e `focus()`
- Se é a primeira renderização, chama `term.open(leafEl)` + `attachGpuRenderer`

Para um `PaneSplit`:
- Cria dois `<div>` de célula + um `<div class="divider">`
- Usa `CSS Grid` com `gridTemplateColumns/Rows` para aplicar o `ratio`
- Gera listener de drag no divider para redimensionamento

### `splitLeaf` e `removeLeaf`

```typescript
// ui/pane.ts:204-248 (resumido)
export async function splitLeaf(root, activeSessionId, dir) {
  const newLeaf = await createSession();
  // replaceLeaf é puro — retorna nova árvore sem mutar a existente
  const newRoot = replaceLeaf(root, activeSessionId, {
    kind: 'split', dir, ratio: 0.5,
    a: findLeaf(root, activeSessionId)!,
    b: newLeaf,
  });
  return { newRoot, newLeaf };
}

export async function removeLeaf(root, removeId) {
  const leaf = findLeaf(root, removeId);
  if (leaf) {
    await destroySession(leaf);
    deleteLeafEl(removeId);
  }
  return pruneLeaf(root, removeId);  // null se árvore ficou vazia
}
```

### `wireLeaf`

```typescript
export function wireLeaf(leaf: PaneLeaf): void {
  leaf.term.onData(data => Write(leaf.sessionId, data));
  leaf.term.onResize(({ cols, rows }) => Resize(leaf.sessionId, cols, rows));

  EventsOn('terminal-exit:' + leaf.sessionId, () => {
    const el = leafElMap.get(leaf.sessionId);
    el?.dispatchEvent(new CustomEvent('session-exit', {
      bubbles: true,
      detail: { sessionId: leaf.sessionId },
    }));
  });
}
```

`session-exit` é um `CustomEvent` que borbulha pelo DOM até `App.svelte`, que o captura e remove o painel/aba.

---

## Atalhos de Teclado

Todos os atalhos são definidos em `App.svelte` via `svelte:window onkeydown`. O xterm.js intercepta `keydown` com `stopPropagation` — por isso `createSession` instala um `attachCustomKeyEventHandler` que re-despacha eventos dos atalhos como `KeyboardEvent` sintético em `document`.

| Atalho | Ação |
|---|---|
| `Ctrl+T` | Nova aba |
| `Ctrl+W` | Fechar painel ativo |
| `Ctrl+Shift+W` | Fechar aba ativa |
| `Ctrl+Shift+D` | Split horizontal |
| `Ctrl+Shift+E` | Split vertical |
| `Ctrl+Tab` | Próxima aba |
| `Ctrl+,` | Abrir settings |
| `Ctrl+V` | Paste (tratado dentro do handler xterm) |

---

## Settings Panel

`SettingsPanel.svelte` permite alterar em tempo real:

- Família e tamanho de fonte
- Altura de linha
- Estilo e piscar do cursor
- Preset de cor
- Tamanho do scrollback
- Shell padrão (dropdown dos shells detectados)
- Copy-on-select

Ao salvar, `settings-apply.ts` itera sobre todos os `PaneLeaf` abertos e aplica as novas configurações (`term.options.*`, `clearTextureAtlas()` para fontes, `fit.fit()` para reflow).

---

## WelcomeScreen

Exibida na primeira visita (sem abas abertas). O usuário vê os shells disponíveis (via `DetectShells()`) com ícones, nome amigável e atalho de teclado. Selecionar um shell cria a primeira sessão e transita para a área de trabalho principal.
