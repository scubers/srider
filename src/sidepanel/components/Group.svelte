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
  import GroupHeader from './GroupHeader.svelte';
  import TabItem from './TabItem.svelte';

  let { group, window: win }: { group: GroupType; window: WindowState } = $props();

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
          // Edge attachment is only meaningful for group-on-group reorders.
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

<div
  bind:this={rootEl}
  class="group"
  class:dragging={isDragging}
  class:edge-top={hoverEdge === 'top'}
  class:edge-bottom={hoverEdge === 'bottom'}
  data-group-id={group.id}
>
  <GroupHeader {group} window={win} onToggle={toggle} />
  {#if !group.collapsed}
    <ul class="tabs" role="list">
      {#each group.tabs as tab (tab.id)}
        <li>
          <TabItem {tab} groupId={group.id} window={win} />
        </li>
      {/each}
      {#if group.tabs.length === 0}
        <li class="empty">空分组 — 拖标签到这里</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .group {
    position: relative;
    border-bottom: 1px solid var(--border);
    transition: opacity 120ms;
  }

  .group.dragging {
    opacity: 0.4;
  }

  .group.edge-top::before,
  .group.edge-bottom::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--drop-line);
    z-index: 2;
  }

  .group.edge-top::before {
    top: -1px;
  }

  .group.edge-bottom::after {
    bottom: -1px;
  }

  .tabs {
    list-style: none;
    margin: 0;
    padding: 2px 0 6px;
  }

  .empty {
    padding: 6px 28px;
    font-size: 12px;
    color: var(--fg-faint);
    font-style: italic;
  }
</style>
