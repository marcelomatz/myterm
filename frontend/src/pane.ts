import { Write, Resize } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { createSession, destroySession } from './session';
import type { PaneLeaf, PaneNode, PaneSplit } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.kind === 'leaf') return [node];
  return [...collectLeaves(node.a), ...collectLeaves(node.b)];
}

function findLeaf(node: PaneNode, sessionId: string): PaneLeaf | null {
  if (node.kind === 'leaf') return node.sessionId === sessionId ? node : null;
  return findLeaf(node.a, sessionId) ?? findLeaf(node.b, sessionId);
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Recursively renders a pane tree into `container`, mounting xterm instances
 * and attaching drag-to-resize dividers.
 */
export function renderPane(
  node: PaneNode,
  container: HTMLElement,
  _onFocus: (sessionId: string) => void,
): void {
  container.innerHTML = '';

  if (node.kind === 'leaf') {
    container.className = 'pane';
    node.el = container;

    // Move the xterm DOM element into this container if it isn't already there.
    // term.element is set after term.open() is called; it may live in a
    // temporary container created during createSession → addTab.
    if (node.term.element && node.term.element.parentElement !== container) {
      container.appendChild(node.term.element);
    }

    container.addEventListener('mousedown', () => _onFocus(node.sessionId));
    // Fit after paint.
    requestAnimationFrame(() => { node.fit.fit(); node.term.focus(); });
    return;
  }

  // Split node — build a two-cell grid.
  renderSplit(node, container, _onFocus);
}

function renderSplit(
  split: PaneSplit,
  container: HTMLElement,
  _onFocus: (sessionId: string) => void,
): void {
  container.className = split.dir === 'h' ? 'split split-h' : 'split split-v';

  const cellA = document.createElement('div');
  const divider = document.createElement('div');
  const cellB = document.createElement('div');

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
  if (node.kind === 'leaf') {
    node.fit.fit();
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
  workspace: HTMLElement,
): Promise<{ newRoot: PaneNode; newLeaf: PaneLeaf }> {
  const container = document.createElement('div');
  container.className = 'pane';
  // We need the leaf's DOM element — temporarily append to workspace off-screen.
  workspace.appendChild(container);

  const newLeaf = await createSession(container);

  const newRoot = replaceLeaf(root, activeSessionId, {
    kind: 'split',
    dir,
    ratio: 0.5,
    a: findLeaf(root, activeSessionId)!,
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
  if (leaf) await destroySession(leaf);
  return pruneLeaf(root, removeId);
}

function replaceLeaf(node: PaneNode, id: string, replacement: PaneNode): PaneNode {
  if (node.kind === 'leaf') return node.sessionId === id ? replacement : node;
  return { ...node, a: replaceLeaf(node.a, id, replacement), b: replaceLeaf(node.b, id, replacement) };
}

function pruneLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.kind === 'leaf') return node.sessionId === id ? null : node;
  const a = pruneLeaf(node.a, id);
  const b = pruneLeaf(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return { ...node, a, b };
}

// ─── Wiring helpers ───────────────────────────────────────────────────────────

/** Hooks write + resize on a leaf to its backend session. */
export function wireLeaf(leaf: PaneLeaf): void {
  leaf.term.onData(data => Write(leaf.sessionId, data));
  leaf.term.onResize(({ cols, rows }) => Resize(leaf.sessionId, cols, rows));

  // Shell exited — notify via a DOM event so main.ts can handle tab close.
  EventsOn('terminal-exit:' + leaf.sessionId, () => {
    leaf.el.dispatchEvent(new CustomEvent('session-exit', {
      bubbles: true,
      detail: { sessionId: leaf.sessionId },
    }));
  });
}
