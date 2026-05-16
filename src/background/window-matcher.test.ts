import { describe, it, expect } from 'vitest';
import {
  jaccard,
  matchWindows,
  cleanupOrphans,
  ORPHAN_TTL_MS,
  type ChromeWindowSnapshot,
} from './window-matcher';
import { emptyAppData, emptyWindowState } from '$shared/types';
import { uuid } from '$shared/id';

describe('jaccard', () => {
  it('returns 1 for two empty sets', () => {
    expect(jaccard([], [])).toBe(1);
  });

  it('returns 0 for fully disjoint sets', () => {
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('computes a partial overlap', () => {
    // {a,b,c} ∩ {b,c,d} = 2, union = 4, 2/4 = 0.5
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });

  it('deduplicates inputs', () => {
    expect(jaccard(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('matchWindows', () => {
  it('creates a new WindowState when no matches exist', () => {
    const data = emptyAppData();
    const snapshot: ChromeWindowSnapshot = {
      chromeWindowId: 1,
      tabs: [{ chromeTabId: 11, url: 'https://a.example', title: 'A' }],
    };
    const result = matchWindows(data, [snapshot]);
    expect(result.newWindowIds).toHaveLength(1);
    expect(result.matchedWindowIds).toHaveLength(0);
    const state = data.windows[result.newWindowIds[0]];
    expect(state).toBeDefined();
    expect(state.chromeWindowId).toBe(1);
    expect(state.untrackedTabs).toHaveLength(1);
    expect(state.untrackedTabs[0].chromeTabId).toBe(11);
    expect(state.fingerprint).toEqual(['https://a.example']);
  });

  it('matches a stored WindowState by Jaccard similarity', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, null);
    state.fingerprint = ['https://a.example', 'https://b.example'];
    state.fingerprintUpdatedAt = Date.now() - 1000;
    data.windows[id] = state;

    const snapshot: ChromeWindowSnapshot = {
      chromeWindowId: 42,
      tabs: [
        { chromeTabId: 1, url: 'https://a.example', title: 'A' },
        { chromeTabId: 2, url: 'https://b.example', title: 'B' },
      ],
    };

    const result = matchWindows(data, [snapshot]);
    expect(result.matchedWindowIds).toEqual([id]);
    expect(data.windows[id].chromeWindowId).toBe(42);
    expect(data.windows[id].untrackedTabs).toHaveLength(2);
  });

  it('greedily assigns Chrome windows to best-matching stored states', () => {
    const data = emptyAppData();

    const idA = uuid();
    const a = emptyWindowState(idA, null);
    a.fingerprint = ['https://work-1', 'https://work-2', 'https://work-3'];
    data.windows[idA] = a;

    const idB = uuid();
    const b = emptyWindowState(idB, null);
    b.fingerprint = ['https://home-1', 'https://home-2'];
    data.windows[idB] = b;

    const snapshots: ChromeWindowSnapshot[] = [
      {
        chromeWindowId: 1,
        tabs: [
          { chromeTabId: 1, url: 'https://home-1', title: 'h1' },
          { chromeTabId: 2, url: 'https://home-2', title: 'h2' },
        ],
      },
      {
        chromeWindowId: 2,
        tabs: [
          { chromeTabId: 3, url: 'https://work-1', title: 'w1' },
          { chromeTabId: 4, url: 'https://work-2', title: 'w2' },
        ],
      },
    ];

    const result = matchWindows(data, snapshots);
    expect(new Set(result.matchedWindowIds)).toEqual(new Set([idA, idB]));
    expect(data.windows[idA].chromeWindowId).toBe(2);
    expect(data.windows[idB].chromeWindowId).toBe(1);
  });

  it('binds TabRef.chromeTabId by URL within a matched window', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, null);
    state.fingerprint = ['https://a', 'https://b'];
    state.groups = [
      {
        id: 'g1',
        name: 'Group',
        collapsed: false,
        createdAt: 0,
        tabs: [
          { id: 't-a', url: 'https://a', title: 'a', chromeTabId: null, addedAt: 0 },
          { id: 't-b', url: 'https://b', title: 'b', chromeTabId: null, addedAt: 0 },
        ],
      },
    ];
    data.windows[id] = state;

    matchWindows(data, [
      {
        chromeWindowId: 7,
        tabs: [
          { chromeTabId: 100, url: 'https://a', title: 'A' },
          { chromeTabId: 200, url: 'https://b', title: 'B' },
        ],
      },
    ]);

    expect(state.groups[0].tabs[0].chromeTabId).toBe(100);
    expect(state.groups[0].tabs[1].chromeTabId).toBe(200);
  });

  it('marks unmatched stored TabRefs as saved (chromeTabId=null)', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, null);
    state.fingerprint = ['https://a', 'https://gone'];
    state.groups = [
      {
        id: 'g1',
        name: 'Group',
        collapsed: false,
        createdAt: 0,
        tabs: [
          { id: 't-a', url: 'https://a', title: 'a', chromeTabId: 999, addedAt: 0 },
          { id: 't-g', url: 'https://gone', title: 'gone', chromeTabId: 998, addedAt: 0 },
        ],
      },
    ];
    data.windows[id] = state;

    matchWindows(data, [
      {
        chromeWindowId: 7,
        tabs: [{ chromeTabId: 100, url: 'https://a', title: 'A' }],
      },
    ]);

    expect(state.groups[0].tabs[0].chromeTabId).toBe(100);
    expect(state.groups[0].tabs[1].chromeTabId).toBeNull();
  });
});

describe('cleanupOrphans', () => {
  it('removes WindowStates closed long enough ago', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, null);
    state.fingerprintUpdatedAt = 0; // ancient
    data.windows[id] = state;

    const removed = cleanupOrphans(data, ORPHAN_TTL_MS + 1);
    expect(removed).toEqual([id]);
    expect(data.windows[id]).toBeUndefined();
  });

  it('keeps WindowStates updated recently', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, null);
    state.fingerprintUpdatedAt = Date.now();
    data.windows[id] = state;

    const removed = cleanupOrphans(data);
    expect(removed).toEqual([]);
    expect(data.windows[id]).toBeDefined();
  });

  it('keeps WindowStates that are still bound to a Chrome window', () => {
    const data = emptyAppData();
    const id = uuid();
    const state = emptyWindowState(id, 1);
    state.fingerprintUpdatedAt = 0;
    data.windows[id] = state;

    const removed = cleanupOrphans(data, ORPHAN_TTL_MS + 1);
    expect(removed).toEqual([]);
  });
});
