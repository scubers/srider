/**
 * Theme application. The Side Panel and Options page call applyTheme() whenever
 * the Settings.theme value changes; we set a data-theme attribute on <html>,
 * which CSS variables key off of.
 */
import type { Theme } from './types';

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
}

/**
 * Listen to system-theme changes when the user has selected `system`.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = matchMedia(MEDIA_QUERY);
  const listener = () => onChange();
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
