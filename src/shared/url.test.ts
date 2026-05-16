import { describe, it, expect } from 'vitest';
import { isSafeNavigationUrl, isSafeFaviconUrl } from './url';

describe('isSafeNavigationUrl', () => {
  it('allows http and https', () => {
    expect(isSafeNavigationUrl('https://example.com')).toBe(true);
    expect(isSafeNavigationUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('allows file: and about:', () => {
    expect(isSafeNavigationUrl('file:///etc/hosts')).toBe(true);
    expect(isSafeNavigationUrl('about:blank')).toBe(true);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeNavigationUrl('JaVaScRiPt:alert(1)')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isSafeNavigationUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isSafeNavigationUrl('not a url')).toBe(false);
    expect(isSafeNavigationUrl('')).toBe(false);
  });
});

describe('isSafeFaviconUrl', () => {
  it('allows http(s)', () => {
    expect(isSafeFaviconUrl('https://example.com/favicon.ico')).toBe(true);
    expect(isSafeFaviconUrl('http://example.com/favicon.ico')).toBe(true);
  });

  it('allows chrome:// and chrome-extension://', () => {
    expect(isSafeFaviconUrl('chrome://favicon/https://example.com')).toBe(true);
    expect(isSafeFaviconUrl('chrome-extension://abc/icon.png')).toBe(true);
  });

  it('rejects data: scheme', () => {
    expect(isSafeFaviconUrl('data:image/png;base64,AAAA')).toBe(false);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeFaviconUrl('javascript:void(0)')).toBe(false);
  });
});
