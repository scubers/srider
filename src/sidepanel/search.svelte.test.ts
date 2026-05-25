import { afterEach, describe, expect, it } from 'vitest';
import { searchStore } from './search.svelte';
import type { TabRef } from '$shared/types';

function tab(over: Partial<TabRef>): TabRef {
  return {
    id: 't',
    url: 'https://example.com',
    title: 'Example',
    chromeTabId: 1,
    addedAt: 0,
    ...over,
  };
}

afterEach(() => {
  searchStore.clear();
});

describe('searchStore.match', () => {
  it('matches everything when no query is active', () => {
    expect(searchStore.match(tab({ title: 'anything' }))).toBe(true);
  });

  it('matches on title (case-insensitive)', () => {
    searchStore.query = 'EXAMPLE';
    expect(searchStore.match(tab({ title: 'My Example Page' }))).toBe(true);
  });

  it('matches on URL', () => {
    searchStore.query = 'github';
    expect(searchStore.match(tab({ title: 'Repo', url: 'https://github.com/x' }))).toBe(true);
  });

  it('matches on the user-set alias even when title and URL do not', () => {
    searchStore.query = 'taxes';
    const t = tab({ title: 'Untitled spreadsheet', url: 'https://sheets.example/1', name: 'Taxes 2025' });
    expect(searchStore.match(t)).toBe(true);
  });

  it('does not match when query is absent from title, URL, and alias', () => {
    searchStore.query = 'zzz';
    expect(searchStore.match(tab({ title: 'Example', url: 'https://a.com', name: 'Notes' }))).toBe(false);
  });

  it('does not throw on a tab without an alias', () => {
    searchStore.query = 'q';
    expect(searchStore.match(tab({ name: undefined }))).toBe(false);
  });
});
