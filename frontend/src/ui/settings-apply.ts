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

/**
 * Applies the current settings to a single xterm instance.
 * Waits for the chosen font to be ready in the browser before
 * clearing xterm's glyph cache to avoid rendering with the fallback.
 */
export async function applySettingsToLeaf(leaf: PaneLeaf, s: AppSettings): Promise<void> {
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
  for (const leaf of leaves) void applySettingsToLeaf(leaf, s);
}
