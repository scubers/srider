<script lang="ts">
  import type { StashItem } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { t } from '$shared/i18n/index.svelte';
  import { settingsStore, viewStore } from '$shared/stores.svelte';
  import { extractGroupingDomain } from '$shared/url';
  import Favicon from './Favicon.svelte';
  import { searchStore } from '../search.svelte';
  import { splitAliasHighlight } from '../highlight';
  import RenameInput from './RenameInput.svelte';

  let {
    item,
    folderId,
    chromeWindowId,
  }: {
    item: StashItem;
    folderId: string;
    chromeWindowId: number;
  } = $props();

  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuPopupEl: HTMLDivElement | undefined = $state();
  let menuPos = $state<{ left: number; top: number } | null>(null);

  const APPROX_MENU_WIDTH = 180;
  const APPROX_MENU_HEIGHT = 90;

  const host = $derived(extractGroupingDomain(item.url) ?? item.url ?? '?');

  const aliasPrefix = $derived(item.name ? `(${item.name}) ` : '');
  const richSegments = $derived(
    splitAliasHighlight(aliasPrefix, item.title || item.url, searchStore.normalized),
  );

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuPopupEl?.contains(target)) return;
      menuOpen = false;
    };
    document.addEventListener('mousedown', onDocClick);
    const onReposition = () => {
      menuOpen = false;
    };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  });

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
    if (renaming) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onActivate();
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (renaming) return;
    let left = e.clientX;
    let top = e.clientY;
    if (left + APPROX_MENU_WIDTH > window.innerWidth - 4) {
      left = window.innerWidth - APPROX_MENU_WIDTH - 4;
    }
    if (left < 4) left = 4;
    if (top + APPROX_MENU_HEIGHT > window.innerHeight - 4) {
      top = e.clientY - APPROX_MENU_HEIGHT;
    }
    if (top < 4) top = 4;
    menuPos = { left, top };
    menuOpen = true;
  }

  async function commitRename(name: string) {
    renaming = false;
    await sendMessage({
      type: 'renameStashItem',
      folderId,
      itemId: item.id,
      name,
    });
  }
</script>

<div
  class="item"
  role="button"
  tabindex="0"
  onclick={renaming ? undefined : onActivate}
  ondblclick={renaming ? undefined : () => { renaming = true; }}
  onkeydown={onKeydown}
  oncontextmenu={onContextMenu}
  title={item.url}
>
  <span class="favicon-wrap" aria-hidden="true">
    <Favicon src={item.favIconUrl} {host} size={14} />
  </span>

  {#if renaming}
    <RenameInput
      initial={item.name ?? ''}
      onCommit={commitRename}
      onCancel={() => (renaming = false)}
    />
  {:else}
    <span class="title">
      {#each richSegments as seg, i (i)}
        {#if seg.alias}
          {#if seg.mark}
            <span class="alias"><mark>{seg.text}</mark></span>
          {:else}
            <span class="alias">{seg.text}</span>
          {/if}
        {:else if seg.mark}
          <mark>{seg.text}</mark>
        {:else}
          {seg.text}
        {/if}
      {/each}
    </span>
  {/if}

  <button
    class="remove"
    onclick={onRemove}
    title={t('stash.item_remove_title')}
    aria-label={t('stash.item_remove_aria')}
  >×</button>
</div>

{#if menuOpen && menuPos}
  <div
    bind:this={menuPopupEl}
    class="menu"
    role="menu"
    aria-label={t('stash.item_menu_aria')}
    style:left="{menuPos.left}px"
    style:top="{menuPos.top}px"
  >
    <button role="menuitem" onclick={() => { renaming = true; menuOpen = false; }}>{t('stash.item_menu_rename')}</button>
    <button role="menuitem" onclick={(e) => { menuOpen = false; void onRemove(e); }}>{t('stash.item_remove_title')}</button>
  </div>
{/if}

<style>
  .item {
    position: relative;
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

  .title mark {
    background: var(--accent-bg-soft);
    color: var(--accent);
    border-radius: 2px;
    padding: 0 1px;
    font: inherit;
  }

  .alias {
    color: var(--accent);
    font-weight: inherit;
  }

  .alias mark {
    background: var(--accent-bg-soft);
    color: var(--accent);
    border-radius: 2px;
    padding: 0 1px;
    font: inherit;
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

  .menu {
    position: fixed;
    min-width: 160px;
    max-width: 220px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: var(--shadow);
    padding: 4px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .menu button {
    padding: 6px 10px;
    text-align: left;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text);
  }

  .menu button:hover:not(:disabled) {
    background: var(--surface-hover);
  }
</style>
