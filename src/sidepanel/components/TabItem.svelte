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
  import { extractGroupingDomain } from '$shared/url';
  import { makeTabDragData, makeTabDropData } from '../dnd';
  import { activeTabStore } from '../active-tab.svelte';
  import Favicon from './Favicon.svelte';

  let {
    tab,
    groupId,
    window: win,
    /**
     * 'dot' inside auto-domain groups (the card header already shows the
     * domain favicon, so each row gets a small placeholder). 'favicon'
     * everywhere else (manual groups, untracked) — each row shows the page's
     * own favicon with a colored-letter fallback.
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

  const isLive = $derived(tab.chromeTabId !== null);
  const isActive = $derived(
    tab.chromeTabId !== null && tab.chromeTabId === activeTabStore.chromeTabId,
  );
  const isPinned = $derived(tab.pinned === true);
  const canPin = $derived(groupId !== null);
  const host = $derived(extractGroupingDomain(tab.url) ?? tab.url ?? '?');

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
    if (groupId === null) return;
    await sendMessage({
      type: 'setTabPinned',
      windowId: win.id,
      tabRefId: tab.id,
      groupId,
      pinned: !isPinned,
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
  data-tab-id={tab.id}
  aria-current={isActive ? 'true' : undefined}
  onclick={onActivate}
  onkeydown={onKeydown}
  title={tab.url}
>
  {#if iconVariant === 'dot'}
    <span class="dot" aria-hidden="true"></span>
  {:else}
    <span class="favicon-wrap" aria-hidden="true">
      <Favicon src={tab.favIconUrl} {host} size={14} />
    </span>
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
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
        {#if isPinned}
          <path fill="currentColor" d="M9.5 1.5 14 6l-3 1-1 3-3-3-4 4v-1l3-3-3-3 3-1 1-3z"/>
        {:else}
          <path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M9.5 1.5 14 6l-3 1-1 3-3-3-4 4v-1l3-3-3-3 3-1 1-3z"/>
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
    gap: 8px;
    height: 28px;
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

  .tab.saved {
    color: var(--text-mute);
  }

  /* Active = accent-tinted soft background, no border, no left bar. */
  .tab.active {
    background: var(--accent-bg-soft);
    color: var(--text);
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
    font-size: 12.5px;
    line-height: 1.35;
  }

  .pin,
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
    background: var(--surface);
    color: var(--accent);
  }

  .remove:hover {
    background: var(--surface);
    color: var(--danger);
  }
</style>
