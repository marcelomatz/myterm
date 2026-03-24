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
  import { getSettings, saveSettings } from './domain/settings';
  import { applySettingsToAll } from './ui/settings-apply';
  import { EventsOn } from './bridge/events';
  import { ForceQuit, CheckForUpdates } from './bridge/backend';
  import type { UpdateInfo } from './bridge/backend';
  import UpdateToast from './ui/UpdateToast.svelte';

  const SETTINGS_TAB_ID = '__settings__';

  // ── Close-confirmation modal ───────────────────────────────────────────────
  /** > 0 = modal visible, value is the number of open sessions. */
  let confirmCloseCount = $state(0);

  // ── Update notification ────────────────────────────────────────────────────
  let updateInfo = $state<UpdateInfo | null>(null);

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

    // Ctrl+, — settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      toggleSettingsTab();
    }

    // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
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

    // Ctrl+, must be registered as a CAPTURE-phase listener on window BEFORE
    // addTab() creates xterm. xterm also uses capture (on its textarea), but our
    // window-level capture fires first in the propagation chain:
    //   window(capture) → document → … → .xterm > textarea(xterm capture)
    // stopPropagation() here ensures the event never reaches xterm at all,
    // preventing any double-dispatch via the synthetic-event path.
    const handleCtrlComma = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === ',' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleSettingsTab();
      }
    };
    window.addEventListener('keydown', handleCtrlComma, true);

    // Listen for the confirm-close event emitted by Go's ConfirmClose hook.
    EventsOn('confirm-close', (n: number) => { confirmCloseCount = n; });

    // Open first tab using settings default shell (no picker)
    addTab();

    // Check for updates in the background — silent on failure.
    CheckForUpdates().then((info) => {
      if (info?.hasUpdate) updateInfo = info;
    }).catch(() => { /* network unavailable — ignore */ });

    return () => {
      window.removeEventListener('keydown', handleCtrlComma, true);
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
    style:inset="0"
  ></div>
</div>

<!-- ── Close-confirmation modal ──────────────────────────────────────────── -->
{#if confirmCloseCount > 0}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => confirmCloseCount = 0}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-box" onclick={e => e.stopPropagation()}>
      <h3 class="modal-title">Fechar MyTerm?</h3>
      <p class="modal-body">
        {confirmCloseCount} {confirmCloseCount === 1 ? 'sessão aberta' : 'sessões abertas'}.
        Os processos em execução serão encerrados.
      </p>
      <div class="modal-actions">
        <button class="btn-cancel" onclick={() => confirmCloseCount = 0}>Cancelar</button>
        <button class="btn-close" onclick={() => ForceQuit()}>Fechar</button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Update notification toast (only while a terminal is open) ──────── -->
{#if updateInfo?.hasUpdate && !showWelcome}
  <UpdateToast
    version={updateInfo.version}
    url={updateInfo.url}
    onDismiss={() => updateInfo = null}
  />
{/if}


<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal-box {
    background: #1e1e2e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 28px 32px;
    width: 360px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    animation: modal-in 0.15s ease;
  }

  @keyframes modal-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)  scale(1); }
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 600;
    color: #cdd6f4;
    margin: 0 0 10px;
  }

  .modal-body {
    font-size: 0.875rem;
    color: #a6adc8;
    margin: 0 0 22px;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel, .btn-close {
    padding: 7px 18px;
    border-radius: 7px;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-cancel {
    background: rgba(255,255,255,0.07);
    color: #cdd6f4;
  }

  .btn-close {
    background: #f38ba8;
    color: #1e1e2e;
  }

  .btn-cancel:hover { opacity: 0.8; }
  .btn-close:hover  { opacity: 0.85; }
</style>
