<script lang="ts">
  import { viewStore, type ViewMode } from '$shared/stores.svelte';
  import { t } from '$shared/i18n/index.svelte';

  function setMode(mode: ViewMode) {
    viewStore.set(mode);
  }
</script>

<div class="switcher" role="tablist" aria-label={t('switcher.aria_label')}>
  <button
    class="tab"
    class:active={viewStore.mode === 'tabs'}
    role="tab"
    aria-selected={viewStore.mode === 'tabs'}
    onclick={() => setMode('tabs')}
  >
    <span class="icon" aria-hidden="true">📑</span>
    <span>{t('switcher.tabs')}</span>
  </button>
  <button
    class="tab"
    class:active={viewStore.mode === 'stash'}
    role="tab"
    aria-selected={viewStore.mode === 'stash'}
    onclick={() => setMode('stash')}
    data-stash-target
  >
    <span class="icon" aria-hidden="true">📦</span>
    <span class="stash-label">{t('switcher.stash')}</span>
  </button>
</div>

<style>
  .switcher {
    display: flex;
    gap: 4px;
    padding: 0 10px 6px;
    background: var(--bg);
  }

  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    color: var(--text-mute);
    font-size: 12.5px;
    font-weight: 500;
    transition: background 80ms, color 80ms, border-color 80ms;
  }

  .tab:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .tab.active {
    background: var(--accent-bg-soft);
    color: var(--accent);
    border-color: var(--accent-border, var(--accent));
    font-weight: 600;
  }

  .icon {
    font-size: 14px;
    line-height: 1;
  }

  /* The Stash text is the animation target; keep it inline-block so transform
     during shake works without affecting layout. */
  .stash-label {
    display: inline-block;
  }
</style>
