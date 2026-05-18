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
  import { splitHighlight } from '../highlight';

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

  const isActive = $derived(tab.chromeTabId === activeTabStore.chromeTabId);
  const host = $derived(extractGroupingDomain(tab.url) ?? tab.url ?? '?');
  const displayTitle = $derived(tab.title || tab.url);
  const titleSegments = $derived(splitHighlight(displayTitle, searchStore.normalized));

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
  class:active={isActive}
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

  <span class="title">
    {#each titleSegments as seg, i (i)}
      {#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
    {/each}
  </span>

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
</style>
