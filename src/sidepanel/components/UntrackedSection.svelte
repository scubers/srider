<script lang="ts">
  import { onMount } from 'svelte';
  import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import type { WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { makeUntrackedDropData } from '../dnd';
  import TabItem from './TabItem.svelte';

  let { window: win }: { window: WindowState } = $props();
  let rootEl: HTMLElement | undefined = $state();
  let isOver = $state(false);
  let busy = $state(false);

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

  async function autoGroupByDomain() {
    if (busy) return;
    busy = true;
    try {
      await sendMessage({ type: 'autoGroupByDomain', windowId: win.id });
    } finally {
      busy = false;
    }
  }
</script>

<section bind:this={rootEl} class="untracked" class:over={isOver}>
  <div class="title-row">
    <div class="title">未归类 ({win.untrackedTabs.length})</div>
    <button
      class="action"
      onclick={autoGroupByDomain}
      disabled={busy || win.untrackedTabs.length === 0}
      title="把未归类的标签按域名自动整理成分组"
    >
      按域名分组
    </button>
  </div>
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

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px;
  }

  .title {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted);
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--accent);
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    transition: background 80ms, border-color 80ms;
  }

  .action:hover:not(:disabled) {
    background: var(--accent-bg);
    border-color: var(--accent);
  }

  .action:disabled {
    color: var(--fg-faint);
    cursor: not-allowed;
    opacity: 0.6;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
