import type { ITheme } from '@xterm/xterm';

// ─── Color Presets ────────────────────────────────────────────────────────────

export interface ColorPreset {
  id: string;
  name: string;
  theme: ITheme;
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'cyber-noir',
    name: 'Cyber Noir',
    theme: {
      background: '#09090b', foreground: '#a1a1aa',
      cursor: '#22d3ee', cursorAccent: '#09090b',
      black: '#18181b',  brightBlack:  '#3f3f46',
      red:   '#ef4444',  brightRed:    '#f87171',
      green: '#10b981',  brightGreen:  '#34d399',
      yellow:'#eab308',  brightYellow: '#facc15',
      blue:  '#3b82f6',  brightBlue:   '#60a5fa',
      magenta:'#d946ef', brightMagenta:'#e879f9',
      cyan:  '#06b6d4',  brightCyan:   '#22d3ee',
      white: '#e4e4e7',  brightWhite:  '#ffffff',
    },
  },
  {
    id: 'pampulha-night',
    name: 'Pampulha Night',
    theme: {
      background: '#0f172a', foreground: '#cbd5e1',
      cursor: '#fbbf24', cursorAccent: '#0f172a',
      black: '#1e293b',  brightBlack:  '#475569',
      red:   '#e11d48',  brightRed:    '#f43f5e',
      green: '#059669',  brightGreen:  '#10b981',
      yellow:'#d97706',  brightYellow: '#fbbf24',
      blue:  '#2563eb',  brightBlue:   '#3b82f6',
      magenta:'#7c3aed', brightMagenta:'#8b5cf6',
      cyan:  '#0891b2',  brightCyan:   '#06b6d4',
      white: '#f1f5f9',  brightWhite:  '#ffffff',
    },
  },
  {
    id: 'espresso-code',
    name: 'Espresso Code',
    theme: {
      background: '#1c1917', foreground: '#d6d3d1',
      cursor: '#d97706', cursorAccent: '#1c1917',
      black: '#292524',  brightBlack:  '#57534e',
      red:   '#dc2626',  brightRed:    '#ef4444',
      green: '#65a30d',  brightGreen:  '#84cc16',
      yellow:'#d97706',  brightYellow: '#f59e0b',
      blue:  '#0284c7',  brightBlue:   '#0ea5e9',
      magenta:'#9333ea', brightMagenta:'#a855f7',
      cyan:  '#0d9488',  brightCyan:   '#14b8a6',
      white: '#e7e5e4',  brightWhite:  '#f5f5f4',
    },
  },
  {
    id: 'gophers-forge',
    name: "Gopher's Forge",
    theme: {
      background: '#121212', foreground: '#e0e0e0',
      cursor: '#00add8', cursorAccent: '#121212',
      black: '#242424',  brightBlack:  '#484848',
      red:   '#ff5c5c',  brightRed:    '#ff8a8a',
      green: '#5cff9d',  brightGreen:  '#8affba',
      yellow:'#ffdc5c',  brightYellow: '#ffe78a',
      blue:  '#5c9dff',  brightBlue:   '#8abaff',
      magenta:'#d85cff', brightMagenta:'#e78aff',
      cyan:  '#00add8',  brightCyan:   '#5ce6ff',
      white: '#f5f5f5',  brightWhite:  '#ffffff',
    },
  },
  {
    id: 'sysadmin-phosphor',
    name: 'Phosphor',
    theme: {
      background: '#020b05', foreground: '#4ade80',
      cursor: '#22c55e', cursorAccent: '#020b05',
      black: '#064e3b',  brightBlack:  '#065f46',
      red:   '#b91c1c',  brightRed:    '#ef4444',
      green: '#16a34a',  brightGreen:  '#22c55e',
      yellow:'#ca8a04',  brightYellow: '#eab308',
      blue:  '#1d4ed8',  brightBlue:   '#3b82f6',
      magenta:'#9d174d', brightMagenta:'#db2777',
      cyan:  '#0f766e',  brightCyan:   '#14b8a6',
      white: '#a7f3d0',  brightWhite:  '#ffffff',
    },
  },
];

// ─── Settings schema ──────────────────────────────────────────────────────────

export interface AppSettings {
  // Appearance
  fontFamily: string;
  fontSize: number;       // 8–28
  lineHeight: number;     // 1.0–2.0
  cursorBlink: boolean;
  cursorStyle: 'block' | 'bar' | 'underline';
  // Colors
  colorPresetId: string;  // id from COLOR_PRESETS
  // Scrollback
  scrollback: number;     // 500–10000
  // Shell default
  defaultShell: string;   // empty = auto-detect
  // Clipboard
  copyOnSelect: boolean;  // copy to clipboard on text selection
  // AI Integration
  ollamaHost: string;
  ollamaModel: string;
}

const STORAGE_KEY = 'myterm.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: '"Cascadia Code", monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block',
  colorPresetId: 'cyber-noir',
  scrollback: 1000,
  defaultShell: '',
  copyOnSelect: false,
  ollamaHost: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3',
};

// In-memory singleton so callers don't read localStorage repeatedly.
let _settings: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (!_settings) _settings = loadSettings();
  return _settings;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings): void {
  _settings = s;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Returns the ColorPreset for the given id, falling back to the first preset. */
export function getPreset(id: string): ColorPreset {
  return COLOR_PRESETS.find(p => p.id === id) ?? COLOR_PRESETS[0];
}
