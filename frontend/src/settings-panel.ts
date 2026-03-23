import {
  AppSettings, COLOR_PRESETS, DEFAULT_SETTINGS,
  getSettings, saveSettings, applySettingsToAll, getPreset,
} from './settings';
import type { PaneLeaf } from './types';
import { DetectShells } from '../wailsjs/go/main/App';

const FONT_OPTIONS = [
  { label: 'Cascadia Code',  value: '"Cascadia Code", "JetBrains Mono", monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code',      value: '"Fira Code", monospace' },
  { label: 'Source Code Pro',value: '"Source Code Pro", monospace' },
  { label: 'Consolas',       value: 'Consolas, monospace' },
  { label: 'Menlo / Monaco', value: 'Menlo, Monaco, monospace' },
  { label: 'System Mono',    value: 'ui-monospace, monospace' },
];

/**
 * Returns an element that renders the settings as a retro terminal screen
 * with a live terminal preview on the right side.
 * Shell detection happens async and updates just the shell section.
 * `onRebuild` is called after "Reset to defaults".
 */
export function buildSettingsPane(
  getLeaves: () => PaneLeaf[],
  onRebuild: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tset-wrap';

  renderPanel([]);
  DetectShells()
    .then(shells => renderPanel(shells))
    .catch(() => {});

  function renderPanel(shells: string[]): void {
    wrap.innerHTML = '';

    let draft: AppSettings = { ...getSettings() };

    // ── helpers ─────────────────────────────────────────────────────────

    function apply(updater: (d: AppSettings) => void): void {
      updater(draft);
      saveSettings(draft);
      applySettingsToAll(getLeaves(), draft);
    }

    /** Reflect the selected font in the settings panel itself. */
    function setPanelFont(fontFamily: string): void {
      wrap.style.fontFamily = fontFamily;
    }

    /**
     * Inject the active theme's colors as CSS custom properties on the wrap.
     * Both the settings panel AND the preview pane pick these up automatically.
     */
    function applyThemeToPanel(presetId: string): void {
      const t = getPreset(presetId).theme;
      const bg  = t.background  ?? '#09090b';
      const fg  = t.foreground  ?? '#a1a1aa';
      const cur = t.cursor      ?? fg;
      const cyn  = t.cyan        ?? fg;
      const bCy  = t.brightCyan  ?? cyn;
      const grn  = t.green       ?? fg;
      const red  = t.red         ?? '#ef4444';
      const yel  = t.yellow      ?? '#eab308';
      const blu  = t.blue        ?? '#3b82f6';
      const mag  = t.magenta     ?? '#d946ef';
      const bGrn = t.brightGreen  ?? grn;
      const bRed = t.brightRed    ?? red;
      const bYel = t.brightYellow ?? yel;
      const bBlu = t.brightBlue   ?? blu;
      const bMag = t.brightMagenta ?? mag;
      const bBlk = t.brightBlack  ?? colorWithAlpha(fg, 0.35);

      wrap.style.setProperty('--tset-bg',        bg);
      wrap.style.setProperty('--tset-fg',        fg);
      wrap.style.setProperty('--tset-cursor',    cur);
      wrap.style.setProperty('--tset-cyan',      bCy);
      wrap.style.setProperty('--tset-accent',    grn);
      wrap.style.setProperty('--tset-dim',       colorWithAlpha(fg, 0.20));
      wrap.style.setProperty('--tset-dimfg',     colorWithAlpha(fg, 0.45));
      // Full ANSI palette for preview
      wrap.style.setProperty('--tset-red',       red);
      wrap.style.setProperty('--tset-green',     grn);
      wrap.style.setProperty('--tset-yellow',    yel);
      wrap.style.setProperty('--tset-blue',      blu);
      wrap.style.setProperty('--tset-magenta',   mag);
      wrap.style.setProperty('--tset-br-red',    bRed);
      wrap.style.setProperty('--tset-br-green',  bGrn);
      wrap.style.setProperty('--tset-br-yellow', bYel);
      wrap.style.setProperty('--tset-br-blue',   bBlu);
      wrap.style.setProperty('--tset-br-magenta',bMag);
      wrap.style.setProperty('--tset-br-black',  bBlk);
    }

    /** Convert any hex color to rgba(r,g,b,alpha). Falls back to original if unparseable. */
    function colorWithAlpha(hex: string, alpha: number): string {
      const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
      if (!m) return hex;
      return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
    }

    /** A box row: "  key  |  value" */
    function row(key: string, control: HTMLElement): HTMLElement {
      const r = document.createElement('div');
      r.className = 'tset-row';
      const lbl = document.createElement('span');
      lbl.className = 'tset-key';
      lbl.textContent = key;
      const sep = document.createElement('span');
      sep.className = 'tset-sep';
      sep.textContent = ' │ ';
      const val = document.createElement('span');
      val.className = 'tset-val';
      val.appendChild(control);
      r.append(lbl, sep, val);
      return r;
    }

    function section(title: string): HTMLElement {
      const s = document.createElement('div');
      s.className = 'tset-section';
      const hdr = document.createElement('div');
      hdr.className = 'tset-section-hdr';
      hdr.textContent = `── ${title} `;
      s.appendChild(hdr);
      return s;
    }

    function makeSelect(
      options: { label: string; value: string }[],
      current: string,
      onChange: (v: string) => void,
    ): HTMLSelectElement {
      const sel = document.createElement('select');
      sel.className = 'tset-select';
      for (const { label, value } of options) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        if (value === current) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    }

    function makeRange(
      min: number, max: number, step: number, current: number,
      onChange: (v: number) => void,
    ): HTMLElement {
      const w = document.createElement('span');
      w.className = 'tset-range-wrap';
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'tset-range';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(current);
      const badge = document.createElement('span');
      badge.className = 'tset-range-badge';
      badge.textContent = String(current);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        badge.textContent = String(v);
        onChange(v);
      });
      w.append(input, badge);
      return w;
    }

    function makeToggle(current: boolean, onChange: (v: boolean) => void): HTMLElement {
      const btn = document.createElement('button');
      btn.className = 'tset-toggle' + (current ? ' on' : '');
      btn.textContent = current ? '[ON ]' : '[OFF]';
      btn.addEventListener('click', () => {
        const next = !btn.classList.contains('on');
        btn.classList.toggle('on', next);
        btn.textContent = next ? '[ON ]' : '[OFF]';
        onChange(next);
      });
      return btn;
    }

    // ── Preview ──────────────────────────────────────────────────────────

    /** Builds the right-side live preview pane with mock terminal content. */
    function buildPreviewPane(): { pane: HTMLElement; term: HTMLElement } {
      const pane = document.createElement('div');
      pane.className = 'tset-preview-pane';

      const hdr = document.createElement('div');
      hdr.className = 'tset-preview-hdr';
      hdr.textContent = '── LIVE PREVIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
      pane.appendChild(hdr);

      const term = document.createElement('div');
      term.className = 'tset-preview-term';
      term.style.fontSize   = draft.fontSize   + 'px';
      term.style.lineHeight = String(draft.lineHeight);
      term.innerHTML = buildMockHTML();
      pane.appendChild(term);

      return { pane, term };
    }

    /** Builds rich mock terminal HTML demonstrating all color categories. */
    function buildMockHTML(): string {
      const s = (cls: string, txt: string) => `<span class="${cls}">${txt}</span>`;
      const L = (...parts: string[]) => `<div class="pv-line">${parts.join('')}</div>`;
      const prompt = (path: string) =>
        s('pv-user','user') + s('pv-at','@') + s('pv-host','myterm') + s('pv-sep',':') +
        s('pv-path', path)  + s('pv-dollar','$ ');
      const blank = () => L('');

      return [
        // ── ls -la
        L( prompt('~/projects/myapp'), s('pv-cmd','ls'), ' ', s('pv-arg','-la src/') ),
        L( s('pv-dim','total 64') ),
        L( s('pv-dim','drwxr-xr-x'), '  7 user  ', s('pv-cyan','224'), ' Mar 23 11:44 ', s('pv-path','./') ),
        L( s('pv-dim','drwxr-xr-x'), ' 14 user  ', s('pv-cyan','448'), ' Mar 23 11:30 ', s('pv-path','../') ),
        L( s('pv-dim','-rw-r--r--'), '  1 user ', s('pv-num','2341'), ' Mar 23 11:44 ', s('pv-green','main.ts') ),
        L( s('pv-dim','-rw-r--r--'), '  1 user ', s('pv-num','3892'), ' Mar 23 11:44 ', s('pv-green','settings-panel.ts') ),
        L( s('pv-dim','-rw-r--r--'), '  1 user ', s('pv-num','1087'), ' Mar 23 11:30 ', s('pv-green','settings.ts') ),
        L( s('pv-dim','drwxr-xr-x'), '  3 user   ', s('pv-cyan','96'), ' Mar 23 11:00 ', s('pv-path','types/') ),
        blank(),

        // ── git log
        L( prompt('~/projects/myapp'), s('pv-cmd','git'), ' ', s('pv-arg','log --oneline -4') ),
        L( s('pv-yellow','a3f2c1d'), ' ', s('pv-green','feat'), s('pv-dim',':'), ' add live preview to settings' ),
        L( s('pv-yellow','9b8e4f2'), ' ', s('pv-green','feat'), s('pv-dim',':'), ' theme CSS variables' ),
        L( s('pv-yellow','c7d5a1e'), ' ', s('pv-blue','fix'),  s('pv-dim',':'), ' closeActivePane debounce' ),
        L( s('pv-yellow','1e3b9d0'), ' ', s('pv-dim','chore:'), ' initial commit' ),
        blank(),

        // ── npm test
        L( prompt('~/projects/myapp'), s('pv-cmd','npm'), ' ', s('pv-arg','test -- --reporter=verbose') ),
        blank(),
        L( ' ', s('pv-ok','\u2713 PASS'), '  src/__tests__/', s('pv-cyan','settings.test.ts'), s('pv-dim','  (2.3s)') ),
        L( '   ', s('pv-pass','\u2713 '), s('pv-dim','loads defaults correctly '), s('pv-cyan','(12ms)') ),
        L( '   ', s('pv-pass','\u2713 '), s('pv-dim','saves and restores settings '), s('pv-cyan','(8ms)') ),
        L( '   ', s('pv-pass','\u2713 '), s('pv-dim','applies theme to panel '), s('pv-cyan','(4ms)') ),
        blank(),
        L( ' ', s('pv-fail','\u2717 FAIL'), '  src/__tests__/', s('pv-red','preview.test.ts') ),
        L( '   ', s('pv-fail','\u2717 '), s('pv-dim','theme matches preset') ),
        L( '     ', s('pv-dim','Expected: '), s('pv-str','"pampulha-night"') ),
        L( '     ', s('pv-dim','Received: '), s('pv-red','"cyber-noir"') ),
        blank(),
        L( s('pv-dim','Tests: '), s('pv-fail','1 failed'), s('pv-dim',', '), s('pv-pass','3 passed'), s('pv-dim',', 4 total') ),
        blank(),

        // ── cat file (Go syntax showcase)
        L( prompt('~/projects/myapp'), s('pv-cmd','cat'), ' ', s('pv-arg','cmd/main.go') ),
        L( s('pv-kw','package'), ' ', s('pv-green','main') ),
        blank(),
        L( s('pv-kw','import'), ' ('),
        L( '    ', s('pv-str','"fmt"'), '                ', s('pv-cmt','// standard library') ),
        L( '    ', s('pv-str','"os"'), '                 ', s('pv-cmt','// exit codes') ),
        L( ')' ),
        blank(),
        L( s('pv-kw','func'), ' ', s('pv-green','main'), s('pv-dim','() {') ),
        L( '    ', s('pv-magenta','fmt'), s('pv-dim','.'), s('pv-cyan','Println'), s('pv-dim','('), s('pv-str','"Hello, myterm!"'), s('pv-dim',')') ),
        L( '    ', s('pv-magenta','os'), s('pv-dim','.'), s('pv-cyan','Exit'), s('pv-dim','('), s('pv-num','0'), s('pv-dim',')') ),
        L( s('pv-dim','}') ),
        blank(),

        // ── cursor
        L( prompt('~/projects/myapp'), s('pv-cursor',' ') ),
      ].join('');
    }

    // ── Build layout ─────────────────────────────────────────────────────

    // Left panel ────────────────────────────────────────────────────────
    const leftDiv = document.createElement('div');
    leftDiv.className = 'tset-left';

    const panel = document.createElement('div');
    panel.className = 'tset-panel';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'tset-header';
    hdr.innerHTML =
      `<span class="tset-prompt">$</span>` +
      `<span class="tset-cmd"> myterm <span class="tset-arg">--settings</span></span>` +
      `<span class="tset-blink">▋</span>`;
    panel.appendChild(hdr);

    const divTop = document.createElement('div');
    divTop.className = 'tset-div';
    divTop.textContent = '─'.repeat(46);
    panel.appendChild(divTop);

    // ── § Appearance
    // We need previewTerm reference for live font-size / line-height updates.
    // Declare before wiring onChange; assigned below after buildPreviewPane().
    let previewTerm: HTMLElement | null = null;

    const secAp = section('APPEARANCE');
    secAp.appendChild(row('font-family   ',
      makeSelect(FONT_OPTIONS, draft.fontFamily,
        v => { apply(d => { d.fontFamily = v; }); setPanelFont(v); })));
    secAp.appendChild(row('font-size     ',
      makeRange(8, 28, 1, draft.fontSize,
        v => {
          apply(d => { d.fontSize = v; });
          if (previewTerm) previewTerm.style.fontSize = v + 'px';
        })));
    secAp.appendChild(row('line-height   ',
      makeRange(1.0, 2.0, 0.05, draft.lineHeight,
        v => {
          apply(d => { d.lineHeight = Number(v.toFixed(2)); });
          if (previewTerm) previewTerm.style.lineHeight = String(v);
        })));
    secAp.appendChild(row('cursor-style  ',
      makeSelect(
        [{ label: 'block',     value: 'block' },
         { label: 'bar',       value: 'bar' },
         { label: 'underline', value: 'underline' }],
        draft.cursorStyle,
        v => apply(d => { d.cursorStyle = v as AppSettings['cursorStyle']; }))));
    secAp.appendChild(row('cursor-blink  ',
      makeToggle(draft.cursorBlink,
        v => apply(d => { d.cursorBlink = v; }))));
    panel.appendChild(secAp);

    // ── § Colors
    const secCl = section('COLORS');
    secCl.appendChild(row('color-theme   ',
      makeSelect(
        COLOR_PRESETS.map(p => ({ label: p.name, value: p.id })),
        draft.colorPresetId,
        v => { apply(d => { d.colorPresetId = v; }); applyThemeToPanel(v); })));
    panel.appendChild(secCl);

    // ── § Shell
    const secSh = section('SHELL');
    if (shells.length > 0) {
      secSh.appendChild(row('default-shell ',
        makeSelect(
          [{ label: '(auto)', value: '' }, ...shells.map(s => ({ label: s, value: s }))],
          draft.defaultShell,
          v => apply(d => { d.defaultShell = v; }))));
    } else {
      const note = document.createElement('div');
      note.className = 'tset-note';
      note.textContent = '  # shell detection unavailable — using auto';
      secSh.appendChild(note);
    }
    panel.appendChild(secSh);

    // ── § Behavior
    const secBh = section('BEHAVIOR');
    secBh.appendChild(row('scrollback    ',
      makeRange(500, 10000, 100, draft.scrollback,
        v => apply(d => { d.scrollback = v; }))));
    secBh.appendChild(row('copy-on-select',
      makeToggle(draft.copyOnSelect,
        v => apply(d => { d.copyOnSelect = v; }))));
    panel.appendChild(secBh);

    // ── Footer / reset
    const divBot = document.createElement('div');
    divBot.className = 'tset-div';
    divBot.textContent = '─'.repeat(46);
    panel.appendChild(divBot);

    const footer = document.createElement('div');
    footer.className = 'tset-footer';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'tset-reset-btn';
    resetBtn.textContent = '[ reset to defaults ]';
    resetBtn.addEventListener('click', () => {
      draft = { ...DEFAULT_SETTINGS };
      saveSettings(draft);
      applySettingsToAll(getLeaves(), draft);
      onRebuild();
    });
    footer.appendChild(resetBtn);
    panel.appendChild(footer);

    leftDiv.appendChild(panel);

    // Right panel ───────────────────────────────────────────────────────
    const { pane: previewPane, term } = buildPreviewPane();
    previewTerm = term;   // wire up to range onChange callbacks

    // Assemble
    wrap.append(leftDiv, previewPane);

    // Apply current theme + font immediately
    setPanelFont(draft.fontFamily);
    applyThemeToPanel(draft.colorPresetId);
  }

  return wrap;
}
