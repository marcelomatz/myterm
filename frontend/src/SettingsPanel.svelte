<script lang="ts">
  import { onMount } from "svelte";
  import type { AppSettings } from "./domain/settings";
  import {
    COLOR_PRESETS,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getPreset,
  } from "./domain/settings";
  import { applySettingsToAll } from "./ui/settings-apply";
  import type { PaneLeaf } from "./domain/types";
  import { DetectShells } from "./bridge/backend";
  import { shellMeta } from "./domain/shell-meta";

  interface Props {
    getLeaves: () => PaneLeaf[];
    onRebuild: () => void;
  }
  const { getLeaves, onRebuild }: Props = $props();

  const FONT_OPTIONS = [
    { label: "Cascadia Code", value: '"Cascadia Code", monospace' },
    { label: "Fira Code", value: '"Fira Code", monospace' },
    { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
    { label: "Consolas", value: "Consolas, monospace" },
  ];

  // ── reactive draft ──────────────────────────────────────────────────────
  let draft = $state<AppSettings>({ ...getSettings() });
  let shells = $state<string[]>([]);

  // CSS variables that reflect the active theme
  let themeVars = $state<Record<string, string>>({});
  let panelFont = $derived(draft.fontFamily);

  function colorWithAlpha(hex: string, alpha: number): string {
    const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
  }

  function buildThemeVars(presetId: string): Record<string, string> {
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

  // ── helpers ─────────────────────────────────────────────────────────────
  function apply(updater: (d: AppSettings) => void): void {
    updater(draft);
    saveSettings(draft);
    applySettingsToAll(getLeaves(), draft);
  }

  function onFontFamily(v: string) {
    apply((d) => {
      d.fontFamily = v;
    });
  }
  function onFontSize(v: number) {
    apply((d) => {
      d.fontSize = v;
    });
  }
  function onLineHeight(v: number) {
    apply((d) => {
      d.lineHeight = Number(v.toFixed(2));
    });
  }
  function onCursorStyle(v: string) {
    apply((d) => {
      d.cursorStyle = v as AppSettings["cursorStyle"];
    });
  }
  function onCursorBlink(v: boolean) {
    apply((d) => {
      d.cursorBlink = v;
    });
  }
  function onColorPreset(v: string) {
    apply((d) => {
      d.colorPresetId = v;
    });
    themeVars = buildThemeVars(v);
  }
  function onDefaultShell(v: string) {
    apply((d) => {
      d.defaultShell = v;
    });
  }
  function onScrollback(v: number) {
    apply((d) => {
      d.scrollback = v;
    });
  }
  function onCopyOnSelect(v: boolean) {
    apply((d) => {
      d.copyOnSelect = v;
    });
  }
  function resetToDefaults() {
    draft = { ...DEFAULT_SETTINGS };
    saveSettings(draft);
    applySettingsToAll(getLeaves(), draft);
    themeVars = buildThemeVars(draft.colorPresetId);
    onRebuild();
  }

  // ── mock preview HTML ────────────────────────────────────────────────────
  function s(cls: string, txt: string) {
    return `<span class="${cls}">${txt}</span>`;
  }
  function L(...parts: string[]) {
    return `<div class="pv-line">${parts.join("")}</div>`;
  }
  function prompt(path: string) {
    return (
      s("pv-user", "user") +
      s("pv-at", "@") +
      s("pv-host", "myterm") +
      s("pv-sep", ":") +
      s("pv-path", path) +
      s("pv-dollar", "$ ")
    );
  }
  const blank = () => L("");
  const mockHTML = [
    L(
      prompt("~/projects/myapp"),
      s("pv-cmd", "ls"),
      " ",
      s("pv-arg", "-la src/"),
    ),
    L(s("pv-dim", "total 64")),
    L(
      s("pv-dim", "drwxr-xr-x"),
      "  7 user  ",
      s("pv-cyan", "224"),
      " Mar 23 11:44 ",
      s("pv-path", "./"),
    ),
    L(
      s("pv-dim", "drwxr-xr-x"),
      " 14 user  ",
      s("pv-cyan", "448"),
      " Mar 23 11:30 ",
      s("pv-path", "../"),
    ),
    L(
      s("pv-dim", "-rw-r--r--"),
      "  1 user ",
      s("pv-num", "2341"),
      " Mar 23 11:44 ",
      s("pv-green", "main.ts"),
    ),
    L(
      s("pv-dim", "-rw-r--r--"),
      "  1 user ",
      s("pv-num", "3892"),
      " Mar 23 11:44 ",
      s("pv-green", "settings-panel.ts"),
    ),
    blank(),
    L(
      prompt("~/projects/myapp"),
      s("pv-cmd", "git"),
      " ",
      s("pv-arg", "log --oneline -4"),
    ),
    L(
      s("pv-yellow", "a3f2c1d"),
      " ",
      s("pv-green", "feat"),
      s("pv-dim", ":"),
      " add live preview to settings",
    ),
    L(
      s("pv-yellow", "9b8e4f2"),
      " ",
      s("pv-green", "feat"),
      s("pv-dim", ":"),
      " theme CSS variables",
    ),
    L(
      s("pv-yellow", "c7d5a1e"),
      " ",
      s("pv-blue", "fix"),
      s("pv-dim", ":"),
      " closeActivePane debounce",
    ),
    blank(),
    L(
      prompt("~/projects/myapp"),
      s("pv-cmd", "npm"),
      " ",
      s("pv-arg", "test -- --reporter=verbose"),
    ),
    blank(),
    L(
      " ",
      s("pv-ok", "✓ PASS"),
      "  src/__tests__/",
      s("pv-cyan", "settings.test.ts"),
      s("pv-dim", "  (2.3s)"),
    ),
    L(
      "   ",
      s("pv-pass", "✓ "),
      s("pv-dim", "loads defaults correctly "),
      s("pv-cyan", "(12ms)"),
    ),
    L(
      "   ",
      s("pv-pass", "✓ "),
      s("pv-dim", "saves and restores settings "),
      s("pv-cyan", "(8ms)"),
    ),
    blank(),
    L(
      " ",
      s("pv-fail", "✗ FAIL"),
      "  src/__tests__/",
      s("pv-red", "preview.test.ts"),
    ),
    L("   ", s("pv-fail", "✗ "), s("pv-dim", "theme matches preset")),
    L("     ", s("pv-dim", "Expected: "), s("pv-str", '"pampulha-night"')),
    L("     ", s("pv-dim", "Received: "), s("pv-red", '"cyber-noir"')),
    blank(),
    L(s("pv-kw", "func"), " ", s("pv-green", "main"), s("pv-dim", "() {")),
    L(
      "    ",
      s("pv-magenta", "fmt"),
      s("pv-dim", "."),
      s("pv-cyan", "Println"),
      s("pv-dim", "("),
      s("pv-str", '"Hello, myterm!"'),
      s("pv-dim", ")"),
    ),
    L(s("pv-dim", "}")),
    blank(),
    L(prompt("~/projects/myapp"), s("pv-cursor", " ")),
  ].join("");

  // ── lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    themeVars = buildThemeVars(draft.colorPresetId);
    DetectShells()
      .then((s) => {
        shells = s;
      })
      .catch(() => {});
  });

  // Derive inline style string from themeVars object
  const styleStr = $derived(
    Object.entries(themeVars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";"),
  );
</script>

<div class="tset-wrap" style="{styleStr};font-family:{panelFont}">
  <div class="tset-left">
    <div class="tset-panel">
      <!-- header -->
      <div class="tset-header">
        <span class="tset-prompt">$</span>
        <span class="tset-cmd">
          myterm <span class="tset-arg">--settings</span></span
        >
        <span class="tset-blink">▋</span>
      </div>
      <div class="tset-div">{"─".repeat(46)}</div>

      <!-- APPEARANCE -->
      <div class="tset-section">
        <div class="tset-section-hdr">── APPEARANCE</div>
        <div class="tset-row">
          <span class="tset-key">font-family </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <select
              class="tset-select"
              value={draft.fontFamily}
              onchange={(e) =>
                onFontFamily((e.target as HTMLSelectElement).value)}
            >
              {#each FONT_OPTIONS as opt}
                <option
                  value={opt.value}
                  selected={draft.fontFamily === opt.value}>{opt.label}</option
                >
              {/each}
            </select>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">font-size </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <span class="tset-range-wrap">
              <input
                type="range"
                class="tset-range"
                min="8"
                max="28"
                step="1"
                value={draft.fontSize}
                oninput={(e) =>
                  onFontSize(Number((e.target as HTMLInputElement).value))}
              />
              <span class="tset-range-badge">{draft.fontSize}</span>
            </span>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">line-height </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <span class="tset-range-wrap">
              <input
                type="range"
                class="tset-range"
                min="1.0"
                max="2.0"
                step="0.05"
                value={draft.lineHeight}
                oninput={(e) =>
                  onLineHeight(Number((e.target as HTMLInputElement).value))}
              />
              <span class="tset-range-badge">{draft.lineHeight.toFixed(2)}</span
              >
            </span>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">cursor-style </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <select
              class="tset-select"
              value={draft.cursorStyle}
              onchange={(e) =>
                onCursorStyle((e.target as HTMLSelectElement).value)}
            >
              {#each ["block", "bar", "underline"] as style}
                <option value={style} selected={draft.cursorStyle === style}
                  >{style}</option
                >
              {/each}
            </select>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">cursor-blink </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <button
              class="tset-toggle{draft.cursorBlink ? ' on' : ''}"
              onclick={() => onCursorBlink(!draft.cursorBlink)}
            >
              {draft.cursorBlink ? "[ON ]" : "[OFF]"}
            </button>
          </span>
        </div>
      </div>

      <!-- COLORS -->
      <div class="tset-section">
        <div class="tset-section-hdr">── COLORS</div>
        <div class="tset-row">
          <span class="tset-key">color-theme </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <select
              class="tset-select"
              value={draft.colorPresetId}
              onchange={(e) =>
                onColorPreset((e.target as HTMLSelectElement).value)}
            >
              {#each COLOR_PRESETS as p}
                <option value={p.id} selected={draft.colorPresetId === p.id}
                  >{p.name}</option
                >
              {/each}
            </select>
          </span>
        </div>
      </div>

      <!-- SHELL -->
      <div class="tset-section">
        <div class="tset-section-hdr">── SHELL</div>
        {#if shells.length > 0}
          <div class="tset-row">
            <span class="tset-key">default-shell </span>
            <span class="tset-sep"> │ </span>
            <span class="tset-val">
              <select
                class="tset-select"
                value={draft.defaultShell}
                onchange={(e) =>
                  onDefaultShell((e.target as HTMLSelectElement).value)}
              >
                <option value="">（auto）</option>
                {#each shells as sh}
                  <option value={sh} selected={draft.defaultShell === sh}
                    >{shellMeta(sh).label}</option
                  >
                {/each}
              </select>
            </span>
          </div>
        {:else}
          <div class="tset-note">
            # shell detection unavailable — using auto
          </div>
        {/if}
      </div>

      <!-- BEHAVIOR -->
      <div class="tset-section">
        <div class="tset-section-hdr">── BEHAVIOR</div>
        <div class="tset-row">
          <span class="tset-key">scrollback </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <span class="tset-range-wrap">
              <input
                type="range"
                class="tset-range"
                min="500"
                max="10000"
                step="100"
                value={draft.scrollback}
                oninput={(e) =>
                  onScrollback(Number((e.target as HTMLInputElement).value))}
              />
              <span class="tset-range-badge">{draft.scrollback}</span>
            </span>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">copy-on-select </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <button
              class="tset-toggle{draft.copyOnSelect ? ' on' : ''}"
              onclick={() => onCopyOnSelect(!draft.copyOnSelect)}
            >
              {draft.copyOnSelect ? "[ON ]" : "[OFF]"}
            </button>
          </span>
        </div>
      </div>

      <!-- footer -->
      <div class="tset-div">{"─".repeat(46)}</div>
      <div class="tset-footer">
        <button class="tset-reset-btn" onclick={resetToDefaults}
          >[ reset to defaults ]</button
        >
      </div>
    </div>
  </div>

  <!-- right: live preview -->
  <div class="tset-preview-pane">
    <div class="tset-preview-hdr">
      ── LIVE PREVIEW ──────────────────────────────────────────
    </div>
    <div
      class="tset-preview-term"
      style="font-size:{draft.fontSize}px;line-height:{draft.lineHeight}"
    >
      {@html mockHTML}
    </div>
  </div>
</div>
