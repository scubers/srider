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
