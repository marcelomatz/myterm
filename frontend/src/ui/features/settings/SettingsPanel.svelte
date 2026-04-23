<script lang="ts">
  import { onMount } from "svelte";
  import type { AppSettings } from "../../../domain/settings";
  import {
    COLOR_PRESETS,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getPreset,
  } from "../../../domain/settings";
  import { applySettingsToAll } from "../../settings-apply";
  import type { PaneLeaf } from "../../../domain/types";
  import {
    DetectShells,
    GetOllamaModels,
  } from "../../../infrastructure/wails/backend";
  import { shellMeta } from "../../../domain/shell-meta";

  import { i18nStore } from "../../../application/i18n.store.svelte";
  import { dictSettingsPanel } from "../../../application/i18n/dictionaries/SettingsPanel";
  import type { Locale } from "../../../application/i18n.store.svelte";

  let dict = $derived(dictSettingsPanel[i18nStore.locale]);

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
  let ollamaModels = $state<string[]>([]);
  let isFetchingModels = $state(false);

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
  function onStartupPath(v: string) {
    apply((d) => {
      d.startupPath = v;
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
  function onOllamaHost(v: string) {
    apply((d) => {
      d.ollamaHost = v;
    });
  }
  function onOllamaModel(v: string) {
    apply((d) => {
      d.ollamaModel = v;
    });
  }

  async function fetchOllamaModels() {
    if (!draft.ollamaHost) return;
    isFetchingModels = true;
    try {
      const models = await GetOllamaModels(draft.ollamaHost);
      ollamaModels = models || [];
    } catch {
      ollamaModels = [];
    } finally {
      isFetchingModels = false;
    }
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

    fetchOllamaModels();
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
        <div class="tset-section-hdr">{dict.headerAppearance}</div>
        <div class="tset-row">
          <span class="tset-key">{dict.language} </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <select
              class="tset-select"
              value={i18nStore.locale}
              onchange={(e) =>
                i18nStore.setLocale((e.target as HTMLSelectElement).value as Locale)}
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
            </select>
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">{dict.fontFamily} </span>
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
          <span class="tset-key">{dict.fontSize} </span>
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
          <span class="tset-key">{dict.lineHeight} </span>
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
          <span class="tset-key">{dict.cursorStyle} </span>
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
          <span class="tset-key">{dict.cursorBlink} </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <button
              class="tset-toggle{draft.cursorBlink ? ' on' : ''}"
              onclick={() => onCursorBlink(!draft.cursorBlink)}
            >
              {draft.cursorBlink ? dict.on : dict.off}
            </button>
          </span>
        </div>
      </div>

      <!-- COLORS -->
      <div class="tset-section">
        <div class="tset-section-hdr">{dict.headerColors}</div>
        <div class="tset-row">
          <span class="tset-key">{dict.colorTheme} </span>
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
        <div class="tset-section-hdr">{dict.headerShell}</div>
        {#if shells.length > 0}
          <div class="tset-row">
            <span class="tset-key">{dict.defaultShell} </span>
            <span class="tset-sep"> │ </span>
            <span class="tset-val">
              <select
                class="tset-select"
                value={draft.defaultShell}
                onchange={(e) =>
                  onDefaultShell((e.target as HTMLSelectElement).value)}
              >
                <option value="">{dict.auto}</option>
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
            {dict.shellDetectionUnavailable}
          </div>
        {/if}
      </div>

      <div class="tset-row">
        <span class="tset-key" title="Default directory for new sessions">Startup Path</span>
        <span class="tset-sep"> │ </span>
        <span class="tset-val">
          <input
            type="text"
            class="tset-input"
            value={draft.startupPath}
            onchange={(e) => apply(d => d.startupPath = (e.target as HTMLInputElement).value)}
            placeholder="~"
          />
        </span>
      </div>

      <div class="tset-row">
        <span class="tset-key" title="Command used to open files from Sidebar">Default Editor</span>
        <span class="tset-sep"> │ </span>
        <span class="tset-val">
          <input
            type="text"
            class="tset-input"
            value={draft.defaultEditorCmd}
            onchange={(e) => apply(d => d.defaultEditorCmd = (e.target as HTMLInputElement).value)}
            placeholder="vim"
          />
        </span>
      </div>

      <!-- BEHAVIOR -->
      <div class="tset-section">
        <div class="tset-section-hdr">{dict.headerBehavior}</div>
        <div class="tset-row">
          <span class="tset-key">{dict.scrollback} </span>
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
          <span class="tset-key">{dict.copyOnSelect} </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <button
              class="tset-toggle{draft.copyOnSelect ? ' on' : ''}"
              onclick={() => onCopyOnSelect(!draft.copyOnSelect)}
            >
              {draft.copyOnSelect ? dict.on : dict.off}
            </button>
          </span>
        </div>
      </div>

      <!-- AI (Ollama) -->
      <div class="tset-section">
        <div class="tset-section-hdr">{dict.headerAI}</div>
        <div class="tset-row">
          <span class="tset-key">{dict.host} </span>
          <span class="tset-sep"> │ </span>
          <span class="tset-val">
            <input
              type="text"
              class="tset-input"
              value={draft.ollamaHost}
              onchange={(e) => {
                onOllamaHost((e.target as HTMLInputElement).value);
                fetchOllamaModels();
              }}
            />
          </span>
        </div>
        <div class="tset-row">
          <span class="tset-key">{dict.model} </span>
          <span class="tset-sep"> │ </span>
          <span
            class="tset-val"
            style="display: flex; gap: 4px; align-items: center"
          >
            {#if isFetchingModels}
              <span class="tset-dim">{dict.fetching}</span>
            {:else if ollamaModels.length > 0}
              <select
                class="tset-select"
                value={draft.ollamaModel}
                onchange={(e) =>
                  onOllamaModel((e.target as HTMLSelectElement).value)}
              >
                {#each ollamaModels as m}
                  <option value={m} selected={draft.ollamaModel === m}
                    >{m}</option
                  >
                {/each}
              </select>
            {:else}
              <input
                type="text"
                class="tset-input"
                value={draft.ollamaModel}
                placeholder="Ex: llama3"
                onchange={(e) =>
                  onOllamaModel((e.target as HTMLInputElement).value)}
              />
              <button
                class="tset-btn-small"
                onclick={fetchOllamaModels}
                title="Retry fetch">↻</button
              >
            {/if}
          </span>
        </div>
      </div>

      <!-- footer -->
      <div class="tset-div">{"─".repeat(46)}</div>
      <div class="tset-footer">
        <button class="tset-reset-btn" onclick={resetToDefaults}
          >{dict.resetToDefaults}</button
        >
      </div>
    </div>
  </div>

  <!-- right: live preview -->
  <div class="tset-preview-pane">
    <div class="tset-preview-hdr">
      {dict.headerPreview} ──────────────────────────────────────────
    </div>
    <div
      class="tset-preview-term"
      style="font-size:{draft.fontSize}px;line-height:{draft.lineHeight}"
    >
      {@html mockHTML}
    </div>
  </div>
</div>

<style>
  /* ── Settings (retro terminal) ──────────────────────────────────────────── */

  /* ─── Settings split layout ─────────────────────────────────────────────── */

  .tset-wrap {
    /* Default theme vars (overridden immediately by JS from the active preset) */
    --tset-bg: #0a0e0a;
    --tset-fg: #39ff6e;
    --tset-cursor: #39ff6e;
    --tset-dim: #1d5c30;
    --tset-cyan: #7affd4;
    --tset-dimfg: #2f6b40;
    --tset-accent: #90ff90;
    /* ANSI palette (set by JS) */
    --tset-red: #ef4444;
    --tset-green: #10b981;
    --tset-yellow: #eab308;
    --tset-blue: #3b82f6;
    --tset-magenta: #d946ef;
    --tset-br-red: #f87171;
    --tset-br-green: #34d399;
    --tset-br-yellow: #facc15;
    --tset-br-blue: #60a5fa;
    --tset-br-magenta: #e879f9;
    --tset-br-black: #3f3f46;

    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    background: var(--tset-bg);
  }

  /* Left side: scrollable settings controls */
  .tset-left {
    flex: 0 0 46%;
    overflow-y: auto;
    padding: 24px 20px;
    border-right: 1px solid var(--tset-dim);
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }

  /* ── Minimal scrollbars (left panel + preview) ─────────────────────────── */
  .tset-left::-webkit-scrollbar,
  .tset-preview-term::-webkit-scrollbar {
    width: 3px;
  }
  .tset-left::-webkit-scrollbar-track,
  .tset-preview-term::-webkit-scrollbar-track {
    background: transparent;
  }
  .tset-left::-webkit-scrollbar-thumb,
  .tset-preview-term::-webkit-scrollbar-thumb {
    background: var(--tset-dim);
    border-radius: 2px;
    transition: background 0.2s;
  }
  .tset-left::-webkit-scrollbar-thumb:hover,
  .tset-preview-term::-webkit-scrollbar-thumb:hover {
    background: var(--tset-dimfg);
  }
  /* Firefox */
  .tset-left,
  .tset-preview-term {
    scrollbar-width: thin;
    scrollbar-color: var(--tset-dim) transparent;
  }

  /* The panel: inherits font from .tset-wrap (set via JS) */
  .tset-panel {
    width: 100%;
    font-family: inherit;
    font-size: 13px;
    color: var(--tset-fg);
    line-height: 1.7;
    text-shadow: 0 0 6px color-mix(in srgb, var(--tset-fg) 45%, transparent);
  }

  /* "$ myterm --settings ▋" header line */
  .tset-header {
    padding: 4px 0 6px;
    font-size: 14px;
    letter-spacing: 0.02em;
  }

  .tset-prompt {
    color: var(--tset-accent);
  }
  .tset-cmd {
    color: var(--tset-fg);
  }
  .tset-arg {
    color: var(--tset-cyan);
  }

  /* Blinking cursor */
  .tset-blink {
    display: inline-block;
    animation: tset-blink-anim 1.1s step-start infinite;
    color: var(--tset-cursor);
    opacity: 1;
  }
  @keyframes tset-blink-anim {
    50% {
      opacity: 0;
    }
  }

  /* Horizontal rule: ─────── */
  .tset-div {
    color: var(--tset-dim);
    letter-spacing: 0;
    font-size: 13px;
    user-select: none;
    overflow: hidden;
    white-space: nowrap;
  }

  /* Section header: ── APPEARANCE ─────────── */
  .tset-section {
    margin-top: 14px;
  }

  .tset-section-hdr {
    color: var(--tset-cyan);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 2px;
    text-shadow: 0 0 8px color-mix(in srgb, var(--tset-cyan) 50%, transparent);
  }

  /* Key │ value row */
  .tset-row {
    display: flex;
    align-items: center;
    padding: 1px 0;
    gap: 0;
  }

  .tset-key {
    color: var(--tset-accent);
    min-width: 16ch;
    font-size: 13px;
  }

  .tset-sep {
    color: var(--tset-dim);
    margin: 0 4px;
    user-select: none;
  }

  .tset-val {
    display: flex;
    align-items: center;
    gap: 0;
  }

  /* Inline note (shell detection unavailable) */
  .tset-note {
    color: var(--tset-dimfg);
    font-size: 12px;
    font-style: italic;
    padding: 2px 0;
  }

  /* Select: no native chrome, themed outline */
  .tset-select {
    background: transparent;
    border: none;
    border-bottom: 1px dashed var(--tset-dim);
    color: var(--tset-fg);
    font-family: inherit;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    padding: 0 4px;
    appearance: none;
    -webkit-appearance: none;
    text-shadow: 0 0 4px color-mix(in srgb, var(--tset-fg) 35%, transparent);
    max-width: 240px;
  }

  .tset-select:focus {
    border-bottom-color: var(--tset-fg);
  }

  .tset-input {
    background: transparent;
    border: none;
    border-bottom: 1px dashed var(--tset-dim);
    color: var(--tset-fg);
    font-family: inherit;
    font-size: 13px;
    outline: none;
    padding: 0 4px;
    text-shadow: 0 0 4px color-mix(in srgb, var(--tset-fg) 35%, transparent);
    max-width: 240px;
  }
  .tset-input:focus {
    border-bottom-color: var(--tset-fg);
  }

  .tset-btn-small {
    background: transparent;
    border: 1px solid var(--tset-dim);
    color: var(--tset-dimfg);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 2px;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .tset-btn-small:hover {
    color: var(--tset-fg);
    border-color: var(--tset-fg);
  }

  /* For <option> on Windows/Linux we can't do much, override dark bg */
  .tset-select option {
    background: var(--tset-bg);
    color: var(--tset-fg);
  }

  /* Range slider: themed accent */
  .tset-range-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tset-range {
    width: 130px;
    accent-color: var(--tset-fg);
    cursor: pointer;
    background: transparent;
  }

  .tset-range-badge {
    color: var(--tset-cyan);
    min-width: 30px;
    font-size: 13px;
    text-align: right;
  }

  /* Toggle: ASCII [ON ] / [OFF] button */
  .tset-toggle {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    color: var(--tset-dimfg);
    text-shadow: none;
    letter-spacing: 0.05em;
    transition: color 0.1s;
  }

  .tset-toggle.on {
    color: var(--tset-fg);
    text-shadow: 0 0 6px color-mix(in srgb, var(--tset-fg) 50%, transparent);
  }

  .tset-toggle:hover {
    color: var(--tset-accent);
  }

  /* Footer */
  .tset-footer {
    padding: 10px 0 6px;
    display: flex;
    justify-content: flex-start;
  }

  .tset-reset-btn {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 13px;
    color: var(--tset-dimfg);
    cursor: pointer;
    padding: 0;
    letter-spacing: 0.03em;
    transition:
      color 0.15s,
      text-shadow 0.15s;
  }

  .tset-reset-btn:hover {
    color: #ff6b6b;
    text-shadow: 0 0 8px rgba(255, 80, 80, 0.5);
  }

  /* --- Live terminal preview pane ------------------------------------------- */

  .tset-preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .tset-preview-hdr {
    padding: 8px 16px 7px;
    border-bottom: 1px solid var(--tset-dim);
    color: var(--tset-cyan);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    flex-shrink: 0;
    user-select: none;
    text-shadow: 0 0 8px color-mix(in srgb, var(--tset-cyan) 50%, transparent);
  }

  .tset-preview-term {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 18px 20px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.6;
    color: var(--tset-fg);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.09) 2px,
      rgba(0, 0, 0, 0.09) 4px
    );
  }

  :global(.pv-line) {
    display: block;
    white-space: pre;
    min-height: 1em;
    word-break: break-all;
  }

  /* Preview ANSI color spans */
  :global(.pv-user) {
    color: var(--tset-br-green);
  }
  :global(.pv-at) {
    color: var(--tset-dimfg);
  }
  :global(.pv-host) {
    color: var(--tset-cyan);
  }
  :global(.pv-sep) {
    color: var(--tset-dimfg);
  }
  :global(.pv-path) {
    color: var(--tset-br-blue, var(--tset-blue));
    font-weight: bold;
  }
  :global(.pv-dollar) {
    color: var(--tset-accent);
  }
  :global(.pv-cmd) {
    color: var(--tset-fg);
    font-weight: bold;
  }
  :global(.pv-arg) {
    color: var(--tset-yellow);
  }
  :global(.pv-str) {
    color: var(--tset-br-yellow, var(--tset-yellow));
  }
  :global(.pv-kw) {
    color: var(--tset-magenta);
  }
  :global(.pv-cmt) {
    color: var(--tset-dimfg);
    font-style: italic;
  }
  :global(.pv-num) {
    color: var(--tset-cyan);
  }
  :global(.pv-red) {
    color: var(--tset-br-red, var(--tset-red));
  }
  :global(.pv-green) {
    color: var(--tset-br-green, var(--tset-green));
  }
  :global(.pv-yellow) {
    color: var(--tset-yellow);
  }
  :global(.pv-blue) {
    color: var(--tset-blue);
  }
  :global(.pv-magenta) {
    color: var(--tset-magenta);
  }
  :global(.pv-cyan) {
    color: var(--tset-cyan);
  }
  :global(.pv-dim) {
    color: var(--tset-br-black, var(--tset-dimfg));
  }
  :global(.pv-ok) {
    color: var(--tset-br-green, var(--tset-green));
    font-weight: bold;
  }
  :global(.pv-fail) {
    color: var(--tset-br-red, var(--tset-red));
    font-weight: bold;
  }
  :global(.pv-pass) {
    color: var(--tset-br-green, var(--tset-green));
  }
  :global(.pv-diff-a) {
    color: var(--tset-br-green, var(--tset-green));
  }
  :global(.pv-diff-d) {
    color: var(--tset-br-red, var(--tset-red));
  }
  :global(.pv-cursor) {
    display: inline-block;
    background: var(--tset-cursor);
    color: var(--tset-bg);
    animation: tset-blink-anim 1.1s step-start infinite;
    min-width: 0.6em;
  }
</style>
