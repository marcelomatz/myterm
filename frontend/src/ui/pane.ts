import { Write, Resize } from '../bridge/backend';
import { EventsOn } from '../bridge/events';
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
  if (node.kind === 'leaf') return [node];
  return [...collectLeaves(node.a), ...collectLeaves(node.b)];
}

function findLeaf(node: PaneNode, sessionId: string): PaneLeaf | null {
  if (node.kind === 'leaf') return node.sessionId === sessionId ? node : null;
  return findLeaf(node.a, sessionId) ?? findLeaf(node.b, sessionId);
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderPane(
  node: PaneNode,
  container: HTMLElement,
  _onFocus: (sessionId: string) => void,
): void {
  if (node.kind === 'leaf') {
    // ── Leaf: mount the persistent pane div into container ──────────────────
    //
    // Each session has exactly ONE persistent <div class="pane"> stored in
    // leafElMap.  We move it into `container` rather than creating/destroying
    // DOM — this prevents innerHTML='' from accidentally killing the .xterm of
    // a session that was previously rendered in the same container (e.g. when
    // switching tabs that share terminalEl).

    const leafEl = getOrCreateLeafEl(node.sessionId);

    // Clear `container` safely: remove all children EXCEPT leafEl itself
    // (in a same-tab re-render leafEl might already be a child).
    Array.from(container.children).forEach(c => { if (c !== leafEl) c.remove(); });

    // Move leafEl into container if not already there.
    if (leafEl.parentElement !== container) {
      container.appendChild(leafEl);
    }

    // Ensure class is set (may have been cleared by a previous render).
    container.className = '';
    container.style.display = 'block';
    leafEl.className = 'pane';

    if (leafEl.querySelector('.xterm')) {
      // Terminal already opened in a previous render — just re-fit and focus.
      leafEl.addEventListener('mousedown', () => _onFocus(node.sessionId), { once: true });
      requestAnimationFrame(() => { node.fit.fit(); node.term.focus(); });
    } else {
      // First render — container is live in the DOM; open the terminal now.
      // term.open() must only be called once per Terminal instance.
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
): Promise<{ newRoot: PaneNode; newLeaf: PaneLeaf }> {
  // createSession no longer calls term.open() — rendering happens lazily in
  // renderPane() when the leaf is placed into a live DOM container.
  const newLeaf = await createSession();

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
  if (leaf) {
    await destroySession(leaf);
    deleteLeafEl(removeId);
  }
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
