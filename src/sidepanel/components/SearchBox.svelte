<script lang="ts">
  import { t } from '$shared/i18n/index.svelte';
  import { searchStore } from '../search.svelte';

  let inputEl: HTMLInputElement | undefined = $state();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      searchStore.clear();
      inputEl?.blur();
    }
  }

  function clear() {
    searchStore.clear();
    inputEl?.focus();
  }
</script>

<div class="search" role="search">
  <span class="icon" aria-hidden="true">
    <svg viewBox="0 0 14 14" width="12" height="12">
      <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <path d="m9 9 3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    </svg>
  </span>
  <input
    bind:this={inputEl}
    bind:value={searchStore.query}
    type="search"
    placeholder={t('search.placeholder')}
    aria-label={t('search.aria_label')}
    onkeydown={onKeydown}
  />
  {#if searchStore.active}
    <button class="clear" onclick={clear} title={t('search.clear_title')} aria-label={t('search.clear_aria')}>
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
        <path d="M1 1 9 9 M9 1 1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .search {
    flex: 1 1 auto;
    min-width: 80px;
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 4px 0 8px;
    gap: 6px;
    border-radius: 13px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    transition: border-color 80ms, background 80ms;
  }

  .search:focus-within {
    border-color: var(--accent);
    background: var(--bg-raised);
  }

  .icon {
    flex: 0 0 12px;
    width: 12px;
    height: 12px;
    color: var(--text-mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    height: 24px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: 12.5px;
    padding: 0;
  }

  input::placeholder {
    color: var(--text-faint);
  }

  /* Hide native search-input affordances (the WebKit clear "X" and decoration). */
  input::-webkit-search-decoration,
  input::-webkit-search-cancel-button,
  input::-webkit-search-results-button,
  input::-webkit-search-results-decoration {
    display: none;
  }

  .clear {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    border-radius: 9px;
    color: var(--text-mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 80ms, color 80ms;
  }

  .clear:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
