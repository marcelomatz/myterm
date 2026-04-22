import { getSettings } from '../domain/settings';
import type { Tab, PaneLeaf, PaneNode } from '../domain/types';
import { createSession, destroySession } from '../ui/session';
import {
  renderPane, wireLeaf, splitLeaf, removeLeaf, collectLeaves,
  deleteLeafEl,
} from '../ui/pane';
import { pickShell } from '../ui/shell-picker';
import { shellMeta } from '../domain/shell-meta';
import { tick } from 'svelte';

export const SETTINGS_TAB_ID = '__settings__';

class SessionStore {
  tabs = $state<Tab[]>([]);
  activeTabId = $state<string>('');
  confirmCloseCount = $state(0);
  _manuallyClosing = new Set<string>();

  get activeTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  get activeShell(): string {
    const tab = this.activeTab;
    if (!tab) return '';
    const leaves = collectLeaves(tab.root);
    const leaf = leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
    return leaf?.shell ?? '';
  }

  get allLeaves(): PaneLeaf[] {
    return this.tabs
      .filter(t => t.id !== SETTINGS_TAB_ID)
      .flatMap(t => collectLeaves(t.root));
  }

  get activeLeaf(): PaneLeaf | undefined {
    const tab = this.activeTab;
    if (!tab || tab.id === SETTINGS_TAB_ID) return undefined;
    const leaves = collectLeaves(tab.root);
    return leaves.find(l => l.sessionId === tab.activeLeafId) ?? leaves[0];
  }

  activateTab(tabId: string, renderWorkspace: () => void): void {
    this.activeTabId = tabId;
    renderWorkspace();
  }

  async addTab(
    opts: { promptPick?: boolean; shell?: string } = {},
    terminalEl: HTMLDivElement | undefined,
    renderWorkspace: () => void
  ): Promise<void> {
    let shell = opts.shell ?? '';
    if (opts.promptPick) {
      const newTabBtn = document.getElementById('new-tab-btn') as HTMLElement;
      const chosen = await pickShell(newTabBtn);
      if (chosen === null) return;
      shell = chosen;
    }

    let leaf: PaneLeaf;
    try {
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

    this.tabs.push(tab);
    this.activeTabId = tab.id;
    await tick();
    renderWorkspace();
  }

  async closeTab(tabId: string, renderWorkspace: () => void): Promise<void> {
    if (tabId === SETTINGS_TAB_ID) {
      this.closeSettingsTab(renderWorkspace);
      return;
    }

    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = this.tabs[idx];
    const leaves = collectLeaves(tab.root);

    for (const l of leaves) this._manuallyClosing.add(l.sessionId);
    await Promise.all(leaves.map(l => {
      const p = destroySession(l);
      deleteLeafEl(l.sessionId);
      return p;
    }));

    this.tabs.splice(idx, 1);
    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? '';
    }
    renderWorkspace();
  }

  openSettingsTab(renderWorkspace: () => void): void {
    if (this.activeTabId === SETTINGS_TAB_ID) return;
    if (!this.tabs.find(t => t.id === SETTINGS_TAB_ID)) {
      this.tabs.push({ id: SETTINGS_TAB_ID, title: '⚙ Settings', root: null as never, activeLeafId: '' });
    }
    this.activateTab(SETTINGS_TAB_ID, renderWorkspace);
  }

  closeSettingsTab(renderWorkspace: () => void): void {
    const idx = this.tabs.findIndex(t => t.id === SETTINGS_TAB_ID);
    if (idx === -1) return;
    this.tabs.splice(idx, 1);
    if (this.activeTabId === SETTINGS_TAB_ID) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? '';
    }
    renderWorkspace();
  }

  toggleSettingsTab(renderWorkspace: () => void): void {
    if (this.activeTabId === SETTINGS_TAB_ID) this.closeSettingsTab(renderWorkspace);
    else this.openSettingsTab(renderWorkspace);
  }

  async splitActive(dir: 'h' | 'v', renderWorkspace: () => void): Promise<void> {
    const tab = this.activeTab;
    if (!tab || tab.id === SETTINGS_TAB_ID) return;

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

  pruneLeafFromTree(root: PaneNode, sessionId: string): PaneNode | null {
    if (root.kind === 'leaf') return root.sessionId === sessionId ? null : root;
    const a = this.pruneLeafFromTree(root.a, sessionId);
    const b = this.pruneLeafFromTree(root.b, sessionId);
    if (!a) return b;
    if (!b) return a;
    return { ...root, a, b };
  }

  async closeActivePane(renderWorkspace: () => void): Promise<void> {
    const tab = this.activeTab;
    if (!tab) return;
    if (tab.id === SETTINGS_TAB_ID) { this.closeSettingsTab(renderWorkspace); return; }

    const sessionId = tab.activeLeafId;
    const leaves = collectLeaves(tab.root);
    const leaf = leaves.find(l => l.sessionId === sessionId);
    if (!leaf) return;

    this._manuallyClosing.add(sessionId);

    await destroySession(leaf);
    deleteLeafEl(sessionId);

    const newRoot = this.pruneLeafFromTree(tab.root, sessionId);
    if (!newRoot) {
      const idx = this.tabs.findIndex(t => t.id === tab.id);
      if (idx !== -1) {
        this.tabs.splice(idx, 1);
        const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
        this.activeTabId = next?.id ?? '';
      }
      renderWorkspace();
    } else {
      tab.root = newRoot;
      tab.activeLeafId = collectLeaves(newRoot)[0].sessionId;
      renderWorkspace();
    }
  }

  async onSessionExit(tabId: string, sessionId: string, renderWorkspace: () => void): Promise<void> {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const newRoot = await removeLeaf(tab.root, sessionId);
    if (!newRoot) {
      const idx = this.tabs.findIndex(t => t.id === tabId);
      if (idx !== -1) {
        this.tabs.splice(idx, 1);
        const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
        this.activeTabId = next?.id ?? '';
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

  handleRename(tabId: string, title: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) tab.title = title;
  }
}

export const sessionStore = new SessionStore();
