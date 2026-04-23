import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { NewSession, CloseSession, Write } from '../infrastructure/wails/backend';
import { EventsOn, EventsOff } from '../infrastructure/wails/events';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { createCommandTracker, CommandTracker } from './command-tracker';
import type { PaneLeaf } from '../domain/types';
import { getSettings, getPreset } from '../domain/settings';
import { ensureFont } from '../domain/font-loader';

// ─── GPU renderer ─────────────────────────────────────────────────────────────

/**
 * Attaches the best available GPU renderer (WebGL → Canvas → DOM fallback)
 * to `term`, which must already be open in a live DOM element.
 *
 * @param term            The xterm Terminal instance.
 * @param onRendererChange  Called every time the active renderer changes
 *                          (initial attach AND every context-loss recovery).
 *                          Callers must store the value in `leaf.renderer`
 *                          so that destroySession() can always dispose it.
 *
 * The browser limits active WebGL contexts (≈16).  Without this callback the
 * context-loss fallback creates a new CanvasAddon but leaf.renderer still
 * points to the already-disposed WebglAddon → the canvas is never cleaned up.
 */
export async function attachGpuRenderer(
  term: Terminal,
  onRendererChange: (r: WebglAddon | CanvasAddon | null) => void,
): Promise<void> {
  const attachCanvas = () => {
    try {
      const canvas = new CanvasAddon();
      term.loadAddon(canvas);
      onRendererChange(canvas);
    } catch (err2) {
      console.warn('[myterm] CanvasAddon also unavailable — using DOM renderer:', err2);
      onRendererChange(null);
    }
  };

  try {
    const webgl = new WebglAddon();

    // Keep leaf.renderer in sync if the context is lost later.
    // NOTE: do NOT call webgl.dispose() here — xterm already performs internal
    // cleanup when firing onContextLoss; a second dispose() crashes with
    // "Cannot read properties of undefined (reading '_isDisposed')".
    webgl.onContextLoss(() => {
      console.warn('[myterm] WebGL context lost — falling back to CanvasAddon');
      attachCanvas();
    });

    term.loadAddon(webgl);
    onRendererChange(webgl);
  } catch (err) {
    console.warn('[myterm] WebGL unavailable — using CanvasAddon:', err);
    attachCanvas();
  }
}


// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new backend PTY session + an xterm.js Terminal instance.
 *
 * IMPORTANT: term.open() is NOT called here — the terminal is opened lazily
 * by renderPane() the first time it is rendered into a live DOM container.
 * This prevents the WebGL/Canvas renderer from failing to acquire a GL context
 * on a detached DOM element.
 *
 * Returns a PaneLeaf ready to insert into the state tree.
 */
export async function createSession(
  shell: string = '',
): Promise<PaneLeaf> {
  const s = getSettings();
  const effectiveShell = shell || s.defaultShell || '';
  const startupPath = s.startupPath || '~';

  const sessionId = await NewSession(effectiveShell, startupPath);
  if (!sessionId) throw new Error('NewSession returned empty id');

  const preset = getPreset(s.colorPresetId);

  const family = s.fontFamily === 'monospace' 
    ? 'monospace' 
    : `'${s.fontFamily}', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace`;

  const term = new Terminal({
    fontFamily: family,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    cursorBlink: s.cursorBlink,
    cursorStyle: s.cursorStyle,
    scrollback: s.scrollback,
    allowProposedApi: true,
    theme: preset.theme,
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  const tracker = createCommandTracker(sessionId);
  term.onData(data => tracker.trackInput(data));

  setTimeout(() => {
    const setup = CommandTracker.shellIntegrationSetup(effectiveShell);
    Write(sessionId, setup);
    setTimeout(() => Write(sessionId, "clear\r"), 300);
  }, 500);

  // Pre-load the web font so it's ready when term.open() is called in renderPane.
  await ensureFont(s.fontFamily);

  let lastPaste = 0;

  // Allow our window-level shortcuts to bubble through even when the terminal
  // is focused. xterm.js calls stopPropagation() on all keydown events it
  // handles — returning false here makes xterm skip its own handling so the
  // event reaches the window listener in App.svelte.
  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    if (ev.type !== 'keydown') return true;
    // Ignore key-repeat: only act on the first press to prevent double actions.
    // NOTE: only block repeats for our own shortcuts — character repetition
    // (holding 'a' to get 'aaaaa') must still reach xterm normally.
    if (ev.ctrlKey) {
      // Ctrl+C — Copy if text is selected, otherwise let xterm send SIGINT.
      if (!ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'c' && !ev.repeat) {
        if (term.hasSelection()) {
          const sel = term.getSelection();
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => {});
            term.clearSelection();
          }
          return false; // Prevent xterm from sending SIGINT (\x03)
        }
      }

      // Ctrl+V — paste from clipboard.
      // We manually intercept and paste to avoid xterm sending \x16.
      // A debounce is used to prevent double pastes if multiple events fire.
      if (!ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'v' && !ev.repeat) {
        const now = Date.now();
        if (now - lastPaste > 100) {
          lastPaste = now;
          navigator.clipboard.readText()
            .then(text => { if (text) term.paste(text); })
            .catch(() => { /* ignore */ });
        }
        return false; // Prevent xterm from sending \x16 and double-processing
      }
      const isOurShortcut =
        (ev.shiftKey && 'WwDdEeTt'.includes(ev.key)) ||
        ev.key === ',' ||
        ev.key === 'Tab' || ev.code === 'Tab';

      if (isOurShortcut) {
        if (ev.repeat) return false; // suppress repeated shortcut presses
        // Re-fire a synthetic clone on `document` so App.svelte's
        // svelte:window onkeydown receives it despite xterm's stopPropagation.
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: ev.key,
          code: ev.code,
          ctrlKey: ev.ctrlKey,
          shiftKey: ev.shiftKey,
          altKey: ev.altKey,
          metaKey: ev.metaKey,
          bubbles: true,
          cancelable: true,
        }));
        return false;
      }
    }
    return true;
  });


  // Forward PTY output → xterm
  EventsOn('terminal-output:' + sessionId, (data: string) => {
    term.write(data);
    tracker.trackOutput(data);
  });

  // Copy on select
  if (s.copyOnSelect) {
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => { });
    });
  }

  // renderer is null until renderPane calls term.open() + attachGpuRenderer().
  return { kind: 'leaf', sessionId, shell: effectiveShell, term, fit, renderer: null };
}

/**
 * Tears down a PaneLeaf: closes the backend session, disposes xterm,
 * and removes all event listeners.
 *
 * The renderer addon is disposed BEFORE term.dispose() to avoid
 * the xterm internal disposal-order bug that causes:
 *   "Cannot read properties of undefined (reading '_isDisposed')"
 */
export async function destroySession(leaf: PaneLeaf): Promise<void> {
  EventsOff('terminal-output:' + leaf.sessionId);
  EventsOff('terminal-exit:' + leaf.sessionId);
  try { await CloseSession(leaf.sessionId); } catch { /* already closed */ }
  // Dispose renderer addon first to avoid xterm's internal disposal-order bug.
  try { leaf.renderer?.dispose(); } catch { /* ignore */ }
  leaf.term.dispose();
}
