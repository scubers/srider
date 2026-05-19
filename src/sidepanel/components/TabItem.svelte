<script lang="ts">
  import { onMount } from 'svelte';
  import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import {
    attachClosestEdge,
    extractClosestEdge,
    type Edge,
  } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
  import type { TabRef, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { t } from '$shared/i18n/index.svelte';
  import { extractGroupingDomain } from '$shared/url';
  import { makeTabDragData, makeTabDropData } from '../dnd';
  import { activeTabStore } from '../active-tab.svelte';
  import { runSaveAnimation } from '../save-animation';
  import Favicon from './Favicon.svelte';
  import { searchStore } from '../search.svelte';
  import { splitAliasHighlight } from '../highlight';
  import RenameInput from './RenameInput.svelte';

  let {
    tab,
    groupId,
    window: win,
    /**
     * 'dot' inside auto-domain groups (header already shows the domain
     * favicon, so each row gets a small placeholder). 'favicon' everywhere
     * else.
     */
    iconVariant = 'favicon',
  }: {
    tab: TabRef;
    groupId: string | null;
    window: WindowState;
    iconVariant?: 'dot' | 'favicon';
  } = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let hoverEdge: Edge | null = $state(null);
  let isDragging = $state(false);
  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuPopupEl: HTMLDivElement | undefined = $state();
  let menuPos = $state<{ left: number; top: number } | null>(null);

  const APPROX_MENU_WIDTH = 180;
  const APPROX_MENU_HEIGHT = 110;

  const isActive = $derived(tab.chromeTabId === activeTabStore.chromeTabId);
  const host = $derived(extractGroupingDomain(tab.url) ?? tab.url ?? '?');

  const aliasPrefix = $derived(tab.name ? `(${tab.name}) ` : '');
  const richSegments = $derived(
    splitAliasHighlight(aliasPrefix, tab.title || tab.url, searchStore.normalized),
  );

  onMount(() => {
    if (!rootEl) return;
    const cleanups = [
      draggable({
        element: rootEl,
        getInitialData: () => makeTabDragData(tab.id, groupId) as unknown as Record<string, unknown>,
        onDragStart: () => (isDragging = true),
        onDrop: () => (isDragging = false),
      }),
      dropTargetForElements({
        element: rootEl,
        canDrop: ({ source }) => {
          const data = source.data as { kind?: string; tabRefId?: string };
          return data.kind === 'tab' && data.tabRefId !== tab.id;
        },
        getData: ({ input, element }) =>
          attachClosestEdge(makeTabDropData(groupId, tab.id) as unknown as Record<string, unknown>, {
            input,
            element,
            allowedEdges: ['top', 'bottom'],
          }),
        onDrag: ({ self }) => (hoverEdge = extractClosestEdge(self.data)),
        onDragLeave: () => (hoverEdge = null),
        onDrop: () => (hoverEdge = null),
      }),
    ];
    return () => {
      for (const c of cleanups) c();
    };
  });

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
    await sendMessage({
      type: 'activateLiveTab',
      chromeWindowId: win.chromeWindowId,
      tabRefId: tab.id,
    });
  }

  async function onRemove(e: MouseEvent) {
    e.stopPropagation();
    await sendMessage({
      type: 'closeLiveTab',
      chromeWindowId: win.chromeWindowId,
      tabRefId: tab.id,
    });
  }

  async function onSaveToStash(e: MouseEvent) {
    e.stopPropagation();
    if (!rootEl) return;
    const sourceRect = rootEl.getBoundingClientRect();
    const response = await sendMessage({
      type: 'saveTabToStash',
      chromeWindowId: win.chromeWindowId,
      tabRefId: tab.id,
      fromGroupId: groupId,
    });
    if (response.ok) {
      runSaveAnimation({ sourceRect });
    }
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
      type: 'renameTab',
      chromeWindowId: win.chromeWindowId,
      tabRefId: tab.id,
      name,
    });
  }
</script>

<div
  bind:this={rootEl}
  class="tab"
  class:active={isActive}
  class:dragging={isDragging}
  class:edge-top={hoverEdge === 'top'}
  class:edge-bottom={hoverEdge === 'bottom'}
  role="button"
  tabindex="0"
  data-tab-id={tab.id}
  aria-current={isActive ? 'true' : undefined}
  onclick={renaming ? undefined : onActivate}
  ondblclick={renaming ? undefined : () => { renaming = true; }}
  onkeydown={onKeydown}
  oncontextmenu={onContextMenu}
  title={tab.url}
>
  {#if iconVariant === 'dot'}
    <span class="dot" aria-hidden="true"></span>
  {:else}
    <span class="favicon-wrap" aria-hidden="true">
      <Favicon src={tab.favIconUrl} {host} size={14} />
    </span>
  {/if}

  {#if renaming}
    <RenameInput
      initial={tab.name ?? ''}
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
    class="save"
    onclick={onSaveToStash}
    title={t('tab.save_to_stash_title')}
    aria-label={t('tab.save_to_stash_aria')}
  >
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
        d="m8 1.5 1.95 4.2 4.55.5-3.4 3.1.95 4.5L8 11.6 3.95 13.8l.95-4.5L1.5 6.2l4.55-.5z"
      />
    </svg>
  </button>

  <button
    class="remove"
    onclick={onRemove}
    title={t('tab.close_live_title')}
    aria-label={t('tab.close_live_title')}
  >×</button>
</div>

{#if menuOpen && menuPos}
  <div
    bind:this={menuPopupEl}
    class="menu"
    role="menu"
    aria-label={t('tab.menu_aria')}
    style:left="{menuPos.left}px"
    style:top="{menuPos.top}px"
  >
    <button role="menuitem" onclick={() => { renaming = true; menuOpen = false; }}>{t('tab.menu_rename')}</button>
    <button role="menuitem" onclick={(e) => { menuOpen = false; void onSaveToStash(e); }}>{t('tab.save_to_stash_title')}</button>
    <button role="menuitem" onclick={(e) => { menuOpen = false; void onRemove(e); }}>{t('tab.close_live_title')}</button>
  </div>
{/if}

<style>
  .tab {
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

  .tab:hover {
    background: var(--surface-hover);
  }

  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .tab.active {
    background: var(--accent-bg-soft);
    color: var(--text);
  }

  .tab.active .title {
    font-weight: 600;
  }

  .tab.dragging {
    opacity: 0.4;
  }

  .tab.edge-top::before,
  .tab.edge-bottom::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--drop-line);
    border-radius: 1px;
    z-index: 2;
  }

  .tab.edge-top::before {
    top: -1px;
  }

  .tab.edge-bottom::after {
    bottom: -1px;
  }

  .dot {
    flex: 0 0 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--text-faint);
    margin-left: 4px;
    margin-right: 1px;
  }

  .tab.active .dot {
    background: var(--accent);
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

  .tab.active .title mark {
    background: var(--accent);
    color: #fff;
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

  .tab.active .alias mark {
    background: var(--accent);
    color: #fff;
  }

  .save,
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

  .tab:hover .save,
  .tab:focus-within .save,
  .tab:hover .remove,
  .tab:focus-within .remove {
    opacity: 1;
  }

  .save:hover {
    background: var(--surface);
    color: var(--accent);
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
