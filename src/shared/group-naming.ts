/**
 * Naming helpers for auto-domain groups.
 *
 * When a fresh auto-domain group is created we pick the shortest non-empty
 * tab title in the bucket — homepages and index pages usually have the
 * shortest titles and best represent "the site itself" — then append the
 * domain in parens:
 *
 *   "哔哩哔哩 (°-°)つ口 干杯~-bilibili(bilibili.com)"
 *
 * UI truncates with CSS ellipsis; the full string is exposed via the header
 * `title` tooltip on hover.
 *
 * Only invoked at group **creation**. Merging more tabs into an existing
 * auto-domain group keeps the existing name, so renames and the initial
 * pick stay stable.
 */
export function formatAutoGroupName(domain: string, titles: readonly string[]): string {
  const base = pickShortestTitle(titles);
  if (!base) return domain;
  return `${base}(${domain})`;
}

function pickShortestTitle(titles: readonly string[]): string | null {
  let best: string | null = null;
  for (const raw of titles) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (best === null || trimmed.length < best.length) best = trimmed;
  }
  return best;
}
