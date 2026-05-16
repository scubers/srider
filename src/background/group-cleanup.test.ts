import { describe, it, expect } from 'vitest';
import { cleanupEmptyAutoGroups } from './group-cleanup';
import { emptyWindowState, type Group, type TabRef, type WindowState } from '$shared/types';

function tab(id: string, chromeTabId: number | null = 1, pinned = false): TabRef {
  return {
    id,
    url: 'https://example.com',
    title: 'x',
    chromeTabId,
    pinned,
    addedAt: 0,
  };
}

function makeWindow(groups: Group[]): WindowState {
  const w = emptyWindowState('w', 1);
  w.groups = groups;
  return w;
}

describe('cleanupEmptyAutoGroups', () => {
  it('removes auto-domain groups with no tabs', () => {
    const w = makeWindow([
      {
        id: 'g1',
        name: 'github.com',
        collapsed: false,
        tabs: [],
        createdAt: 0,
        kind: 'auto-domain',
        autoDomain: 'github.com',
      },
    ]);
    const removed = cleanupEmptyAutoGroups(w);
    expect(removed).toBe(1);
    expect(w.groups).toHaveLength(0);
  });

  it('keeps auto-domain groups with at least one tab', () => {
    const w = makeWindow([
      {
        id: 'g1',
        name: 'github.com',
        collapsed: false,
        tabs: [tab('t1')],
        createdAt: 0,
        kind: 'auto-domain',
        autoDomain: 'github.com',
      },
    ]);
    expect(cleanupEmptyAutoGroups(w)).toBe(0);
    expect(w.groups).toHaveLength(1);
  });

  it('keeps auto-domain groups whose only tabs are pinned (saved)', () => {
    // After all live tabs close, pinned items remain (chromeTabId=null but
    // tabs.length > 0), so the group is NOT empty and should stay.
    const w = makeWindow([
      {
        id: 'g1',
        name: 'github.com',
        collapsed: false,
        tabs: [tab('t1', null, true), tab('t2', null, true)],
        createdAt: 0,
        kind: 'auto-domain',
        autoDomain: 'github.com',
      },
    ]);
    expect(cleanupEmptyAutoGroups(w)).toBe(0);
    expect(w.groups).toHaveLength(1);
  });

  it('preserves empty manual groups (user created them deliberately)', () => {
    const w = makeWindow([
      {
        id: 'g1',
        name: '工作',
        collapsed: false,
        tabs: [],
        createdAt: 0,
        kind: 'manual',
      },
      {
        id: 'g2',
        name: 'gone',
        collapsed: false,
        tabs: [],
        createdAt: 0,
        // missing kind defaults to 'manual' (legacy data)
      } as Group,
    ]);
    expect(cleanupEmptyAutoGroups(w)).toBe(0);
    expect(w.groups).toHaveLength(2);
  });

  it('removes only the empty auto groups when mixed', () => {
    const w = makeWindow([
      {
        id: 'auto-keep',
        name: 'github.com',
        collapsed: false,
        tabs: [tab('t1')],
        createdAt: 0,
        kind: 'auto-domain',
        autoDomain: 'github.com',
      },
      {
        id: 'auto-empty',
        name: 'twitter.com',
        collapsed: false,
        tabs: [],
        createdAt: 0,
        kind: 'auto-domain',
        autoDomain: 'twitter.com',
      },
      {
        id: 'manual-empty',
        name: '工作',
        collapsed: false,
        tabs: [],
        createdAt: 0,
        kind: 'manual',
      },
    ]);
    expect(cleanupEmptyAutoGroups(w)).toBe(1);
    expect(w.groups.map((g) => g.id)).toEqual(['auto-keep', 'manual-empty']);
  });
});
