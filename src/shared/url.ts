/**
 * URL validation utilities.
 *
 * Saved-tab URLs and external-drop URLs must be vetted before we ask Chrome
 * to navigate to them — otherwise a `javascript:` or `data:` URL could
 * execute in whatever tab the user clicked from, or be persisted into a
 * group and later activated.
 */

const SAFE_SCHEMES = new Set([
  'http:',
  'https:',
  'ftp:',
  'file:',
  'about:',
  'chrome-extension:',
]);

/** True if `url` parses and has a scheme we are willing to navigate to. */
export function isSafeNavigationUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return SAFE_SCHEMES.has(parsed.protocol);
}

/**
 * Schemes we'll trust as <img src> for a favicon. Limited to http(s) on
 * purpose: chrome:// favicons depend on Chrome version (the public
 * `chrome://favicon/…` endpoint was removed in MV3), and
 * `chrome-extension://OTHER_ID/…` favicons are blocked by Chrome unless the
 * owning extension declares them in `web_accessible_resources`. Both produce
 * console warnings on every render. The colored-letter fallback covers those
 * tabs cleanly.
 */
const SAFE_FAVICON_SCHEMES = new Set(['http:', 'https:']);

/** True if `url` is a safe scheme for use as <img src>. */
export function isSafeFaviconUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return SAFE_FAVICON_SCHEMES.has(parsed.protocol);
}

/**
 * Extract a hostname suitable for domain-based grouping. Returns null for
 * URLs that don't have a meaningful host (e.g. about:blank, javascript:).
 *
 * This is a simple hostname (not eTLD+1) — subdomains like `mail.google.com`
 * and `drive.google.com` will produce separate keys. Computing eTLD+1
 * requires bundling a public-suffix list; v1 keeps it simple. Users can
 * rename auto groups freely.
 */
export function extractGroupingDomain(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname) return null;
  // Strip a leading "www." for nicer labels; treat `www.x.com` and `x.com`
  // as the same domain for grouping purposes.
  return parsed.hostname.replace(/^www\./i, '');
}

/**
 * Whether two tab URLs refer to "the same tab" for the purpose of re-binding a
 * restored Chrome tab to its place in the session mirror (see session-restore.ts).
 *
 * v1: exact string equality. Chrome's session restore hands back each tab's last
 * committed URL verbatim, so exact match already has a high hit rate, and it
 * carries zero false-merge risk — the failure mode of looser matching (collapsing
 * `…/watch?v=A` and `…/watch?v=B`, `…?id=1` and `…?id=2`) is worse than the
 * occasional drifted URL that falls back to untracked. Kept as a single function
 * so a future "exact → origin+path" relaxation is a localized change.
 */
export function sameTabUrl(a: string, b: string): boolean {
  return a === b;
}
