/**
 * Chrome tab/window event handlers. Spec §6.1-6.8.
 *
 * Concurrency model:
 *   - All AppData mutations go through the shared serialized queue
 *     (write-queue.ts). Both tab events AND UI commands serialize on this
 *     queue, so they cannot race on read-modify-write.
 *   - Window creation establishes an event buffer SYNCHRONOUSLY in
 *     handleWindowCreated before any await, so subsequent tab events for
 *     that window correctly defer until window matching completes.
 */
import {
  getSessionState,
  updateSessionState,
} from '$shared/storage';
import type { TabRef, WindowState } from '$shared/types';
import { uuid } from '$shared/id';
import { withAppData } from './write-queue';
import { cleanupEmptyAutoGroups } from './group-cleanup';
import {
  matchWindows,
  cleanupOrphans,
  type ChromeWindowSnapshot,
} from './window-matcher';

const PENDING_OPEN_TTL_MS = 10_000;
const PENDING_OPEN_MAX_ENTRIES = 100;
const NEW_WINDOW_SETTLE_MS = 500;
const UNKNOWN_WINDOW_RETRY_MS = 600;
const MAX_UNKNOWN_WINDOW_RETRIES = 3;
const PENDING_ROUTE_TTL_MS = 1_000;

// ---------- Pending "next new tab in this window goes to group X" route ----------

/**
 * Set synchronously by message-handlers' newTabInGroup BEFORE it calls
 * chrome.tabs.create, so handleTabCreated can route the resulting TabRef
 * straight into the target group instead of the default untrackedTabs.
 *
 * In-memory (not session storage): the SW lifetime is the only window where
 * this matters. Auto-expires after PENDING_ROUTE_TTL_MS to prevent a stale
 * route from catching an unrelated user-initiated tab.
 */
const pendingNewTabRoute = new Map<number /* chromeWindowId */, string /* groupId */>();

export function reserveNewTabRoute(chromeWindowId: number, groupId: string): void {
  pendingNewTabRoute.set(chromeWindowId, groupId);
  setTimeout(() => {
    if (pendingNewTabRoute.get(chromeWindowId) === groupId) {
      pendingNewTabRoute.delete(chromeWindowId);
    }
  }, PENDING_ROUTE_TTL_MS);
}

// ---------- Event buffer for new windows ----------

/**
 * Per chromeWindowId queue of deferred event-replays. handleWindowCreated owns
 * this map: it sets the key synchronously on entry and clears it on flush.
 * Other handlers only push when isBuffering() returns true.
 */
const windowBuffers = new Map<number, Array<() => Promise<void>>>();

function isBuffering(chromeWindowId: number): boolean {
  return windowBuffers.has(chromeWindowId);
}

function bufferEvent(chromeWindowId: number, fn: () => Promise<void>): void {
  // Precondition: isBuffering(chromeWindowId) is true. Caller checks.
  windowBuffers.get(chromeWindowId)!.push(fn);
}

async function flushBuffer(chromeWindowId: number): Promise<void> {
  const list = windowBuffers.get(chromeWindowId);
  windowBuffers.delete(chromeWindowId);
  if (!list) return;
  for (const fn of list) {
    try {
      await fn();
    } catch (e) {
      console.error('[side-tab] buffered event replay failed', e);
    }
  }
}

// ---------- Internal lookups ----------

function findWindowStateByChromeId(
  data: { windows: Record<string, WindowState> },
  chromeWindowId: number,
): WindowState | null {
  for (const state of Object.values(data.windows)) {
    if (state.chromeWindowId === chromeWindowId) return state;
  }
  return null;
}

interface TabLocation {
  state: WindowState;
  group: { id: string; tabs: TabRef[] } | null; // null means untrackedTabs
  tabRef: TabRef;
}

function findTabByChromeId(
  data: { windows: Record<string, WindowState> },
  chromeTabId: number,
): TabLocation | null {
  for (const state of Object.values(data.windows)) {
    const inState = findTabByChromeIdInState(state, chromeTabId);
    if (inState) return { state, group: inState.group, tabRef: inState.tabRef };
  }
  return null;
}

function findTabByChromeIdInState(
  state: WindowState,
  chromeTabId: number,
): { group: { id: string; tabs: TabRef[] } | null; tabRef: TabRef } | null {
  for (const group of state.groups) {
    for (const tab of group.tabs) {
      if (tab.chromeTabId === chromeTabId) return { group, tabRef: tab };
    }
  }
  for (const tab of state.untrackedTabs) {
    if (tab.chromeTabId === chromeTabId) return { group: null, tabRef: tab };
  }
  return null;
}

function updateFingerprint(state: WindowState): void {
  const urls: string[] = [];
  for (const group of state.groups) {
    for (const t of group.tabs) {
      if (t.chromeTabId !== null && t.url) urls.push(t.url);
    }
  }
  for (const t of state.untrackedTabs) {
    if (t.chromeTabId !== null && t.url) urls.push(t.url);
  }
  state.fingerprint = urls;
  state.fingerprintUpdatedAt = Date.now();
}

// ---------- Pending opens ----------

function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

async function peekPendingOpen(url: string): Promise<string | null> {
  if (isUnsafeKey(url)) return null;
  const state = await getSessionState();
  const entry = state.pendingOpens[url];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PENDING_OPEN_TTL_MS) return null;
  return entry.tabRefId;
}

async function consumePendingOpenEntry(url: string): Promise<void> {
  if (isUnsafeKey(url)) return;
  await updateSessionState((s) => {
    delete s.pendingOpens[url];
  });
}

export async function registerPendingOpen(url: string, tabRefId: string): Promise<void> {
  if (isUnsafeKey(url)) return;
  await updateSessionState((s) => {
    s.pendingOpens[url] = { tabRefId, timestamp: Date.now() };
    // Cap the map size by evicting oldest entries.
    const entries = Object.entries(s.pendingOpens);
    if (entries.length > PENDING_OPEN_MAX_ENTRIES) {
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const overflow = entries.length - PENDING_OPEN_MAX_ENTRIES;
      for (let i = 0; i < overflow; i++) {
        delete s.pendingOpens[entries[i][0]];
      }
    }
  });
}

export async function gcPendingOpens(): Promise<void> {
  const state = await getSessionState();
  const now = Date.now();
  const expired = Object.entries(state.pendingOpens).filter(
    ([, v]) => now - v.timestamp > PENDING_OPEN_TTL_MS,
  );
  if (expired.length === 0) return;
  await updateSessionState((s) => {
    for (const [k] of expired) delete s.pendingOpens[k];
  });
}

// ---------- Tab handlers ----------

export async function handleTabCreated(
  tab: chrome.tabs.Tab,
  retriesLeft = MAX_UNKNOWN_WINDOW_RETRIES,
): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) return;
  const chromeTabId = tab.id;
  const chromeWindowId = tab.windowId;

  // Synchronous buffer check — must come before any await.
  if (isBuffering(chromeWindowId)) {
    bufferEvent(chromeWindowId, () => handleTabCreated(tab));
    return;
  }

  // Prefer pendingUrl: when a tab is created via chrome.tabs.create({url:X}),
  // onCreated typically fires with pendingUrl=X and url='' (or
  // 'chrome://newtab/'). Using ?? would lock us to the empty string and break
  // pendingOpens lookup (which is why clicking a saved tab used to spawn a
  // new entry instead of relinking the existing one).
  const url = tab.pendingUrl || tab.url || '';
  const title = tab.title || url;

  // Peek pendingOpens (do not consume yet — we only consume on commit so a
  // failed lookup leaves the entry intact for the next attempt).
  const pendingTabRefId = url ? await peekPendingOpen(url) : null;

  let consumePending = false;
  let retry = false;

  await withAppData((data) => {
    const state = findWindowStateByChromeId(data, chromeWindowId);
    if (!state) {
      // Window not yet established. Schedule a delayed retry; do NOT create
      // a placeholder WindowState here (would race with handleWindowCreated's
      // matching path).
      retry = true;
      return;
    }

    if (pendingTabRefId) {
      // Re-link an existing saved TabRef (the tab was reopened via §6.4).
      for (const g of state.groups) {
        const found = g.tabs.find((t) => t.id === pendingTabRefId);
        if (found) {
          found.chromeTabId = chromeTabId;
          if (title) found.title = title;
          if (tab.favIconUrl) found.favIconUrl = tab.favIconUrl;
          updateFingerprint(state);
          consumePending = true;
          return;
        }
      }
      // Fall through if TabRef no longer exists; treat as a brand-new tab.
    }

    // Recovery (matchWindows) may have pre-populated a TabRef for this same
    // Chrome tab when the SW was waking up. Claim it instead of duplicating.
    const existing = findTabByChromeIdInState(state, chromeTabId);
    if (existing) {
      if (url) existing.tabRef.url = url;
      if (title) existing.tabRef.title = title;
      if (tab.favIconUrl) existing.tabRef.favIconUrl = tab.favIconUrl;
      updateFingerprint(state);
      return;
    }

    const newRef: TabRef = {
      id: uuid(),
      url,
      title,
      favIconUrl: tab.favIconUrl,
      chromeTabId,
      addedAt: Date.now(),
    };

    // If newTabInGroup reserved a route for this window, place the TabRef
    // directly into the target group. Single-use: consume on first match.
    const routedGroupId = pendingNewTabRoute.get(chromeWindowId);
    if (routedGroupId) {
      const target = state.groups.find((g) => g.id === routedGroupId);
      if (target) {
        pendingNewTabRoute.delete(chromeWindowId);
        target.tabs.push(newRef);
        updateFingerprint(state);
        return;
      }
      // Group no longer exists (deleted in the brief window): fall through.
      pendingNewTabRoute.delete(chromeWindowId);
    }

    // Default: new tabs land in untrackedTabs; users drag them into groups
    // manually.
    state.untrackedTabs.push(newRef);
    updateFingerprint(state);
  });

  if (consumePending && url) {
    await consumePendingOpenEntry(url);
  }

  if (retry) {
    if (retriesLeft > 0) {
      setTimeout(() => {
        void handleTabCreated(tab, retriesLeft - 1);
      }, UNKNOWN_WINDOW_RETRY_MS);
    } else {
      console.warn(
        `[side-tab] handleTabCreated dropped: window ${chromeWindowId} not established after retries`,
      );
    }
  }
}

export async function handleTabRemoved(
  chromeTabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo,
): Promise<void> {
  if (isBuffering(removeInfo.windowId)) {
    bufferEvent(removeInfo.windowId, () => handleTabRemoved(chromeTabId, removeInfo));
    return;
  }

  await withAppData((data) => {
    // Sweep all TabRefs with this chromeTabId, not just the first found.
    // (addUrlToGroup tries to prevent duplicates, but partial restores can
    // still produce them.)
    for (const state of Object.values(data.windows)) {
      let changed = false;
      for (const group of state.groups) {
        const before = group.tabs.length;
        group.tabs = group.tabs.filter((t) => {
          if (t.chromeTabId !== chromeTabId) return true;
          if (t.pinned) {
            // Pinned: retain as saved (chromeTabId → null, URL preserved).
            t.chromeTabId = null;
            return true;
          }
          // Unpinned: drop from the group entirely.
          return false;
        });
        if (group.tabs.length !== before) changed = true;
      }
      // Untracked tabs are live-only and have no pin concept; drop them.
      const beforeUntracked = state.untrackedTabs.length;
      state.untrackedTabs = state.untrackedTabs.filter((t) => t.chromeTabId !== chromeTabId);
      if (state.untrackedTabs.length !== beforeUntracked) changed = true;
      if (changed) {
        cleanupEmptyAutoGroups(state);
        updateFingerprint(state);
      }
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
  if (tab.windowId !== undefined && isBuffering(tab.windowId)) {
    bufferEvent(tab.windowId, () => handleTabUpdated(chromeTabId, changeInfo, tab));
    return;
  }

  await withAppData((data) => {
    const loc = findTabByChromeId(data, chromeTabId);
    if (!loc) return;
    if (tab.url) loc.tabRef.url = tab.url;
    if (tab.title) loc.tabRef.title = tab.title;
    if (tab.favIconUrl) loc.tabRef.favIconUrl = tab.favIconUrl;
    updateFingerprint(loc.state);
  });
}

export async function handleTabAttached(
  chromeTabId: number,
  attachInfo: chrome.tabs.TabAttachInfo,
): Promise<void> {
  // Tab moved to another Chrome window. Per the per-window model, the tab
  // leaves its current group and joins the target window's untrackedTabs.
  await withAppData((data) => {
    // Find the TabRef regardless of which window it currently belongs to.
    const loc = findTabByChromeId(data, chromeTabId);
    if (loc) {
      const moving = loc.tabRef;
      if (loc.group) {
        loc.group.tabs = loc.group.tabs.filter((t) => t.id !== moving.id);
      } else {
        loc.state.untrackedTabs = loc.state.untrackedTabs.filter((t) => t.id !== moving.id);
      }
      cleanupEmptyAutoGroups(loc.state);
      updateFingerprint(loc.state);

      const target = findWindowStateByChromeId(data, attachInfo.newWindowId);
      if (target) {
        // moving.chromeTabId is already chromeTabId; we just relocate the TabRef.
        target.untrackedTabs.push(moving);
        updateFingerprint(target);
      }
      // If target unknown, the tab will be picked up by future matching.
      return;
    }

    // Defensive: even if we have no record of this tab, ensure no stale
    // chromeTabId entries point at it.
    for (const state of Object.values(data.windows)) {
      for (const group of state.groups) {
        for (const t of group.tabs) {
          if (t.chromeTabId === chromeTabId) t.chromeTabId = null;
        }
      }
      const before = state.untrackedTabs.length;
      state.untrackedTabs = state.untrackedTabs.filter((t) => t.chromeTabId !== chromeTabId);
      if (state.untrackedTabs.length !== before) updateFingerprint(state);
    }
  });
}

// ---------- Window handlers ----------

export function handleWindowCreated(window: chrome.windows.Window): void {
  if (window.id === undefined) return;
  const chromeWindowId = window.id;

  // SYNCHRONOUSLY install the buffer before scheduling the async work, so
  // any onCreated/onUpdated/onRemoved that fires while we are matching is
  // queued instead of processed against a missing WindowState.
  if (!windowBuffers.has(chromeWindowId)) {
    windowBuffers.set(chromeWindowId, []);
  }

  setTimeout(async () => {
    try {
      const tabs = await chrome.tabs.query({ windowId: chromeWindowId });
      const snapshot: ChromeWindowSnapshot = {
        chromeWindowId,
        tabs: tabs
          .filter((t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined)
          .map((t) => ({
            chromeTabId: t.id,
            url: t.url ?? t.pendingUrl ?? '',
            title: t.title ?? '',
            favIconUrl: t.favIconUrl,
          })),
      };

      await withAppData((data) => {
        if (findWindowStateByChromeId(data, chromeWindowId)) return;
        matchWindows(data, [snapshot]);
      });
    } finally {
      await flushBuffer(chromeWindowId);
    }
  }, NEW_WINDOW_SETTLE_MS);
}

export async function handleWindowRemoved(chromeWindowId: number): Promise<void> {
  await withAppData((data) => {
    const state = findWindowStateByChromeId(data, chromeWindowId);
    if (!state) return;
    state.chromeWindowId = null;
    // chromeTabIds in groups become stale; mark them saved.
    for (const group of state.groups) {
      for (const t of group.tabs) t.chromeTabId = null;
    }
    // untrackedTabs are live-only by design (spec §4 / §6.6: rebind populates
    // them fresh from the snapshot). The persisted fingerprint preserves
    // their URLs for the next match.
    state.untrackedTabs = [];
    state.fingerprintUpdatedAt = Date.now();
  });
}

// ---------- Startup recovery ----------

let recoverOnceP: Promise<void> | null = null;

async function snapshotAllWindows(): Promise<ChromeWindowSnapshot[]> {
  const chromeWindows = await chrome.windows.getAll({ populate: true });
  return chromeWindows
    .filter((w): w is chrome.windows.Window & { id: number } => w.id !== undefined)
    .map((w) => ({
      chromeWindowId: w.id,
      tabs: (w.tabs ?? [])
        .filter((t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined)
        .map((t) => ({
          chromeTabId: t.id,
          url: t.pendingUrl || t.url || '',
          title: t.title || '',
          favIconUrl: t.favIconUrl,
        })),
    }));
}

/**
 * Match against all currently-open Chrome windows. Idempotent per SW lifetime:
 * multiple calls share one promise so we don't run matching repeatedly on
 * every cold wake.
 */
export function recoverOnStartup(): Promise<void> {
  if (recoverOnceP) return recoverOnceP;
  recoverOnceP = (async () => {
    const snapshots = await snapshotAllWindows();
    await withAppData((data) => {
      matchWindows(data, snapshots);
      cleanupOrphans(data);
    });
  })();
  return recoverOnceP;
}

export function recoverOnInstall(): Promise<void> {
  // First install: same logic as startup.
  return recoverOnStartup();
}

// Exposed for tests
export const __testing__ = {
  windowBuffers,
  flushBuffer,
  findWindowStateByChromeId,
  findTabByChromeId,
  resetRecover: () => {
    recoverOnceP = null;
  },
};
