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

const SAFE_FAVICON_SCHEMES = new Set(['http:', 'https:', 'chrome:', 'chrome-extension:']);

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
