/**
 * Typed wrappers around chrome.storage.
 *
 * Invariants:
 *   - Only the service worker writes AppData / SessionData.
 *   - UI reads via getAppData() / getSessionData() and subscribes via onAppDataChange / onSessionDataChange.
 *   - Settings flow through chrome.storage.sync (cross-device).
 */
import {
  type AppData,
  type SessionData,
  type Settings,
  type ChromeWindowId,
  type WindowState,
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  emptyAppData,
  emptySessionData,
} from './types';

const APP_DATA_KEY = 'appData';
const SETTINGS_KEY = 'settings';
const SESSION_DATA_KEY = 'sessionData';

// ---------- AppData (chrome.storage.local) ----------

export async function getAppData(): Promise<AppData> {
  const result = await chrome.storage.local.get(APP_DATA_KEY);
  const raw = result[APP_DATA_KEY] as AppData | undefined;
  if (!raw) return emptyAppData();
  return migrateAppData(raw);
}

export async function setAppData(data: AppData): Promise<void> {
  await chrome.storage.local.set({ [APP_DATA_KEY]: data });
}

/** Read-modify-write helper. SW callers must funnel through write-queue.ts for serialization. */
export async function updateAppData(fn: (data: AppData) => void | Promise<void>): Promise<AppData> {
  const data = await getAppData();
  await fn(data);
  await setAppData(data);
  return data;
}

type AppDataChangeListener = (data: AppData) => void;

export function onAppDataChange(cb: AppDataChangeListener): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== 'local') return;
    if (!(APP_DATA_KEY in changes)) return;
    const newValue = changes[APP_DATA_KEY]?.newValue as AppData | undefined;
    if (!newValue) return;
    cb(migrateAppData(newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---------- SessionData (chrome.storage.session) ----------

export async function getSessionData(): Promise<SessionData> {
  const result = await chrome.storage.session.get(SESSION_DATA_KEY);
  const raw = result[SESSION_DATA_KEY] as SessionData | undefined;
  return raw ?? emptySessionData();
}

export async function setSessionData(data: SessionData): Promise<void> {
  await chrome.storage.session.set({ [SESSION_DATA_KEY]: data });
}

/** Read-modify-write. SW callers funnel through write-queue.ts. */
export async function updateSessionData(
  fn: (data: SessionData) => void | Promise<void>,
): Promise<SessionData> {
  const data = await getSessionData();
  await fn(data);
  await setSessionData(data);
  return data;
}

type SessionDataChangeListener = (data: SessionData) => void;

export function onSessionDataChange(cb: SessionDataChangeListener): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== 'session') return;
    if (!(SESSION_DATA_KEY in changes)) return;
    const newValue = changes[SESSION_DATA_KEY]?.newValue as SessionData | undefined;
    cb(newValue ?? emptySessionData());
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// Convenience: pull one window's state. Returns null if not present.
export async function getWindowState(
  chromeWindowId: ChromeWindowId,
): Promise<WindowState | null> {
  const data = await getSessionData();
  return data.windows[chromeWindowId] ?? null;
}

// ---------- Settings (chrome.storage.sync) ----------

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await setSettings(next);
  return next;
}

export function onSettingsChange(cb: (s: Settings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== 'sync') return;
    if (!(SETTINGS_KEY in changes)) return;
    const raw = changes[SETTINGS_KEY]?.newValue as Partial<Settings> | undefined;
    cb({ ...DEFAULT_SETTINGS, ...(raw ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---------- Migration ----------

function migrateAppData(data: AppData): AppData {
  // Schema bumped to 2 in the Stash redesign. Older data is incompatible and
  // the project hasn't shipped, so we discard rather than migrate.
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return emptyAppData();
  }
  return data;
}
