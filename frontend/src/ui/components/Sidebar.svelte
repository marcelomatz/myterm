<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { ListDirectory, Write, GetGitStatus } from "../../infrastructure/wails/backend";
  import type { pro } from "../../infrastructure/wails/backend";
  import FileTreeNode from "@enterprise/components/FileTreeNode.svelte";
  import GitTree from "@enterprise/components/GitTree.svelte";
  import { getSettings } from "../../domain/settings";
  import type { PaneLeaf } from "../../domain/types";

  interface Props {
    rootPath: string;
    onClose: () => void;
    activeLeaf: () => PaneLeaf | undefined | null;
  }

  const { rootPath, onClose, activeLeaf }: Props = $props();

  let nodes = $state<pro.FileNode[]>([]);
  let loading = $state(false);
  let error = $state("");

  let gitStatus = $state<pro.GitStatusResult | null>(null);

  // Resize state
  let width = $state(200); // default width matches min width
  let isDragging = $state(false);
  
  let gitRatio = $state(20); // 20% for source control
  let isHDragging = $state(false);

  let commandListener: (e: Event) => void;
  let editorSavedListener: (e: Event) => void;

  $effect(() => {
    if (rootPath) {
      loadRoot();
      loadGitStatus();
    }
  });

  onMount(() => {
    commandListener = () => {
      if (rootPath) loadGitStatus();
    };
    editorSavedListener = () => {
      if (rootPath) loadGitStatus();
    };

    window.addEventListener('myterm:command-finish', commandListener);
    window.addEventListener('myterm:editor-saved', editorSavedListener);

    return () => {
      window.removeEventListener('myterm:command-finish', commandListener);
      window.removeEventListener('myterm:editor-saved', editorSavedListener);
    };
  });

  async function loadGitStatus() {
    try {
      gitStatus = await GetGitStatus(rootPath);
    } catch (err) {
      console.warn("Failed to get git status:", err);
      gitStatus = null;
    }
  }

  async function loadRoot() {
    loading = true;
    error = "";
    console.log("[Sidebar] Loading directory:", rootPath);
    try {
      const result = await ListDirectory(rootPath);
      nodes = (result || []).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err: any) {
      console.error("[Sidebar] Error:", err);
      error = (typeof err === 'string' ? err : err?.message) || "Failed to load directory";
    } finally {
      loading = false;
    }
  }

  function handleFileClick(path: string) {
    const normalizedPath = path.replace(/\\/g, "/");
    window.dispatchEvent(new CustomEvent('myterm:open-editor', { detail: { filePath: normalizedPath } }));
  }

  // --- Resizing logic ---
  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    e.preventDefault();
  }

  function onHPointerDown(e: PointerEvent) {
    isHDragging = true;
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (isDragging) {
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200; // min width
      if (newWidth > 600) newWidth = 600; // max width
      width = newWidth;
    }
    if (isHDragging) {
      // Calculate gitRatio. Sidebar height is window.innerHeight.
      // gitRatio = percentage from bottom
      let newRatio = ((window.innerHeight - e.clientY) / window.innerHeight) * 100;
      if (newRatio < 10) newRatio = 10;
      if (newRatio > 90) newRatio = 90;
      gitRatio = newRatio;
    }
  }

  function onPointerUp() {
    isDragging = false;
    isHDragging = false;
  }
</script>

<svelte:window 
  onpointermove={onPointerMove} 
  onpointerup={onPointerUp} 
  onpointercancel={onPointerUp} 
/>

<div class="sidebar-container" style="width: {width}px" transition:fly={{ x: -200, duration: 250, opacity: 0 }}>
  <div class="sidebar-header">
    <div class="title">EXPLORER</div>
    <button class="close-btn" onclick={onClose} aria-label="Close Sidebar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  </div>

  <div class="sidebar-content" style="flex: {gitStatus?.isGitRepo ? 100 - gitRatio : 100}">
    {#if loading}
      <div class="message">Loading...</div>
    {:else if error}
      <div class="message error">{error}</div>
    {:else if nodes.length === 0}
      <div class="message">Empty directory</div>
    {:else}
      {#each nodes as node}
        <FileTreeNode 
          {node} 
          depth={0} 
          onFileClick={handleFileClick} 
          activeFilePath={activeLeaf()?.kind === 'editor' ? activeLeaf()?.activeFilePath : undefined}
        />
      {/each}
    {/if}
  </div>

  {#if gitStatus?.isGitRepo}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="sidebar-h-resizer" role="separator" aria-orientation="horizontal" onpointerdown={onHPointerDown}></div>
    <div class="sidebar-header">
      <div class="title">SOURCE CONTROL</div>
    </div>
    <div class="sidebar-content git-section" style="flex: {gitRatio}">
      <GitTree files={gitStatus.files} {rootPath} onFileClick={handleFileClick} />
    </div>
  {/if}

  <!-- Drag handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="resizer" role="separator" aria-orientation="vertical" onpointerdown={onPointerDown}></div>
</div>

<style>
  .sidebar-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: color-mix(in srgb, var(--tset-bg) 80%, rgba(15, 15, 15, 0.6));
    backdrop-filter: blur(10px);
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 36px;
    padding: 0 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    box-sizing: border-box;
  }

  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .close-btn svg {
    width: 14px;
    height: 14px;
  }

  .sidebar-content {
    overflow-y: auto;
    padding: 8px 0;
  }

  /* Custom scrollbar for sidebar */
  .sidebar-content::-webkit-scrollbar {
    width: 8px;
  }
  .sidebar-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
  .sidebar-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .message {
    padding: 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
  }

  .message.error {
    color: #ef4444;
  }

  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 10;
  }
  
  .resizer:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .sidebar-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.05);
    margin: 4px 0;
  }

  .sidebar-h-resizer {
    height: 4px;
    background: rgba(255, 255, 255, 0.05);
    margin: 0;
    cursor: row-resize;
    z-index: 10;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }
  .sidebar-h-resizer:hover, .sidebar-h-resizer:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .git-section {
    min-height: 50px;
    border-top: none;
  }
</style>
