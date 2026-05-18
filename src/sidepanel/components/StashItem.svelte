<script lang="ts">
  import type { StashItem } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { t } from '$shared/i18n/index.svelte';
  import { settingsStore, viewStore } from '$shared/stores.svelte';
  import { extractGroupingDomain } from '$shared/url';
  import Favicon from './Favicon.svelte';

  let {
    item,
    folderId,
    chromeWindowId,
  }: {
    item: StashItem;
    folderId: string;
    chromeWindowId: number;
  } = $props();

  const host = $derived(extractGroupingDomain(item.url) ?? item.url ?? '?');
  const displayTitle = $derived(item.title || item.url);

  async function onActivate() {
    const result = await sendMessage({
      type: 'openStashItem',
      itemId: item.id,
      chromeWindowId,
      behavior: settingsStore.value.stashClickBehavior,
    });
    // Auto-jump back to Tabs view so user sees the new tab in untracked.
    if (result.ok) viewStore.set('tabs');
  }

  async function onRemove(e: MouseEvent) {
    e.stopPropagation();
    await sendMessage({
      type: 'deleteStashItem',
      folderId,
      itemId: item.id,
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onActivate();
    }
  }
</script>

<div
  class="item"
  role="button"
  tabindex="0"
  onclick={onActivate}
  onkeydown={onKeydown}
  title={item.url}
>
  <span class="favicon-wrap" aria-hidden="true">
    <Favicon src={item.favIconUrl} {host} size={14} />
  </span>
  <span class="title">{displayTitle}</span>
  <button
    class="remove"
    onclick={onRemove}
    title={t('stash.item_remove_title')}
    aria-label={t('stash.item_remove_aria')}
  >×</button>
</div>

<style>
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 8px 0 10px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--text-dim);
    min-width: 0;
  }

  .item:hover {
    background: var(--surface-hover);
  }

  .item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .favicon-wrap {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13.5px;
    line-height: 1.35;
  }

  .remove {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 80ms, background 80ms, color 80ms;
  }

  .item:hover .remove,
  .item:focus-within .remove {
    opacity: 1;
  }

  .remove:hover {
    background: var(--surface);
    color: var(--danger);
  }
</style>
