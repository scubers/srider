import { describe, expect, it } from 'vitest';
import type { Group, SessionData, TabRef } from '$shared/types';
import { reconcileSessionData, type LiveTabInfo } from './reconcile';

function ref(id: string, chromeTabId: number, url = `https://${id}.com`): TabRef {
  return { id, url, title: id.toUpperCase(), chromeTabId, addedAt: 0 };
}

function group(id: string, tabs: TabRef[], kind: Group['kind'] = 'manual'): Group {
  const g: Group = { id, name: id, collapsed: false, tabs, createdAt: 0, kind };
  if (kind === 'auto-domain') g.autoDomain = `${id}.com`;
  return g;
}

function live(chromeTabId: number, chromeWindowId: number): LiveTabInfo {
  return { chromeTabId, chromeWindowId };
}

describe('reconcileSessionData', () => {
  it('removes TabRefs whose chromeTabId no longer exists (groups and untracked)', () => {
    const data: SessionData = {
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [ref('a', 1), ref('dead-in-group', 99)])],
          untrackedTabs: [ref('b', 2), ref('dead-untracked', 98)],
        },
      },
    };

    const stats = reconcileSessionData(data, [live(1, 100), live(2, 100)]);

    expect(stats.deadTabsRemoved).toBe(2);
    expect(data.windows[100].groups[0].tabs.map((t) => t.id)).toEqual(['a']);
    expect(data.windows[100].untrackedTabs.map((t) => t.id)).toEqual(['b']);
  });

  it('drops an auto-domain group emptied by dead-tab removal but keeps empty manual groups', () => {
    const data: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            group('auto', [ref('dead1', 91)], 'auto-domain'),
            group('manual', [ref('dead2', 92)], 'manual'),
          ],
          untrackedTabs: [ref('keep', 1)],
        },
      },
    };

    const stats = reconcileSessionData(data, [live(1, 100)]);

    expect(stats.deadTabsRemoved).toBe(2);
    expect(stats.emptyAutoGroupsRemoved).toBe(1);
    expect(data.windows[100].groups.map((g) => g.id)).toEqual(['manual']);
  });

  it('dedupes two TabRefs tracking the same chromeTabId in one window (group wins over untracked)', () => {
    const inGroup = ref('in-group', 7);
    const inUntracked = ref('in-untracked', 7);
    const data: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [inGroup])],
          untrackedTabs: [inUntracked],
        },
      },
    };

    const stats = reconcileSessionData(data, [live(7, 100)]);

    expect(stats.duplicatesRemoved).toBe(1);
    expect(data.windows[100].groups[0].tabs.map((t) => t.id)).toEqual(['in-group']);
    expect(data.windows[100].untrackedTabs).toHaveLength(0);
  });

  it('dedupes cross-window duplicates: the copy in the tab\'s actual window wins', () => {
    // Tab 7 physically lives in window 200. A buggy addUrlToGroup left a
    // duplicate TabRef inside a group of window 100. The actual-window copy
    // must win even though the stale one sits in a group.
    const wrongWindowCopy = ref('wrong-win', 7);
    const actualWindowCopy = ref('actual-win', 7);
    const data: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [wrongWindowCopy, ref('own', 1)])],
          untrackedTabs: [],
        },
        200: {
          chromeWindowId: 200,
          groups: [],
          untrackedTabs: [actualWindowCopy],
        },
      },
    };

    const stats = reconcileSessionData(data, [live(7, 200), live(1, 100)]);

    expect(stats.duplicatesRemoved).toBe(1);
    expect(data.windows[100].groups[0].tabs.map((t) => t.id)).toEqual(['own']);
    expect(data.windows[200].untrackedTabs.map((t) => t.id)).toEqual(['actual-win']);
  });

  it('migrates a TabRef tracked in the wrong window to the actual window\'s untracked', () => {
    // Tab 7 lives in window 200 but is only tracked by window 100 (lost
    // onAttached). It must move to 200.untrackedTabs, creating the state.
    const misplaced = ref('misplaced', 7);
    const data: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [misplaced])],
          untrackedTabs: [],
        },
      },
    };

    const stats = reconcileSessionData(data, [live(7, 200), live(1, 100)]);

    expect(stats.tabsMigrated).toBe(1);
    expect(data.windows[100].groups[0].tabs).toHaveLength(0);
    expect(data.windows[200].untrackedTabs.map((t) => t.id)).toEqual(['misplaced']);
  });

  it('removes WindowStates for windows with no remaining live tabs', () => {
    const data: SessionData = {
      windows: {
        100: { chromeWindowId: 100, groups: [], untrackedTabs: [ref('a', 1)] },
        300: { chromeWindowId: 300, groups: [], untrackedTabs: [ref('gone', 90)] },
      },
    };

    const stats = reconcileSessionData(data, [live(1, 100)]);

    expect(stats.deadWindowsRemoved).toBe(1);
    expect(Object.keys(data.windows)).toEqual(['100']);
  });

  it('leaves a fully healthy state untouched and reports zero changes', () => {
    const a = ref('a', 1);
    const b = ref('b', 2);
    const c = ref('c', 3);
    const data: SessionData = {
      rehydratedAt: 5,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [a, b])],
          untrackedTabs: [c],
        },
      },
    };
    const before = JSON.stringify(data);

    const stats = reconcileSessionData(data, [live(1, 100), live(2, 100), live(3, 100)]);

    expect(stats).toEqual({
      deadTabsRemoved: 0,
      duplicatesRemoved: 0,
      tabsMigrated: 0,
      deadWindowsRemoved: 0,
      emptyAutoGroupsRemoved: 0,
    });
    expect(JSON.stringify(data)).toBe(before);
  });

  it('keeps alias and metadata on the surviving TabRef when deduping', () => {
    const winner = { ...ref('w', 7), name: 'My Alias' };
    const loser = ref('l', 7);
    const data: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [group('g1', [winner])],
          untrackedTabs: [loser],
        },
      },
    };

    reconcileSessionData(data, [live(7, 100)]);

    expect(data.windows[100].groups[0].tabs[0].name).toBe('My Alias');
  });
});
