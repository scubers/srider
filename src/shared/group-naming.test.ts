import { describe, it, expect } from 'vitest';
import { formatAutoGroupName } from './group-naming';

describe('formatAutoGroupName', () => {
  it('wraps a single-tab bucket title with the domain in parens', () => {
    expect(
      formatAutoGroupName('bilibili.com', ['哔哩哔哩 (°-°)つ口 干杯~-bilibili']),
    ).toBe('哔哩哔哩 (°-°)つ口 干杯~-bilibili(bilibili.com)');
  });

  it('picks the shortest non-empty title across a multi-tab bucket', () => {
    expect(
      formatAutoGroupName('github.com', [
        'anthropics/claude-code · Pull requests · GitHub',
        'GitHub',
        'anthropics/claude-code · Issues · GitHub',
      ]),
    ).toBe('GitHub(github.com)');
  });

  it('trims whitespace before measuring length', () => {
    expect(
      formatAutoGroupName('example.com', ['   short   ', 'a much longer title']),
    ).toBe('short(example.com)');
  });

  it('skips empty/whitespace-only titles', () => {
    expect(
      formatAutoGroupName('news.example.com', ['', '   ', 'Top story headline']),
    ).toBe('Top story headline(news.example.com)');
  });

  it('falls back to the bare domain when every title is empty', () => {
    expect(formatAutoGroupName('example.com', ['', '   ', ''])).toBe('example.com');
  });

  it('falls back to the bare domain on an empty bucket', () => {
    expect(formatAutoGroupName('example.com', [])).toBe('example.com');
  });

  it('keeps the earlier title on a length tie', () => {
    // Both "aaaa" — earlier wins because `<` not `<=`.
    expect(formatAutoGroupName('x.com', ['aaaa', 'bbbb'])).toBe('aaaa(x.com)');
  });
});
