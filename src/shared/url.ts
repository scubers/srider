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
