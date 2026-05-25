import { describe, it, expect } from 'vitest';
import {
  projectToMirror,
  matchWindows,
  rebindWindow,
  consumeFromPool,
  tabRefFromReopened,
  WINDOW_MATCH_THRESHOLD,
  type ReopenedTab,
  type ReopenedWindow,
} from './session-restore';
import {
  SCHEMA_VERSION,
  type MirrorWindow,
  type SessionData,
  type TabRef,
  type WindowState,
} from '$shared/types';

// ---------- builders ----------

function tabRef(over: Partial<TabRef> & { url: string; chromeTabId: number }): TabRef {
  return { id: `ref-${over.chromeTabId}`, title: over.url, addedAt: 0, ...over };
}

function reTab(url: string, chromeTabId: number, extra: Partial<ReopenedTab> = {}): ReopenedTab {
  return { url, chromeTabId, title: url, ...extra };
}

function reWin(id: number, tabs: ReopenedTab[]): ReopenedWindow {
  return { id, tabs };
}

// ---------- projectToMirror ----------

describe('projectToMirror', () => {
  it('strips ids/chromeTabId, keeps url+name+group meta and order', () => {
    const state: WindowState = {
      chromeWindowId: 7,
      groups: [
        {
          id: 'g1',
          name: 'Work',
          collapsed: false,
          kind: 'manual',
          createdAt: 123,
          tabs: [
            tabRef({ url: 'https://a.com', chromeTabId: 11, name: 'Alpha' }),
            tabRef({ url: 'https://b.com', chromeTabId: 12 }),
          ],
        },
        {
          id: 'g2',
          name: 'github.com',
          collapsed: true,
          kind: 'auto-domain',
          autoDomain: 'github.com',
          createdAt: 124,
          tabs: [tabRef({ url: 'https://github.com/x', chromeTabId: 13 })],
        },
      ],
      untrackedTabs: [
        tabRef({ url: 'https://u.com', chromeTabId: 14, name: 'Unt' }),
        tabRef({ url: 'https://v.com', chromeTabId: 15 }),
      ],
    };
    const session: SessionData = { windows: { 7: state } };

    const mirror = projectToMirror(session);

    expect(mirror.schemaVersion).toBe(SCHEMA_VERSION);
    expect(mirror.windows).toHaveLength(1);
    const mw = mirror.windows[0];
    expect(mw.groups[0]).toEqual({
      name: 'Work',
      collapsed: false,
      kind: 'manual',
      tabs: [{ url: 'https://a.com', name: 'Alpha' }, { url: 'https://b.com' }],
    });
    expect(mw.groups[1]).toEqual({
      name: 'github.com',
      collapsed: true,
      kind: 'auto-domain',
      autoDomain: 'github.com',
      tabs: [{ url: 'https://github.com/x' }],
    });
    expect(mw.untracked).toEqual([{ url: 'https://u.com', name: 'Unt' }, { url: 'https://v.com' }]);
    // No leaked ids anywhere.
    expect(JSON.stringify(mirror)).not.toContain('chromeTabId');
    expect(JSON.stringify(mirror)).not.toContain('ref-11');
  });

  it('omits autoDomain for manual groups and name for unaliased tabs', () => {
    const session: SessionData = {
      windows: {
        1: {
          chromeWindowId: 1,
          groups: [
            {
              id: 'g',
              name: 'M',
              collapsed: false,
              kind: 'manual',
              createdAt: 0,
              tabs: [tabRef({ url: 'https://a.com', chromeTabId: 1 })],
            },
          ],
          untrackedTabs: [],
        },
      },
    };
    const mw = projectToMirror(session).windows[0];
    expect('autoDomain' in mw.groups[0]).toBe(false);
    expect('name' in mw.groups[0].tabs[0]).toBe(false);
  });
});

// ---------- matchWindows ----------

describe('matchWindows', () => {
  const mw = (urls: string[]): MirrorWindow => ({
    groups: [
      {
        name: 'g',
        collapsed: false,
        kind: 'manual',
        tabs: urls.map((url) => ({ url })),
      },
    ],
    untracked: [],
  });

  it('matches a single window with identical URL set', () => {
    const reopened = [reWin(1, [reTab('https://a.com', 11), reTab('https://b.com', 12)])];
    const mirror = [mw(['https://a.com', 'https://b.com'])];
    const res = matchWindows(reopened, mirror, WINDOW_MATCH_THRESHOLD);
    expect(res.get(1)).toBe(mirror[0]);
  });

  it('pairs two distinct windows correctly regardless of mirror order', () => {
    const reopened = [
      reWin(1, [reTab('https://a.com', 11), reTab('https://b.com', 12)]),
      reWin(2, [reTab('https://c.com', 21), reTab('https://d.com', 22)]),
    ];
    // Mirror in reverse order relative to reopened windows.
    const mCD = mw(['https://c.com', 'https://d.com']);
    const mAB = mw(['https://a.com', 'https://b.com']);
    const res = matchWindows(reopened, [mCD, mAB], WINDOW_MATCH_THRESHOLD);
    expect(res.get(1)).toBe(mAB);
    expect(res.get(2)).toBe(mCD);
  });

  it('does not match below the threshold', () => {
    const reopened = [
      reWin(1, [
        reTab('https://a.com', 11),
        reTab('https://b.com', 12),
        reTab('https://c.com', 13),
        reTab('https://d.com', 14),
      ]),
    ];
    const mirror = [mw(['https://a.com'])]; // jaccard 1/4 = 0.25
    const res = matchWindows(reopened, mirror, WINDOW_MATCH_THRESHOLD);
    expect(res.size).toBe(0);
  });

  it('leaves extra reopened windows unmatched when mirror has fewer', () => {
    const reopened = [
      reWin(1, [reTab('https://a.com', 11)]),
      reWin(2, [reTab('https://z.com', 21)]),
    ];
    const mirror = [mw(['https://a.com'])];
    const res = matchWindows(reopened, mirror, WINDOW_MATCH_THRESHOLD);
    expect(res.get(1)).toBe(mirror[0]);
    expect(res.has(2)).toBe(false);
  });

  it('uses at most one mirror window per reopened window when mirror has more', () => {
    const reopened = [reWin(1, [reTab('https://a.com', 11)])];
    const mirror = [mw(['https://a.com']), mw(['https://a.com'])];
    const res = matchWindows(reopened, mirror, WINDOW_MATCH_THRESHOLD);
    expect(res.size).toBe(1);
    expect(res.get(1)).toBe(mirror[0]); // index tiebreak → first
  });

  it('is deterministic on ties (assigns by index)', () => {
    const reopened = [reWin(1, [reTab('https://a.com', 11)]), reWin(2, [reTab('https://a.com', 21)])];
    const m0 = mw(['https://a.com']);
    const m1 = mw(['https://a.com']);
    const res = matchWindows(reopened, [m0, m1], WINDOW_MATCH_THRESHOLD);
    expect(res.get(1)).toBe(m0);
    expect(res.get(2)).toBe(m1);
  });

  it('returns empty for empty inputs', () => {
    expect(matchWindows([], [mw(['x'])], 0.5).size).toBe(0);
    expect(matchWindows([reWin(1, [reTab('x', 1)])], [], 0.5).size).toBe(0);
  });
});

// ---------- rebindWindow ----------

describe('rebindWindow', () => {
  it('fully restores groups, aliases, and order', () => {
    const reopened = reWin(1, [
      reTab('https://a.com', 11),
      reTab('https://b.com', 12),
      reTab('https://c.com', 13),
    ]);
    const mirror: MirrorWindow = {
      groups: [
        {
          name: 'Work',
          collapsed: false,
          kind: 'manual',
          tabs: [{ url: 'https://a.com', name: 'AA' }, { url: 'https://b.com' }],
        },
      ],
      untracked: [{ url: 'https://c.com', name: 'CC' }],
    };
    const state = rebindWindow(reopened, mirror);

    expect(state.chromeWindowId).toBe(1);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].name).toBe('Work');
    expect(state.groups[0].tabs.map((t) => [t.url, t.chromeTabId, t.name])).toEqual([
      ['https://a.com', 11, 'AA'],
      ['https://b.com', 12, undefined],
    ]);
    expect(state.untrackedTabs.map((t) => [t.url, t.chromeTabId, t.name])).toEqual([
      ['https://c.com', 13, 'CC'],
    ]);
  });

  it('keeps only reopened members on partial restore, preserving order', () => {
    const reopened = reWin(1, [reTab('https://a.com', 11), reTab('https://c.com', 13)]);
    const mirror: MirrorWindow = {
      groups: [
        {
          name: 'Work',
          collapsed: false,
          kind: 'manual',
          tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }, { url: 'https://c.com' }],
        },
      ],
      untracked: [],
    };
    const state = rebindWindow(reopened, mirror);
    expect(state.groups[0].tabs.map((t) => t.url)).toEqual(['https://a.com', 'https://c.com']);
  });

  it('drops a group whose members did not reopen', () => {
    const reopened = reWin(1, [reTab('https://a.com', 11)]);
    const mirror: MirrorWindow = {
      groups: [
        { name: 'Gone', collapsed: false, kind: 'manual', tabs: [{ url: 'https://x.com' }] },
        { name: 'Keep', collapsed: false, kind: 'manual', tabs: [{ url: 'https://a.com' }] },
      ],
      untracked: [],
    };
    const state = rebindWindow(reopened, mirror);
    expect(state.groups.map((g) => g.name)).toEqual(['Keep']);
  });

  it('consumes duplicate URLs positionally', () => {
    const reopened = reWin(1, [reTab('https://a.com', 11), reTab('https://a.com', 12)]);
    const mirror: MirrorWindow = {
      groups: [
        {
          name: 'Dup',
          collapsed: false,
          kind: 'manual',
          tabs: [{ url: 'https://a.com', name: 'first' }, { url: 'https://a.com', name: 'second' }],
        },
      ],
      untracked: [],
    };
    const state = rebindWindow(reopened, mirror);
    expect(state.groups[0].tabs.map((t) => [t.chromeTabId, t.name])).toEqual([
      [11, 'first'],
      [12, 'second'],
    ]);
  });

  it('sends reopened tabs not in the mirror to untracked', () => {
    const reopened = reWin(1, [reTab('https://a.com', 11), reTab('https://z.com', 99)]);
    const mirror: MirrorWindow = {
      groups: [{ name: 'G', collapsed: false, kind: 'manual', tabs: [{ url: 'https://a.com' }] }],
      untracked: [],
    };
    const state = rebindWindow(reopened, mirror);
    expect(state.groups[0].tabs.map((t) => t.url)).toEqual(['https://a.com']);
    expect(state.untrackedTabs.map((t) => [t.url, t.chromeTabId])).toEqual([['https://z.com', 99]]);
  });

  it('preserves auto-domain kind, autoDomain, and collapsed', () => {
    const reopened = reWin(1, [reTab('https://x.com/1', 11)]);
    const mirror: MirrorWindow = {
      groups: [
        {
          name: 'x.com',
          collapsed: true,
          kind: 'auto-domain',
          autoDomain: 'x.com',
          tabs: [{ url: 'https://x.com/1' }],
        },
      ],
      untracked: [],
    };
    const g = rebindWindow(reopened, mirror).groups[0];
    expect(g.kind).toBe('auto-domain');
    expect(g.autoDomain).toBe('x.com');
    expect(g.collapsed).toBe(true);
  });
});

// ---------- consumeFromPool ----------

describe('consumeFromPool', () => {
  it('removes and returns the first URL match', () => {
    const pool = [reTab('https://a.com', 11), reTab('https://b.com', 12)];
    const got = consumeFromPool(pool, 'https://a.com');
    expect(got?.chromeTabId).toBe(11);
    expect(pool.map((t) => t.chromeTabId)).toEqual([12]);
  });

  it('returns null and leaves the pool intact when absent', () => {
    const pool = [reTab('https://a.com', 11)];
    expect(consumeFromPool(pool, 'https://zzz.com')).toBeNull();
    expect(pool).toHaveLength(1);
  });

  it('consumes duplicates in order', () => {
    const pool = [reTab('https://a.com', 11), reTab('https://a.com', 12)];
    expect(consumeFromPool(pool, 'https://a.com')?.chromeTabId).toBe(11);
    expect(consumeFromPool(pool, 'https://a.com')?.chromeTabId).toBe(12);
    expect(consumeFromPool(pool, 'https://a.com')).toBeNull();
  });
});

// ---------- tabRefFromReopened ----------

describe('tabRefFromReopened', () => {
  it('builds a TabRef with a fresh id and the reopened chromeTabId', () => {
    const ref = tabRefFromReopened(reTab('https://a.com', 11, { favIconUrl: 'https://a.com/f.ico' }), 'Name');
    expect(ref.url).toBe('https://a.com');
    expect(ref.chromeTabId).toBe(11);
    expect(ref.name).toBe('Name');
    expect(ref.favIconUrl).toBe('https://a.com/f.ico');
    expect(typeof ref.id).toBe('string');
    expect(ref.id.length).toBeGreaterThan(0);
  });

  it('falls back to url for an empty title and omits empty alias/favicon', () => {
    const ref = tabRefFromReopened({ url: 'https://a.com', chromeTabId: 1, title: '' });
    expect(ref.title).toBe('https://a.com');
    expect(ref.name).toBeUndefined();
    expect(ref.favIconUrl).toBeUndefined();
  });
});
