import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionData } from '$shared/types';
import { handleMessage } from './message-handlers';
import { __testing__ as writeQueue } from './write-queue';

/**
 * addUrlToGroup must resolve the dropped URL to a tab of the TARGET window
 * only. Resolving against all windows used to bind a TabRef to another
 * window's chromeTabId — a cross-window duplicate whose onRemoved fast path
 * never cleans it up (permanent ghost row).
 */
const sessionStore: { sessionData?: SessionData } = {};
let fakeTabs: Array<{ id: number; windowId: number; url: string; title?: string }> = [];

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
      query: async (info: { windowId?: number }) =>
        info.windowId === undefined ? fakeTabs : fakeTabs.filter((t) => t.windowId === info.windowId),
    },
    windows: { getAll: async () => [] },
  };
}

beforeEach(() => {
  delete sessionStore.sessionData;
  fakeTabs = [];
  installMock();
});

afterEach(() => {
  writeQueue.cancelMirrorFlush();
});

function seedWindowWithGroup(chromeWindowId: number): void {
  sessionStore.sessionData = {
    rehydratedAt: 1,
    windows: {
      [chromeWindowId]: {
        chromeWindowId,
        groups: [
          {
            id: 'g1',
            name: 'G',
            collapsed: false,
            kind: 'manual',
            createdAt: 0,
            tabs: [],
          },
        ],
        untrackedTabs: [],
      },
    },
  };
}

describe('addUrlToGroup — window-scoped tab resolution', () => {
  it('binds the URL to a tab of the target window', async () => {
    seedWindowWithGroup(100);
    fakeTabs = [{ id: 7, windowId: 100, url: 'https://a.com/', title: 'A' }];

    const res = await handleMessage({
      type: 'addUrlToGroup',
      chromeWindowId: 100,
      groupId: 'g1',
      url: 'https://a.com/',
    });

    expect(res.ok).toBe(true);
    const g = sessionStore.sessionData!.windows[100].groups[0];
    expect(g.tabs.map((t) => [t.url, t.chromeTabId])).toEqual([['https://a.com/', 7]]);
  });

  it('does NOT bind a same-URL tab living in another window', async () => {
    seedWindowWithGroup(100);
    // The only tab with this URL lives in window 200.
    fakeTabs = [{ id: 7, windowId: 200, url: 'https://a.com/', title: 'A' }];

    const res = await handleMessage({
      type: 'addUrlToGroup',
      chromeWindowId: 100,
      groupId: 'g1',
      url: 'https://a.com/',
    });

    expect(res.ok).toBe(false);
    expect(sessionStore.sessionData!.windows[100].groups[0].tabs).toHaveLength(0);
  });
});
