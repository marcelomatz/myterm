import { Write, Resize } from '../infrastructure/wails/backend';
import { EventsOn } from '../infrastructure/wails/events';
import { createSession, destroySession, attachGpuRenderer } from './session';
import type { PaneLeaf, PaneNode, PaneSplit } from '../domain/types';

// ─── Non-reactive DOM element map ────────────────────────────────────────────
//
// PaneLeaf is stored inside Svelte $state — any property write on it triggers
// the reactive system.  DOM element references must live OUTSIDE the $state
// tree to prevent renderPane (called inside a $effect) from causing an
// effect_update_depth_exceeded infinite loop.
//
// Each session gets ONE persistent <div class="pane"> created at wire-time and
// stored here.  renderPane() only ever MOVES that div — it never innerHTML=''
// on terminalEl, which would destroy a sibling session's .xterm.
//
const leafElMap = new Map<string, HTMLElement>();

/** Returns the current DOM container for a leaf, or undefined if not mounted. */
export function getLeafEl(sessionId: string): HTMLElement | undefined {
  return leafElMap.get(sessionId);
}

/**
 * Creates (once) and returns the persistent pane <div> for this session.
 * The element is kept alive for the lifetime of the session even when
 * its owning tab is not active.
 */
export function getOrCreateLeafEl(sessionId: string): HTMLElement {
  let el = leafElMap.get(sessionId);
  if (!el) {
    el = document.createElement('div');
    el.className = 'pane';
    leafElMap.set(sessionId, el);
  }
  return el;
}

/** Removes the DOM container entry for a leaf (call when session is destroyed). */
export function deleteLeafEl(sessionId: string): void {
  leafElMap.delete(sessionId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.kind !== 'split') return [node];
  return [...collectLeaves(node.a), ...collectLeaves(node.b)];
}

export function findLeaf(node: PaneNode, sessionId: string): PaneLeaf | null {
  if (node.kind !== 'split') {
    if (node.kind === 'terminal') return node.sessionId === sessionId ? node : null;
    if (node.kind === 'editor') return node.id === sessionId ? node : null;
  }
  return findLeaf(node.a, sessionId) ?? findLeaf(node.b, sessionId);
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderPane(
  node: PaneNode,
  container: HTMLElement,
  _onFocus: (sessionId: string) => void,
): void {
  if (node.kind === 'terminal') {
    const leafEl = getOrCreateLeafEl(node.sessionId);
    Array.from(container.children).forEach(c => { if (c !== leafEl) c.remove(); });
    if (leafEl.parentElement !== container) container.appendChild(leafEl);

    container.className = '';
    container.style.display = 'block';
    leafEl.className = 'pane';

    if (leafEl.querySelector('.xterm')) {
      leafEl.addEventListener('mousedown', () => _onFocus(node.sessionId), { once: true });
      requestAnimationFrame(() => { node.fit.fit(); node.term.focus(); });
    } else {
      node.term.open(leafEl);
      leafEl.addEventListener('mousedown', () => _onFocus(node.sessionId), { once: true });
      attachGpuRenderer(node.term, renderer => {
        node.renderer = renderer;
        node.fit.fit();
        node.term.focus();
      });
    }
    return;
  }

  if (node.kind === 'extension') {
    const leafEl = getOrCreateLeafEl(node.id);
    Array.from(container.children).forEach(c => { if (c !== leafEl) c.remove(); });
    if (leafEl.parentElement !== container) container.appendChild(leafEl);

    container.className = '';
    container.style.display = 'block';
    leafEl.className = 'pane';

    if (!leafEl.hasAttribute('data-ext-id')) {
      leafEl.setAttribute('data-ext-id', node.extensionId);
      leafEl.addEventListener('mousedown', () => _onFocus(node.id));
      
      // Dispatch an event so a Svelte coordinator can mount the extension here
      const evt = new CustomEvent('myterm:mount-extension', { detail: { leaf: node, container: leafEl } });
      window.dispatchEvent(evt);
    }
    return;
  }

  // Split node — clear container and build a two-cell grid.
  // Safe to innerHTML='' here because split containers are ephemeral
  // wrappers — the persistent leafEl divs are children of cellA/cellB,
  // not of container itself, so they won't be destroyed.
  container.innerHTML = '';
  container.className = '';
  renderSplit(node, container, _onFocus);
}

function renderSplit(
  split: PaneSplit,
  container: HTMLElement,
  _onFocus: (sessionId: string) => void,
): void {
  container.className = split.dir === 'h' ? 'split split-h' : 'split split-v';
  container.style.display = 'grid';

  const cellA = document.createElement('div');
  const divider = document.createElement('div');
  const cellB = document.createElement('div');

  cellA.style.cssText = 'width:100%;height:100%;overflow:hidden;min-width:0;min-height:0;';
  cellB.style.cssText = 'width:100%;height:100%;overflow:hidden;min-width:0;min-height:0;';

  divider.className = split.dir === 'h' ? 'divider divider-h' : 'divider divider-v';

  container.appendChild(cellA);
  container.appendChild(divider);
  container.appendChild(cellB);

  applyRatio(container, split);

  renderPane(split.a, cellA, _onFocus);
  renderPane(split.b, cellB, _onFocus);

  // Drag to resize.
  attachDividerDrag(divider, split, container);
}

function applyRatio(container: HTMLElement, split: PaneSplit): void {
  const pct = `${(split.ratio * 100).toFixed(1)}%`;
  const divSize = '4px';
  if (split.dir === 'h') {
    container.style.gridTemplateColumns = `${pct} ${divSize} 1fr`;
    container.style.gridTemplateRows = '';
  } else {
    container.style.gridTemplateRows = `${pct} ${divSize} 1fr`;
    container.style.gridTemplateColumns = '';
  }
}

function attachDividerDrag(
  divider: HTMLElement,
  split: PaneSplit,
  container: HTMLElement,
): void {
  divider.addEventListener('mousedown', (startEvt) => {
    startEvt.preventDefault();
    const rect = container.getBoundingClientRect();

    const onMove = (e: MouseEvent) => {
      if (split.dir === 'h') {
        split.ratio = Math.min(0.9, Math.max(0.1,
          (e.clientX - rect.left) / rect.width));
      } else {
        split.ratio = Math.min(0.9, Math.max(0.1,
          (e.clientY - rect.top) / rect.height));
      }
      applyRatio(container, split);
      fitAll(split);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      fitAll(split);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function fitAll(node: PaneNode): void {
  if (node.kind !== 'split') {
    if (node.kind === 'terminal') node.fit.fit();
    // Editors resize via CSS usually, or via their own layout() method (handled elsewhere).
  } else {
    fitAll(node.a);
    fitAll(node.b);
  }
}

// ─── Split operations ─────────────────────────────────────────────────────────

/**
 * Replaces the leaf identified by `activeSessionId` in `root` with a PaneSplit
 * containing that leaf and a brand-new session.
 */
export async function splitLeaf(
  root: PaneNode,
  activeSessionId: string,
  dir: 'h' | 'v',
): Promise<{ newRoot: PaneNode; newLeaf: PaneLeaf }> {
  const targetLeaf = findLeaf(root, activeSessionId);
  if (!targetLeaf) throw new Error("Leaf not found");

  let newLeaf: PaneLeaf;
  if (targetLeaf.kind === 'terminal') {
    newLeaf = await createSession();
  } else {
    // Clone editor state so we get the same files side-by-side.
    // We share the same EditorFile objects so 'isDirty' state syncs across splits.
    const activeFile = targetLeaf.files.find(f => f.filePath === targetLeaf.activeFilePath);
    newLeaf = {
      kind: 'editor',
      id: 'editor-' + Date.now() + Math.random().toString(36).substr(2, 9),
      files: activeFile ? [activeFile] : [],
      activeFilePath: targetLeaf.activeFilePath
    };
  }

  const newRoot = replaceLeaf(root, activeSessionId, dir === 'v' ? {
    kind: 'split',
    dir: 'v',
    ratio: 0.8,
    a: targetLeaf,
    b: newLeaf,
  } : {
    kind: 'split',
    dir,
    ratio: 0.5,
    a: targetLeaf,
    b: newLeaf,
  });

  return { newRoot, newLeaf };
}

/** Removes the leaf with `removeId` from the tree. Returns null if tree becomes empty. */
export async function removeLeaf(
  root: PaneNode,
  removeId: string,
): Promise<PaneNode | null> {
  const leaf = findLeaf(root, removeId);
  if (leaf) {
    await destroySession(leaf);
    deleteLeafEl(removeId);
  }
  return pruneLeaf(root, removeId);
}

export function replaceLeaf(node: PaneNode, id: string, replacement: PaneNode): PaneNode {
  if (node.kind !== 'split') {
    const isTarget = node.kind === 'terminal' ? node.sessionId === id : node.id === id;
    return isTarget ? replacement : node;
  }
  return { ...node, a: replaceLeaf(node.a, id, replacement), b: replaceLeaf(node.b, id, replacement) };
}

function pruneLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.kind !== 'split') {
    const isTarget = node.kind === 'terminal' ? node.sessionId === id : node.id === id;
    return isTarget ? null : node;
  }
  const a = pruneLeaf(node.a, id);
  const b = pruneLeaf(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return { ...node, a, b };
}

// ─── Wiring helpers ───────────────────────────────────────────────────────────

/** Hooks write + resize on a leaf to its backend session. */
export function wireLeaf(leaf: PaneLeaf): void {
  if (leaf.kind !== 'terminal') return;

  leaf.term.onData(data => Write(leaf.sessionId, data));
  leaf.term.onResize(({ cols, rows }) => Resize(leaf.sessionId, cols, rows));

  // Shell exited — notify via a DOM event so App.svelte can handle tab close.
  // Dispatch from the leaf's current container (from leafElMap) so the event
  // bubbles up through the live workspace DOM.
  EventsOn('terminal-exit:' + leaf.sessionId, () => {
    const el = leafElMap.get(leaf.sessionId);
    el?.dispatchEvent(new CustomEvent('session-exit', {
      bubbles: true,
      detail: { sessionId: leaf.sessionId },
    }));
  });
}
