<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TabBar from './ui/components/TabBar.svelte';
  import WelcomeScreen from './ui/pages/WelcomeScreen.svelte';
  import SettingsPanel from './ui/features/settings/SettingsPanel.svelte';
  import TerminalError from './ui/components/TerminalError.svelte';
  import ConfirmCloseModal from './ui/components/ConfirmCloseModal.svelte';
  import StatusBar from './ui/components/StatusBar.svelte';

  import { createSession, destroySession } from './ui/session';
  import {
    renderPane, wireLeaf, splitLeaf, removeLeaf, collectLeaves,
    deleteLeafEl, replaceLeaf, findLeaf
  } from './ui/pane';
  import type { AppState, Tab, PaneLeaf, PaneNode } from './domain/types';
  import { pickShell } from './ui/shell-picker';
  import { shellMeta } from './domain/shell-meta';
  import { getSettings, saveSettings } from './domain/settings';
  import { applySettingsToAll, applyGlobalTheme } from './ui/settings-apply';
  import { EventsOn } from './infrastructure/wails/events';
  import { ForceQuit, CheckForUpdates } from './infrastructure/wails/backend';
  import type { UpdateInfo } from './infrastructure/wails/backend';
  import UpdateToast from './ui/components/UpdateToast.svelte';
  import { i18nStore } from './application/i18n.store.svelte';
  import { mount } from 'svelte';
  import { setWorkspaceApi } from './application/workspace.api';
  import { extensionRegistry } from './application/extension.registry';
  import type { ExtensionLeaf, TerminalLeaf } from './domain/types';
  import { initializeEnterpriseFeatures } from '@enterprise';

  const SETTINGS_TAB_ID = '__settings__';

  // ── Close-confirmation modal ───────────────────────────────────────────────
  /** > 0 = modal visible, value is the number of open sessions. */
  let confirmCloseCount = $state(0);

  // ── Update notification ────────────────────────────────────────────────────
  let updateInfo = $state<UpdateInfo | null>(null);

  // ── App state ──────────────────────────────────────────────────────────────
  let tabs        = $state<Tab[]>([]);
  let hiddenTerminals: TerminalLeaf[] = [];

  let terminalsLoaded = $state(false);
  let activeTabId = $state('');

  /** Sessions being explicitly destroyed — suppresses the session-exit event. */
  const _manuallyClosing = new Set<string>();

  // ── Workspace DOM target ───────────────────────────────────────────────────
  let workspaceEl: HTMLDivElement;
  /** Inner div that renderWorkspace() writes into imperatively. Svelte never touches this. */
  let terminalEl: HTMLDivElement;

  setWorkspaceApi({
    getLeaves: () => {
      const tab = activeTab();
      return tab ? collectLeaves(tab.root) : [];
    },
    getActiveTab: () => activeTab(),
    getActiveLeafId: () => {
      const tab = activeTab();
      return tab?.activeLeafId ?? '';
    },
    setActiveLeafId: (id: string) => {
      const tab = activeTab();
      if (tab) tab.activeLeafId = id;
    },
    renderWorkspace: () => renderWorkspace(),
    replaceLeaf: (leafId: string, newLeaf: PaneNode) => {
      const tab = activeTab();
      if (tab) tab.root = replaceLeaf(tab.root, leafId, newLeaf);
    },
    removeLeaf: async (leafId: string) => {
      const tab = activeTab();
      if (!tab) return;
      const newRoot = await removeLeaf(tab.root, leafId);
      if (!newRoot) {
        const idx = tabs.findIndex(t => t.id === tab.id);
        if (idx !== -1) {
          tabs.splice(idx, 1);
          const next = tabs[Math.min(idx, tabs.length - 1)];
          activeTabId = next?.id ?? '';
        }
      } else {
        tab.root = newRoot;
      }
    }
  });

  // ── Derived helpers ────────────────────────────────────────────────────────
  function activeTab(): Tab | undefined {
    return tabs.find(t => t.id === activeTabId);
  }

  function activeShell(): string {
    const tab = activeTab();
    if (!tab) return '';
    const leaves = collectLeaves(tab.root);
    const leaf = leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
    return leaf?.shell ?? '';
  }

  /** All leaves across all terminal tabs. */
  function allLeaves(): PaneLeaf[] {
    return tabs
      .filter(t => t.id !== SETTINGS_TAB_ID)
      .flatMap(t => collectLeaves(t.root));
  }

  /** Active leaf (focused pane in the active tab). */
  function activeLeaf(): PaneLeaf | undefined {
    const tab = activeTab();
    if (!tab || tab.id === SETTINGS_TAB_ID) return undefined;
    const leaves = collectLeaves(tab.root);
    return leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
  }

  // ── Tab management ─────────────────────────────────────────────────────────

  async function addTab(opts: { promptPick?: boolean; shell?: string } = {}): Promise<void> {
    let shell = opts.shell ?? '';
    if (opts.promptPick) {
      const newTabBtn = document.getElementById('new-tab-btn') as HTMLElement;
      const chosen = await pickShell(newTabBtn);
      if (chosen === null) return;
      shell = chosen;
    }

    let leaf: PaneLeaf;
    try {
      // createSession() does NOT call term.open() — the terminal is opened
      // lazily by renderPane() the first time it lands in a live DOM container.
      leaf = await createSession(shell);
    } catch (err) {
      console.error('[myterm] Failed to create session:', err);
      if (terminalEl) {
        terminalEl.innerHTML =
          `<div style="color:#f66;padding:16px;font-family:monospace">
            Failed to start terminal session.<br>
            Make sure you are running inside the Wails window, not a plain browser.<br>
            <small>${err}</small>
          </div>`;
      }
      return;
    }
    wireLeaf(leaf);

    const tab: Tab = {
      id: leaf.sessionId,
      title: shellMeta(leaf.shell).label,
      root: leaf,
      activeLeafId: leaf.sessionId,
      isSidebarOpen: false,
    };

    tabs.push(tab);
    activeTabId = tab.id;
    // tick() flushes Svelte DOM updates so terminalEl (bind:this) is assigned
    // before renderWorkspace() tries to use it.
    await tick();
    renderWorkspace();
    // session-exit events are handled by the delegated listener on workspaceEl (see onMount).
  }


  async function closeTab(tabId: string): Promise<void> {
    // Settings tab has no PTY session — delegate to the dedicated handler.
    if (tabId === SETTINGS_TAB_ID) {
      closeSettingsTab();
      return;
    }

    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    const leaves = collectLeaves(tab.root);

    // Destroy first — dispose WebGL/Canvas renderer BEFORE we clear the DOM.
    for (const l of leaves) {
      const id = l.kind === 'terminal' ? l.sessionId : l.id;
      _manuallyClosing.add(id);
    }
    await Promise.all(leaves.map(l => {
      const p = destroySession(l);
      const id = l.kind === 'terminal' ? l.sessionId : l.id;
      deleteLeafEl(id);
      return p;
    }));

    tabs.splice(idx, 1);
    if (activeTabId === tabId) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activeTabId = next?.id ?? '';
    }
    renderWorkspace();
  }


  function activateTab(tabId: string): void {
    activeTabId = tabId;
    renderWorkspace();
  }

  // ── Settings tab ───────────────────────────────────────────────────────────

  function openSettingsTab(): void {
    if (activeTabId === SETTINGS_TAB_ID) return;
    if (!tabs.find(t => t.id === SETTINGS_TAB_ID)) {
      tabs.push({ id: SETTINGS_TAB_ID, title: '⚙ Settings', root: null as never, activeLeafId: '', isSidebarOpen: false });
    }
    activateTab(SETTINGS_TAB_ID);
  }

  function closeSettingsTab(): void {
    const idx = tabs.findIndex(t => t.id === SETTINGS_TAB_ID);
    if (idx === -1) return;
    tabs.splice(idx, 1);
    if (activeTabId === SETTINGS_TAB_ID) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activeTabId = next?.id ?? '';
    }
    renderWorkspace();
  }

  function toggleSettingsTab(): void {
    if (activeTabId === SETTINGS_TAB_ID) closeSettingsTab();
    else openSettingsTab();
  }

  // ── Workspace rendering ────────────────────────────────────────────────────

  function renderWorkspace(): void {
    if (!terminalEl) return;

    const tab = activeTab();

    // WelcomeScreen / SettingsPanel are Svelte {#if} nodes — we never touch them here.
    if (!tab || tab.id === SETTINGS_TAB_ID) {
      terminalEl.innerHTML = '';
      return;
    }

    // Render the pane tree directly into terminalEl (it already has width/height 100%).
    // renderPane handles safe clearing internally — do NOT call terminalEl.innerHTML='' here
    // because renderPane rescues the .xterm child BEFORE clearing, and this outer clear
    // would destroy it first.
    renderPane(tab.root, terminalEl, (sessionId) => {
      tab.activeLeafId = sessionId;
      const leaf = collectLeaves(tab.root).find(l => l.sessionId === sessionId);
      leaf?.term.focus();
    });
  }

  // ── Split helpers ──────────────────────────────────────────────────────────

  async function splitActive(dir: 'h' | 'v'): Promise<void> {
    const tab = activeTab();
    if (!tab) return;
    if (tab.id === SETTINGS_TAB_ID) return;

    const { newRoot, newLeaf } = await splitLeaf(
      tab.root,
      tab.activeLeafId,
      dir,
    );
    if (newLeaf.kind === 'terminal') {
      wireLeaf(newLeaf);
    }
    tab.root = newRoot;
    tab.activeLeafId = newLeaf.kind === 'terminal' ? newLeaf.sessionId : newLeaf.id;
    renderWorkspace();
  }

  function pruneLeafFromTree(root: PaneNode, sessionId: string): PaneNode | null {
    if (root.kind !== 'split') {
      const isTarget = root.kind === 'terminal' ? root.sessionId === sessionId : root.id === sessionId;
      return isTarget ? null : root;
    }
    const a = pruneLeafFromTree(root.a, sessionId);
    const b = pruneLeafFromTree(root.b, sessionId);
    if (!a) return b;
    if (!b) return a;
    return { ...root, a, b };
  }

  async function closeActivePane(): Promise<void> {
    const tab = activeTab();
    if (!tab) return;
    if (tab.id === SETTINGS_TAB_ID) { closeSettingsTab(); return; }

    const sessionId = tab.activeLeafId;
    const leaves = collectLeaves(tab.root);
    const leaf = leaves.find(l => l.kind === 'terminal' ? l.sessionId === sessionId : l.id === sessionId);
    if (!leaf) return;

    _manuallyClosing.add(sessionId);

    const newRoot = pruneLeafFromTree(tab.root, sessionId);

    if (leaf.kind === 'terminal' && newRoot) {
      // Hide terminal instead of destroying it
      hiddenTerminals.push(leaf as TerminalLeaf);
    } else {
      // Destroy FIRST — dispose renderer before DOM is cleared.
      await destroySession(leaf);
      deleteLeafEl(sessionId);
    }

    if (!newRoot) {
      const idx = tabs.findIndex(t => t.id === tab.id);
      if (idx !== -1) {
        tabs.splice(idx, 1);
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = next?.id ?? '';
      }
      renderWorkspace();
    } else {
      tab.root = newRoot;
      const nextLeaf = collectLeaves(newRoot)[0];
      tab.activeLeafId = nextLeaf.kind === 'terminal' ? nextLeaf.sessionId : nextLeaf.id;
      renderWorkspace();
    }
  }

  async function onSessionExit(tabId: string, sessionId: string): Promise<void> {
    const hiddenIdx = hiddenTerminals.findIndex(t => t.sessionId === sessionId);
    if (hiddenIdx !== -1) {
      const leaf = hiddenTerminals[hiddenIdx];
      hiddenTerminals.splice(hiddenIdx, 1);
      await destroySession(leaf);
      deleteLeafEl(sessionId);
      return;
    }

    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const newRoot = await removeLeaf(tab.root, sessionId);
    if (!newRoot) {
      const idx = tabs.findIndex(t => t.id === tabId);
      if (idx !== -1) {
        tabs.splice(idx, 1);
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = next?.id ?? '';
        renderWorkspace();
      }
      return;
    }

    tab.root = newRoot;
    if (tab.activeLeafId === sessionId) {
      const nextLeaf = collectLeaves(newRoot)[0];
      tab.activeLeafId = nextLeaf.kind === 'terminal' ? nextLeaf.sessionId : nextLeaf.id;
    }
    renderWorkspace();
  }

  // ── Rename handler ─────────────────────────────────────────────────────────
  function handleRename(tabId: string, title: string): void {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) tab.title = title;
  }

  let _lastTabCycle = 0;
  function onKeydown(e: KeyboardEvent): void {
    if (e.repeat) return;

    // When xterm has focus it calls stopPropagation() on every keydown, then
    // our custom handler in session.ts re-dispatches a synthetic (isTrusted=false)
    // clone for our shortcuts. If the real event ALSO reaches this listener
    // (e.g. via Svelte's capture listener) the action would fire twice —
    // opening 2 tabs or running two concurrent splitActive() calls.
    // Guard: when xterm is focused, only process non-trusted (synthetic) events.
    if (e.isTrusted && document.activeElement?.closest?.('.xterm')) return;

    if (e.ctrlKey && e.shiftKey) {
      switch (e.key) {
        case 'D': e.preventDefault(); splitActive('v'); break;
        case 'E': e.preventDefault(); splitActive('h'); break;
        case 'W':
        case 'w': e.preventDefault(); closeActivePane(); break;
        case 'T': e.preventDefault(); addTab({ shell: activeShell() }); break;
      }
    }

    // Ctrl+, — settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      toggleSettingsTab();
    }

    // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
    if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
      e.preventDefault();
      const now = Date.now();
      if (now - _lastTabCycle < 150) return;
      _lastTabCycle = now;
      
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      if (tabs[next]) activateTab(tabs[next].id);
    }

    // Ctrl+= or Ctrl++ — font size up
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      const s = getSettings();
      const next = Math.min(28, s.fontSize + 1);
      if (next !== s.fontSize) {
        s.fontSize = next;
        saveSettings(s);
        applySettingsToAll(allLeaves(), s);
      }
    }

    // Ctrl+- — font size down
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '-') {
      e.preventDefault();
      const s = getSettings();
      const next = Math.max(8, s.fontSize - 1);
      if (next !== s.fontSize) {
        s.fontSize = next;
        saveSettings(s);
        applySettingsToAll(allLeaves(), s);
      }
    }
  }


  // ── Helpers for SettingsPanel ──────────────────────────────────────────────
  function getLeaves(): PaneLeaf[] {
    const tab = tabs.find(x => x.id !== SETTINGS_TAB_ID && x.id === activeTabId)
             ?? tabs.find(x => x.id !== SETTINGS_TAB_ID);
    return tab ? collectLeaves(tab.root) : [];
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  function toggleTerminal(): void {
    const tab = activeTab();
    if (!tab || tab.id === SETTINGS_TAB_ID) return;

    const leaves = collectLeaves(tab.root);
    const visibleTerminals = leaves.filter(l => l.kind === 'terminal') as TerminalLeaf[];

    if (visibleTerminals.length > 0) {
      // Hide all visible terminals
      let newRoot = tab.root;
      for (const t of visibleTerminals) {
        const pruned = pruneLeafFromTree(newRoot, t.sessionId);
        if (pruned) {
          hiddenTerminals.push(t);
          newRoot = pruned;
        }
      }
      tab.root = newRoot;
      const remaining = collectLeaves(tab.root);
      if (remaining.length > 0) {
        tab.activeLeafId = remaining[0].kind === 'terminal' ? remaining[0].sessionId : remaining[0].id;
      }
      renderWorkspace();
    } else {
      // Show terminal
      const active = findLeaf(tab.root, tab.activeLeafId);
      if (!active) return;

      if (hiddenTerminals.length > 0) {
        const tToRestore = hiddenTerminals.pop()!;
        tab.root = replaceLeaf(tab.root, tab.activeLeafId, {
          kind: 'split', dir: 'v', ratio: 0.8, a: active, b: tToRestore
        });
        tab.activeLeafId = tToRestore.sessionId;
        renderWorkspace();
      } else {
        splitActive('v');
      }
    }
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  onMount(() => {
    initializeEnterpriseFeatures();
    
    // Initialize i18n locale
    i18nStore.init();

    // Initialize global themes
    applyGlobalTheme(getSettings());

    // Single delegated listener for session-exit events bubbling from any leaf
    // container. leafElMap tracks the current container per sessionId — the
    // event always bubbles from whichever slot is live in workspaceEl.
    workspaceEl.addEventListener('session-exit', (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail;
      if (_manuallyClosing.has(sessionId)) { _manuallyClosing.delete(sessionId); return; }
      // Find which tab owns this session.
      const ownerTab = tabs.find(t => t.id !== SETTINGS_TAB_ID &&
        collectLeaves(t.root).some(l => l.sessionId === sessionId));
      if (ownerTab) onSessionExit(ownerTab.id, sessionId);
    });

    // Ctrl+, must be registered as a CAPTURE-phase listener on window BEFORE
    // addTab() creates xterm. xterm also uses capture (on its textarea), but our
    // window-level capture fires first in the propagation chain:
    //   window(capture) → document → … → .xterm > textarea(xterm capture)
    // stopPropagation() here ensures the event never reaches xterm at all,
    // preventing any double-dispatch via the synthetic-event path.
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Ctrl+, -> Settings
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === ',' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleSettingsTab();
      }
      // Ctrl+b or Cmd+b -> Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      }


      // Ctrl+j or Cmd+j -> Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleTerminal();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys, true);

    // Listen for the confirm-close event emitted by Go's ConfirmClose hook.
    EventsOn('confirm-close', (n: number) => { confirmCloseCount = n; });

    // Open first tab using settings default shell (no picker)
    addTab();

    // Check for updates in the background — silent on failure.
    CheckForUpdates().then((info) => {
      if (info?.hasUpdate) updateInfo = info;
    }).catch(() => { /* network unavailable — ignore */ });

    const handleCwdChange = (e: Event) => {
      const ce = e as CustomEvent;
      sessionCwdMap.set(ce.detail.sessionId, ce.detail.cwd);
      sessionCwdMap = new Map(sessionCwdMap);
    };
    window.addEventListener('myterm:cwd-change', handleCwdChange);

    const handleMountExtension = (e: Event) => {
      const ce = e as CustomEvent<{ leaf: ExtensionLeaf; container: HTMLElement }>;
      const { leaf, container } = ce.detail;
      const ext = extensionRegistry.getPane(leaf.extensionId);
      if (ext) {
        mount(ext.component, { target: container, props: { leaf } });
      }
    };
    window.addEventListener('myterm:mount-extension', handleMountExtension);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeys, true);
      window.removeEventListener('myterm:cwd-change', handleCwdChange);
      window.removeEventListener('myterm:mount-extension', handleMountExtension);
    };
  });


  // Derived: which view to show in the workspace div
  const tab = $derived(activeTab());
  const showWelcome   = $derived(!tab);
  const showSettings  = $derived(tab?.id === SETTINGS_TAB_ID);
  const showTerminal  = $derived(!!tab && tab.id !== SETTINGS_TAB_ID);

  // Re-render the imperative pane tree whenever the active terminal tab changes.
  // We track activeTabId explicitly so the effect only fires on tab switches,
  // not on every reactive update (addTab calls renderWorkspace() itself).
  $effect(() => {
    const _track = activeTabId; // declare dependency
    if (showTerminal && terminalEl) {
      renderWorkspace();
    }
  });

  // Automatically refit terminal sizes when the container resizes (e.g. window maximized)
  $effect(() => {
    if (!terminalEl) return;
    const ro = new ResizeObserver(() => {
      const t = activeTab();
      if (t && t.id !== SETTINGS_TAB_ID) {
        const leaves = collectLeaves(t.root);
        for (const leaf of leaves) {
          try { leaf.fit.fit(); } catch (e) { /* ignore errors during rapid resize */ }
        }
      }
    });
    ro.observe(terminalEl);
    return () => ro.disconnect();
  });
  import Sidebar from './ui/components/Sidebar.svelte';

  let sessionCwdMap = $state<Map<string, string>>(new Map());
  
  function toggleSidebar() {
    const t = activeTab();
    if (t) {
      t.isSidebarOpen = !t.isSidebarOpen;
    }
  }

  function getLeafForTab(t: Tab): PaneLeaf | undefined {
    const leaves = collectLeaves(t.root);
    return leaves.find(l => 
      (l.kind === 'terminal' && l.sessionId === t.activeLeafId) ||
      (l.kind === 'editor' && l.id === t.activeLeafId)
    ) || leaves[0];
  }

  function getTabRootPath(t: Tab): string {
    const leaves = collectLeaves(t.root);
    let active = leaves.find(l => l.kind === 'terminal' && l.sessionId === t.activeLeafId) 
                || leaves.find(l => l.kind === 'terminal');
    
    if (!active && hiddenTerminals.length > 0) {
      active = hiddenTerminals[hiddenTerminals.length - 1];
    }
    
    if (!active) return '~';
    return sessionCwdMap.get(active.sessionId) || '~';
  }
</script>

<svelte:window onkeydown={onKeydown} />

<TabBar
  {tabs}
  {activeTabId}
  onActivate={activateTab}
  onClose={closeTab}
  onNewTab={() => addTab({ promptPick: true })}
  onRename={handleRename}
  onSettings={toggleSettingsTab}
/>

<div id="workspace" bind:this={workspaceEl} style="display: flex; flex-direction: row;">
  {#each tabs as t (t.id)}
    {#if t.isSidebarOpen && t.id !== SETTINGS_TAB_ID}
      <div style="display: {activeTabId === t.id && showTerminal ? 'block' : 'none'}; height: 100%;">
        <Sidebar 
          rootPath={getTabRootPath(t)} 
          onClose={() => { t.isSidebarOpen = false; }} 
          activeLeaf={() => activeTabId === t.id ? activeLeaf() : getLeafForTab(t)} 
        />
      </div>
    {/if}
  {/each}

  <div style="flex: 1; position: relative; height: 100%;">
    <!-- Svelte-controlled overlays — never cleared by renderWorkspace() -->
    {#if showWelcome}
      <WelcomeScreen
        updateVersion={updateInfo?.hasUpdate ? updateInfo.version : undefined}
        updateUrl={updateInfo?.hasUpdate ? updateInfo.url : undefined}
        onDismissUpdate={() => updateInfo = null}
      />
    {:else if showSettings}
      <SettingsPanel {getLeaves} onRebuild={renderWorkspace} />
    {/if}
    <!-- Imperative terminal slot — renderWorkspace() only ever touches this div -->
    <div
      id="terminal-slot"
      bind:this={terminalEl}
      style:display={showTerminal ? 'block' : 'none'}
      style:position="absolute"
      style:inset="0 0 0 0"
    ></div>
  </div>
</div>

{#if showTerminal && activeTabId !== SETTINGS_TAB_ID}
  <StatusBar leaf={activeLeaf()} onToggleSidebar={toggleSidebar} />
{/if}

<!-- ── Close-confirmation modal ──────────────────────────────────────────── -->
{#if confirmCloseCount > 0}
  <ConfirmCloseModal count={confirmCloseCount} onCancel={() => confirmCloseCount = 0} />
{/if}

<!-- ── Update notification toast (only while a terminal is open) ──────── -->
{#if updateInfo?.hasUpdate && !showWelcome}
  <UpdateToast
    version={updateInfo.version}
    url={updateInfo.url}
    onDismiss={() => updateInfo = null}
  />
{/if}

<TerminalError />

<style>
</style>
