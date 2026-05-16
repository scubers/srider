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
  import { activeTabStore } from '../active-tab.svelte';

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
  const isActive = $derived(
    tab.chromeTabId !== null && tab.chromeTabId === activeTabStore.chromeTabId,
  );
  const isPinned = $derived(tab.pinned === true);
  /** Pin only has meaning inside a group; untrackedTabs entries can't be pinned. */
  const canPin = $derived(groupId !== null);
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

  async function togglePin(e: MouseEvent) {
    e.stopPropagation();
    if (groupId === null) return; // shouldn't happen — pin hidden in untracked
    await sendMessage({
      type: 'setTabPinned',
      windowId: win.id,
      tabRefId: tab.id,
      groupId,
      pinned: !isPinned,
    });
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
  class:active={isActive}
  class:pinned={isPinned}
  class:dragging={isDragging}
  class:edge-top={hoverEdge === 'top'}
  class:edge-bottom={hoverEdge === 'bottom'}
  role="button"
  tabindex="0"
  aria-current={isActive ? 'true' : undefined}
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

  {#if canPin}
    <button
      class="pin"
      onclick={togglePin}
      title={isPinned ? '取消固定（关闭时一并删除）' : '固定（关闭后保留为 saved）'}
      aria-label={isPinned ? '取消固定' : '固定'}
      aria-pressed={isPinned}
    >
      <!-- thumbtack: filled when pinned, outline when not -->
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        {#if isPinned}
          <path
            fill="currentColor"
            d="M9.5 1.5 14 6l-3 1-1 3-3-3-4 4v-1l3-3-3-3 3-1 1-3z"
          />
        {:else}
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
            d="M9.5 1.5 14 6l-3 1-1 3-3-3-4 4v-1l3-3-3-3 3-1 1-3z"
          />
        {/if}
      </svg>
    </button>
  {/if}

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
    gap: 5px;
    padding: 3px 4px 3px 16px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg);
    min-width: 0;
  }

  .tab:hover {
    background: var(--bg-hover);
  }

  /* Currently-focused Chrome tab. The inset box-shadow draws a left bar
     without taking up a pseudo-element slot (::before/::after are claimed
     by the drag drop-line indicators). */
  .tab.active {
    background: var(--accent-bg);
    color: var(--fg);
    font-weight: 500;
    box-shadow: inset 2px 0 0 var(--accent);
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
    left: 8px;
    right: 6px;
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13.5px;
  }

  .pin,
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
    transition: opacity 80ms, background 80ms, color 80ms;
  }

  /* Pinned tabs always show the pin icon so users see the state at rest. */
  .tab.pinned .pin {
    opacity: 1;
    color: var(--accent);
  }

  .tab:hover .pin,
  .tab:focus-within .pin,
  .tab:hover .remove,
  .tab:focus-within .remove {
    opacity: 1;
  }

  .pin:hover {
    background: var(--bg-active);
    color: var(--accent);
  }

  .remove:hover {
    background: var(--bg-active);
    color: var(--danger);
  }
</style>
