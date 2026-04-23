import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WebglAddon } from '@xterm/addon-webgl';
import type { CanvasAddon } from '@xterm/addon-canvas';

// ─── Pane tree ───────────────────────────────────────────────────────────────

export interface TerminalLeaf {
  kind: 'terminal';
  sessionId: string;
  shell: string;          // effective shell executable used for this session
  term: Terminal;
  fit: FitAddon;
  /** WebGL or Canvas renderer addon — used for clearTextureAtlas on font change. */
  renderer: WebglAddon | CanvasAddon | null;
  // NOTE: el (DOM container) is NOT stored here — it lives in pane.ts:leafElMap
  // to keep it out of Svelte's reactive $state tree and avoid infinite $effect loops.
}

export interface EditorFile {
  filePath: string;
  content: string;
  isDirty: boolean;
}

export interface ExtensionLeaf {
  kind: 'extension';
  extensionId: string;    // e.g. 'editor'
  id: string;             // unique identifier for the instance
  state: any;             // plugin-specific state
}

export type PaneLeaf = TerminalLeaf | ExtensionLeaf;

export interface PaneSplit {
  kind: 'split';
  dir: 'h' | 'v';        // 'h' = side-by-side columns, 'v' = top/bottom rows
  ratio: number;          // 0.0–1.0, fraction for child `a`
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

// ─── Tab ─────────────────────────────────────────────────────────────────────

export interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activeLeafId: string;   // sessionId of the focused pane
  isSidebarOpen?: boolean;
}

// ─── App state ───────────────────────────────────────────────────────────────

export interface AppState {
  tabs: Tab[];
  activeTabId: string;
}
