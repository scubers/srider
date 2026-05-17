<script lang="ts">
  import { settingsStore } from '$shared/stores.svelte';
  import { applyTheme, watchSystemTheme } from '$shared/theme';
  import { t } from '$shared/i18n/index.svelte';
  import type {
    LanguageSetting,
    SavedTabClickBehavior,
    Theme,
  } from '$shared/types';

  $effect(() => {
    let unwatch: (() => void) | null = null;
    void settingsStore.init().then(() => {
      applyTheme(settingsStore.value.theme);
      unwatch = watchSystemTheme(() => applyTheme(settingsStore.value.theme));
    });
    return () => {
      unwatch?.();
      settingsStore.destroy();
    };
  });

  $effect(() => {
    if (settingsStore.loaded) applyTheme(settingsStore.value.theme);
  });

  // Keep the document title in sync with the resolved locale.
  $effect(() => {
    document.title = t('options.title');
  });

  async function setLanguage(language: LanguageSetting) {
    await settingsStore.update({ language });
  }

  async function setTheme(theme: Theme) {
    await settingsStore.update({ theme });
  }

  async function setShowFavicons(showFavicons: boolean) {
    await settingsStore.update({ showFavicons });
  }

  async function setDefaultGroupExpanded(defaultGroupExpanded: boolean) {
    await settingsStore.update({ defaultGroupExpanded });
  }

  async function setClickBehavior(savedTabClickBehavior: SavedTabClickBehavior) {
    await settingsStore.update({ savedTabClickBehavior });
  }

  // The two settings below live in Chrome's own UI; the extension cannot
  // toggle them, only open the right chrome:// page.
  function openShortcutSettings() {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }

  function openAppearanceSettings() {
    void chrome.tabs.create({ url: 'chrome://settings/appearance' });
  }

  const themeOptions: Theme[] = ['light', 'dark', 'system'];
  const clickOptions: SavedTabClickBehavior[] = [
    'current-tab',
    'new-tab',
    'new-window',
  ];
  const languageOptions: LanguageSetting[] = ['auto', 'en', 'zh', 'ja'];

  function themeLabel(theme: Theme): string {
    if (theme === 'light') return t('options.theme_light');
    if (theme === 'dark') return t('options.theme_dark');
    return t('options.theme_system');
  }

  function clickLabel(v: SavedTabClickBehavior): string {
    if (v === 'current-tab') return t('options.click_saved_current');
    if (v === 'new-tab') return t('options.click_saved_new_tab');
    return t('options.click_saved_new_window');
  }

  function languageLabel(v: LanguageSetting): string {
    if (v === 'auto') return t('options.language_auto');
    if (v === 'en') return t('options.language_en');
    if (v === 'zh') return t('options.language_zh');
    return t('options.language_ja');
  }
</script>

<main>
  <h1>{t('options.title')}</h1>

  {#if !settingsStore.loaded}
    <p>{t('options.loading')}</p>
  {:else}
    <section class="field">
      <div class="label">{t('options.language_label')}</div>
      <div class="control radio-col">
        {#each languageOptions as v (v)}
          <label class="radio">
            <input
              type="radio"
              name="language"
              value={v}
              checked={settingsStore.value.language === v}
              onchange={() => setLanguage(v)}
            />
            <span>{languageLabel(v)}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="field">
      <div class="label">{t('options.theme_label')}</div>
      <div class="control radio-row">
        {#each themeOptions as themeOption (themeOption)}
          <label class="radio">
            <input
              type="radio"
              name="theme"
              value={themeOption}
              checked={settingsStore.value.theme === themeOption}
              onchange={() => setTheme(themeOption)}
            />
            <span>{themeLabel(themeOption)}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="field">
      <div class="label">{t('options.show_favicons_label')}</div>
      <div class="control">
        <label class="switch">
          <input
            type="checkbox"
            checked={settingsStore.value.showFavicons}
            onchange={(e) => setShowFavicons((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>{t('options.show_favicons_desc')}</span>
        </label>
      </div>
    </section>

    <section class="field">
      <div class="label">{t('options.default_expanded_label')}</div>
      <div class="control">
        <label class="switch">
          <input
            type="checkbox"
            checked={settingsStore.value.defaultGroupExpanded}
            onchange={(e) =>
              setDefaultGroupExpanded((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>{t('options.default_expanded_desc')}</span>
        </label>
      </div>
    </section>

    <section class="field">
      <div class="label">{t('options.click_saved_label')}</div>
      <div class="control radio-col">
        {#each clickOptions as v (v)}
          <label class="radio">
            <input
              type="radio"
              name="click-behavior"
              value={v}
              checked={settingsStore.value.savedTabClickBehavior === v}
              onchange={() => setClickBehavior(v)}
            />
            <span>{clickLabel(v)}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="field">
      <div class="label">{t('options.browser_settings_label')}</div>
      <div class="control link-col">
        <button class="link-btn" onclick={openShortcutSettings}>
          <span class="link-title">{t('options.shortcut_link_title')}</span>
          <span class="link-desc">{t('options.shortcut_link_desc')}</span>
        </button>
        <button class="link-btn" onclick={openAppearanceSettings}>
          <span class="link-title">{t('options.appearance_link_title')}</span>
          <span class="link-desc">{t('options.appearance_link_desc')}</span>
        </button>
      </div>
    </section>
  {/if}
</main>

<style>
  h1 {
    margin: 0 0 24px;
    font-size: 20px;
    color: var(--text);
  }

  .field {
    display: flex;
    gap: 24px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }

  .field:last-of-type {
    border-bottom: none;
  }

  .label {
    flex: 0 0 160px;
    font-weight: 500;
    color: var(--text);
    padding-top: 2px;
  }

  .control {
    flex: 1;
    min-width: 0;
  }

  .radio-row {
    display: flex;
    gap: 16px;
  }

  .radio-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .radio,
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--text);
  }

  input[type='radio'],
  input[type='checkbox'] {
    accent-color: var(--accent);
  }

  .link-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .link-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: left;
    transition: background 80ms, border-color 80ms;
  }

  .link-btn:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
  }

  .link-title {
    font-weight: 500;
    color: var(--text);
  }

  .link-title::after {
    content: ' →';
    color: var(--accent);
  }

  .link-desc {
    font-size: 12px;
    color: var(--text-mute);
  }
</style>
