import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionData, TabRef } from '$shared/types';
import {
  handleTabAttached,
  handleTabReplaced,
  __testing__ as tabHandlers,
} from './tab-handlers';
import { __testing__ as writeQueue } from './write-queue';

/** In-memory chrome.storage mock — same pattern as restore-startup.test.ts. */
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
      query: async () => fakeTabs,
      get: async (id: number) => {
        const t = fakeTabs.find((t) => t.id === id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        return t;
      },
    },
    windows: { getAll: async () => [] },
  };
}

function ref(id: string, chromeTabId: number, name?: string): TabRef {
  const r: TabRef = {
    id,
    url: `https://${id}.com`,
    title: id.toUpperCase(),
    chromeTabId,
    addedAt: 0,
  };
  if (name) r.name = name;
  return r;
}

beforeEach(() => {
  delete sessionStore.sessionData;
  fakeTabs = [];
  installMock();
  tabHandlers.resetRecover();
});

afterEach(() => {
  writeQueue.cancelMirrorFlush();
  tabHandlers.resetRecover();
});

describe('handleTabReplaced', () => {
  it('rebinds the TabRef to the new chromeTabId in place (keeps position and alias)', async () => {
    sessionStore.sessionData = {
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g1',
              name: 'Work',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [ref('a', 7, 'My Alias'), ref('b', 8)],
            },
          ],
          untrackedTabs: [],
        },
      },
    };

    await handleTabReplaced(70, 7);

    const tabs = sessionStore.sessionData!.windows[100].groups[0].tabs;
    expect(tabs.map((t) => [t.id, t.chromeTabId])).toEqual([
      ['a', 70],
      ['b', 8],
    ]);
    expect(tabs[0].name).toBe('My Alias');
  });

  it('drops the old-id TabRef when the new id is already tracked (no duplicate)', async () => {
    sessionStore.sessionData = {
      rehydratedAt: 1,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [],
          untrackedTabs: [ref('old', 7), ref('new', 70)],
        },
      },
    };

    await handleTabReplaced(70, 7);

    const tabs = sessionStore.sessionData!.windows[100].untrackedTabs;
    expect(tabs.map((t) => [t.id, t.chromeTabId])).toEqual([['new', 70]]);
  });

  it('rebinds the first copy and drops extra duplicates of the replaced id', async () => {
    sessionStore.sessionData = {
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
              tabs: [ref('first', 7)],
            },
          ],
          untrackedTabs: [ref('dup', 7)],
        },
      },
    };

    await handleTabReplaced(70, 7);

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups[0].tabs.map((t) => [t.id, t.chromeTabId])).toEqual([['first', 70]]);
    expect(w.untrackedTabs).toHaveLength(0);
  });

  it('is a no-op when nothing tracks the replaced id', async () => {
    sessionStore.sessionData = {
      rehydratedAt: 1,
      windows: {
        100: { chromeWindowId: 100, groups: [], untrackedTabs: [ref('x', 1)] },
      },
    };

    await handleTabReplaced(70, 7);

    expect(sessionStore.sessionData!.windows[100].untrackedTabs.map((t) => t.id)).toEqual(['x']);
  });
});

describe('handleTabAttached — duplicate guard', () => {
  it('does not duplicate when the destination already tracks the chromeTabId (windowCreated race)', async () => {
    // Window 200's handleWindowCreated raced ahead and already seeded a fresh
    // TabRef for tab 7; the attached handler then moves the original TabRef
    // (with alias) over. The seeded copy must be replaced, not duplicated.
    sessionStore.sessionData = {
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
              tabs: [ref('original', 7, 'Alias')],
            },
          ],
          untrackedTabs: [],
        },
        200: {
          chromeWindowId: 200,
          groups: [],
          untrackedTabs: [ref('seeded-copy', 7)],
        },
      },
    };

    await handleTabAttached(7, { newWindowId: 200, newPosition: 0 });

    const w200 = sessionStore.sessionData!.windows[200];
    const refs7 = [
      ...w200.groups.flatMap((g) => g.tabs),
      ...w200.untrackedTabs,
    ].filter((t) => t.chromeTabId === 7);
    expect(refs7).toHaveLength(1);
    expect(refs7[0].name).toBe('Alias');
    // Source window no longer tracks it.
    expect(
      sessionStore.sessionData!.windows[100].groups.flatMap((g) => g.tabs),
    ).toHaveLength(0);
  });
});
