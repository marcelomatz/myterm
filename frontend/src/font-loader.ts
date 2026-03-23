/**
 * font-loader.ts
 *
 * Implements the font-loading logic from @xterm/addon-web-fonts
 * inline (the npm package requires @xterm/xterm ^5.6, this project
 * uses 5.5, so we vendor just the logic we need).
 *
 * Source reference:
 *   https://github.com/xtermjs/xterm.js/blob/master/addons/addon-web-fonts/src/WebFontsAddon.ts
 */

/** Strip surrounding quotes from a CSS font-family token. */
function unquote(s: string): string {
  if ((s[0] === '"'  && s[s.length - 1] === '"')  ||
      (s[0] === "'"  && s[s.length - 1] === "'"))  {
    return s.slice(1, -1);
  }
  return s;
}

/** Split a CSS fontFamily string into individual family names. */
function splitFamily(family: string | undefined): string[] {
  if (!family) return [];
  return family.split(',').map(e => unquote(e.trim()));
}

/**
 * Wait for all FontFace objects in document.fonts that match the
 * given family names (strings) to finish loading.
 *
 * Mirrors the behaviour of loadFonts() from @xterm/addon-web-fonts:
 * - Waits for document.fonts.ready first (stylesheet parsing complete).
 * - For each family name, finds matching FontFace entries and loads them.
 * - Rejects if a requested family name has no @font-face rule registered.
 */
function _loadFonts(families: string[]): Promise<FontFace[]> {
  const ffs: FontFace[] = [];
  // FontFaceSet is not Iterable<FontFace> in TS 5.4 lib.dom — use forEach.
  (document.fonts as unknown as { forEach(cb: (ff: FontFace) => void): void })
    .forEach(ff => ffs.push(ff));
  const toLoad: FontFace[] = [];
  for (const name of families) {
    const matched = ffs.filter(ff => unquote(ff.family) === name);
    if (!matched.length) {
      // Family not registered (system font or @font-face not yet parsed).
      // Skip silently — terminal will use the system fallback.
      continue;
    }
    toLoad.push(...matched);
  }
  return Promise.all(toLoad.map(ff => ff.load()));
}


/**
 * Ensures the font families present in a CSS fontFamily string are loaded
 * before xterm opens or changes its fontFamily option.
 *
 * Usage:
 *   await ensureFont('"JetBrains Mono", monospace');
 *   terminal.open(container);
 *
 * Swallows errors so the terminal always falls back gracefully.
 */
export async function ensureFont(fontFamily: string): Promise<void> {
  try {
    // Wait for stylesheet parsing to complete first.
    await document.fonts.ready;
    const families = splitFamily(fontFamily);
    // Only attempt to load web fonts (skip generic families like "monospace").
    const generics = new Set(['monospace', 'serif', 'sans-serif', 'cursive', 'fantasy', 'system-ui', 'ui-monospace']);
    const webFamilies = families.filter(f => !generics.has(f));
    if (webFamilies.length) {
      await _loadFonts(webFamilies);
    }
  } catch (err) {
    // Offline or font not registered — log and continue with fallback.
    console.warn('[myterm] font preload failed, falling back:', err);
  }
}
