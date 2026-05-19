import { describe, it, expect } from 'vitest';
import { splitAliasHighlight, splitHighlight } from './highlight';

describe('splitHighlight', () => {
  it('returns the whole text un-marked when the query is empty', () => {
    expect(splitHighlight('hello world', '')).toEqual([
      { text: 'hello world', mark: false },
    ]);
  });

  it('returns the whole text un-marked when the query is longer than the text', () => {
    expect(splitHighlight('hi', 'hello')).toEqual([{ text: 'hi', mark: false }]);
  });

  it('marks a single mid-string hit', () => {
    expect(splitHighlight('GitHub PR', 'hub')).toEqual([
      { text: 'Git', mark: false },
      { text: 'Hub', mark: true },
      { text: ' PR', mark: false },
    ]);
  });

  it('marks every occurrence', () => {
    expect(splitHighlight('aaXaaXaa', 'x')).toEqual([
      { text: 'aa', mark: false },
      { text: 'X', mark: true },
      { text: 'aa', mark: false },
      { text: 'X', mark: true },
      { text: 'aa', mark: false },
    ]);
  });

  it('marks a hit at the start with no leading segment', () => {
    expect(splitHighlight('GitHub', 'git')).toEqual([
      { text: 'Git', mark: true },
      { text: 'Hub', mark: false },
    ]);
  });

  it('marks a hit at the end with no trailing segment', () => {
    expect(splitHighlight('docHUB', 'hub')).toEqual([
      { text: 'doc', mark: false },
      { text: 'HUB', mark: true },
    ]);
  });

  it('matches case-insensitively while preserving original casing in the output', () => {
    expect(splitHighlight('GitHub.com', 'github')).toEqual([
      { text: 'GitHub', mark: true },
      { text: '.com', mark: false },
    ]);
  });

  it('returns a single un-marked segment when there is no hit', () => {
    expect(splitHighlight('GitHub', 'rust')).toEqual([
      { text: 'GitHub', mark: false },
    ]);
  });

  it('handles back-to-back hits without producing empty segments', () => {
    expect(splitHighlight('xxxx', 'xx')).toEqual([
      { text: 'xx', mark: true },
      { text: 'xx', mark: true },
    ]);
  });

  it('handles a hit equal to the whole text', () => {
    expect(splitHighlight('exact', 'exact')).toEqual([
      { text: 'exact', mark: true },
    ]);
  });
});

describe('splitAliasHighlight', () => {
  it('tags every segment as non-alias when there is no alias prefix', () => {
    expect(splitAliasHighlight('', 'GitHub', 'hub')).toEqual([
      { text: 'Git', mark: false, alias: false },
      { text: 'Hub', mark: true, alias: false },
    ]);
  });

  it('tags alias-only and title-only segments correctly', () => {
    // alias="(Work) ", title="Docs" — query hits the title, not the prefix.
    expect(splitAliasHighlight('(Work) ', 'Docs', 'docs')).toEqual([
      { text: '(Work) ', mark: false, alias: true },
      { text: 'Docs', mark: true, alias: false },
    ]);
  });

  it('splits a highlight segment that straddles the alias boundary', () => {
    // alias = "(ab) " (length 5), title = "cdef".
    // query "b) c" hits positions 2-5 (alias tail) + 5 (title head).
    // splitHighlight produces: "(a" non-mark | "b) c" mark | "def" non-mark.
    // The straddling "b) c" must split into "b) " alias-mark + "c" title-mark.
    expect(splitAliasHighlight('(ab) ', 'cdef', 'b) c')).toEqual([
      { text: '(a', mark: false, alias: true },
      { text: 'b) ', mark: true, alias: true },
      { text: 'c', mark: true, alias: false },
      { text: 'def', mark: false, alias: false },
    ]);
  });

  it('tags an alias-internal hit correctly', () => {
    expect(splitAliasHighlight('(Work) ', 'Inbox', 'work')).toEqual([
      { text: '(', mark: false, alias: true },
      { text: 'Work', mark: true, alias: true },
      { text: ') ', mark: false, alias: true },
      { text: 'Inbox', mark: false, alias: false },
    ]);
  });
});
