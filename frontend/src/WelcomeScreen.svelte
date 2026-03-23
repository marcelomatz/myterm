<script lang="ts">
  import { onMount } from "svelte";

  const VERSION = "0.1.0-beta";

  const BANNER = `
  ███╗   ███╗██╗   ██╗████████╗███████╗██████╗ ███╗   ███╗
  ████╗ ████║╚██╗ ██╔╝╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
  ██╔████╔██║ ╚████╔╝    ██║   █████╗  ██████╔╝██╔████╔██║
  ██║╚██╔╝██║  ╚██╔╝     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
  ██║ ╚═╝ ██║   ██║      ██║   ███████╗██║  ██║██║ ╚═╝ ██║
  ╚═╝     ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝`.trimStart();

  const LINES = [
    "",
    `  myterm ${VERSION} `,
    "",
    "  ┌─────────────────────────────────────────────────────────┐",
    "  │  QUICK START                                            │",
    "  │                                                         │",
    "  │  Click  [+]              Open a new terminal tab        │",
    "  │  Ctrl+Shift+T            New tab (same shell)           │",
    "  │  Ctrl+Shift+D            Split horizontally             │",
    "  │  Ctrl+Shift+E            Split vertically               │",
    "  │  Ctrl+Shift+W            Close focused pane             │",
    "  │  Ctrl+Tab                Cycle through tabs             │",
    "  │  Ctrl+,                  Open settings                  │",
    "  └─────────────────────────────────────────────────────────┘",
    "",
    "  A terminal emulator for humans - Built by Matz",
    "",
  ].join("\n");

  // 35 random noise particles — generated once at component creation.
  interface Particle {
    left: string;
    top: string;
    dur: string;
    delay: string;
    opacity: string;
  }
  const particles: Particle[] = Array.from({ length: 35 }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    dur: `${6 + Math.random() * 14}s`,
    delay: `${-Math.random() * 20}s`,
    opacity: `${(0.1 + Math.random() * 0.4).toFixed(2)}`,
  }));

  // Trigger font load so xterm renders with the correct face when a tab is opened.
  onMount(async () => {
    try {
      await document.fonts.ready;
      await Promise.allSettled([
        document.fonts.load('400 14px "JetBrains Mono"'),
        document.fonts.load('400 14px "Fira Code"'),
      ]);
    } catch {
      /* offline or fonts blocked */
    }
  });
</script>

<div class="welcome-screen" id="welcome-screen">
  <!-- Floating noise particles -->
  <div class="welcome-noise" aria-hidden="true">
    {#each particles as p}
      <span
        style="left:{p.left};top:{p.top};animation-duration:{p.dur};animation-delay:{p.delay};opacity:{p.opacity}"
      ></span>
    {/each}
  </div>

  <div class="welcome-inner">
    <div class="welcome-banner">{BANNER}</div>
    <div class="welcome-lines">{LINES}<span class="welcome-cursor"></span></div>
    <div class="welcome-cta">
      ▶ Click <strong>[+]</strong> or press <strong>Ctrl+Shift+T</strong> to open
      a terminal
    </div>
  </div>
</div>

<style>
  .welcome-screen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a00;
    overflow: hidden;
    font-family: "JetBrains Mono", "Fira Code", "Source Code Pro", ui-monospace,
      monospace;
    color: #d4a017;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Scanline overlay */
  .welcome-screen::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.18) 3px,
      rgba(0, 0, 0, 0.18) 4px
    );
    pointer-events: none;
    z-index: 10;
  }

  /* Vignette */
  .welcome-screen::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      transparent 55%,
      rgba(0, 0, 0, 0.7) 100%
    );
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

  .welcome-banner {
    white-space: pre;
    font-size: clamp(5px, 1.15vw, 11px);
    line-height: 1.2;
    color: #ffb300;
    text-shadow: 0 0 6px rgba(255, 179, 0, 0.65);
    animation: ws-flicker 8s infinite;
    margin-bottom: 10px;
    letter-spacing: 0.02em;
  }

  .welcome-lines {
    white-space: pre;
    font-size: clamp(10px, 1.2vw, 13px);
    line-height: 1.55;
    color: #c8920a;
    letter-spacing: 0.03em;
    text-shadow: 0 0 4px rgba(200, 146, 10, 0.4);
  }

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

  .welcome-cta {
    margin-top: 14px;
    font-size: clamp(10px, 1.1vw, 12px);
    color: #7a5800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    animation: ws-pulse 2.8s ease-in-out infinite;
  }

  @keyframes ws-blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  @keyframes ws-flicker {
    0%,
    97%,
    100% {
      opacity: 1;
    }
    97.5% {
      opacity: 0.6;
    }
    98% {
      opacity: 1;
    }
    98.5% {
      opacity: 0.7;
    }
    99% {
      opacity: 1;
    }
  }

  @keyframes ws-pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes ws-drift {
    from {
      transform: translateY(100vh);
    }
    to {
      transform: translateY(-10px);
    }
  }
</style>
