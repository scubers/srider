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
 * the browser session. Live tabs themselves come back across a browser restart
 * via Chrome's own "continue where you left off" session restore; to bring the
 * *organization* back with them (group names, membership, tab aliases) we
 * additionally mirror each window's structure to chrome.storage.local as a
 * `SessionMirror` and best-effort re-bind the restored tabs on startup by URL
 * matching (see 2026-05-26-restart-group-recovery-design.md). Anything the user
 * wants kept regardless of whether Chrome reopens the tab still goes to Stash.
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
  /**
   * Set the first time startup rehydration runs in a browser session. Because
   * chrome.storage.session is wiped on browser restart but survives SW
   * recycling, its presence distinguishes "SW woke mid-session (live state is
   * authoritative, don't re-rehydrate)" from "fresh browser session (rebuild
   * from the mirror)". See session-restore.ts / tab-handlers.recoverOnStartup.
   */
  rehydratedAt?: number;
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

/**
 * Cross-restart structure mirror (chrome.storage.local, key `sessionMirror`).
 *
 * A write-through projection of the live per-window `SessionData`, holding only
 * the skeleton needed to rebuild grouping after a browser restart. It stores no
 * ids that change across restart (`chromeTabId` / `chromeWindowId` / `TabRef.id`
 * / `Group.id`) — windows are re-associated by URL-set matching, tabs by URL.
 * UI never reads this; it exists purely for startup rehydration.
 */
export interface SessionMirror {
  /** Order is irrelevant — windows are matched by URL set, not position. */
  windows: MirrorWindow[];
  /** Equals SCHEMA_VERSION at write time; a mismatch on read discards the mirror. */
  schemaVersion: number;
  updatedAt: number;
}

export interface MirrorWindow {
  /** Order = display order. */
  groups: MirrorGroup[];
  /** Order = display order. Present only to restore aliases on untracked tabs. */
  untracked: MirrorTab[];
}

export interface MirrorGroup {
  name: string;
  collapsed: boolean;
  kind: GroupKind;
  /** Only for kind === 'auto-domain'. */
  autoDomain?: string;
  /** Order = in-group order. */
  tabs: MirrorTab[];
}

export interface MirrorTab {
  url: string;
  /** Alias; absent/empty means none. */
  name?: string;
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

export function emptySessionMirror(): SessionMirror {
  return { windows: [], schemaVersion: SCHEMA_VERSION, updatedAt: 0 };
}

export function emptyWindowState(chromeWindowId: ChromeWindowId): WindowState {
  return {
    chromeWindowId,
    groups: [],
    untrackedTabs: [],
  };
}
