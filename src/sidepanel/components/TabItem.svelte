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
  import { settingsStore } from '$shared/stores.svelte';
  import { isSafeFaviconUrl } from '$shared/url';
  import { makeTabDragData, makeTabDropData } from '../dnd';

  let {
    tab,
    groupId,
    window: win,
  }: {
    tab: TabRef;
    /** null means the tab lives in untrackedTabs. */
    groupId: string | null;
    window: WindowState;
  } = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let hoverEdge: Edge | null = $state(null);
  let isDragging = $state(false);

  const isLive = $derived(tab.chromeTabId !== null);
  const showFavicon = $derived(settingsStore.value.showFavicons);
  const safeFavicon = $derived(
    tab.favIconUrl && isSafeFaviconUrl(tab.favIconUrl) ? tab.favIconUrl : null,
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

  async function onActivate() {
    if (isLive) {
      await sendMessage({ type: 'activateLiveTab', windowId: win.id, tabRefId: tab.id });
    } else {
      await sendMessage({
        type: 'openSavedTab',
        windowId: win.id,
        tabRefId: tab.id,
        behavior: settingsStore.value.savedTabClickBehavior,
      });
    }
  }

  async function onRemove(e: MouseEvent) {
    e.stopPropagation();
    if (isLive) {
      await sendMessage({ type: 'closeLiveTab', windowId: win.id, tabRefId: tab.id });
    } else {
      await sendMessage({
        type: 'removeTab',
        windowId: win.id,
        tabRefId: tab.id,
        fromGroupId: groupId,
      });
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // Only handle keys on the row itself; if a child button (e.g. remove)
    // is focused and bubbles up, ignore — that button has its own handler.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onActivate();
    }
  }
</script>

<div
  bind:this={rootEl}
  class="tab"
  class:live={isLive}
  class:saved={!isLive}
  class:dragging={isDragging}
  class:edge-top={hoverEdge === 'top'}
  class:edge-bottom={hoverEdge === 'bottom'}
  role="button"
  tabindex="0"
  onclick={onActivate}
  onkeydown={onKeydown}
  title={tab.url}
>
  {#if showFavicon}
    <span class="favicon">
      {#if safeFavicon}
        <img src={safeFavicon} alt="" width="14" height="14" />
      {:else}
        <span class="favicon-fallback">{isLive ? '●' : '○'}</span>
      {/if}
    </span>
  {:else}
    <span class="dot">{isLive ? '●' : '○'}</span>
  {/if}

  <span class="title">{tab.title || tab.url}</span>

  <button
    class="remove"
    onclick={onRemove}
    title={isLive ? '关闭标签' : '从分组移除'}
    aria-label={isLive ? '关闭标签' : '从分组移除'}
  >×</button>
</div>

<style>
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 28px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg);
  }

  .tab:hover {
    background: var(--bg-hover);
  }

  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .tab.saved {
    color: var(--fg-muted);
  }

  .tab.dragging {
    opacity: 0.4;
  }

  .tab.edge-top::before,
  .tab.edge-bottom::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    height: 2px;
    background: var(--drop-line);
    z-index: 2;
  }

  .tab.edge-top::before {
    top: -1px;
  }

  .tab.edge-bottom::after {
    bottom: -1px;
  }

  .favicon {
    flex: 0 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
  }

  .favicon img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  .favicon-fallback,
  .dot {
    font-size: 9px;
    color: var(--fg-faint);
  }

  .tab.live .favicon-fallback,
  .tab.live .dot {
    color: var(--accent);
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }

  .remove {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: var(--fg-faint);
    font-size: 14px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 80ms;
  }

  .tab:hover .remove,
  .tab:focus-within .remove {
    opacity: 1;
  }

  .remove:hover {
    background: var(--bg-active);
    color: var(--danger);
  }
</style>
