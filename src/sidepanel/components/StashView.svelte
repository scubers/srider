<script lang="ts">
  import { appDataStore } from '$shared/stores.svelte';
  import { t } from '$shared/i18n/index.svelte';
  import StashFolder from './StashFolder.svelte';

  let { chromeWindowId }: { chromeWindowId: number } = $props();

  const subtitleLines = $derived(t('stash.empty_subtitle').split('\n'));
</script>

<div class="stash-view">
  {#if appDataStore.data.stash.length === 0}
    <div class="empty">
      <div class="icon">📦</div>
      <p class="primary">{t('stash.empty_title')}</p>
      <p class="secondary">
        {#each subtitleLines as line, i (i)}
          {line}{#if i < subtitleLines.length - 1}<br />{/if}
        {/each}
      </p>
    </div>
  {:else}
    <ul class="folder-list" role="list">
      {#each appDataStore.data.stash as folder (folder.id)}
        <li>
          <StashFolder {folder} {chromeWindowId} />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .stash-view {
    display: flex;
    flex-direction: column;
  }

  .folder-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .empty {
    padding: 48px 16px;
    text-align: center;
    color: var(--text-mute);
  }

  .empty .icon {
    font-size: 32px;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .empty .primary {
    margin: 0 0 6px;
    font-weight: 500;
    color: var(--text);
  }

  .empty .secondary {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
  }
</style>
