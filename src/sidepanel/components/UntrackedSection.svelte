<script lang="ts">
  import { onMount } from 'svelte';
  import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import type { WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { makeUntrackedDropData } from '../dnd';
  import { activeTabStore } from '../active-tab.svelte';
  import TabItem from './TabItem.svelte';

  let { window: win }: { window: WindowState } = $props();
  let rootEl: HTMLElement | undefined = $state();
  let isOver = $state(false);
  let busy = $state(false);

  const hasActiveTab = $derived(
    activeTabStore.chromeTabId !== null &&
      win.untrackedTabs.some((t) => t.chromeTabId === activeTabStore.chromeTabId),
  );

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

<section
  bind:this={rootEl}
  class="card"
  class:over={isOver}
  class:has-active={hasActiveTab}
>
  <div class="header">
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M2 4h4l1.5 1.5h6.5v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/></svg>
    </span>
    <span class="title">未分类</span>
    <span class="count tnum">{win.untrackedTabs.length}</span>
    <button
      class="action"
      onclick={autoGroupByDomain}
      disabled={busy || win.untrackedTabs.length === 0}
      title="按域名自动整理成分组"
    >
      按域名分组
    </button>
  </div>
  <ul role="list">
    {#each win.untrackedTabs as tab (tab.id)}
      <li>
        <TabItem {tab} groupId={null} window={win} iconVariant="favicon" />
      </li>
    {/each}
  </ul>
</section>

<style>
  .card {
    position: relative;
    background: var(--bg-raised);
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    margin-bottom: 6px;
    overflow: hidden;
    transition: background 120ms, border-color 120ms;
  }

  /* Card-level highlight when the focused Chrome tab is currently untracked. */
  .card.has-active {
    background: linear-gradient(180deg, var(--accent-bg-soft), var(--bg-raised));
    border-color: var(--accent-border);
  }

  /* Drag-over wins over has-active. */
  .card.over {
    border-color: var(--accent);
    background: var(--accent-bg-soft);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 12px;
    color: var(--text-mute);
  }

  .icon {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-mute);
  }

  .title {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.005em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-mute);
    background: var(--surface);
    border-radius: 8px;
    padding: 1px 7px;
    min-width: 18px;
    text-align: center;
  }

  .action {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--accent);
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    transition: background 80ms, border-color 80ms;
  }

  .action:hover:not(:disabled) {
    background: var(--accent-bg-soft);
    border-color: var(--accent);
  }

  .action:disabled {
    color: var(--text-faint);
    cursor: not-allowed;
    opacity: 0.6;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 4px 4px 6px;
    border-top: 1px solid var(--border-soft);
  }
</style>
