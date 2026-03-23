/**
 * welcome-screen.ts
 *
 * Empty-state screen shown in the workspace when there are no tabs open.
 * Aesthetic: retro amber-phosphor terminal, 80s/90s vibe, indie.
 */

const VERSION = '0.1.0-beta';

const BANNER = `
  ███╗   ███╗██╗   ██╗████████╗███████╗██████╗ ███╗   ███╗
  ████╗ ████║╚██╗ ██╔╝╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
  ██╔████╔██║ ╚████╔╝    ██║   █████╗  ██████╔╝██╔████╔██║
  ██║╚██╔╝██║  ╚██╔╝     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
  ██║ ╚═╝ ██║   ██║      ██║   ███████╗██║  ██║██║ ╚═╝ ██║
  ╚═╝     ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝`.trimStart();

const LINES = [
  '',
  `  myterm ${VERSION} `,
  '',
  '  ┌─────────────────────────────────────────────────────────┐',
  '  │  QUICK START                                            │',
  '  │                                                         │',
  '  │  Click  [+]              Open a new terminal tab        │',
  '  │  Ctrl+Shift+T            New tab (same shell)           │',
  '  │  Ctrl+Shift+D            Split horizontally             │',
  '  │  Ctrl+Shift+E            Split vertically               │',
  '  │  Ctrl+Shift+W            Close focused pane             │',
  '  │  Ctrl+Tab                Cycle through tabs             │',
  '  │  Ctrl+,                  Open settings                  │',
  '  └─────────────────────────────────────────────────────────┘',
  '',
  '  A terminal emulator for humans - Built by Matz',
  '',
];

/** CSS injected once into <head>. */
const STYLE = `
.welcome-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0a0a00;
  overflow: hidden;
  font-family: "JetBrains Mono", "Fira Code", "Source Code Pro", ui-monospace, monospace;
  color: #d4a017;
  user-select: none;
  -webkit-user-select: none;
}

/* Scanline overlay */
.welcome-screen::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 3px,
    rgba(0,0,0,0.18) 3px,
    rgba(0,0,0,0.18) 4px
  );
  pointer-events: none;
  z-index: 10;
}

/* Vignette */
.welcome-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%);
  pointer-events: none;
  z-index: 9;
}

.welcome-inner {
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 700px;
  width: 100%;
  padding: 0 16px;
}

/* ASCII banner */
.welcome-banner {
  white-space: pre;
  font-size: clamp(5px, 1.15vw, 11px);
  line-height: 1.2;
  color: #ffb300;
  text-shadow: 0 0 6px rgba(255,179,0,0.65);
  animation: ws-flicker 8s infinite;
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}

/* Info lines */
.welcome-lines {
  white-space: pre;
  font-size: clamp(10px, 1.2vw, 13px);
  line-height: 1.55;
  color: #c8920a;
  letter-spacing: 0.03em;
  text-shadow: 0 0 4px rgba(200,146,10,0.4);
}

/* Blinking cursor at the end */
.welcome-cursor {
  display: inline-block;
  width: 9px;
  height: 1.1em;
  background: #ffb300;
  vertical-align: text-bottom;
  margin-left: 2px;
  animation: ws-blink 1.1s step-end infinite;
  box-shadow: 0 0 6px #ffb300;
}

/* Floating scanline noise dots */
.welcome-noise {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  overflow: hidden;
}
.welcome-noise span {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(212, 160, 23, 0.25);
  animation: ws-drift linear infinite;
}

/* CTA hint */
.welcome-cta {
  margin-top: 14px;
  font-size: clamp(10px, 1.1vw, 12px);
  color: #7a5800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: ws-pulse 2.8s ease-in-out infinite;
}

@keyframes ws-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

@keyframes ws-flicker {
  0%, 97%, 100%          { opacity: 1; }
  97.5%                  { opacity: 0.6; }
  98%                    { opacity: 1; }
  98.5%                  { opacity: 0.7; }
  99%                    { opacity: 1; }
}

@keyframes ws-pulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1;    }
}

@keyframes ws-drift {
  from { transform: translateY(100vh); }
  to   { transform: translateY(-10px); }
}
`.trim();

let _styleInjected = false;
function injectStyle(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
}

/** Creates floating noise particles */
function makeNoise(container: HTMLElement, count = 35): void {
  const noise = document.createElement('div');
  noise.className = 'welcome-noise';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    dot.style.animationDuration = `${6 + Math.random() * 14}s`;
    dot.style.animationDelay = `${-Math.random() * 20}s`;
    dot.style.opacity = `${0.1 + Math.random() * 0.4}`;
    noise.appendChild(dot);
  }
  container.appendChild(noise);
}

/**
 * Wait for the web fonts used by the welcome screen to load.
 * Resolves after document.fonts.ready, then force-loads JetBrains Mono.
 * Gracefully falls back if offline or fonts blocked by CSP.
 */
async function waitForFonts(): Promise<void> {
  try {
    await document.fonts.ready;
    await Promise.allSettled([
      document.fonts.load('400 14px "JetBrains Mono"'),
      document.fonts.load('400 14px "Fira Code"'),
    ]);
  } catch { /* offline or fonts blocked – use system monospace */ }
}

/** Build and asynchronously mount the welcome screen into a container. */
export async function mountWelcomeScreen(container: HTMLElement): Promise<HTMLElement | null> {
  injectStyle();
  await waitForFonts();

  // If a tab was opened while fonts were loading, don't mount.
  if (!container.isConnected || container.hasChildNodes()) return null;

  const root = document.createElement('div');
  root.className = 'welcome-screen';
  root.id = 'welcome-screen';

  makeNoise(root);

  const inner = document.createElement('div');
  inner.className = 'welcome-inner';

  const banner = document.createElement('div');
  banner.className = 'welcome-banner';
  banner.textContent = BANNER;

  const lines = document.createElement('div');
  lines.className = 'welcome-lines';
  lines.textContent = LINES.join('\n');

  // Blinking cursor at the end of the last line
  const cursor = document.createElement('span');
  cursor.className = 'welcome-cursor';
  lines.appendChild(cursor);

  const cta = document.createElement('div');
  cta.className = 'welcome-cta';
  cta.innerHTML = '▶  Click [+] or press <strong>Ctrl+Shift+T</strong> to open a terminal';

  inner.appendChild(banner);
  inner.appendChild(lines);
  inner.appendChild(cta);
  root.appendChild(inner);

  container.appendChild(root);
  return root;
}

/**
 * Synchronous façade kept for backward-compat.
 * Builds the element immediately (fonts may not be loaded yet) and kicks off
 * an async font-check that swaps the font-family once ready.
 */
export function buildWelcomeScreen(): HTMLElement {
  injectStyle();

  const root = document.createElement('div');
  root.className = 'welcome-screen';
  root.id = 'welcome-screen';

  makeNoise(root);

  const inner = document.createElement('div');
  inner.className = 'welcome-inner';

  const banner = document.createElement('div');
  banner.className = 'welcome-banner';
  banner.textContent = BANNER;

  const lines = document.createElement('div');
  lines.className = 'welcome-lines';
  lines.textContent = LINES.join('\n');

  const cursor = document.createElement('span');
  cursor.className = 'welcome-cursor';
  lines.appendChild(cursor);


  inner.appendChild(banner);
  inner.appendChild(lines);
  root.appendChild(inner);

  // Kick off font loading in the background; once the fonts are ready the
  // browser automatically re-renders using the correct face — no manual
  // repaint trick needed. We just need the load call to happen.
  waitForFonts().then(() => {
    if (root.isConnected) {
      // Force a style recalculation so the browser picks up the newly loaded
      // font. Reading offsetHeight is a well-known, lint-safe way to do this.
      void root.offsetHeight;
    }
  });


  return root;
}
