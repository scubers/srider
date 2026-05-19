/**
 * Split a text into alternating non-highlighted / highlighted segments based
 * on case-insensitive occurrences of `normalizedQuery`. `normalizedQuery` is
 * expected to be already lowercased and trimmed (the caller — usually the
 * searchStore — owns normalization). An empty query returns the whole text
 * as a single non-highlighted segment.
 *
 * Pure function; covered by highlight.test.ts.
 */
export interface HighlightSegment {
  text: string;
  mark: boolean;
}

export function splitHighlight(
  text: string,
  normalizedQuery: string,
): HighlightSegment[] {
  if (!normalizedQuery) return [{ text, mark: false }];
  if (normalizedQuery.length > text.length) return [{ text, mark: false }];

  const lower = text.toLowerCase();
  const segs: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const hit = lower.indexOf(normalizedQuery, cursor);
    if (hit === -1) {
      segs.push({ text: text.slice(cursor), mark: false });
      break;
    }
    if (hit > cursor) {
      segs.push({ text: text.slice(cursor, hit), mark: false });
    }
    segs.push({
      text: text.slice(hit, hit + normalizedQuery.length),
      mark: true,
    });
    cursor = hit + normalizedQuery.length;
  }

  return segs;
}

export interface AliasHighlightSegment extends HighlightSegment {
  /** True when this segment falls inside the leading `(name) ` alias prefix. */
  alias: boolean;
}

/**
 * Run `splitHighlight` over `aliasPrefix + title`, then tag each segment with
 * whether it sits inside the alias prefix. Segments that straddle the
 * boundary are split into two so the template can colour them independently.
 */
export function splitAliasHighlight(
  aliasPrefix: string,
  title: string,
  normalizedQuery: string,
): AliasHighlightSegment[] {
  const raw = splitHighlight(aliasPrefix + title, normalizedQuery);
  if (!aliasPrefix) return raw.map((s) => ({ ...s, alias: false }));

  const aliasLen = aliasPrefix.length;
  const out: AliasHighlightSegment[] = [];
  let pos = 0;
  for (const seg of raw) {
    const segEnd = pos + seg.text.length;
    if (segEnd <= aliasLen) {
      out.push({ text: seg.text, mark: seg.mark, alias: true });
    } else if (pos >= aliasLen) {
      out.push({ text: seg.text, mark: seg.mark, alias: false });
    } else {
      const cut = aliasLen - pos;
      out.push({ text: seg.text.slice(0, cut), mark: seg.mark, alias: true });
      out.push({ text: seg.text.slice(cut), mark: seg.mark, alias: false });
    }
    pos = segEnd;
  }
  return out;
}
