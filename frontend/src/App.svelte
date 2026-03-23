<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TitleBar from './TitleBar.svelte';
  import TabBar from './TabBar.svelte';
  import WelcomeScreen from './WelcomeScreen.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  import { createSession, destroySession } from './ui/session';
  import {
    renderPane, wireLeaf, splitLeaf, removeLeaf, collectLeaves,
    deleteLeafEl,
  } from './ui/pane';
  import type { AppState, Tab, PaneLeaf, PaneNode } from './domain/types';
  import { pickShell } from './ui/shell-picker';
  import { shellMeta } from './domain/shell-meta';

  const SETTINGS_TAB_ID = '__settings__';

  // ── App state ──────────────────────────────────────────────────────────────
  let tabs        = $state<Tab[]>([]);
  let activeTabId = $state('');

  /** Sessions being explicitly destroyed — suppresses the session-exit event. */
  const _manuallyClosing = new Set<string>();

  // ── Workspace DOM target ───────────────────────────────────────────────────
  let workspaceEl: HTMLDivElement;
  /** Inner div that renderWorkspace() writes into imperatively. Svelte never touches this. */
  let terminalEl: HTMLDivElement;

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

  function findLeafBySession(tab: Tab, sessionId: string): PaneLeaf | undefined {
    return collectLeaves(tab.root).find(l => l.sessionId === sessionId);
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
    for (const l of leaves) _manuallyClosing.add(l.sessionId);
    await Promise.all(leaves.map(l => {
      const p = destroySession(l);
      deleteLeafEl(l.sessionId);
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
      tabs.push({ id: SETTINGS_TAB_ID, title: '⚙ Settings', root: null as never, activeLeafId: '' });
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
      const leaf = findLeafBySession(tab, sessionId);
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
    wireLeaf(newLeaf);
    tab.root = newRoot;
    tab.activeLeafId = newLeaf.sessionId;
    renderWorkspace();
  }

  function pruneLeafFromTree(root: PaneNode, sessionId: string): PaneNode | null {
    if (root.kind === 'leaf') return root.sessionId === sessionId ? null : root;
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
    const leaf = leaves.find(l => l.sessionId === sessionId);
    if (!leaf) return;

    _manuallyClosing.add(sessionId);

    // Destroy FIRST — dispose renderer before DOM is cleared.
    await destroySession(leaf);
    deleteLeafEl(sessionId);

    const newRoot = pruneLeafFromTree(tab.root, sessionId);
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
      tab.activeLeafId = collectLeaves(newRoot)[0].sessionId;
      renderWorkspace();
    }
  }

  async function onSessionExit(tabId: string, sessionId: string): Promise<void> {
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
      tab.activeLeafId = collectLeaves(newRoot)[0].sessionId;
    }
    renderWorkspace();
  }

  // ── Rename handler ─────────────────────────────────────────────────────────
  function handleRename(tabId: string, title: string): void {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) tab.title = title;
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
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
        case 'D': e.preventDefault(); splitActive('h'); break;
        case 'E': e.preventDefault(); splitActive('v'); break;
        case 'W':
        case 'w': e.preventDefault(); closeActivePane(); break;
        case 'T': e.preventDefault(); addTab({ shell: activeShell() }); break;
      }
    }
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      toggleSettingsTab();
    }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      if (tabs[next]) activateTab(tabs[next].id);
    }
  }


  // ── Helpers for SettingsPanel ──────────────────────────────────────────────
  function getLeaves(): PaneLeaf[] {
    const tab = tabs.find(x => x.id !== SETTINGS_TAB_ID && x.id === activeTabId)
             ?? tabs.find(x => x.id !== SETTINGS_TAB_ID);
    return tab ? collectLeaves(tab.root) : [];
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  onMount(() => {
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
    // Open first tab using settings default shell (no picker)
    addTab();
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
</script>

<svelte:window onkeydown={onKeydown} />

<TitleBar onSettings={toggleSettingsTab} />

<TabBar
  {tabs}
  {activeTabId}
  onActivate={activateTab}
  onClose={closeTab}
  onNewTab={() => addTab({ promptPick: true })}
  onRename={handleRename}
/>

<div id="workspace" bind:this={workspaceEl}>
  <!-- Svelte-controlled overlays — never cleared by renderWorkspace() -->
  {#if showWelcome}
    <WelcomeScreen />
  {:else if showSettings}
    <SettingsPanel {getLeaves} onRebuild={renderWorkspace} />
  {/if}
  <!-- Imperative terminal slot — renderWorkspace() only ever touches this div -->
  <div
    id="terminal-slot"
    bind:this={terminalEl}
    style:display={showTerminal ? 'block' : 'none'}
    style:position="absolute"
    style:inset="0"
  ></div>
</div>
