/**
 * Pure logic for cross-restart group recovery. See
 * docs/superpowers/specs/2026-05-26-restart-group-recovery-design.md.
 *
 * Nothing here touches chrome.* — tab-handlers.ts does the I/O (queries Chrome,
 * reads the mirror, writes session) and calls into these functions. Keeping the
 * fragile matching logic pure makes it fully unit-testable and isolates it to a
 * single startup code path (we never re-associate windows incrementally).
 */
import type {
  ChromeWindowId,
  Group,
  MirrorGroup,
  MirrorTab,
  MirrorWindow,
  SessionData,
  SessionMirror,
  TabRef,
  WindowState,
} from '$shared/types';
import { SCHEMA_VERSION } from '$shared/types';
import { uuid } from '$shared/id';
import { sameTabUrl } from '$shared/url';

/** Below this Jaccard similarity a reopened window is treated as brand-new. */
export const WINDOW_MATCH_THRESHOLD = 0.5;

/**
 * A Chrome window as seen at startup, normalized off `chrome.windows.Window`.
 * `tabs` is in Chrome tab-index order.
 */
export interface ReopenedTab {
  chromeTabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}
export interface ReopenedWindow {
  id: ChromeWindowId;
  tabs: ReopenedTab[];
}

// ---------- Projection (live SessionData → mirror) ----------

export function projectToMirror(session: SessionData): SessionMirror {
  const windows: MirrorWindow[] = Object.values(session.windows).map((state) => ({
    groups: state.groups.map(projectGroup),
    untracked: state.untrackedTabs.map(projectTab),
  }));
  return { windows, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() };
}

function projectGroup(group: Group): MirrorGroup {
  const mg: MirrorGroup = {
    name: group.name,
    collapsed: group.collapsed,
    kind: group.kind,
    tabs: group.tabs.map(projectTab),
  };
  if (group.autoDomain !== undefined) mg.autoDomain = group.autoDomain;
  return mg;
}

function projectTab(tab: TabRef): MirrorTab {
  return tab.name ? { url: tab.url, name: tab.name } : { url: tab.url };
}

// ---------- Window-level matching ----------

/**
 * Assign each reopened window to at most one mirror window by URL-set Jaccard
 * similarity, using a one-shot global greedy assignment (highest score first,
 * disjoint). Returns chromeWindowId → MirrorWindow for matched windows only.
 */
export function matchWindows(
  reopened: ReopenedWindow[],
  mirrorWindows: MirrorWindow[],
  threshold: number,
): Map<ChromeWindowId, MirrorWindow> {
  const result = new Map<ChromeWindowId, MirrorWindow>();
  if (reopened.length === 0 || mirrorWindows.length === 0) return result;

  const reopenedSets = reopened.map((w) => new Set(w.tabs.map((t) => t.url)));
  const mirrorSets = mirrorWindows.map((mw) => new Set(mirrorUrls(mw)));

  interface Candidate {
    ri: number;
    mi: number;
    score: number;
    inter: number;
  }
  const candidates: Candidate[] = [];
  for (let ri = 0; ri < reopened.length; ri++) {
    for (let mi = 0; mi < mirrorWindows.length; mi++) {
      const { score, inter } = jaccard(reopenedSets[ri], mirrorSets[mi]);
      if (score >= threshold) candidates.push({ ri, mi, score, inter });
    }
  }
  // Highest score first; ties → larger absolute overlap; then index order so the
  // assignment is deterministic.
  candidates.sort(
    (a, b) => b.score - a.score || b.inter - a.inter || a.ri - b.ri || a.mi - b.mi,
  );

  const usedReopened = new Set<number>();
  const usedMirror = new Set<number>();
  for (const c of candidates) {
    if (usedReopened.has(c.ri) || usedMirror.has(c.mi)) continue;
    usedReopened.add(c.ri);
    usedMirror.add(c.mi);
    result.set(reopened[c.ri].id, mirrorWindows[c.mi]);
  }
  return result;
}

function mirrorUrls(mw: MirrorWindow): string[] {
  const urls: string[] = [];
  for (const g of mw.groups) for (const t of g.tabs) urls.push(t.url);
  for (const t of mw.untracked) urls.push(t.url);
  return urls;
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; inter: number } {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return { score: union === 0 ? 0 : inter / union, inter };
}

// ---------- Tab-level rebinding ----------

/**
 * Rebuild a WindowState by placing the reopened window's live tabs into the
 * mirror's groups/untracked by URL. Consumed positionally so duplicate URLs are
 * handled deterministically. Members whose URL didn't reopen are skipped; a
 * group left empty is dropped; tabs not mentioned by the mirror land untracked.
 */
export function rebindWindow(reopened: ReopenedWindow, mirror: MirrorWindow): WindowState {
  const pool = [...reopened.tabs];
  const state: WindowState = {
    chromeWindowId: reopened.id,
    groups: [],
    untrackedTabs: [],
  };

  for (const mg of mirror.groups) {
    const group: Group = {
      id: uuid(),
      name: mg.name,
      collapsed: mg.collapsed,
      kind: mg.kind,
      createdAt: Date.now(),
      tabs: [],
    };
    if (mg.autoDomain !== undefined) group.autoDomain = mg.autoDomain;
    for (const mt of mg.tabs) {
      const tab = consumeFromPool(pool, mt.url);
      if (tab) group.tabs.push(tabRefFromReopened(tab, mt.name));
    }
    if (group.tabs.length > 0) state.groups.push(group);
  }

  for (const mt of mirror.untracked) {
    const tab = consumeFromPool(pool, mt.url);
    if (tab) state.untrackedTabs.push(tabRefFromReopened(tab, mt.name));
  }

  // Leftover reopened tabs (not mentioned by the mirror) → untracked, no alias.
  for (const tab of pool) state.untrackedTabs.push(tabRefFromReopened(tab));

  return state;
}

/** Remove and return the first pooled tab whose URL matches; null if none. Mutates `pool`. */
export function consumeFromPool(pool: ReopenedTab[], url: string): ReopenedTab | null {
  const idx = pool.findIndex((t) => sameTabUrl(t.url, url));
  if (idx < 0) return null;
  return pool.splice(idx, 1)[0];
}

export function tabRefFromReopened(tab: ReopenedTab, name?: string): TabRef {
  const ref: TabRef = {
    id: uuid(),
    url: tab.url,
    title: tab.title || tab.url,
    chromeTabId: tab.chromeTabId,
    addedAt: Date.now(),
  };
  if (tab.favIconUrl) ref.favIconUrl = tab.favIconUrl;
  if (name) ref.name = name;
  return ref;
}
