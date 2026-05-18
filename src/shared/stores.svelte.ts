/**
 * Svelte 5 rune-based reactive stores.
 *
 * Three persisted stores + one ephemeral view-mode store:
 *   - appDataStore     → chrome.storage.local (Stash; only persistent layer)
 *   - sessionDataStore → chrome.storage.session (per-window state)
 *   - settingsStore    → chrome.storage.sync
 *   - viewStore        → in-memory ('tabs' | 'stash')
 *
 * The UI never writes AppData / SessionData directly — see CLAUDE.md. It
 * subscribes here and mutates via messages.
 */
import {
  getAppData,
  getSessionData,
  getSettings,
  onAppDataChange,
  onSessionDataChange,
  onSettingsChange,
  setSettings as persistSettings,
} from './storage';
import {
  type AppData,
  type SessionData,
  type Settings,
  DEFAULT_SETTINGS,
  emptyAppData,
  emptySessionData,
} from './types';

class AppDataStore {
  data = $state<AppData>(emptyAppData());
  loaded = $state(false);
  private unsubscribe: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.data = await getAppData();
      this.loaded = true;
      this.unsubscribe = onAppDataChange((next) => {
        this.data = next;
      });
    })();
    return this.initPromise;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.initPromise = null;
    this.loaded = false;
  }
}

class SessionDataStore {
  data = $state<SessionData>(emptySessionData());
  loaded = $state(false);
  private unsubscribe: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.data = await getSessionData();
      this.loaded = true;
      this.unsubscribe = onSessionDataChange((next) => {
        this.data = next;
      });
    })();
    return this.initPromise;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.initPromise = null;
    this.loaded = false;
  }
}

class SettingsStore {
  value = $state<Settings>(DEFAULT_SETTINGS);
  loaded = $state(false);
  private unsubscribe: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.value = await getSettings();
      this.loaded = true;
      this.unsubscribe = onSettingsChange((next) => {
        this.value = next;
      });
    })();
    return this.initPromise;
  }

  async update(patch: Partial<Settings>): Promise<void> {
    const next: Settings = { ...this.value, ...patch };
    this.value = next;
    await persistSettings(next);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.initPromise = null;
    this.loaded = false;
  }
}

/**
 * Which top-level pane the side panel is showing. Ephemeral; resets to 'tabs'
 * on every side-panel mount. (Persisting it would cause a "where am I?" jolt
 * across sessions.)
 */
export type ViewMode = 'tabs' | 'stash';

class ViewStore {
  mode = $state<ViewMode>('tabs');
  set(next: ViewMode): void {
    this.mode = next;
  }
}

export const appDataStore = new AppDataStore();
export const sessionDataStore = new SessionDataStore();
export const settingsStore = new SettingsStore();
export const viewStore = new ViewStore();
