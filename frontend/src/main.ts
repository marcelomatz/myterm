import '@xterm/xterm/css/xterm.css';
import { createSession, destroySession } from './session';
import {
  renderPane, wireLeaf, splitLeaf, removeLeaf, collectLeaves,
} from './pane';
import type { AppState, Tab, PaneLeaf, PaneNode } from './types';
import { buildSettingsPane } from './settings-panel';
import { mountWelcomeScreen } from './welcome-screen';

const SETTINGS_TAB_ID = '__settings__';

import { pickShell, shellBadge } from './shell-picker';
import { shellMeta } from './shell-meta';
import {
  Quit, WindowMinimise, WindowToggleMaximise,
} from '../wailsjs/runtime/runtime';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const state: AppState = { tabs: [], activeTabId: '' };
/** Sessions being explicitly destroyed \u2014 suppresses the session-exit event. */
const _manuallyClosing = new Set<string>();

const tabbarEl    = document.getElementById('tabbar')!;
const newTabBtn   = document.getElementById('new-tab-btn')!;
const workspaceEl = document.getElementById('workspace')!;
const settingsBtn = document.getElementById('settings-btn')!;

// ─── Tab management ──────────────────────────────────────────────────────────

/** Returns the shell of the currently active pane, or '' to use the default. */
function activeShell(): string {
  const tab = activeTab();
  if (!tab) return '';
  const leaves = collectLeaves(tab.root);
  const leaf = leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
  return leaf?.shell ?? '';
}

/**
 * Opens a new tab.
 * - `shell` explicit → gebruik that shell.
 * - `promptPick: true` → show shell picker first.
 * - Neither → use settings default.
 */
async function addTab(opts: { promptPick?: boolean; shell?: string } = {}): Promise<void> {
  let shell = opts.shell ?? '';
  if (opts.promptPick) {
    const chosen = await pickShell(newTabBtn as HTMLElement);
    if (chosen === null) return;   // user dismissed
    shell = chosen;
  }

  const container = document.createElement('div');
  container.className = 'pane';

  let leaf: PaneLeaf;
  try {
    leaf = await createSession(container, shell);
  } catch (err) {
    console.error('[myterm] Failed to create session:', err);
    workspaceEl.innerHTML =
      `<div style="color:#f66;padding:16px;font-family:monospace">
        Failed to start terminal session.<br>
        Make sure you are running inside the Wails window, not a plain browser.<br>
        <small>${err}</small>
      </div>`;
    return;
  }
  wireLeaf(leaf);

  const tab: Tab = {
    id: leaf.sessionId,
    title: shellMeta(leaf.shell).label,
    root: leaf,
    activeLeafId: leaf.sessionId,
  };

  state.tabs.push(tab);
  renderTabBar();
  activateTab(tab.id);

  // Handle shell exit propagated from wireLeaf.
  // Only handle NATURAL exits — skip if we're closing this session explicitly.
  container.addEventListener('session-exit', (e) => {
    const { sessionId } = (e as CustomEvent).detail;
    if (_manuallyClosing.has(sessionId)) { _manuallyClosing.delete(sessionId); return; }
    onSessionExit(tab.id, sessionId);
  });
}

async function closeTab(tabId: string): Promise<void> {
  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const tab = state.tabs[idx];
  const leaves = collectLeaves(tab.root);

  // ── Remove the tab from state SYNCHRONOUSLY before any await. ──────────────
  // This is the fix for the "need two clicks to close" bug: during the async
  // destroySession call any re-entrant click will find idx === -1 and bail out.
  state.tabs.splice(idx, 1);
  if (state.activeTabId === tabId) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    state.activeTabId = next?.id ?? '';
  }
  renderTabBar();
  renderWorkspace();

  // Mark all leaves as manually closing so the session-exit event doesn't
  // trigger onSessionExit for these sessions.
  for (const l of leaves) _manuallyClosing.add(l.sessionId);
  // Tear down backend sessions asynchronously (fire-and-forget is fine here —
  // the UI is already updated above).
  await Promise.all(leaves.map(destroySession));
}

function activateTab(tabId: string): void {
  state.activeTabId = tabId;
  renderTabBar();
  renderWorkspace();
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function openSettingsTab(): void {
  if (state.activeTabId === SETTINGS_TAB_ID) return; // already active
  if (!state.tabs.find(t => t.id === SETTINGS_TAB_ID)) {
    // Insert at the end (but before no real tab, since this is virtual)
    state.tabs.push({
      id: SETTINGS_TAB_ID,
      title: '⚙ Settings',
      root: null as never,   // settings tab has no pane tree
      activeLeafId: '',
    });
  }
  activateTab(SETTINGS_TAB_ID);
}

function closeSettingsTab(): void {
  const idx = state.tabs.findIndex(t => t.id === SETTINGS_TAB_ID);
  if (idx === -1) return;
  state.tabs.splice(idx, 1);
  if (state.activeTabId === SETTINGS_TAB_ID) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    state.activeTabId = next?.id ?? '';
  }
  renderTabBar();
  renderWorkspace();
}

function toggleSettingsTab(): void {
  if (state.activeTabId === SETTINGS_TAB_ID) {
    closeSettingsTab();
  } else {
    openSettingsTab();
  }
}

// ─── Workspace rendering ──────────────────────────────────────────────────────

function renderWorkspace(): void {
  workspaceEl.innerHTML = '';
  const tab = activeTab();

  // No tabs open → empty state (async so fonts load before DOM is created)
  if (!tab) {
    mountWelcomeScreen(workspaceEl);
    return;
  }

  // Settings tab — render the settings pane
  if (tab.id === SETTINGS_TAB_ID) {
    const settingsEl = buildSettingsPane(
      () => {
        const t = state.tabs.find(x => x.id !== SETTINGS_TAB_ID && x.id === state.activeTabId)
               ?? state.tabs.find(x => x.id !== SETTINGS_TAB_ID);
        return t ? collectLeaves(t.root) : [];
      },
      () => renderWorkspace(),  // onRebuild: re-render after reset
    );
    workspaceEl.appendChild(settingsEl);
    return;
  }

  const rootEl = document.createElement('div');
  rootEl.style.width  = '100%';
  rootEl.style.height = '100%';
  workspaceEl.appendChild(rootEl);

  renderPane(tab.root, rootEl, (sessionId) => {
    tab.activeLeafId = sessionId;
    const leaf = findLeafBySession(tab, sessionId);
    leaf?.term.focus();
  });
}

// ─── Tab bar rendering ────────────────────────────────────────────────────────

function renderTabBar(): void {
  // Preserve the + button; rebuild tab items.
  const existing = tabbarEl.querySelectorAll('.tab-item');
  existing.forEach(el => el.remove());

  for (const tab of state.tabs) {
    const item = document.createElement('div');
    const isSettings = tab.id === SETTINGS_TAB_ID;
    item.className = 'tab-item' + (tab.id === state.activeTabId ? ' active' : '') + (isSettings ? ' tab-item--settings' : '');
    item.dataset.tabId = tab.id;

    // Determine the shell of the first (or active) leaf in this tab
    // (settings tab has no leaves).
    const leaves = tab.id !== SETTINGS_TAB_ID ? collectLeaves(tab.root) : [];
    const activeLeaf = leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
    const badge = activeLeaf ? shellBadge(activeLeaf.shell) : null;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    title.addEventListener('dblclick', () => startRename(tab, title));

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Close tab';
    if (tab.id === SETTINGS_TAB_ID) {
      close.addEventListener('click', (e) => { e.stopPropagation(); closeSettingsTab(); });
    } else {
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
    }

    if (badge) item.appendChild(badge);
    item.appendChild(title);
    item.appendChild(close);
    // Use pointerdown on the item (fires before the close button's click),
    // and bail out if the click target is the close button itself.
    item.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return;
      activateTab(tab.id);
    });

    tabbarEl.insertBefore(item, newTabBtn);
  }
}

function startRename(tab: Tab, el: HTMLElement): void {
  const input = document.createElement('input');
  input.className = 'tab-rename';
  input.value = tab.title;
  el.replaceWith(input);
  input.focus();
  input.select();

  const finish = () => {
    tab.title = input.value.trim() || tab.title;
    renderTabBar();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

// ─── Split helpers ────────────────────────────────────────────────────────────

async function splitActive(dir: 'h' | 'v'): Promise<void> {
  const tab = activeTab();
  if (!tab) return;

  const { newRoot, newLeaf } = await splitLeaf(
    tab.root,
    tab.activeLeafId,
    dir,
    workspaceEl,
  );

  wireLeaf(newLeaf);
  tab.root = newRoot;
  tab.activeLeafId = newLeaf.sessionId;

  renderWorkspace();
}

async function closeActivePane(): Promise<void> {
  const tab = activeTab();
  if (!tab) return;

  const sessionId = tab.activeLeafId;
  const leaves = collectLeaves(tab.root);
  const leaf = leaves.find(l => l.sessionId === sessionId);
  if (!leaf) return;

  // ── Update state + UI synchronously first (same fix as closeTab). ──────────
  // This means Ctrl+Shift+W closes in one keystroke without any debounce.
  _manuallyClosing.add(sessionId);

  const newRoot = pruneLeafFromTree(tab.root, sessionId);
  if (!newRoot) {
    // Last pane — close the whole tab immediately.
    const idx = state.tabs.findIndex(t => t.id === tab.id);
    if (idx !== -1) {
      state.tabs.splice(idx, 1);
      const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
      state.activeTabId = next?.id ?? '';
    }
    renderTabBar();
    renderWorkspace();
  } else {
    tab.root = newRoot;
    tab.activeLeafId = collectLeaves(newRoot)[0].sessionId;
    renderWorkspace();
  }

  // Tear down backend session in the background.
  await destroySession(leaf);
}

/** Prunes a leaf from the tree WITHOUT destroying its session (used by closeActivePane). */
function pruneLeafFromTree(root: PaneNode, sessionId: string): PaneNode | null {
  if (root.kind === 'leaf') return root.sessionId === sessionId ? null : root;
  const a = pruneLeafFromTree(root.a, sessionId);
  const b = pruneLeafFromTree(root.b, sessionId);
  if (!a) return b;
  if (!b) return a;
  return { ...root, a, b };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function activeTab(): Tab | undefined {
  return state.tabs.find(t => t.id === state.activeTabId);
}

function findLeafBySession(tab: Tab, sessionId: string): PaneLeaf | undefined {
  return collectLeaves(tab.root).find(l => l.sessionId === sessionId);
}

async function onSessionExit(tabId: string, sessionId: string): Promise<void> {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  const newRoot = await removeLeaf(tab.root, sessionId);
  if (!newRoot) {
    // Last pane in the tab exited — close the whole tab.
    // State is already removed by removeLeaf; just clean up tabs array.
    const idx = state.tabs.findIndex(t => t.id === tabId);
    if (idx !== -1) {
      state.tabs.splice(idx, 1);
      const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
      state.activeTabId = next?.id ?? '';
      renderTabBar();
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

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;  // ignore key-repeat

  if (e.ctrlKey && e.shiftKey) {
    switch (e.key) {
      case 'D': e.preventDefault(); splitActive('h'); break;
      case 'E': e.preventDefault(); splitActive('v'); break;
      case 'W':
      case 'w': e.preventDefault(); closeActivePane(); break;
      case 'T': e.preventDefault(); addTab({ shell: activeShell() }); break;
    }
  }
  // Ctrl+, — toggle settings tab
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault();
    toggleSettingsTab();
  }
  // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
    const next = e.shiftKey
      ? (idx - 1 + state.tabs.length) % state.tabs.length
      : (idx + 1) % state.tabs.length;
    if (state.tabs[next]) activateTab(state.tabs[next].id);
  }
});


// ─── Event listeners ─────────────────────────────────────────────────────────

// Window controls
document.getElementById('btn-close')!.addEventListener('click', () => Quit());
document.getElementById('btn-min')!  .addEventListener('click', () => WindowMinimise());
document.getElementById('btn-max')!  .addEventListener('click', () => WindowToggleMaximise());

// Left-click: open with default shell; long-press / right-click not needed
// because Ctrl+Shift+T already shows the picker.
newTabBtn.addEventListener('click', () => addTab({ promptPick: true }));

settingsBtn.addEventListener('click', () => toggleSettingsTab());

// ─── Init ─────────────────────────────────────────────────────────────────────

// Mount welcome screen immediately (fonts load async before DOM is inserted).
mountWelcomeScreen(workspaceEl);

// Open the first tab without the shell picker (use saved default).
addTab(); // no opts → uses settings default shell, no picker
