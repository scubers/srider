<script lang="ts">
  import { onMount } from 'svelte';
  import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import type { WindowState } from '$shared/types';
  import { makeUntrackedDropData } from '../dnd';
  import TabItem from './TabItem.svelte';

  let { window: win }: { window: WindowState } = $props();
  let rootEl: HTMLElement | undefined = $state();
  let isOver = $state(false);

  onMount(() => {
    if (!rootEl) return;
    return dropTargetForElements({
      element: rootEl,
      canDrop: ({ source }) => {
        const data = source.data as { kind?: string };
        return data.kind === 'tab';
      },
      getData: () => makeUntrackedDropData() as unknown as Record<string, unknown>,
      onDragEnter: () => (isOver = true),
      onDragLeave: () => (isOver = false),
      onDrop: () => (isOver = false),
    });
  });
</script>

<section bind:this={rootEl} class="untracked" class:over={isOver}>
  <div class="title">未归类 ({win.untrackedTabs.length})</div>
  <ul role="list">
    {#each win.untrackedTabs as tab (tab.id)}
      <li>
        <TabItem {tab} groupId={null} window={win} />
      </li>
    {/each}
  </ul>
</section>

<style>
  .untracked {
    margin-top: 12px;
    padding-top: 6px;
    border-top: 1px dashed var(--border);
  }

  .untracked.over {
    background: var(--accent-bg);
  }

  .title {
    padding: 4px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted);
    font-weight: 600;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
