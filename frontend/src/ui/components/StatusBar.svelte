<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getSettings } from '../../domain/settings';
  import { AnalyzeDirectory } from '../../infrastructure/wails/backend';
  import type { enterprise } from '../../infrastructure/wails/backend';
  import type { PaneLeaf } from '../../domain/types';

  interface Props {
    leaf: PaneLeaf | undefined;
    onToggleSidebar?: () => void;
  }
  const { leaf, onToggleSidebar }: Props = $props();

  let sessionId = $derived(leaf?.kind === 'terminal' ? leaf.sessionId : undefined);
  let editorId = $derived(leaf?.kind === 'editor' ? leaf.id : undefined);

  let cwd = $state<string>('');
  let stats = $state<enterprise.DirectoryStats | null>(null);
  let isAnalyzing = $state(false);
  let analyzeError = $state<string>('');
  let lastExitCode = $state<number>(0);
  let processingTimeMs = $state<number>(0);

  let cursorLine = $state<number>(1);
  let cursorCol = $state<number>(1);

  let cwdListener: (e: Event) => void;
  let commandListener: (e: Event) => void;
  let cursorListener: (e: Event) => void;

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  async function updateStats(path: string) {
    if (!path) return;
    isAnalyzing = true;
    analyzeError = '';
    try {
      stats = await AnalyzeDirectory(path);
    } catch (err) {
      if (String(err).includes("Enterprise features disabled")) {
        analyzeError = '';
      } else {
        console.warn("AnalyzeDirectory failed:", err);
        analyzeError = String(err);
      }
      stats = null;
    } finally {
      isAnalyzing = false;
    }
  }

  onMount(() => {
    // Read initial CWD if set
    const s = getSettings();
    if (s.startupPath) {
      cwd = s.startupPath;
      if (cwd === '~') cwd = ''; // we don't know the exact expanded path yet unless we ask backend, but backend handles it, frontend doesn't.
      if (cwd) {
        updateStats(cwd).then(() => {
          if (stats && stats.path) {
            cwd = stats.path;
            window.dispatchEvent(new CustomEvent('myterm:cwd-change', {
              detail: { sessionId, cwd }
            }));
          }
        });
      }
    }

    cwdListener = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail.sessionId === sessionId) {
        if (cwd !== ce.detail.cwd) {
          cwd = ce.detail.cwd;
          updateStats(cwd);
        }
      }
    };

    commandListener = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail.sessionId === sessionId) {
        lastExitCode = ce.detail.exitCode;
        processingTimeMs = ce.detail.processingTimeMs;
        // Re-analyze dir after command might have created files
        if (cwd) updateStats(cwd);
      }
    };

    cursorListener = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail.leafId === editorId) {
        cursorLine = ce.detail.line;
        cursorCol = ce.detail.column;
      }
    };

    window.addEventListener('myterm:cwd-change', cwdListener);
    window.addEventListener('myterm:command-finish', commandListener);
    window.addEventListener('myterm:editor-cursor', cursorListener);
  });

  onDestroy(() => {
    window.removeEventListener('myterm:cwd-change', cwdListener);
    window.removeEventListener('myterm:command-finish', commandListener);
    window.removeEventListener('myterm:editor-cursor', cursorListener);
  });
</script>

<div class="status-bar">
  <div class="left-pane">
    {#if processingTimeMs > 0}
      <div class="item time" title="Last command processing time">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        {formatTime(processingTimeMs)}
      </div>
      <div class="item exit {lastExitCode === 0 ? 'ok' : 'error'}" title="Exit code">
        {#if lastExitCode === 0}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon ok"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          OK
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          ERR {lastExitCode}
        {/if}
      </div>
    {/if}
  </div>

  <div class="right-pane">
    {#if cwd}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="item path" class:clickable={!!onToggleSidebar} title={cwd} onclick={() => onToggleSidebar && onToggleSidebar()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        {cwd.length > 30 ? '...' + cwd.slice(-30) : cwd}
      </div>
    {/if}
    {#if stats}
      <div class="item count" title="Directories">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        {stats.totalDirs}
      </div>
      <div class="item count" title="Files">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        {stats.totalFiles}
      </div>
      <div class="item size" title="Size">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        {formatBytes(stats.totalBytes)}
      </div>
    {:else if analyzeError}
      <div class="item exit error" title={analyzeError}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        {analyzeError}
      </div>
    {/if}
    {#if editorId}
      <div class="item cursor-pos" title="Cursor Position">
        Ln {cursorLine}, Col {cursorCol}
      </div>
    {/if}
  </div>
</div>

<style>
  .status-bar {
    height: 24px;
    background: rgba(var(--bg-rgb, 15, 23, 42), 0.85);
    backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 8px;
    font-family: var(--font-family, monospace);
    font-size: 11px;
    color: var(--fg, #cbd5e1);
    z-index: 100;
    user-select: none;
  }

  .left-pane, .right-pane {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  
  .item:hover {
    opacity: 1;
  }

  .icon {
    width: 12px;
    height: 12px;
  }
  
  .icon.ok {
    color: var(--green, #10b981);
  }
  
  .icon.error {
    color: var(--red, #f43f5e);
  }

  .exit.error {
    color: var(--red, #f43f5e);
  }

  .exit.ok {
    color: var(--green, #10b981);
  }

  .item.path {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item.path.clickable {
    cursor: pointer;
    border-radius: 4px;
    padding: 0 4px;
    margin-left: -4px;
  }

  .item.path.clickable:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .item.exit {
    opacity: 0.6;
  }
</style>
