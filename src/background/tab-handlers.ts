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
import { getSessionMirror } from '$shared/storage';
import { withSessionData, withWindow, cancelMirrorFlush } from './write-queue';
import { cleanupEmptyAutoGroups } from './group-cleanup';
import {
  matchWindows,
  rebindWindow,
  tabRefFromReopened,
  WINDOW_MATCH_THRESHOLD,
  type ReopenedTab,
  type ReopenedWindow,
} from './session-restore';

const PENDING_ROUTE_TTL_MS = 5_000;

// ---------- Pending tab-creation slots ----------
//
// When the SW deliberately creates Chrome tab(s) on behalf of a UI command
// (the "+" button in a group; "open Stash folder as group"; "open Stash item
// in new tab"), it pushes one slot per tab here so the resulting onCreated
// event(s) can pick up the metadata in FIFO order.
//
// A slot carries optional `groupId` (where to route the new TabRef — default
// is untrackedTabs) and optional `name` (alias to attach to the new TabRef).
interface PendingSlot {
  groupId?: string;
  name?: string;
}

interface PendingQueue {
  slots: PendingSlot[];
  expiresAt: number;
}
const pendingTabQueue = new Map<ChromeWindowId, PendingQueue>();

function refreshExpiry(entry: PendingQueue): void {
  entry.expiresAt = Date.now() + Math.max(entry.slots.length, 1) * PENDING_ROUTE_TTL_MS;
}

export function pushPendingTabSlots(
  chromeWindowId: ChromeWindowId,
  slots: PendingSlot[],
): void {
  if (slots.length === 0) return;
  let entry = pendingTabQueue.get(chromeWindowId);
  if (entry && Date.now() <= entry.expiresAt) {
    entry.slots.push(...slots);
    refreshExpiry(entry);
  } else {
    entry = { slots: [...slots], expiresAt: 0 };
    refreshExpiry(entry);
    pendingTabQueue.set(chromeWindowId, entry);
  }
  // Auto-cleanup if some onCreated events never arrive (e.g., chrome.tabs.create
  // rejected, or the user closed the target window mid-stream).
  const expiresAtSnapshot = entry.expiresAt;
  setTimeout(
    () => {
      const cur = pendingTabQueue.get(chromeWindowId);
      if (cur && cur.expiresAt <= expiresAtSnapshot && Date.now() >= cur.expiresAt) {
        pendingTabQueue.delete(chromeWindowId);
      }
    },
    Math.max(slots.length, 1) * PENDING_ROUTE_TTL_MS + 100,
  );
}

export function reservePendingTabRoute(
  chromeWindowId: ChromeWindowId,
  groupId: string,
  count: number,
): void {
  const slots: PendingSlot[] = Array.from({ length: count }, () => ({ groupId }));
  pushPendingTabSlots(chromeWindowId, slots);
}

export function reservePendingTabAlias(
  chromeWindowId: ChromeWindowId,
  name: string,
): void {
  pushPendingTabSlots(chromeWindowId, [{ name }]);
}

function consumePendingSlot(chromeWindowId: ChromeWindowId): PendingSlot | null {
  const entry = pendingTabQueue.get(chromeWindowId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingTabQueue.delete(chromeWindowId);
    return null;
  }
  const slot = entry.slots.shift();
  if (entry.slots.length === 0) {
    pendingTabQueue.delete(chromeWindowId);
  }
  return slot ?? null;
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
    const slot = consumePendingSlot(chromeWindowId);

    // Already known? (Recovery may have pre-populated; or this event is a
    // duplicate.) Refresh fields rather than creating a duplicate TabRef.
    const existing = findTabInState(state, chromeTabId);
    if (existing) {
      const url = tab.pendingUrl || tab.url || existing.tab.url;
      if (url) existing.tab.url = url;
      if (tab.title) existing.tab.title = tab.title;
      if (tab.favIconUrl) existing.tab.favIconUrl = tab.favIconUrl;
      if (slot?.name) existing.tab.name = slot.name;
      return;
    }

    const newRef = makeTabRef({ ...tab, id: chromeTabId });
    if (slot?.name) newRef.name = slot.name;

    // If a route was reserved (newTabInGroup or openStashFolderAsGroup),
    // place the TabRef into the target group.
    if (slot?.groupId) {
      const target = state.groups.find((g) => g.id === slot.groupId);
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
  // Clear any pending slots for the dead window.
  pendingTabQueue.delete(chromeWindowId);
}

// ---------- Startup recovery ----------

let recoverOncePromise: Promise<void> | null = null;

/**
 * Build WindowStates for every currently-open Chrome window, rehydrating group
 * structure from the cross-restart mirror where the reopened tabs match.
 *
 * Idempotent per SW lifetime (one shared promise). Across SW recycles within a
 * browser session it must NOT clobber live session state, so it only rebuilds
 * from the mirror on the first run of a browser session (detected via
 * `SessionData.rehydratedAt`, which is wiped on restart but survives recycling).
 * On the first run it overwrites authoritatively — `chrome.windows.getAll`
 * yields the full live tab set, so the result is correct even if onCreated raced
 * ahead and pre-populated a window with untracked-only tabs.
 */
export function recoverOnStartup(): Promise<void> {
  if (recoverOncePromise) return recoverOncePromise;
  const run = (async () => {
    const [mirror, chromeWindows] = await Promise.all([
      getSessionMirror(),
      chrome.windows.getAll({ populate: true }),
    ]);

    const reopened: ReopenedWindow[] = [];
    for (const w of chromeWindows) {
      if (w.id === undefined) continue;
      const tabs: ReopenedTab[] = (w.tabs ?? [])
        .filter((t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined)
        .map((t) => ({
          chromeTabId: t.id,
          url: t.url || t.pendingUrl || '',
          title: t.title || '',
          favIconUrl: t.favIconUrl,
        }));
      reopened.push({ id: w.id, tabs });
    }

    await withSessionData((data) => {
      const freshSession = data.rehydratedAt === undefined;
      // Window matching runs ONLY on the first run of a browser session. On a
      // mid-session SW wake we must never re-match: a window opened while the SW
      // was dead must not inherit a copy of another window's groups (spec §0/§2,
      // "运行期开新窗口完全不做匹配"). Such windows are seeded as plain untracked.
      const matches = freshSession
        ? matchWindows(reopened, mirror.windows, WINDOW_MATCH_THRESHOLD)
        : null;
      for (const w of reopened) {
        // Mid-session wake: leave already-tracked windows untouched.
        if (!freshSession && data.windows[w.id]) continue;
        const mw = matches?.get(w.id) ?? null;
        data.windows[w.id] = mw
          ? rebindWindow(w, mw)
          : {
              chromeWindowId: w.id,
              groups: [],
              untrackedTabs: w.tabs.map((t) => tabRefFromReopened(t)),
            };
      }
      // `rehydratedAt` and the window rebuild MUST be written in this same
      // setSessionData (one callback) — setting the marker in a separate/earlier
      // write would reintroduce clobber-on-recycle.
      if (freshSession) data.rehydratedAt = Date.now();
    });

    // Don't let rehydration's own session write echo back into the mirror: we
    // only *read* the mirror to rebuild state, and re-projecting that
    // (necessarily lossy — dropped non-reopened windows, redirected tabs) over
    // the good mirror would degrade the next restart. The mirror is rewritten
    // only by genuine post-startup mutations.
    cancelMirrorFlush();
  })();
  // Don't cache a rejected promise for the SW's lifetime — a transient
  // getAll/storage failure would otherwise permanently disable recovery. Allow a
  // later trigger to retry.
  run.catch(() => {
    if (recoverOncePromise === run) recoverOncePromise = null;
  });
  recoverOncePromise = run;
  return run;
}

export function recoverOnInstall(): Promise<void> {
  return recoverOnStartup();
}

// Exposed for tests.
export const __testing__ = {
  pendingTabQueue,
  consumePendingSlot,
  resetRecover: () => {
    recoverOncePromise = null;
  },
};
