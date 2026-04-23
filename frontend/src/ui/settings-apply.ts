/**
 * settings-apply.ts
 *
 * Applies AppSettings to live xterm instances.
 * Lives in the ui-logic layer (not domain) because it depends on PaneLeaf
 * (which contains xterm and FitAddon instances).
 */
import { FitAddon } from '@xterm/addon-fit';
import type { PaneLeaf } from '../domain/types';
import { ensureFont } from '../domain/font-loader';
import { getPreset, type AppSettings } from '../domain/settings';

function colorWithAlpha(hex: string, alpha: number): string {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

export function buildThemeVars(presetId: string): Record<string, string> {
  const t = getPreset(presetId).theme;
  const fg = t.foreground ?? "#a1a1aa";
  const bg = t.background ?? "#09090b";
  const cur = t.cursor ?? fg;
  const cyn = t.cyan ?? fg;
  const bCy = t.brightCyan ?? cyn;
  const grn = t.green ?? fg;
  const red = t.red ?? "#ef4444";
  const yel = t.yellow ?? "#eab308";
  const blu = t.blue ?? "#3b82f6";
  const mag = t.magenta ?? "#d946ef";
  const bGrn = t.brightGreen ?? grn;
  const bRed = t.brightRed ?? red;
  const bYel = t.brightYellow ?? yel;
  const bBlu = t.brightBlue ?? blu;
  const bMag = t.brightMagenta ?? mag;
  const bBlk = t.brightBlack ?? colorWithAlpha(fg, 0.35);
  return {
    "--tset-bg": bg,
    "--tset-fg": fg,
    "--tset-cursor": cur,
    "--tset-cyan": bCy,
    "--tset-accent": grn,
    "--tset-dim": colorWithAlpha(fg, 0.2),
    "--tset-dimfg": colorWithAlpha(fg, 0.45),
    "--tset-red": red,
    "--tset-green": grn,
    "--tset-yellow": yel,
    "--tset-blue": blu,
    "--tset-magenta": mag,
    "--tset-br-red": bRed,
    "--tset-br-green": bGrn,
    "--tset-br-yellow": bYel,
    "--tset-br-blue": bBlu,
    "--tset-br-magenta": bMag,
    "--tset-br-black": bBlk,
  };
}

export function applyGlobalTheme(s: AppSettings) {
  const vars = buildThemeVars(s.colorPresetId);
  const root = document.documentElement;
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  root.style.setProperty("--filetree-font", s.fontFamily);
  root.style.setProperty("--filetree-font-size", `${s.filetreeFontSize}px`);
}


/**
 * Applies the current settings to a single xterm instance.
 * Waits for the chosen font to be ready in the browser before
 * clearing xterm's glyph cache to avoid rendering with the fallback.
 */
export async function applySettingsToLeaf(leaf: PaneLeaf, s: AppSettings): Promise<void> {
  if (leaf.kind !== 'terminal') return;
  const preset = getPreset(s.colorPresetId);

  // Update all options (except font) immediately so colour / cursor changes show.
  leaf.term.options.fontSize    = s.fontSize;
  leaf.term.options.lineHeight  = s.lineHeight;
  leaf.term.options.cursorBlink = s.cursorBlink;
  leaf.term.options.cursorStyle = s.cursorStyle;
  leaf.term.options.scrollback  = s.scrollback;
  leaf.term.options.theme       = preset.theme;

  // Wait for the chosen web font to fully load before applying it to xterm.
  // This mirrors @xterm/addon-web-fonts: the glyph texture must be built with
  // the correct metrics, not from a fallback font.
  await ensureFont(s.fontFamily);

  // Apply font family after it's ready.
  leaf.term.options.fontFamily = s.fontFamily;

  // Clear the glyph texture atlas so xterm redraws with the new font.
  (leaf.renderer as any)?.clearTextureAtlas?.();
  leaf.term.refresh(0, leaf.term.rows - 1);

  // Refit after changing font metrics.
  requestAnimationFrame(() => { (leaf.fit as FitAddon).fit(); });
}

/**
 * Applies settings to every open leaf (fire-and-forget).
 */
export function applySettingsToAll(leaves: PaneLeaf[], s: AppSettings): void {
  applyGlobalTheme(s);
  for (const leaf of leaves) void applySettingsToLeaf(leaf, s);
}
