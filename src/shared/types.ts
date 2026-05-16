/**
 * Core data types for Side Tab. See docs/superpowers/specs/2026-05-16-side-tab-extension-design.md §4.
 *
 * All persisted state lives under three storage keys:
 *   - chrome.storage.local  → AppData (groups, tabs, window states)
 *   - chrome.storage.sync   → Settings
 *   - chrome.storage.session → SessionState (pendingOpens, windowBuffers)
 */

export const SCHEMA_VERSION = 1 as const;

export type WindowUUID = string;
export type GroupId = string;
export type TabRefId = string;

/** A reference to a tab. `chromeTabId` is null when the tab is closed (saved). */
export interface TabRef {
  /** Stable UUID. Survives session restore. NOT the Chrome tabId. */
  id: TabRefId;
  url: string;
  title: string;
  favIconUrl?: string;
  /** Live mapping to Chrome's ephemeral tabId. null = saved (closed). */
  chromeTabId: number | null;
  /**
   * If true, the TabRef is retained as `saved` when its Chrome tab is closed.
   * If false/undefined, closing the tab removes the TabRef from the group
   * entirely. Pin only has meaning inside groups; entries in untrackedTabs
   * are always live-only.
   */
  pinned?: boolean;
  addedAt: number;
}

export interface Group {
  id: GroupId;
  name: string;
  collapsed: boolean;
  /** Order is array position. Do not introduce an `order` field. */
  tabs: TabRef[];
  createdAt: number;
}

export interface WindowState {
  id: WindowUUID;
  /** Current Chrome windowId. Changes across restart. null when window is closed. */
  chromeWindowId: number | null;
  groups: Group[];
  /**
   * Live tabs that don't belong to any group. All newly-created Chrome tabs
   * land here; the user drags them into a group manually.
   */
  untrackedTabs: TabRef[];
  /** URL set captured at last update, used for matching restored windows. */
  fingerprint: string[];
  fingerprintUpdatedAt: number;
}

export interface AppData {
  windows: Record<WindowUUID, WindowState>;
  schemaVersion: number;
}

export type Theme = 'light' | 'dark' | 'system';
export type SavedTabClickBehavior = 'current-tab' | 'new-tab' | 'new-window';

export interface Settings {
  theme: Theme;
  showFavicons: boolean;
  savedTabClickBehavior: SavedTabClickBehavior;
  defaultGroupExpanded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  showFavicons: true,
  savedTabClickBehavior: 'new-tab',
  defaultGroupExpanded: true,
};

export function emptyAppData(): AppData {
  return { windows: {}, schemaVersion: SCHEMA_VERSION };
}

export function emptyWindowState(id: WindowUUID, chromeWindowId: number | null): WindowState {
  return {
    id,
    chromeWindowId,
    groups: [],
    untrackedTabs: [],
    fingerprint: [],
    fingerprintUpdatedAt: Date.now(),
  };
}
