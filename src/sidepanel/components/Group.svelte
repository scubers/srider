<script lang="ts">
  import { onMount } from 'svelte';
  import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import {
    attachClosestEdge,
    extractClosestEdge,
    type Edge,
  } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
  import type { Group as GroupType, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { makeGroupDragData, makeGroupDropData } from '../dnd';
  import { activeTabStore } from '../active-tab.svelte';
  import { searchStore } from '../search.svelte';
  import GroupHeader from './GroupHeader.svelte';
  import TabItem from './TabItem.svelte';

  let { group, window: win }: { group: GroupType; window: WindowState } = $props();

  const isAuto = $derived(group.kind === 'auto-domain');
  /** Card-level highlight: light up the entire card when the currently
      focused Chrome tab lives inside this group. */
  const hasActiveTab = $derived(
    activeTabStore.chromeTabId !== null &&
      group.tabs.some((t) => t.chromeTabId === activeTabStore.chromeTabId),
  );

  const matchedTabs = $derived(group.tabs.filter((t) => searchStore.match(t)));
  /** Card hides itself entirely when a search is active and yields no matches. */
  const visibleInSearch = $derived(!searchStore.active || matchedTabs.length > 0);
  /** During search, the card is always expanded regardless of the persisted
      `group.collapsed`. effectiveCollapsed must NOT be written back to
      storage — it's purely a render-time view. */
  const effectiveCollapsed = $derived(searchStore.active ? false : group.collapsed);

  let rootEl: HTMLDivElement | undefined = $state();
  let hoverEdge: Edge | null = $state(null);
  let isDragging = $state(false);

  onMount(() => {
    if (!rootEl) return;
    const cleanups = [
      draggable({
        element: rootEl,
        getInitialData: () => makeGroupDragData(group.id) as unknown as Record<string, unknown>,
        onDragStart: () => (isDragging = true),
        onDrop: () => (isDragging = false),
      }),
      dropTargetForElements({
        element: rootEl,
        canDrop: ({ source }) => {
          const data = source.data as { kind?: string; groupId?: string };
          if (data.kind === 'group') return data.groupId !== group.id;
          if (data.kind === 'tab') return true;
          return false;
        },
        getData: ({ input, element, source }) => {
          const base = makeGroupDropData(group.id) as unknown as Record<string, unknown>;
          const sourceData = source.data as { kind?: string };
          if (sourceData.kind === 'group') {
            return attachClosestEdge(base, {
              input,
              element,
              allowedEdges: ['top', 'bottom'],
            });
          }
          return base;
        },
        onDrag: ({ self, source }) => {
          const sourceData = source.data as { kind?: string };
          if (sourceData.kind === 'group') {
            hoverEdge = extractClosestEdge(self.data);
          } else {
            hoverEdge = null;
          }
        },
        onDragLeave: () => (hoverEdge = null),
        onDrop: () => (hoverEdge = null),
      }),
    ];
    return () => {
      for (const c of cleanups) c();
    };
  });

  async function toggle() {
    await sendMessage({
      type: 'toggleGroupCollapsed',
      windowId: win.id,
      groupId: group.id,
      collapsed: !group.collapsed,
    });
  }
</script>

{#if visibleInSearch}
<div
  bind:this={rootEl}
  class="card"
  class:dragging={isDragging}
  class:has-active={hasActiveTab}
  class:edge-top={hoverEdge === 'top'}
  class:edge-bottom={hoverEdge === 'bottom'}
  data-group-id={group.id}
>
  <GroupHeader {group} window={win} onToggle={toggle} />
  {#if !effectiveCollapsed}
    <ul class="tabs" role="list">
      {#each matchedTabs as tab (tab.id)}
        <li>
          <TabItem
            {tab}
            groupId={group.id}
            window={win}
            iconVariant={isAuto ? 'dot' : 'favicon'}
          />
        </li>
      {/each}
      {#if group.tabs.length === 0 && !searchStore.active}
        <li class="empty">空分组 — 拖标签到这里</li>
      {/if}
    </ul>
  {/if}
</div>
{/if}

<style>
  .card {
    position: relative;
    background: var(--bg-raised);
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    margin-bottom: 6px;
    transition: opacity 120ms, background 120ms, border-color 120ms;
    overflow: hidden;
  }

  /* When the currently focused Chrome tab lives in this group, light up
     the entire card. */
  .card.has-active {
    background: linear-gradient(180deg, var(--accent-bg-soft), var(--bg-raised));
    border-color: var(--accent-border);
  }

  .card.dragging {
    opacity: 0.4;
  }

  .card.edge-top::before,
  .card.edge-bottom::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--drop-line);
    border-radius: 1px;
    z-index: 2;
  }

  .card.edge-top::before {
    top: -3px;
  }

  .card.edge-bottom::after {
    bottom: -3px;
  }

  .tabs {
    list-style: none;
    margin: 0;
    padding: 4px 4px 6px;
    border-top: 1px solid var(--border-soft);
  }

  .empty {
    padding: 6px 14px;
    font-size: 12px;
    color: var(--text-faint);
    font-style: italic;
  }
</style>
