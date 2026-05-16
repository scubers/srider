import '@testing-library/jest-dom/vitest';

// Minimal stub for chrome.* APIs used in tests.
// Tests that need real behavior should override with vi.fn() in beforeEach.
const noop = () => {};

const storageArea = () => ({
  get: async () => ({}),
  set: async () => {},
  remove: async () => {},
  clear: async () => {},
});

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: storageArea(),
    sync: storageArea(),
    session: storageArea(),
    onChanged: { addListener: noop, removeListener: noop },
  },
  tabs: {
    query: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    onCreated: { addListener: noop },
    onRemoved: { addListener: noop },
    onUpdated: { addListener: noop },
    onMoved: { addListener: noop },
  },
  windows: {
    getCurrent: async () => ({ id: 1 }),
    getAll: async () => [],
    onCreated: { addListener: noop },
    onRemoved: { addListener: noop },
  },
  runtime: {
    onInstalled: { addListener: noop },
    onStartup: { addListener: noop },
    sendMessage: async () => undefined,
    onMessage: { addListener: noop },
  },
  sidePanel: {
    open: async () => {},
    setPanelBehavior: async () => {},
  },
  action: {
    onClicked: { addListener: noop },
  },
};
