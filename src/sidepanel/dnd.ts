/**
 * Drag-and-drop setup for the side panel. Uses @atlaskit/pragmatic-drag-and-drop
 * for internal drags (tab reorder, cross-group, group reorder) and native HTML5
 * drag events for external drops (Chrome tab dragged from the tab strip).
 */
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { WindowState } from '$shared/types';
import { sendMessage } from '$shared/messages';
import { isSafeNavigationUrl } from '$shared/url';

// ---------- Drag source / target payloads ----------

export type DragSource =
  | { kind: 'tab'; tabRefId: string; fromGroupId: string | null }
  | { kind: 'group'; groupId: string };

export type DropTarget =
  | { kind: 'tab'; groupId: string | null; tabRefId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'untracked' };

export function makeTabDragData(tabRefId: string, fromGroupId: string | null): DragSource {
  return { kind: 'tab', tabRefId, fromGroupId };
}

export function makeGroupDragData(groupId: string): DragSource {
  return { kind: 'group', groupId };
}

export function makeTabDropData(groupId: string | null, tabRefId: string): DropTarget {
  return { kind: 'tab', groupId, tabRefId };
}

export function makeGroupDropData(groupId: string): DropTarget {
  return { kind: 'group', groupId };
}

export function makeUntrackedDropData(): DropTarget {
  return { kind: 'untracked' };
}

function isDragSource(value: unknown): value is DragSource {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: unknown };
  return v.kind === 'tab' || v.kind === 'group';
}

function isDropTarget(value: unknown): value is DropTarget {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: unknown };
  return v.kind === 'tab' || v.kind === 'group' || v.kind === 'untracked';
}

// ---------- Global monitor ----------

/**
 * Install the global drag monitor. Returns an unsubscribe function.
 * `getWindow` returns the currently displayed WindowState (or null) — used
 * to resolve indexes during drop.
 */
export function setupGlobalDnD(getWindow: () => WindowState | null): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    monitorForElements({
      onDrop({ source, location }) {
        const window = getWindow();
        if (!window) return;
        const sourceData = source.data;
        if (!isDragSource(sourceData)) return;

        const dropTargets = location.current.dropTargets;
        if (dropTargets.length === 0) return;
        // Use the innermost (most specific) drop target.
        const target = dropTargets[0];
        const targetData = target.data;
        if (!isDropTarget(targetData)) return;

        const edge = extractClosestEdge(targetData as Record<string, unknown>);

        if (sourceData.kind === 'group') {
          handleGroupDrop(window, sourceData, targetData, edge);
        } else if (sourceData.kind === 'tab') {
          handleTabDrop(window, sourceData, targetData, edge);
        }
      },
    }),
  );

  // Native external drops (Chrome tab drag from tab strip).
  cleanups.push(installExternalDropHandlers(getWindow));

  return () => {
    for (const c of cleanups) c();
  };
}

function handleGroupDrop(
  window: WindowState,
  source: Extract<DragSource, { kind: 'group' }>,
  target: DropTarget,
  edge: 'top' | 'bottom' | 'left' | 'right' | null,
): void {
  // Only group → group reorder is supported.
  if (target.kind !== 'group') return;
  if (target.groupId === source.groupId) return;

  const order = window.groups.map((g) => g.id);
  const fromIndex = order.indexOf(source.groupId);
  let toIndex = order.indexOf(target.groupId);
  if (fromIndex === -1 || toIndex === -1) return;

  // Remove source.
  order.splice(fromIndex, 1);
  // Re-find target index after removal.
  toIndex = order.indexOf(target.groupId);
  const insertIndex = edge === 'bottom' ? toIndex + 1 : toIndex;
  order.splice(insertIndex, 0, source.groupId);

  void sendMessage({
    type: 'reorderGroups',
    chromeWindowId: window.chromeWindowId,
    orderedIds: order,
  });
}

function handleTabDrop(
  window: WindowState,
  source: Extract<DragSource, { kind: 'tab' }>,
  target: DropTarget,
  edge: 'top' | 'bottom' | 'left' | 'right' | null,
): void {
  if (target.kind === 'group') {
    // Dropping a tab on a group header → append to that group.
    if (source.fromGroupId === target.groupId) return;
    const targetGroup = window.groups.find((g) => g.id === target.groupId);
    if (!targetGroup) return;
    void sendMessage({
      type: 'moveTab',
      chromeWindowId: window.chromeWindowId,
      tabRefId: source.tabRefId,
      fromGroupId: source.fromGroupId,
      toGroupId: target.groupId,
      toIndex: targetGroup.tabs.length,
    });
    return;
  }

  if (target.kind === 'untracked') {
    void sendMessage({
      type: 'moveTab',
      chromeWindowId: window.chromeWindowId,
      tabRefId: source.tabRefId,
      fromGroupId: source.fromGroupId,
      toGroupId: null,
      toIndex: window.untrackedTabs.length,
    });
    return;
  }

  if (target.kind === 'tab') {
    // Insert before / after target tab.
    const container =
      target.groupId === null
        ? window.untrackedTabs
        : window.groups.find((g) => g.id === target.groupId)?.tabs;
    if (!container) return;

    const targetIndex = container.findIndex((t) => t.id === target.tabRefId);
    if (targetIndex === -1) return;

    // Same-container reorder: account for source index removal.
    let insertIndex = edge === 'bottom' ? targetIndex + 1 : targetIndex;
    if (source.fromGroupId === target.groupId) {
      const sourceIndex = container.findIndex((t) => t.id === source.tabRefId);
      if (sourceIndex === -1) return;
      if (sourceIndex === insertIndex || sourceIndex === insertIndex - 1) return;
      if (sourceIndex < insertIndex) insertIndex -= 1;
    }

    void sendMessage({
      type: 'moveTab',
      chromeWindowId: window.chromeWindowId,
      tabRefId: source.tabRefId,
      fromGroupId: source.fromGroupId,
      toGroupId: target.groupId,
      toIndex: insertIndex,
    });
  }
}

// ---------- External (Chrome native tab) drops ----------

function installExternalDropHandlers(getWindow: () => WindowState | null): () => void {
  const onDragOver = (e: DragEvent) => {
    if (!hasUriDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = async (e: DragEvent) => {
    if (!hasUriDrag(e.dataTransfer)) return;
    e.preventDefault();

    const window = getWindow();
    if (!window) return;

    const url = readUri(e.dataTransfer);
    if (!url) return;

    // Determine target group from the closest ancestor with [data-group-id].
    // If the drop wasn't on a specific group, ignore — there is no "default"
    // group anymore; the user drags onto a group explicitly.
    const targetEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-group-id]');
    const groupId = targetEl?.dataset.groupId;
    if (!groupId) return;

    // chromeTabId resolution happens in the SW where chrome.tabs is available.
    await sendMessage({
      type: 'addUrlToGroup',
      chromeWindowId: window.chromeWindowId,
      groupId,
      url,
    });
  };

  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  return () => {
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('drop', onDrop);
  };
}

function hasUriDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return dt.types.includes('text/uri-list') || dt.types.includes('text/plain');
}

function readUri(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  const list = dt.getData('text/uri-list');
  if (list) {
    // text/uri-list may contain comments (lines starting with #) and multiple
    // URIs; take the first non-comment safe URL.
    for (const line of list.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (isSafeNavigationUrl(trimmed)) return trimmed;
    }
  }
  const plain = dt.getData('text/plain').trim();
  if (plain && isSafeNavigationUrl(plain)) return plain;
  return null;
}
