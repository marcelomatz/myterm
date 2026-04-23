<script lang="ts">
  import { onMount } from "svelte";
  import { ListDirectory, Write } from "../../infrastructure/wails/backend";
  import type { application } from "../../infrastructure/wails/backend";
  import FileTreeNode from "./FileTreeNode.svelte";
  import { getSettings } from "../../domain/settings";
  import type { PaneLeaf } from "../../domain/types";

  interface Props {
    rootPath: string;
    onClose: () => void;
    activeLeaf: () => PaneLeaf | undefined | null;
  }

  const { rootPath, onClose, activeLeaf }: Props = $props();

  let nodes = $state<application.FileNode[]>([]);
  let loading = $state(false);
  let error = $state("");

  // Resize state
  let width = $state(260); // default width
  let isDragging = $state(false);

  $effect(() => {
    if (rootPath) {
      loadRoot();
    }
  });

  async function loadRoot() {
    loading = true;
    error = "";
    console.log("[Sidebar] Loading directory:", rootPath);
    try {
      const result = await ListDirectory(rootPath);
      console.log("[Sidebar] ListDirectory result:", result);
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
    const settings = getSettings();
    const cmd = settings.defaultEditorCmd || "vim";
    const leaf = activeLeaf();
    if (leaf) {
      // Convert backslashes to forward slashes to prevent shell escape sequences stripping them
      const normalizedPath = path.replace(/\\/g, "/");
      // Escape path if it contains spaces
      const safePath = normalizedPath.includes(" ") ? `"${normalizedPath}"` : normalizedPath;
      Write(leaf.sessionId, `${cmd} ${safePath}\r`);
    }
  }

  // --- Resizing logic ---
  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    // ClientX represents the mouse position. The sidebar is on the left.
    // So new width is roughly e.clientX
    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200; // min width
    if (newWidth > 600) newWidth = 600; // max width
    width = newWidth;
  }

  function onPointerUp() {
    isDragging = false;
  }
</script>

<svelte:window 
  onpointermove={onPointerMove} 
  onpointerup={onPointerUp} 
/>

<div class="sidebar-container" style="width: {width}px">
  <div class="sidebar-header">
    <div class="title">EXPLORER</div>
    <button class="close-btn" onclick={onClose} aria-label="Close Sidebar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  </div>

  <div class="sidebar-content">
    {#if loading}
      <div class="message">Loading...</div>
    {:else if error}
      <div class="message error">{error}</div>
    {:else if nodes.length === 0}
      <div class="message">Empty directory</div>
    {:else}
      {#each nodes as node}
        <FileTreeNode {node} depth={0} onFileClick={handleFileClick} />
      {/each}
    {/if}
  </div>

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
    background: rgba(15, 15, 15, 0.6);
    backdrop-filter: blur(10px);
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
    flex: 1;
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
</style>
