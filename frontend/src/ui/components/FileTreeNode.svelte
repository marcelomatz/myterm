<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import FileTreeNode from "./FileTreeNode.svelte";
  import { ListDirectory } from "../../infrastructure/wails/backend";
  import type { application } from "../../infrastructure/wails/backend";

  interface Props {
    node: application.FileNode;
    depth: number;
    onFileClick: (path: string) => void;
  }

  const { node, depth, onFileClick }: Props = $props();

  let expanded = $state(false);
  let children = $state<application.FileNode[]>([]);
  let loading = $state(false);

  async function toggle() {
    if (!node.isDir) {
      onFileClick(node.path);
      return;
    }

    expanded = !expanded;
    if (expanded && children.length === 0) {
      loading = true;
      try {
        // Fetch directory contents
        const result = await ListDirectory(node.path);
        // Sort: directories first, then files, alphabetically
        children = (result || []).sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
      } catch (err) {
        console.error("Failed to list directory", err);
      } finally {
        loading = false;
      }
    }
  }
</script>

<div class="node-wrapper">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="node-row" 
    style="padding-left: {depth * 12 + 8}px;" 
    onclick={toggle}
  >
    <span class="chevron" style="visibility: {node.isDir ? 'visible' : 'hidden'}">
      {#if expanded}
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      {/if}
    </span>
    <FileIcon name={node.name} isDir={node.isDir} expanded={expanded} size={16} />
    <span class="node-name">{node.name}</span>
  </div>

  {#if expanded}
    {#if loading}
      <div class="node-loading" style="padding-left: {(depth + 1) * 12 + 28}px;">
        Loading...
      </div>
    {:else}
      {#each children as child}
        <FileTreeNode node={child} depth={depth + 1} {onFileClick} />
      {/each}
    {/if}
  {/if}
</div>

<style>
  .node-wrapper {
    display: flex;
    flex-direction: column;
  }
  
  .node-row {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    color: var(--tset-fg, #e4e4e7);
    gap: 6px;
    border-radius: 4px;
    transition: background-color 0.1s ease;
  }
  
  .node-row:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }

  .node-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-loading {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    padding: 2px 0;
  }
</style>
