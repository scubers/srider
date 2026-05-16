/**
 * Svelte 5 rune-based reactive stores for AppData and Settings.
 *
 * The UI never writes AppData directly — see CLAUDE.md "Architecture invariants".
 * It subscribes here and mutates via messages or settings updates.
 */
import {
  getAppData,
  getSettings,
  onAppDataChange,
  onSettingsChange,
  setSettings as persistSettings,
} from './storage';
import {
  type AppData,
  type Settings,
  DEFAULT_SETTINGS,
  emptyAppData,
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

  /**
   * Update settings; both UI and service worker will react via onChanged.
   * Unlike AppData, settings can be written from any context.
   */
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

export const appDataStore = new AppDataStore();
export const settingsStore = new SettingsStore();
