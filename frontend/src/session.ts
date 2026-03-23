import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { NewSession, CloseSession } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';
import type { PaneLeaf } from './types';
import { getSettings, getPreset } from './settings';
import { ensureFont } from './font-loader';

// ─── GPU renderer ─────────────────────────────────────────────────────────────

/**
 * Attempts to attach a WebGL renderer to `term` (already opened).
 * Falls back to CanvasAddon if WebGL context is unavailable or lost.
 * Must be called AFTER term.open().
 */
async function attachGpuRenderer(
  term: Terminal,
): Promise<WebglAddon | CanvasAddon | null> {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      console.warn('[myterm] WebGL context lost — falling back to CanvasAddon');
      webgl.dispose();
      const canvas = new CanvasAddon();
      term.loadAddon(canvas);
    });
    term.loadAddon(webgl);
    return webgl;
  } catch (err) {
    console.warn('[myterm] WebGL unavailable — using CanvasAddon:', err);
    try {
      const canvas = new CanvasAddon();
      term.loadAddon(canvas);
      return canvas;
    } catch (err2) {
      console.warn('[myterm] CanvasAddon also unavailable — using DOM renderer:', err2);
      return null;
    }
  }
}


// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new backend PTY session + an xterm.js instance mounted in `container`.
 * `shell` is the executable to run; pass '' to use the default from settings or auto-detect.
 * Returns a PaneLeaf ready to insert into the state tree.
 */
export async function createSession(
  container: HTMLElement,
  shell: string = '',
): Promise<PaneLeaf> {
  const s = getSettings();
  const effectiveShell = shell || s.defaultShell || '';

  const sessionId = await NewSession(effectiveShell);
  if (!sessionId) throw new Error('NewSession returned empty id');

  const preset = getPreset(s.colorPresetId);

  const term = new Terminal({
    fontFamily:       s.fontFamily,
    fontSize:         s.fontSize,
    lineHeight:       s.lineHeight,
    cursorBlink:      s.cursorBlink,
    cursorStyle:      s.cursorStyle,
    scrollback:       s.scrollback,
    allowProposedApi: true,
    theme:            preset.theme,
  });

  const fit = new FitAddon();
  term.loadAddon(fit);

  // Ensure the web font is loaded BEFORE term.open() so the glyph cache
  // is built with correct metrics from the very first frame.
  await ensureFont(s.fontFamily);
  term.open(container);
  const renderer = await attachGpuRenderer(term);

  // Wait a tick for the DOM to settle, then fit.
  await new Promise<void>(r => requestAnimationFrame(() => { fit.fit(); r(); }));
  term.focus();

  // Allow our window-level shortcuts to bubble through even when the terminal
  // is focused. xterm.js calls stopPropagation() on all keydown events it
  // handles — returning false here makes xterm skip its own handling so the
  // event reaches the window listener in main.ts.
  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    if (ev.ctrlKey) {
      if (ev.shiftKey) {
        // Ctrl+Shift+W/D/E/T — our pane/tab shortcuts
        if ('WwDdEeTt'.includes(ev.key)) return false;
      }
      // Ctrl+,  (settings)  |  Ctrl+Tab (cycle tabs)
      if (ev.key === ',' || ev.key === 'Tab') return false;
    }
    return true;
  });

  // Forward PTY output → xterm
  EventsOn('terminal-output:' + sessionId, (data: string) => term.write(data));

  // Copy on select
  if (s.copyOnSelect) {
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });
  }

  return { kind: 'leaf', sessionId, shell: effectiveShell, term, fit, renderer, el: container };
}

/**
 * Tears down a PaneLeaf: closes the backend session, disposes xterm,
 * and removes all event listeners.
 */
export async function destroySession(leaf: PaneLeaf): Promise<void> {
  EventsOff('terminal-output:' + leaf.sessionId);
  EventsOff('terminal-exit:'   + leaf.sessionId);
  try { await CloseSession(leaf.sessionId); } catch { /* already closed */ }
  leaf.term.dispose();
}
