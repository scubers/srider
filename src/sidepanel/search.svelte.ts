/**
 * Side-panel-only search state. Filters the displayed tab list by title/URL
 * substring (case-insensitive). Ephemeral — not persisted across reloads.
 *
 * Used cooperatively by Group, UntrackedSection, GroupHeader and TabItem:
 *   - listing components hide themselves when search is active and they have
 *     no matches
 *   - GroupHeader force-expands during search (without touching
 *     group.collapsed in storage) and disables manual collapse to avoid the
 *     "click does nothing" confusion
 *   - TabItem highlights the matched substring in the rendered title
 */
import type { TabRef } from '$shared/types';

class SearchStore {
  /** Raw input string from <SearchBox>. */
  query = $state('');

  /** Lower-cased, trimmed query used for comparison. Empty ⇒ no filter. */
  normalized = $derived(this.query.trim().toLowerCase());

  /** True when a non-empty query is active. */
  active = $derived(this.normalized.length > 0);

  /**
   * Returns true when no query is active OR when `tab` matches the query
   * against either its title or its URL (case-insensitive substring).
   */
  match(tab: TabRef): boolean {
    if (!this.active) return true;
    const q = this.normalized;
    return (
      tab.title.toLowerCase().includes(q) ||
      tab.url.toLowerCase().includes(q)
    );
  }

  clear(): void {
    this.query = '';
  }
}

export const searchStore = new SearchStore();
