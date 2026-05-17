/**
 * Runtime i18n for the side panel / options UI.
 *
 * Strings are bundled in TypeScript catalogs (en/zh/ja) so the user-pinnable
 * "Language" setting can switch the UI live without reloading the page.
 * `chrome.i18n` is used only for the manifest's __MSG_*__ keys (extension
 * name, description, etc.) — those are resolved by Chrome at install/display
 * time, before any JS we ship gets a chance to run.
 *
 * English is the fallback for every key. Missing-in-locale keys silently
 * fall through to en; missing-everywhere returns the key itself so it's
 * visible in the UI and easy to grep for.
 */
import en, { type MessageKey } from './en';
import zh from './zh';
import ja from './ja';
import { settingsStore } from '../stores.svelte';
import type { LanguageSetting, Locale } from '../types';

export type { MessageKey };

const catalogs: Record<Locale, Record<string, string>> = { en, zh, ja };

function autoLocale(): Locale {
  // navigator can be unavailable in non-DOM contexts (SW), but i18n is only
  // imported by UI bundles where navigator exists.
  const lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.toLowerCase()
      : 'en';
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
}

/**
 * Resolve the effective locale based on the user's Settings.language choice
 * (which defaults to 'auto'). Reading settingsStore.value here makes any
 * Svelte component that calls t() reactive to language changes.
 */
function resolveLocale(): Locale {
  const setting: LanguageSetting = settingsStore.value.language;
  if (setting === 'auto') return autoLocale();
  return setting;
}

/**
 * Look up a translated string. `{paramName}` placeholders in the message are
 * substituted by the values in `params`.
 *
 *   t('group.confirm_close_all', { name: g.name, count: liveCount })
 */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const locale = resolveLocale();
  let msg = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
