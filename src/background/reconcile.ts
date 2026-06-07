/**
 * Reconciliation: re-establish the invariants between SessionData and the real
 * Chrome tab set. The per-event handlers assume every tab disappearance arrives
 * as exactly one successfully-handled event; any missed event (SW killed
 * mid-dispatch, unlistened onReplaced in older builds, cross-window duplicate
 * TabRefs) leaves a "ghost" row in the side panel that can never be closed.
 * This sweep is the self-healing backstop: it runs on every SW cold start
 * (see tab-handlers.recoverOnStartup) and restores three invariants:
 *
 *   1. Every TabRef.chromeTabId refers to a live Chrome tab.
 *   2. A chromeTabId is tracked by exactly one TabRef.
 *   3. A TabRef lives in the WindowState of the window its tab is actually in.
 *
 * Pure with respect to chrome.*: callers pass the live tab set in.
 */
import type { SessionData, TabRef, WindowState } from '$shared/types';
import { cleanupEmptyAutoGroups } from './group-cleanup';

export interface LiveTabInfo {
  chromeTabId: number;
  chromeWindowId: number;
}

export interface ReconcileStats {
  deadTabsRemoved: number;
  duplicatesRemoved: number;
  tabsMigrated: number;
  deadWindowsRemoved: number;
  emptyAutoGroupsRemoved: number;
}

export function reconcileChangeCount(stats: ReconcileStats): number {
  return (
    stats.deadTabsRemoved +
    stats.duplicatesRemoved +
    stats.tabsMigrated +
    stats.deadWindowsRemoved +
    stats.emptyAutoGroupsRemoved
  );
}

interface Candidate {
  ref: TabRef;
  chromeWindowId: number;
  inGroup: boolean;
}

/** Mutates `data` in place; returns what changed. */
export function reconcileSessionData(
  data: SessionData,
  liveTabs: LiveTabInfo[],
): ReconcileStats {
  const stats: ReconcileStats = {
    deadTabsRemoved: 0,
    duplicatesRemoved: 0,
    tabsMigrated: 0,
    deadWindowsRemoved: 0,
    emptyAutoGroupsRemoved: 0,
  };

  const windowOfTab = new Map<number, number>();
  const liveWindowIds = new Set<number>();
  for (const t of liveTabs) {
    windowOfTab.set(t.chromeTabId, t.chromeWindowId);
    liveWindowIds.add(t.chromeWindowId);
  }

  // 1. Drop WindowStates for windows that no longer exist (missed
  //    windows.onRemoved). A live window's state holds at least the live tabs'
  //    window ids; anything else is dead.
  for (const key of Object.keys(data.windows)) {
    const id = Number(key);
    if (!liveWindowIds.has(id)) {
      delete data.windows[id];
      stats.deadWindowsRemoved++;
    }
  }

  // 2. Drop TabRefs whose chromeTabId is not alive (missed onRemoved /
  //    onReplaced).
  for (const state of Object.values(data.windows)) {
    for (const g of state.groups) {
      const before = g.tabs.length;
      g.tabs = g.tabs.filter((t) => windowOfTab.has(t.chromeTabId));
      stats.deadTabsRemoved += before - g.tabs.length;
    }
    const before = state.untrackedTabs.length;
    state.untrackedTabs = state.untrackedTabs.filter((t) => windowOfTab.has(t.chromeTabId));
    stats.deadTabsRemoved += before - state.untrackedTabs.length;
  }

  // 3. Collect every remaining TabRef per chromeTabId (visit groups before
  //    untracked so the tie-break below prefers organized rows).
  const candidates = new Map<number, Candidate[]>();
  const add = (ref: TabRef, chromeWindowId: number, inGroup: boolean) => {
    const list = candidates.get(ref.chromeTabId);
    const cand = { ref, chromeWindowId, inGroup };
    if (list) list.push(cand);
    else candidates.set(ref.chromeTabId, [cand]);
  };
  for (const state of Object.values(data.windows)) {
    for (const g of state.groups) for (const t of g.tabs) add(t, state.chromeWindowId, true);
    for (const t of state.untrackedTabs) add(t, state.chromeWindowId, false);
  }

  // 4. Resolve duplicates and misplacements. Winner preference: tracked in the
  //    tab's actual window (weight 2) > sitting inside a group (weight 1) >
  //    encountered first. Losers are removed; a winner tracked in the wrong
  //    window migrates to the actual window's untracked list.
  const losers = new Set<TabRef>();
  const migrations: Array<{ ref: TabRef; toWindowId: number }> = [];
  for (const [chromeTabId, list] of candidates) {
    const actualWindowId = windowOfTab.get(chromeTabId)!;
    let winner = list[0];
    if (list.length > 1) {
      const score = (c: Candidate) =>
        (c.chromeWindowId === actualWindowId ? 2 : 0) + (c.inGroup ? 1 : 0);
      for (const c of list.slice(1)) {
        if (score(c) > score(winner)) winner = c;
      }
      for (const c of list) {
        if (c !== winner) {
          losers.add(c.ref);
          stats.duplicatesRemoved++;
        }
      }
    }
    if (winner.chromeWindowId !== actualWindowId) {
      migrations.push({ ref: winner.ref, toWindowId: actualWindowId });
    }
  }

  if (losers.size > 0 || migrations.length > 0) {
    const migrating = new Set(migrations.map((m) => m.ref));
    const drop = (t: TabRef) => losers.has(t) || migrating.has(t);
    for (const state of Object.values(data.windows)) {
      for (const g of state.groups) g.tabs = g.tabs.filter((t) => !drop(t));
      state.untrackedTabs = state.untrackedTabs.filter((t) => !drop(t));
    }
    for (const { ref, toWindowId } of migrations) {
      let target: WindowState | undefined = data.windows[toWindowId];
      if (!target) {
        target = { chromeWindowId: toWindowId, groups: [], untrackedTabs: [] };
        data.windows[toWindowId] = target;
      }
      target.untrackedTabs.push(ref);
      stats.tabsMigrated++;
    }
  }

  // 5. Removal may have emptied auto-domain groups.
  for (const state of Object.values(data.windows)) {
    stats.emptyAutoGroupsRemoved += cleanupEmptyAutoGroups(state);
  }

  return stats;
}
