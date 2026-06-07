import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  emptySessionData,
  type AppData,
  type SessionData,
  type SessionMirror,
  type MirrorWindow,
} from '$shared/types';
import { recoverOnStartup, __testing__ as tabHandlers } from './tab-handlers';
import { withSessionData, __testing__ as writeQueue } from './write-queue';

/**
 * In-memory chrome.storage + chrome.windows mock. Mirrors the pattern in
 * rename-handlers.test.ts, extended with a `sessionMirror` local key and a
 * configurable `chrome.windows.getAll` result.
 */
interface FakeTab {
  id: number;
  url: string;
  title?: string;
  favIconUrl?: string;
}
interface FakeWindow {
  id: number;
  tabs: FakeTab[];
}

const sessionStore: { sessionData?: SessionData } = {};
const localStore: { sessionMirror?: SessionMirror; appData?: AppData } = {};
let reopenedWindows: FakeWindow[] = [];
// The reconcile sweep re-queries live tabs inside the serialized write. By
// default the live set is derived from `reopenedWindows`; tests can override
// it to simulate tabs closed between the getAll snapshot and the write.
let liveTabsOverride: Array<FakeTab & { windowId: number }> | null = null;

function liveTabs(): Array<FakeTab & { windowId: number }> {
  if (liveTabsOverride) return liveTabsOverride;
  return reopenedWindows.flatMap((w) => w.tabs.map((t) => ({ ...t, windowId: w.id })));
}

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
      local: {
        get: async (key: string) =>
          key in localStore ? { [key]: localStore[key as keyof typeof localStore] } : {},
        set: async (patch: Record<string, unknown>) => {
          Object.assign(localStore, patch);
        },
        remove: async () => {},
        clear: async () => {},
      },
      sync: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: async () => liveTabs(),
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    windows: {
      getAll: async () => reopenedWindows,
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
    },
  };
}

function mirror(windows: MirrorWindow[]): SessionMirror {
  return { windows, schemaVersion: SCHEMA_VERSION, updatedAt: 1 };
}

function manualGroup(name: string, urls: string[]): MirrorWindow['groups'][number] {
  return { name, collapsed: false, kind: 'manual', tabs: urls.map((url) => ({ url })) };
}

function win(id: number, tabs: FakeTab[]): FakeWindow {
  return { id, tabs };
}

beforeEach(() => {
  delete sessionStore.sessionData;
  delete localStore.sessionMirror;
  delete localStore.appData;
  reopenedWindows = [];
  liveTabsOverride = null;
  installMock();
  tabHandlers.resetRecover();
});

afterEach(() => {
  // Don't let the debounced mirror-flush timer leak past the test.
  writeQueue.cancelMirrorFlush();
  tabHandlers.resetRecover();
});

describe('recoverOnStartup — rehydration', () => {
  it('restores groups, membership, and aliases for a matched single window', async () => {
    localStore.sessionMirror = mirror([
      {
        groups: [
          {
            name: 'Work',
            collapsed: false,
            kind: 'manual',
            tabs: [{ url: 'https://a.com', name: 'AA' }, { url: 'https://b.com' }],
          },
        ],
        untracked: [{ url: 'https://c.com', name: 'CC' }],
      },
    ]);
    reopenedWindows = [
      win(100, [
        { id: 1, url: 'https://a.com', title: 'A' },
        { id: 2, url: 'https://b.com', title: 'B' },
        { id: 3, url: 'https://c.com', title: 'C' },
      ]),
    ];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].name).toBe('Work');
    expect(w.groups[0].tabs.map((t) => [t.url, t.chromeTabId, t.name])).toEqual([
      ['https://a.com', 1, 'AA'],
      ['https://b.com', 2, undefined],
    ]);
    expect(w.untrackedTabs.map((t) => [t.url, t.chromeTabId, t.name])).toEqual([
      ['https://c.com', 3, 'CC'],
    ]);
    expect(typeof sessionStore.sessionData!.rehydratedAt).toBe('number');
  });

  it('puts every tab in untracked when there is no mirror', async () => {
    reopenedWindows = [
      win(100, [
        { id: 1, url: 'https://a.com' },
        { id: 2, url: 'https://b.com' },
      ]),
    ];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups).toHaveLength(0);
    expect(w.untrackedTabs.map((t) => t.url)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('does not group a window that falls below the match threshold', async () => {
    localStore.sessionMirror = mirror([{ groups: [manualGroup('G', ['https://a.com'])], untracked: [] }]);
    reopenedWindows = [
      win(100, [
        { id: 1, url: 'https://a.com' },
        { id: 2, url: 'https://b.com' },
        { id: 3, url: 'https://c.com' },
        { id: 4, url: 'https://d.com' },
      ]),
    ];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups).toHaveLength(0);
    expect(w.untrackedTabs).toHaveLength(4);
  });

  it('pairs multiple windows correctly even when reopened in a different order', async () => {
    localStore.sessionMirror = mirror([
      { groups: [manualGroup('AB', ['https://a.com', 'https://b.com'])], untracked: [] },
      { groups: [manualGroup('CD', ['https://c.com', 'https://d.com'])], untracked: [] },
    ]);
    reopenedWindows = [
      win(100, [
        { id: 31, url: 'https://c.com' },
        { id: 32, url: 'https://d.com' },
      ]),
      win(200, [
        { id: 11, url: 'https://a.com' },
        { id: 12, url: 'https://b.com' },
      ]),
    ];

    await recoverOnStartup();

    expect(sessionStore.sessionData!.windows[100].groups[0].name).toBe('CD');
    expect(sessionStore.sessionData!.windows[200].groups[0].name).toBe('AB');
  });

  it('does not clobber live session state when the SW wakes mid-session', async () => {
    // rehydratedAt present → this is a SW recycle, not a fresh browser session.
    const seeded: SessionData = {
      rehydratedAt: 999,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g-existing',
              name: 'Existing',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [{ id: 'r9', url: 'https://a.com', title: 'A', chromeTabId: 9, addedAt: 0 }],
            },
          ],
          untrackedTabs: [],
        },
      },
    };
    sessionStore.sessionData = seeded;
    // A mirror that would have produced a different grouping — must be ignored.
    localStore.sessionMirror = mirror([
      { groups: [manualGroup('FromMirror', ['https://a.com'])], untracked: [] },
    ]);
    reopenedWindows = [win(100, [{ id: 9, url: 'https://a.com', title: 'A' }])];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].name).toBe('Existing');
    expect(w.groups[0].tabs[0].chromeTabId).toBe(9);
  });

  it('never matches a window opened during SW downtime (mid-session no re-match)', async () => {
    // Mid-session (rehydratedAt set): window 100 is tracked with group "Work".
    // Window 200 was opened while the SW was dead and shares 100's URLs. It must
    // NOT inherit a copy of "Work" — mid-session windows are never matched.
    sessionStore.sessionData = {
      rehydratedAt: 999,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g',
              name: 'Work',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [{ id: 'r1', url: 'https://a.com', title: 'A', chromeTabId: 9, addedAt: 0 }],
            },
          ],
          untrackedTabs: [],
        },
      },
    };
    localStore.sessionMirror = mirror([
      { groups: [manualGroup('Work', ['https://a.com'])], untracked: [] },
    ]);
    reopenedWindows = [
      win(100, [{ id: 9, url: 'https://a.com', title: 'A' }]),
      win(200, [{ id: 21, url: 'https://a.com', title: 'A' }]),
    ];

    await recoverOnStartup();

    // 100 preserved untouched.
    expect(sessionStore.sessionData!.windows[100].groups[0].name).toBe('Work');
    // 200 seeded as plain untracked — no grouping copied over.
    const w200 = sessionStore.sessionData!.windows[200];
    expect(w200.groups).toHaveLength(0);
    expect(w200.untrackedTabs.map((t) => t.url)).toEqual(['https://a.com']);
  });

  it('overwrites an onCreated-prepopulated window on a fresh session (startup race)', async () => {
    // Fresh session (no rehydratedAt) but onCreated already dropped the tabs in
    // untracked. Rehydration must overwrite and apply the groups.
    const raced: SessionData = {
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [],
          untrackedTabs: [{ id: 'tmp', url: 'https://a.com', title: 'A', chromeTabId: 1, addedAt: 0 }],
        },
      },
    };
    sessionStore.sessionData = raced;
    localStore.sessionMirror = mirror([
      { groups: [manualGroup('Work', ['https://a.com', 'https://b.com'])], untracked: [] },
    ]);
    reopenedWindows = [
      win(100, [
        { id: 1, url: 'https://a.com', title: 'A' },
        { id: 2, url: 'https://b.com', title: 'B' },
      ]),
    ];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups).toHaveLength(1);
    expect(w.groups[0].name).toBe('Work');
    expect(w.groups[0].tabs.map((t) => [t.url, t.chromeTabId])).toEqual([
      ['https://a.com', 1],
      ['https://b.com', 2],
    ]);
    expect(w.untrackedTabs).toHaveLength(0);
  });
});

describe('recoverOnStartup — reconcile sweep (self-healing)', () => {
  it('removes ghost TabRefs with dead chromeTabIds on a mid-session SW wake', async () => {
    // Tab 99 died while its onRemoved was lost (SW recycle race / replaced
    // tab). The wake must prune it but keep live tab 9 and the group intact.
    sessionStore.sessionData = {
      rehydratedAt: 999,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [
            {
              id: 'g',
              name: 'Work',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [
                { id: 'live', url: 'https://a.com', title: 'A', chromeTabId: 9, addedAt: 0 },
                { id: 'ghost', url: 'https://dead.com', title: 'D', chromeTabId: 99, addedAt: 0 },
              ],
            },
          ],
          untrackedTabs: [],
        },
      },
    };
    reopenedWindows = [win(100, [{ id: 9, url: 'https://a.com', title: 'A' }])];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups[0].name).toBe('Work');
    expect(w.groups[0].tabs.map((t) => t.id)).toEqual(['live']);
  });

  it('removes WindowStates of windows closed while the SW was dead', async () => {
    sessionStore.sessionData = {
      rehydratedAt: 999,
      windows: {
        100: {
          chromeWindowId: 100,
          groups: [],
          untrackedTabs: [{ id: 'a', url: 'https://a.com', title: 'A', chromeTabId: 9, addedAt: 0 }],
        },
        300: {
          chromeWindowId: 300,
          groups: [],
          untrackedTabs: [{ id: 'z', url: 'https://z.com', title: 'Z', chromeTabId: 80, addedAt: 0 }],
        },
      },
    };
    reopenedWindows = [win(100, [{ id: 9, url: 'https://a.com' }])];

    await recoverOnStartup();

    expect(Object.keys(sessionStore.sessionData!.windows)).toEqual(['100']);
  });

  it('prunes tabs closed between the fresh-session getAll snapshot and the rebuild write', async () => {
    // getAll saw tabs 1 and 2, but tab 2 was closed before the serialized
    // write ran (its onRemoved found no TabRef yet, so only the sweep can
    // catch it). The re-query inside the write returns only tab 1.
    localStore.sessionMirror = mirror([
      { groups: [manualGroup('Work', ['https://a.com', 'https://b.com'])], untracked: [] },
    ]);
    reopenedWindows = [
      win(100, [
        { id: 1, url: 'https://a.com', title: 'A' },
        { id: 2, url: 'https://b.com', title: 'B' },
      ]),
    ];
    liveTabsOverride = [{ id: 1, url: 'https://a.com', title: 'A', windowId: 100 }];

    await recoverOnStartup();

    const w = sessionStore.sessionData!.windows[100];
    expect(w.groups[0].tabs.map((t) => [t.url, t.chromeTabId])).toEqual([['https://a.com', 1]]);
    expect(w.untrackedTabs).toHaveLength(0);
  });
});

describe('write-through mirror', () => {
  it('projects the latest session into the mirror on flush', async () => {
    sessionStore.sessionData = emptySessionData();
    await withSessionData((data) => {
      data.windows[5] = {
        chromeWindowId: 5,
        groups: [
          {
            id: 'g1',
            name: 'Reading',
            collapsed: true,
            kind: 'manual',
            createdAt: 0,
            tabs: [{ id: 't1', url: 'https://news.com', title: 'News', chromeTabId: 21, addedAt: 0, name: 'Daily' }],
          },
        ],
        untrackedTabs: [],
      };
    });

    await writeQueue.flushSessionMirror();

    const m = localStore.sessionMirror!;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.windows).toHaveLength(1);
    expect(m.windows[0].groups[0]).toEqual({
      name: 'Reading',
      collapsed: true,
      kind: 'manual',
      tabs: [{ url: 'https://news.com', name: 'Daily' }],
    });
    expect(JSON.stringify(m)).not.toContain('chromeTabId');
  });
});
