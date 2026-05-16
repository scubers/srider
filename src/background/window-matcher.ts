/**
 * Window re-association across browser restart. Spec §6.6.
 *
 * Chrome `windowId`s are not stable across sessions; instead, on startup we
 * compute a "fingerprint" (the URLs of the window's tabs) and greedily
 * match Chrome windows to stored WindowStates by Jaccard similarity.
 */
import type { AppData, TabRef, WindowState, WindowUUID } from '$shared/types';
import { emptyWindowState } from '$shared/types';
import { uuid } from '$shared/id';

const SIMILARITY_THRESHOLD = 0.5;
/** Stored WindowStates not seen for this long are eligible for cleanup. */
export const ORPHAN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const unionSize = setA.size + setB.size - intersection;
  if (unionSize === 0) return 0;
  return intersection / unionSize;
}

export interface ChromeWindowSnapshot {
  chromeWindowId: number;
  tabs: ChromeTabSnapshot[];
}

export interface ChromeTabSnapshot {
  chromeTabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface MatchResult {
  /** Updated AppData (returned for chaining). */
  appData: AppData;
  /** Newly created WindowState ids (had no previous match). */
  newWindowIds: WindowUUID[];
  /** Matched existing WindowState ids. */
  matchedWindowIds: WindowUUID[];
}

/**
 * Greedy match: for each Chrome window, pick the best unmatched stored
 * WindowState (Jaccard ≥ threshold). Unmatched Chrome windows create new
 * WindowStates. Stored WindowStates that don't match are left untouched
 * (their `chromeWindowId` may be stale or null).
 *
 * Returns a new AppData object; mutation is also performed in place for
 * caller convenience.
 */
export function matchWindows(appData: AppData, snapshots: ChromeWindowSnapshot[]): MatchResult {
  const newWindowIds: WindowUUID[] = [];
  const matchedWindowIds: WindowUUID[] = [];

  // Reset all chromeWindowId mappings; we will re-establish them below.
  for (const state of Object.values(appData.windows)) {
    state.chromeWindowId = null;
  }

  const availableStates = Object.values(appData.windows);
  const claimedStateIds = new Set<WindowUUID>();

  for (const snapshot of snapshots) {
    const urls = snapshot.tabs.map((t) => t.url);

    let bestState: WindowState | null = null;
    let bestScore = -1;

    for (const state of availableStates) {
      if (claimedStateIds.has(state.id)) continue;
      const score = jaccard(urls, state.fingerprint);
      if (score > bestScore) {
        bestScore = score;
        bestState = state;
      }
    }

    if (bestState && bestScore >= SIMILARITY_THRESHOLD) {
      claimedStateIds.add(bestState.id);
      bindWindowState(bestState, snapshot);
      matchedWindowIds.push(bestState.id);
    } else {
      const id = uuid();
      const state = emptyWindowState(id, snapshot.chromeWindowId);
      // No existing groups; every loaded Chrome tab goes to untrackedTabs.
      // Skip tabs whose URL hasn't settled yet — onUpdated will catch them.
      state.untrackedTabs = snapshot.tabs
        .filter((t) => t.url)
        .map(snapshotToTabRef);
      state.fingerprint = urls.filter((u) => u);
      state.fingerprintUpdatedAt = Date.now();
      appData.windows[id] = state;
      newWindowIds.push(id);
    }
  }

  return { appData, newWindowIds, matchedWindowIds };
}

/**
 * Bind a stored WindowState to a Chrome window snapshot:
 * - Update chromeWindowId
 * - For each TabRef in any group, find a matching Chrome tab by URL (in order);
 *   set chromeTabId or mark saved (null) when no match
 * - Chrome tabs not consumed go to untrackedTabs
 */
function bindWindowState(state: WindowState, snapshot: ChromeWindowSnapshot): void {
  state.chromeWindowId = snapshot.chromeWindowId;

  // Build a queue of Chrome tabs grouped by URL. Consume in FIFO order.
  const tabsByUrl = new Map<string, ChromeTabSnapshot[]>();
  for (const tab of snapshot.tabs) {
    const list = tabsByUrl.get(tab.url);
    if (list) list.push(tab);
    else tabsByUrl.set(tab.url, [tab]);
  }

  // Pass 1: assign chromeTabId for TabRefs in groups (already-loaded order).
  for (const group of state.groups) {
    for (const tabRef of group.tabs) {
      if (!tabRef.url) {
        // Group TabRefs with no URL are saved-style placeholders; can't match.
        tabRef.chromeTabId = null;
        continue;
      }
      const candidates = tabsByUrl.get(tabRef.url);
      if (candidates && candidates.length > 0) {
        const tab = candidates.shift()!;
        tabRef.chromeTabId = tab.chromeTabId;
        if (tab.title) tabRef.title = tab.title;
        if (tab.favIconUrl) tabRef.favIconUrl = tab.favIconUrl;
      } else {
        tabRef.chromeTabId = null; // becomes saved
      }
    }
  }

  // Pass 2: existing untrackedTabs: same matching logic.
  for (const tabRef of state.untrackedTabs) {
    if (!tabRef.url) {
      // Empty-URL entries are unmatchable garbage (e.g. created during a
      // brief race when a tab fired onCreated before its URL settled).
      tabRef.chromeTabId = null;
      continue;
    }
    const candidates = tabsByUrl.get(tabRef.url);
    if (candidates && candidates.length > 0) {
      const tab = candidates.shift()!;
      tabRef.chromeTabId = tab.chromeTabId;
      if (tab.title) tabRef.title = tab.title;
      if (tab.favIconUrl) tabRef.favIconUrl = tab.favIconUrl;
    } else {
      // Untracked tab no longer present — drop it (it's not a group member).
      tabRef.chromeTabId = null;
    }
  }
  // Discard untrackedTabs whose chrome tab is gone (saved orphans here are
  // dropped to avoid accumulation; "real" saved tabs live in groups).
  state.untrackedTabs = state.untrackedTabs.filter((t) => t.chromeTabId !== null);

  // Pass 3: any leftover Chrome tabs are new — add to untrackedTabs (skip
  // loading tabs whose URL hasn't settled; onUpdated will pick them up).
  for (const tabs of tabsByUrl.values()) {
    for (const tab of tabs) {
      if (!tab.url) continue;
      state.untrackedTabs.push(snapshotToTabRef(tab));
    }
  }

  // Final dedupe by chromeTabId in case a previously-broken state stored
  // duplicates from before this fix.
  const seenChromeTabIds = new Set<number>();
  state.untrackedTabs = state.untrackedTabs.filter((t) => {
    if (t.chromeTabId === null) return false;
    if (seenChromeTabIds.has(t.chromeTabId)) return false;
    seenChromeTabIds.add(t.chromeTabId);
    return true;
  });

  // Refresh fingerprint.
  state.fingerprint = snapshot.tabs.map((t) => t.url);
  state.fingerprintUpdatedAt = Date.now();
}

function snapshotToTabRef(tab: ChromeTabSnapshot): TabRef {
  return {
    id: uuid(),
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    chromeTabId: tab.chromeTabId,
    addedAt: Date.now(),
  };
}

/** Drop stored WindowStates that haven't been re-associated for ORPHAN_TTL_MS. */
export function cleanupOrphans(appData: AppData, now = Date.now()): WindowUUID[] {
  const removed: WindowUUID[] = [];
  for (const [id, state] of Object.entries(appData.windows)) {
    if (state.chromeWindowId === null && now - state.fingerprintUpdatedAt > ORPHAN_TTL_MS) {
      delete appData.windows[id];
      removed.push(id);
    }
  }
  return removed;
}
