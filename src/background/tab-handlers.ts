/**
 * Chrome tab/window event handlers. See spec §4 (interaction flows).
 *
 * Concurrency model:
 *   - All session-data mutations go through `withSessionData` / `withWindow`
 *     in write-queue.ts so tab events and UI commands serialize.
 *   - Window creation creates a fresh empty WindowState and seeds untracked
 *     from chrome.tabs.query. No fingerprint / Jaccard matching.
 *   - All chrome.* listeners must be registered synchronously at SW top level.
 */
import type { ChromeWindowId, TabRef, WindowState } from '$shared/types';
import { uuid } from '$shared/id';
import { withSessionData, withWindow } from './write-queue';
import { cleanupEmptyAutoGroups } from './group-cleanup';

const PENDING_ROUTE_TTL_MS = 5_000;

// ---------- Pending tab-creation route ----------
//
// When the SW deliberately creates Chrome tab(s) on behalf of a UI command
// (the "+" button in a group; "open Stash folder as group"), it reserves a
// route here so the resulting onCreated event(s) place the new TabRef(s)
// directly into the target group instead of the default untrackedTabs.
//
// `remaining` is the number of tabs the route should still absorb. For the
// "+" button it's 1 (single-use). For "open Stash folder as group" it's the
// number of items in the folder. Each onCreated consumes one slot.
interface PendingRoute {
  groupId: string;
  remaining: number;
  expiresAt: number;
}
const pendingTabRoute = new Map<ChromeWindowId, PendingRoute>();

export function reservePendingTabRoute(
  chromeWindowId: ChromeWindowId,
  groupId: string,
  count: number,
): void {
  const expiresAt = Date.now() + Math.max(count, 1) * PENDING_ROUTE_TTL_MS;
  pendingTabRoute.set(chromeWindowId, { groupId, remaining: count, expiresAt });
  // Auto-cleanup if some onCreated events never arrive (e.g., chrome.tabs.create
  // rejected, or the user closed the target window mid-stream).
  setTimeout(() => {
    const entry = pendingTabRoute.get(chromeWindowId);
    if (entry && entry.groupId === groupId && entry.expiresAt <= Date.now()) {
      pendingTabRoute.delete(chromeWindowId);
    }
  }, Math.max(count, 1) * PENDING_ROUTE_TTL_MS + 100);
}

function consumePendingRoute(
  chromeWindowId: ChromeWindowId,
): string | null {
  const entry = pendingTabRoute.get(chromeWindowId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingTabRoute.delete(chromeWindowId);
    return null;
  }
  const groupId = entry.groupId;
  entry.remaining -= 1;
  if (entry.remaining <= 0) {
    pendingTabRoute.delete(chromeWindowId);
  }
  return groupId;
}

// ---------- Internal helpers ----------

function findTabAcrossWindows(
  windows: Record<ChromeWindowId, WindowState>,
  chromeTabId: number,
):
  | {
      state: WindowState;
      container: TabRef[];
      tab: TabRef;
      groupId: string | null;
    }
  | null {
  for (const state of Object.values(windows)) {
    for (const group of state.groups) {
      const tab = group.tabs.find((t) => t.chromeTabId === chromeTabId);
      if (tab) return { state, container: group.tabs, tab, groupId: group.id };
    }
    const tab = state.untrackedTabs.find((t) => t.chromeTabId === chromeTabId);
    if (tab) return { state, container: state.untrackedTabs, tab, groupId: null };
  }
  return null;
}

function findTabInState(
  state: WindowState,
  chromeTabId: number,
): { container: TabRef[]; tab: TabRef; groupId: string | null } | null {
  for (const group of state.groups) {
    const tab = group.tabs.find((t) => t.chromeTabId === chromeTabId);
    if (tab) return { container: group.tabs, tab, groupId: group.id };
  }
  const tab = state.untrackedTabs.find((t) => t.chromeTabId === chromeTabId);
  if (tab) return { container: state.untrackedTabs, tab, groupId: null };
  return null;
}

function makeTabRef(tab: chrome.tabs.Tab & { id: number }): TabRef {
  const url = tab.pendingUrl || tab.url || '';
  return {
    id: uuid(),
    url,
    title: tab.title || url,
    favIconUrl: tab.favIconUrl,
    chromeTabId: tab.id,
    addedAt: Date.now(),
  };
}

// ---------- Tab handlers ----------

export async function handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) return;
  const chromeTabId = tab.id;
  const chromeWindowId = tab.windowId;

  await withWindow(chromeWindowId, (state) => {
    // Already known? (Recovery may have pre-populated; or this event is a
    // duplicate.) Refresh fields rather than creating a duplicate TabRef.
    const existing = findTabInState(state, chromeTabId);
    if (existing) {
      const url = tab.pendingUrl || tab.url || existing.tab.url;
      if (url) existing.tab.url = url;
      if (tab.title) existing.tab.title = tab.title;
      if (tab.favIconUrl) existing.tab.favIconUrl = tab.favIconUrl;
      return;
    }

    const newRef = makeTabRef({ ...tab, id: chromeTabId });

    // If a route was reserved (newTabInGroup or openStashFolderAsGroup),
    // place the TabRef into the target group.
    const routedGroupId = consumePendingRoute(chromeWindowId);
    if (routedGroupId) {
      const target = state.groups.find((g) => g.id === routedGroupId);
      if (target) {
        target.tabs.push(newRef);
        return;
      }
      // Target group disappeared — fall through to untracked.
    }

    state.untrackedTabs.push(newRef);
  });
}

export async function handleTabRemoved(
  chromeTabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo,
): Promise<void> {
  // If the whole window is closing, handleWindowRemoved will wipe the state
  // anyway. Skip per-tab cleanup to avoid useless writes.
  if (removeInfo.isWindowClosing) return;

  await withSessionData((data) => {
    // Search the specific window first (fast path), then fall back to all
    // windows for defense-in-depth against stale chromeWindowId.
    const state = data.windows[removeInfo.windowId];
    if (state) {
      const located = findTabInState(state, chromeTabId);
      if (located) {
        const idx = located.container.indexOf(located.tab);
        located.container.splice(idx, 1);
        cleanupEmptyAutoGroups(state);
        return;
      }
    }
    // Fallback sweep.
    const fallback = findTabAcrossWindows(data.windows, chromeTabId);
    if (fallback) {
      const idx = fallback.container.indexOf(fallback.tab);
      fallback.container.splice(idx, 1);
      cleanupEmptyAutoGroups(fallback.state);
    }
  });
}

export async function handleTabUpdated(
  chromeTabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): Promise<void> {
  if (changeInfo.status !== 'complete' && !changeInfo.title && !changeInfo.favIconUrl) {
    return;
  }
  if (tab.windowId === undefined) return;

  await withSessionData((data) => {
    const state = data.windows[tab.windowId];
    if (!state) return;
    const located = findTabInState(state, chromeTabId);
    if (!located) return;
    if (tab.url) located.tab.url = tab.url;
    if (tab.title) located.tab.title = tab.title;
    if (tab.favIconUrl) located.tab.favIconUrl = tab.favIconUrl;
  });
}

export async function handleTabAttached(
  chromeTabId: number,
  attachInfo: chrome.tabs.TabAttachInfo,
): Promise<void> {
  // Tab moved to another Chrome window. The TabRef leaves its current
  // container and lands in the target window's untrackedTabs.

  // If we have no prior record, we'll create a fresh TabRef in the
  // destination — fetch current url/title from Chrome so the row isn't blank.
  let liveInfo: { url: string; title: string; favIconUrl?: string } | null = null;

  await withSessionData(async (data) => {
    const located = findTabAcrossWindows(data.windows, chromeTabId);
    if (!located) {
      if (!liveInfo) {
        try {
          const t = await chrome.tabs.get(chromeTabId);
          const url = t.pendingUrl || t.url || '';
          liveInfo = { url, title: t.title || url, favIconUrl: t.favIconUrl };
        } catch {
          liveInfo = { url: '', title: '' };
        }
      }
      let target = data.windows[attachInfo.newWindowId];
      if (!target) {
        target = {
          chromeWindowId: attachInfo.newWindowId,
          groups: [],
          untrackedTabs: [],
        };
        data.windows[attachInfo.newWindowId] = target;
      }
      target.untrackedTabs.push({
        id: uuid(),
        url: liveInfo.url,
        title: liveInfo.title,
        favIconUrl: liveInfo.favIconUrl,
        chromeTabId,
        addedAt: Date.now(),
      });
      return;
    }

    // Remove from source container.
    const srcIdx = located.container.indexOf(located.tab);
    located.container.splice(srcIdx, 1);
    cleanupEmptyAutoGroups(located.state);

    // Add to destination.
    let target = data.windows[attachInfo.newWindowId];
    if (!target) {
      target = {
        chromeWindowId: attachInfo.newWindowId,
        groups: [],
        untrackedTabs: [],
      };
      data.windows[attachInfo.newWindowId] = target;
    }
    target.untrackedTabs.push(located.tab);
  });
}

// ---------- Window handlers ----------

export async function handleWindowCreated(window: chrome.windows.Window): Promise<void> {
  if (window.id === undefined) return;
  const chromeWindowId = window.id;

  // Get the tabs that already exist in this window. For brand-new windows
  // there's typically 1 (the new-tab page); for restored windows there may
  // be many. Either way we just seed untrackedTabs.
  const tabs = await chrome.tabs.query({ windowId: chromeWindowId });

  await withSessionData((data) => {
    let state = data.windows[chromeWindowId];
    if (!state) {
      state = {
        chromeWindowId,
        groups: [],
        untrackedTabs: [],
      };
      data.windows[chromeWindowId] = state;
    }
    // Merge: keep existing TabRefs that already match a chrome tab, add new ones.
    const knownChromeTabIds = new Set<number>();
    for (const group of state.groups) {
      for (const t of group.tabs) knownChromeTabIds.add(t.chromeTabId);
    }
    for (const t of state.untrackedTabs) knownChromeTabIds.add(t.chromeTabId);

    for (const t of tabs) {
      if (t.id === undefined || knownChromeTabIds.has(t.id)) continue;
      state.untrackedTabs.push(makeTabRef({ ...t, id: t.id }));
    }
  });
}

export async function handleWindowRemoved(chromeWindowId: ChromeWindowId): Promise<void> {
  await withSessionData((data) => {
    delete data.windows[chromeWindowId];
  });
  // Clear any pending route for the dead window.
  pendingTabRoute.delete(chromeWindowId);
}

// ---------- Startup recovery ----------

let recoverOncePromise: Promise<void> | null = null;

/**
 * Build WindowStates for every currently-open Chrome window. Idempotent per SW
 * lifetime: multiple calls share one promise so we don't repeat the work on
 * every cold wake.
 */
export function recoverOnStartup(): Promise<void> {
  if (recoverOncePromise) return recoverOncePromise;
  recoverOncePromise = (async () => {
    const chromeWindows = await chrome.windows.getAll({ populate: true });
    await withSessionData((data) => {
      for (const w of chromeWindows) {
        if (w.id === undefined) continue;
        if (data.windows[w.id]) continue; // already populated (e.g., onCreated raced ahead)
        const tabs = (w.tabs ?? []).filter(
          (t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined,
        );
        data.windows[w.id] = {
          chromeWindowId: w.id,
          groups: [],
          untrackedTabs: tabs.map(makeTabRef),
        };
      }
    });
  })();
  return recoverOncePromise;
}

export function recoverOnInstall(): Promise<void> {
  return recoverOnStartup();
}

// Exposed for tests.
export const __testing__ = {
  pendingTabRoute,
  consumePendingRoute,
  resetRecover: () => {
    recoverOncePromise = null;
  },
};
