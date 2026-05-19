import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMessage } from './message-handlers';
import {
  emptyAppData,
  emptySessionData,
  type AppData,
  type SessionData,
  type StashFolder,
  type WindowState,
} from '$shared/types';
import { __testing__ as tabHandlersTesting } from './tab-handlers';

/**
 * In-memory chrome.storage.* mock that mirrors the get/set pattern the real
 * storage helpers use. Tests seed the desired starting state into the locals,
 * then dispatch a message through handleMessage and read back.
 */
const sessionStore: { sessionData?: SessionData } = {};
const localStore: { appData?: AppData } = {};

function installStorageMock() {
  // Re-create chrome.storage with backing maps so handlers see consistent
  // session/local state across get/set calls within a single test.
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      session: {
        get: async (key: string) =>
          key in sessionStore
            ? { [key]: sessionStore[key as keyof typeof sessionStore] }
            : {},
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
      sync: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: async () => [],
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    windows: {
      create: vi.fn(async () => ({ id: 99 })),
      update: vi.fn(async () => ({})),
      getAll: async () => [],
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
    },
    runtime: {
      sendMessage: async () => undefined,
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    sidePanel: { open: async () => {}, setPanelBehavior: async () => {} },
    action: { onClicked: { addListener: () => {} } },
  };
}

function seedSession(state: WindowState) {
  const data = emptySessionData();
  data.windows[state.chromeWindowId] = state;
  sessionStore.sessionData = data;
}

function seedAppData(stash: StashFolder[]) {
  localStore.appData = { ...emptyAppData(), stash };
}

beforeEach(() => {
  delete sessionStore.sessionData;
  delete localStore.appData;
  installStorageMock();
  // Drain any leftover pending slots from prior tests.
  while (tabHandlersTesting.consumePendingSlot(1)) {
    // discard
  }
});

describe('renameTab', () => {
  it('sets name on a TabRef inside a group', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [
        {
          id: 'g1',
          name: 'Work',
          collapsed: false,
          kind: 'manual',
          createdAt: 0,
          tabs: [
            { id: 't1', url: 'https://a.com', title: 'A', chromeTabId: 11, addedAt: 0 },
          ],
        },
      ],
      untrackedTabs: [],
    });

    const res = await handleMessage({
      type: 'renameTab',
      chromeWindowId: 1,
      tabRefId: 't1',
      name: '  Important  ',
    });
    expect(res).toEqual({ ok: true });
    expect(sessionStore.sessionData?.windows[1].groups[0].tabs[0].name).toBe('Important');
  });

  it('clears name when given an empty string', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [],
      untrackedTabs: [
        { id: 't1', url: 'https://a.com', title: 'A', chromeTabId: 11, addedAt: 0, name: 'Old' },
      ],
    });

    const res = await handleMessage({
      type: 'renameTab',
      chromeWindowId: 1,
      tabRefId: 't1',
      name: '   ',
    });
    expect(res).toEqual({ ok: true });
    expect(sessionStore.sessionData?.windows[1].untrackedTabs[0].name).toBeUndefined();
  });

  it('rejects names longer than MAX_NAME_LEN', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [],
      untrackedTabs: [
        { id: 't1', url: 'https://a.com', title: 'A', chromeTabId: 11, addedAt: 0 },
      ],
    });

    const res = await handleMessage({
      type: 'renameTab',
      chromeWindowId: 1,
      tabRefId: 't1',
      name: 'x'.repeat(201),
    });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false when tabRefId is unknown', async () => {
    seedSession({ chromeWindowId: 1, groups: [], untrackedTabs: [] });
    const res = await handleMessage({
      type: 'renameTab',
      chromeWindowId: 1,
      tabRefId: 'ghost',
      name: 'X',
    });
    expect(res.ok).toBe(false);
  });
});

describe('renameStashItem', () => {
  it('sets name on a StashItem', async () => {
    seedAppData([
      {
        id: 'f1',
        name: 'Folder',
        collapsed: false,
        createdAt: 0,
        items: [{ id: 'i1', url: 'https://a.com', title: 'A', addedAt: 0 }],
      },
    ]);

    const res = await handleMessage({
      type: 'renameStashItem',
      folderId: 'f1',
      itemId: 'i1',
      name: 'Saved',
    });
    expect(res).toEqual({ ok: true });
    expect(localStore.appData?.stash[0].items[0].name).toBe('Saved');
  });

  it('clears name on empty', async () => {
    seedAppData([
      {
        id: 'f1',
        name: 'Folder',
        collapsed: false,
        createdAt: 0,
        items: [{ id: 'i1', url: 'https://a.com', title: 'A', addedAt: 0, name: 'Old' }],
      },
    ]);

    const res = await handleMessage({
      type: 'renameStashItem',
      folderId: 'f1',
      itemId: 'i1',
      name: '',
    });
    expect(res).toEqual({ ok: true });
    expect(localStore.appData?.stash[0].items[0].name).toBeUndefined();
  });
});

describe('saveTabToStash name propagation', () => {
  it('carries tab.name into the new StashItem', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [],
      untrackedTabs: [
        {
          id: 't1',
          url: 'https://a.com',
          title: 'A',
          chromeTabId: 11,
          addedAt: 0,
          name: 'Notes',
        },
      ],
    });
    seedAppData([]);

    const res = await handleMessage({
      type: 'saveTabToStash',
      chromeWindowId: 1,
      tabRefId: 't1',
      fromGroupId: null,
    });
    expect(res).toEqual({ ok: true });
    const unsorted = localStore.appData?.stash.find((f) => f.name === 'Unsorted');
    expect(unsorted?.items[0].name).toBe('Notes');
  });

  it('omits name when the source tab has none', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [],
      untrackedTabs: [
        { id: 't1', url: 'https://a.com', title: 'A', chromeTabId: 11, addedAt: 0 },
      ],
    });
    seedAppData([]);

    const res = await handleMessage({
      type: 'saveTabToStash',
      chromeWindowId: 1,
      tabRefId: 't1',
      fromGroupId: null,
    });
    expect(res).toEqual({ ok: true });
    const unsorted = localStore.appData?.stash.find((f) => f.name === 'Unsorted');
    expect(unsorted?.items[0].name).toBeUndefined();
  });
});

describe('saveGroupToStash name propagation', () => {
  it('carries each tab.name to the corresponding StashItem in order', async () => {
    seedSession({
      chromeWindowId: 1,
      groups: [
        {
          id: 'g1',
          name: 'Work',
          collapsed: false,
          kind: 'manual',
          createdAt: 0,
          tabs: [
            { id: 't1', url: 'https://a.com', title: 'A', chromeTabId: 11, addedAt: 0, name: 'First' },
            { id: 't2', url: 'https://b.com', title: 'B', chromeTabId: 12, addedAt: 0 },
            { id: 't3', url: 'https://c.com', title: 'C', chromeTabId: 13, addedAt: 0, name: 'Third' },
          ],
        },
      ],
      untrackedTabs: [],
    });
    seedAppData([]);

    const res = await handleMessage({
      type: 'saveGroupToStash',
      chromeWindowId: 1,
      groupId: 'g1',
    });
    expect(res).toEqual({ ok: true });
    const folder = localStore.appData?.stash.find((f) => f.name === 'Work');
    expect(folder?.items.map((i) => i.name)).toEqual(['First', undefined, 'Third']);
  });
});

describe('openStashFolderAsGroup queues per-item alias slots', () => {
  it('reserves one pending slot per item, each carrying its own name', async () => {
    seedAppData([
      {
        id: 'f1',
        name: 'Saved',
        collapsed: false,
        createdAt: 0,
        items: [
          { id: 'i1', url: 'https://a.com', title: 'A', addedAt: 0, name: 'Alpha' },
          { id: 'i2', url: 'https://b.com', title: 'B', addedAt: 0 },
          { id: 'i3', url: 'https://c.com', title: 'C', addedAt: 0, name: 'Gamma' },
        ],
      },
    ]);
    seedSession({ chromeWindowId: 1, groups: [], untrackedTabs: [] });

    const res = await handleMessage({
      type: 'openStashFolderAsGroup',
      folderId: 'f1',
      targetChromeWindowId: 1,
    });
    expect(res).toEqual({ ok: true });

    // Three slots should be queued in FIFO order, paired with each item.
    const s1 = tabHandlersTesting.consumePendingSlot(1);
    const s2 = tabHandlersTesting.consumePendingSlot(1);
    const s3 = tabHandlersTesting.consumePendingSlot(1);
    expect(s1?.name).toBe('Alpha');
    expect(s2?.name).toBeUndefined();
    expect(s3?.name).toBe('Gamma');
    // All three should carry the same groupId (the new manual group's id).
    expect(s1?.groupId).toBeDefined();
    expect(s2?.groupId).toBe(s1?.groupId);
    expect(s3?.groupId).toBe(s1?.groupId);
  });
});
