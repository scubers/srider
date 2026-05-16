<script lang="ts">
  import { settingsStore } from '$shared/stores.svelte';
  import { applyTheme, watchSystemTheme } from '$shared/theme';
  import type { SavedTabClickBehavior, Theme } from '$shared/types';

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

  // Chrome 限制：以下两项位于浏览器的设置页里，扩展无法在自身 UI 中切换，
  // 只能打开对应的 chrome:// 设置页让用户操作。
  function openShortcutSettings() {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }

  function openAppearanceSettings() {
    void chrome.tabs.create({ url: 'chrome://settings/appearance' });
  }
</script>

<main>
  <h1>Side Tab 设置</h1>

  {#if !settingsStore.loaded}
    <p>加载中…</p>
  {:else}
    <section class="field">
      <div class="label">主题</div>
      <div class="control radio-row">
        {#each ['light', 'dark', 'system'] as t (t)}
          <label class="radio">
            <input
              type="radio"
              name="theme"
              value={t}
              checked={settingsStore.value.theme === t}
              onchange={() => setTheme(t as Theme)}
            />
            <span>{t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="field">
      <div class="label">显示 favicon</div>
      <div class="control">
        <label class="switch">
          <input
            type="checkbox"
            checked={settingsStore.value.showFavicons}
            onchange={(e) => setShowFavicons((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>在标签前显示网站图标</span>
        </label>
      </div>
    </section>

    <section class="field">
      <div class="label">新建分组默认展开</div>
      <div class="control">
        <label class="switch">
          <input
            type="checkbox"
            checked={settingsStore.value.defaultGroupExpanded}
            onchange={(e) =>
              setDefaultGroupExpanded((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>新创建的分组初始为展开状态</span>
        </label>
      </div>
    </section>

    <section class="field">
      <div class="label">点击已保存标签时</div>
      <div class="control radio-col">
        {#each ['current-tab', 'new-tab', 'new-window'] as v (v)}
          <label class="radio">
            <input
              type="radio"
              name="click-behavior"
              value={v}
              checked={settingsStore.value.savedTabClickBehavior === v}
              onchange={() => setClickBehavior(v as SavedTabClickBehavior)}
            />
            <span>
              {v === 'current-tab'
                ? '在当前标签页打开'
                : v === 'new-tab'
                ? '在新标签页打开'
                : '在新窗口打开'}
            </span>
          </label>
        {/each}
      </div>
    </section>

    <section class="field">
      <div class="label">浏览器设置入口</div>
      <div class="control link-col">
        <button class="link-btn" onclick={openShortcutSettings}>
          <span class="link-title">自定义快捷键</span>
          <span class="link-desc">默认 Cmd/Ctrl+B 切换侧边栏，可在 chrome://extensions/shortcuts 改</span>
        </button>
        <button class="link-btn" onclick={openAppearanceSettings}>
          <span class="link-title">侧边栏左/右位置</span>
          <span class="link-desc">在 chrome://settings/appearance 的"侧边栏"区切换</span>
        </button>
      </div>
    </section>
  {/if}
</main>

<style>
  h1 {
    margin: 0 0 24px;
    font-size: 20px;
    color: var(--fg);
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
    color: var(--fg);
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
    color: var(--fg);
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
    background: var(--bg-hover);
    border-color: var(--accent);
  }

  .link-title {
    font-weight: 500;
    color: var(--fg);
  }

  .link-title::after {
    content: ' →';
    color: var(--accent);
  }

  .link-desc {
    font-size: 12px;
    color: var(--fg-muted);
  }
</style>
