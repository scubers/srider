/**
 * Typed wrappers around chrome.storage. See spec §7.
 *
 * Invariants:
 *   - Only the service worker writes to `chrome.storage.local` (AppData).
 *   - UI reads via getAppData() / subscribes via onAppDataChange().
 *   - Settings flow through chrome.storage.sync for cross-device sync.
 *   - Short-term runtime state goes into chrome.storage.session (survives SW recycling,
 *     lost on browser restart).
 */
import {
  type AppData,
  type Settings,
  DEFAULT_SETTINGS,
  emptyAppData,
  SCHEMA_VERSION,
} from './types';

const APP_DATA_KEY = 'appData';
const SETTINGS_KEY = 'settings';
const SESSION_KEY = 'sessionState';

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

/**
 * Read-modify-write helper. NOT atomic across concurrent callers — but since only the
 * service worker writes, callers in the SW serialize via the event loop.
 */
export async function updateAppData(fn: (data: AppData) => void | Promise<void>): Promise<AppData> {
  const data = await getAppData();
  await fn(data);
  await setAppData(data);
  return data;
}

type AppDataChangeListener = (data: AppData) => void;

/** Subscribe to AppData changes. Returns an unsubscribe function. */
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

// ---------- Session state (chrome.storage.session) ----------

export interface SessionState {
  /**
   * Pending tab opens initiated by clicking a saved tab.
   * Keyed by URL → tabRefId. See spec §6.1.
   *
   * Known limitation (spec §12 risk 5): two simultaneous opens of the same URL
   * collide on this key.
   */
  pendingOpens: Record<string, { tabRefId: string; timestamp: number }>;
}

const EMPTY_SESSION_STATE: SessionState = { pendingOpens: {} };

export async function getSessionState(): Promise<SessionState> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const raw = result[SESSION_KEY] as SessionState | undefined;
  return raw ?? EMPTY_SESSION_STATE;
}

export async function updateSessionState(
  fn: (state: SessionState) => void | Promise<void>,
): Promise<SessionState> {
  const state = await getSessionState();
  await fn(state);
  await chrome.storage.session.set({ [SESSION_KEY]: state });
  return state;
}

// ---------- Migration ----------

function migrateAppData(data: AppData): AppData {
  // No migrations yet (we're at schemaVersion 1).
  // Future: switch on data.schemaVersion and transform in place.
  if (!data.schemaVersion) {
    return { ...data, schemaVersion: SCHEMA_VERSION };
  }
  return data;
}
