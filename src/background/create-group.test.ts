import { beforeEach, describe, expect, it } from 'vitest';
import { handleMessage } from './message-handlers';
import {
  emptySessionData,
  type Settings,
  type SessionData,
  type WindowState,
} from '$shared/types';

/**
 * In-memory chrome.storage mock with a configurable `sync` (Settings) store so
 * we can assert that createGroup seeds `collapsed` from the user's
 * `defaultGroupExpanded` preference rather than hardcoding it.
 */
const sessionStore: { sessionData?: SessionData } = {};
const syncStore: { settings?: Partial<Settings> } = {};

function installStorageMock() {
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
      sync: {
        get: async (key: string) =>
          key in syncStore ? { [key]: syncStore[key as keyof typeof syncStore] } : {},
        set: async () => {},
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };
}

function seedSession(state: WindowState) {
  const data = emptySessionData();
  data.windows[state.chromeWindowId] = state;
  sessionStore.sessionData = data;
}

beforeEach(() => {
  delete sessionStore.sessionData;
  delete syncStore.settings;
  installStorageMock();
});

describe('createGroup honors defaultGroupExpanded', () => {
  it('creates an expanded (collapsed:false) group by default', async () => {
    seedSession({ chromeWindowId: 1, groups: [], untrackedTabs: [] });

    const res = await handleMessage({ type: 'createGroup', chromeWindowId: 1, name: 'Work' });

    expect(res).toEqual({ ok: true });
    expect(sessionStore.sessionData?.windows[1].groups[0].collapsed).toBe(false);
  });

  it('creates a collapsed group when defaultGroupExpanded is false', async () => {
    syncStore.settings = { defaultGroupExpanded: false };
    seedSession({ chromeWindowId: 1, groups: [], untrackedTabs: [] });

    const res = await handleMessage({ type: 'createGroup', chromeWindowId: 1, name: 'Work' });

    expect(res).toEqual({ ok: true });
    expect(sessionStore.sessionData?.windows[1].groups[0].collapsed).toBe(true);
  });
});
