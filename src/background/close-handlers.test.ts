import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionData, TabRef } from '$shared/types';
import { handleMessage } from './message-handlers';
import { __testing__ as writeQueue } from './write-queue';

/**
 * Closing-path self-healing: a TabRef bound to a dead chromeTabId (ghost row)
 * must be removed from state when the user tries to close it, instead of
 * failing forever. In-memory chrome mock in the style of tab-handlers.test.ts,
 * with a configurable set of live tab ids.
 */
const sessionStore: { sessionData?: SessionData } = {};
let liveTabIds: Set<number> = new Set();
let removedTabIds: number[] = [];
/** Ids whose chrome.tabs.remove rejects even though the tab is alive (transient failure). */
let transientFailIds: Set<number> = new Set();

function installMock() {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      session: {
        get: async (key: string) =>
          key in sessionStore ? { [key]: sessionStore[key as keyof typeof sessionStore] } : {},
        set: async (patch: Record<string, unknown>) => {
          Object.assign(sessionStore, patch);
        },
        remove: async () => {},
        clear: async () => {},
      },
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      remove: async (id: number) => {
        if (transientFailIds.has(id)) {
          throw new Error('Tabs cannot be edited right now (user may be dragging a tab).');
        }
        if (!liveTabIds.has(id)) throw new Error(`No tab with id: ${id}.`);
        liveTabIds.delete(id);
        removedTabIds.push(id);
      },
      get: async (id: number) => {
        if (!liveTabIds.has(id)) throw new Error(`No tab with id: ${id}.`);
        return { id, windowId: 100 };
      },
      query: async () => [...liveTabIds].map((id) => ({ id, windowId: 100 })),
    },
    windows: { getAll: async () => [] },
  };
}

function ref(id: string, chromeTabId: number): TabRef {
  return { id, url: `https://${id}.com`, title: id.toUpperCase(), chromeTabId, addedAt: 0 };
}

function seed(data: SessionData): void {
  sessionStore.sessionData = data;
}

beforeEach(() => {
  delete sessionStore.sessionData;
  liveTabIds = new Set();
  removedTabIds = [];
  transientFailIds = new Set();
  installMock();
});

afterEach(() => {
  writeQueue.cancelMirrorFlush();
});

describe('closeLiveTab — ghost-row self-healing', () => {
  it('closes a live tab normally and leaves state for onRemoved', async () => {
    liveTabIds = new Set([7]);
    seed({
      rehydratedAt: 1,
      windows: {
        100: { chromeWindowId: 100, groups: [], untrackedTabs: [ref('a', 7)] },
      },
    });

    const res = await handleMessage({
      type: 'closeLiveTab',
      chromeWindowId: 100,
      tabRefId: 'a',
    });

    expect(res.ok).toBe(true);
    expect(removedTabIds).toEqual([7]);
    // TabRef removal is onRemoved's job on this path.
    expect(sessionStore.sessionData!.windows[100].untrackedTabs).toHaveLength(1);
  });

  it('removes the TabRef from state when the chromeTabId is dead (ghost row)', async () => {
    liveTabIds = new Set([1]); // 7 is dead
    seed({
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g1',
              name: 'G',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [ref('ghost', 7), ref('alive', 1)],
            },
          ],
          untrackedTabs: [],
        },
      },
    });

    const res = await handleMessage({
      type: 'closeLiveTab',
      chromeWindowId: 100,
      tabRefId: 'ghost',
    });

    expect(res.ok).toBe(true);
    expect(sessionStore.sessionData!.windows[100].groups[0].tabs.map((t) => t.id)).toEqual([
      'alive',
    ]);
  });

  it('drops an emptied auto-domain group together with its ghost row', async () => {
    liveTabIds = new Set();
    seed({
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'auto',
              name: 'site.com',
              collapsed: false,
              kind: 'auto-domain',
              autoDomain: 'site.com',
              createdAt: 0,
              tabs: [ref('ghost', 7)],
            },
          ],
          untrackedTabs: [],
        },
      },
    });

    const res = await handleMessage({
      type: 'closeLiveTab',
      chromeWindowId: 100,
      tabRefId: 'ghost',
    });

    expect(res.ok).toBe(true);
    expect(sessionStore.sessionData!.windows[100].groups).toHaveLength(0);
  });

  it('keeps the TabRef when remove fails transiently but the tab is still alive', async () => {
    liveTabIds = new Set([7]);
    transientFailIds = new Set([7]);
    seed({
      rehydratedAt: 1,
      windows: {
        100: { chromeWindowId: 100, groups: [], untrackedTabs: [ref('a', 7)] },
      },
    });

    const res = await handleMessage({
      type: 'closeLiveTab',
      chromeWindowId: 100,
      tabRefId: 'a',
    });

    expect(res.ok).toBe(false);
    expect(sessionStore.sessionData!.windows[100].untrackedTabs).toHaveLength(1);
  });
});

describe('closeAllInGroup — one ghost must not poison the batch', () => {
  it('closes all live tabs and prunes ghosts in the same pass', async () => {
    liveTabIds = new Set([1, 2]);
    seed({
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g1',
              name: 'G',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [ref('a', 1), ref('ghost', 9), ref('b', 2)],
            },
          ],
          untrackedTabs: [],
        },
      },
    });

    const res = await handleMessage({
      type: 'closeAllInGroup',
      chromeWindowId: 100,
      groupId: 'g1',
    });

    expect(res.ok).toBe(true);
    // Both live tabs actually closed (not blocked by the ghost)…
    expect(removedTabIds.sort()).toEqual([1, 2]);
    // …and the ghost row got pruned from state.
    const g = sessionStore.sessionData!.windows[100].groups[0];
    expect(g.tabs.find((t) => t.id === 'ghost')).toBeUndefined();
  });

  it('prunes untracked ghosts when closing all untracked tabs', async () => {
    liveTabIds = new Set([1]);
    seed({
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [],
          untrackedTabs: [ref('a', 1), ref('ghost', 9)],
        },
      },
    });

    const res = await handleMessage({
      type: 'closeAllInGroup',
      chromeWindowId: 100,
      groupId: null,
    });

    expect(res.ok).toBe(true);
    expect(removedTabIds).toEqual([1]);
    // 'a' stays for onRemoved to clean up; only the ghost is pruned here.
    expect(sessionStore.sessionData!.windows[100].untrackedTabs.map((t) => t.id)).toEqual(['a']);
  });
});
