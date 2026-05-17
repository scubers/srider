import { describe, it, expect } from 'vitest';
import { splitHighlight } from './highlight';

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
