<script lang="ts">
  import { shellBadge } from '../shell-picker';
  import type { Tab } from '../../domain/types';

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onNewTab: () => void;
    onRename: (id: string, title: string) => void;
    onSettings: () => void;
  }
  const { tabs, activeTabId, onActivate, onClose, onNewTab, onRename, onSettings }: Props = $props();

  import { i18nStore } from "../../application/i18n.store.svelte";
  import { dictTabBar } from "../../application/i18n/dictionaries/TabBar";

  let dict = $derived(dictTabBar[i18nStore.locale]);

  const SETTINGS_TAB_ID = '__settings__';

  // Rename state
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');

  function startRename(tab: Tab) {
    renamingId = tab.id;
    renameValue = tab.title;
  }

  function finishRename(tab: Tab) {
    const title = renameValue.trim() || tab.title;
    onRename(tab.id, title);
    renamingId = null;
  }

  function handleRenameKey(e: KeyboardEvent, tab: Tab) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { renamingId = null; }
  }

  function badgeEl(shell: string): HTMLElement | null {
    try { return shellBadge(shell); } catch { return null; }
  }
</script>

<div id="tabbar">
  {#each tabs as tab (tab.id)}
    {@const isSettings = tab.id === SETTINGS_TAB_ID}
    {@const isActive   = tab.id === activeTabId}
    {@const badge      = !isSettings ? badgeEl((tab.root as any)?.shell ?? '') : null}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="tab-item{isActive ? ' active' : ''}{isSettings ? ' tab-item--settings' : ''}"
      data-tab-id={tab.id}
      onpointerdown={(e) => {
        if ((e.target as HTMLElement).closest('.tab-close')) return;
        onActivate(tab.id);
      }}
    >
      {#if badge}
        <!-- mount the existing badge DOM node -->
        <span class="tab-badge">{badge.textContent}</span>
      {/if}

      {#if renamingId === tab.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="tab-rename"
          autofocus
          bind:value={renameValue}
          onblur={() => finishRename(tab)}
          onkeydown={(e) => handleRenameKey(e, tab)}
        />
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="tab-title"
          ondblclick={() => !isSettings && startRename(tab)}
        >{tab.title}</span>
      {/if}

      <button
        class="tab-close"
        title={dict.closeTab}
        onclick={(e) => { e.stopPropagation(); onClose(tab.id); }}
      >×</button>
    </div>
  {/each}

  <button id="new-tab-btn" title="{dict.newTab} (Ctrl+Shift+T)" onclick={onNewTab}>+</button>
  
  <div style="flex: 1;"></div>
  
  <button id="settings-btn" style="margin-right: 12px;" title="{dict.settings} (Ctrl+,)" onclick={onSettings}>⚙</button>
</div>
