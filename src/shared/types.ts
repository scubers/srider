/**
 * Core data types for Side Tab. See docs/superpowers/specs/2026-05-19-side-tab-redesign-design.md.
 *
 * Storage split:
 *   - chrome.storage.local   → AppData (Stash only — the persistent layer)
 *   - chrome.storage.session → SessionData (per-window state keyed by chromeWindowId;
 *                              survives SW recycling, lost on browser restart)
 *   - chrome.storage.sync    → Settings (cross-device sync)
 *
 * The previous UUID + Jaccard window-matching mechanism is gone. Windows are
 * referenced by Chrome's own `chromeWindowId` (a number) for the duration of
 * the browser session. To persist anything across browser restart, the user
 * saves it to Stash.
 */

export const SCHEMA_VERSION = 2 as const;

export type ChromeWindowId = number;
export type ChromeTabId = number;

export type GroupId = string;
export type TabRefId = string;
export type StashFolderId = string;
export type StashItemId = string;

/**
 * A live tab inside a per-window Group or untrackedTabs.
 * Always live (chromeTabId always set). When the underlying Chrome tab closes,
 * the TabRef is deleted from its container — there is no "saved" state.
 * Persistent storage of URL snapshots lives in Stash.
 */
export interface TabRef {
  /** Stable UUID for this TabRef. Survives URL navigation; new each Chrome tab. */
  id: TabRefId;
  url: string;
  title: string;
  favIconUrl?: string;
  /** The Chrome tab this TabRef tracks. Always set. */
  chromeTabId: ChromeTabId;
  addedAt: number;
  /** User-provided alias rendered as `(name) title`. Empty/undefined means no alias. */
  name?: string;
}

export type GroupKind = 'manual' | 'auto-domain';

export interface Group {
  id: GroupId;
  name: string;
  collapsed: boolean;
  /** Order is array position. Do not introduce an `order` field. */
  tabs: TabRef[];
  createdAt: number;
  kind: GroupKind;
  /** Required when kind === 'auto-domain'. Used as merge key when auto-grouping again. */
  autoDomain?: string;
}

/**
 * State for one Chrome window. Lives in chrome.storage.session; lost when the
 * window closes or the browser restarts.
 */
export interface WindowState {
  chromeWindowId: ChromeWindowId;
  /** Manual + auto-domain groups in one list. `kind` distinguishes them. */
  groups: Group[];
  /** Live tabs not in any group. Auto-group operates on this. */
  untrackedTabs: TabRef[];
}

/** Session storage shape. */
export interface SessionData {
  windows: Record<ChromeWindowId, WindowState>;
}

/**
 * A bookmark-like persistent collection. The only thing that survives browser
 * restart. Click semantics: clicking an item opens a new Chrome tab and that
 * new tab lands in the current window's untrackedTabs. The item itself is
 * never consumed.
 */
export interface StashFolder {
  id: StashFolderId;
  name: string;
  collapsed: boolean;
  items: StashItem[];
  createdAt: number;
}

export interface StashItem {
  id: StashItemId;
  url: string;
  title: string;
  favIconUrl?: string;
  addedAt: number;
  /** User-provided alias. Carried in/out of Stash with the item. */
  name?: string;
}

/** Local storage shape. */
export interface AppData {
  stash: StashFolder[];
  schemaVersion: number;
}

export type Theme = 'light' | 'dark' | 'system';
export type StashClickBehavior = 'current-tab' | 'new-tab' | 'new-window';
export type Locale = 'en' | 'zh' | 'ja';
export type LanguageSetting = 'auto' | Locale;

export interface Settings {
  theme: Theme;
  showFavicons: boolean;
  /** Behavior when clicking a Stash item. */
  stashClickBehavior: StashClickBehavior;
  defaultGroupExpanded: boolean;
  language: LanguageSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  showFavicons: true,
  stashClickBehavior: 'new-tab',
  defaultGroupExpanded: true,
  language: 'auto',
};

export function emptyAppData(): AppData {
  return { stash: [], schemaVersion: SCHEMA_VERSION };
}

export function emptySessionData(): SessionData {
  return { windows: {} };
}

export function emptyWindowState(chromeWindowId: ChromeWindowId): WindowState {
  return {
    chromeWindowId,
    groups: [],
    untrackedTabs: [],
  };
}
