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
  const liveCount = $derived(
    win.untrackedTabs.filter((t) => t.chromeTabId !== null).length,
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

  // ---- Menu (mirrors GroupHeader's position:fixed popup pattern) ----

  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let menuBtnEl: HTMLButtonElement | undefined = $state();
  let menuPopupEl: HTMLDivElement | undefined = $state();
  let menuPos = $state<{ left: number; top: number } | null>(null);

  const MENU_W = 160;
  const MENU_H = 44;

  function computeMenuPos() {
    if (!menuBtnEl) return;
    const rect = menuBtnEl.getBoundingClientRect();
    let left = rect.right - MENU_W;
    if (left < 4) left = 4;
    if (left + MENU_W > window.innerWidth - 4) left = window.innerWidth - MENU_W - 4;
    let top = rect.bottom + 4;
    if (top + MENU_H > window.innerHeight - 4) top = rect.top - MENU_H - 4;
    if (top < 4) top = 4;
    menuPos = { left, top };
  }

  function toggleMenu() {
    if (menuOpen) {
      menuOpen = false;
      return;
    }
    computeMenuPos();
    menuOpen = true;
  }

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuEl?.contains(t)) return;
      if (menuPopupEl?.contains(t)) return;
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

  async function closeAll() {
    menuOpen = false;
    if (liveCount === 0) return;
    if (!confirm(`关闭"未分类"里的 ${liveCount} 个已打开标签？`)) return;
    await sendMessage({ type: 'closeAllInGroup', windowId: win.id, groupId: null });
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
    <div class="menu-wrap" bind:this={menuEl}>
      <button bind:this={menuBtnEl} class="menu-btn" onclick={toggleMenu} aria-label="更多操作">⋯</button>
    </div>
  </div>
  <ul role="list">
    {#each win.untrackedTabs as tab (tab.id)}
      <li>
        <TabItem {tab} groupId={null} window={win} iconVariant="favicon" />
      </li>
    {/each}
  </ul>
</section>

{#if menuOpen && menuPos}
  <div
    bind:this={menuPopupEl}
    class="menu"
    role="menu"
    style:left="{menuPos.left}px"
    style:top="{menuPos.top}px"
  >
    <button role="menuitem" disabled={liveCount === 0} onclick={closeAll}>
      关闭所有 <span class="count-hint">({liveCount})</span>
    </button>
  </div>
{/if}

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

  .card.has-active {
    background: linear-gradient(180deg, var(--accent-bg-soft), var(--bg-raised));
    border-color: var(--accent-border);
  }

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

  .menu-wrap {
    position: relative;
  }

  .menu-btn {
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    color: var(--text-mute);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
  }

  .menu-btn:hover {
    background: var(--surface);
    color: var(--text);
  }

  .menu {
    position: fixed;
    min-width: 140px;
    max-width: 200px;
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

  .menu button:disabled {
    color: var(--text-faint);
    cursor: default;
  }

  .count-hint {
    color: var(--text-faint);
    font-size: 11px;
    margin-left: 2px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 4px 4px 6px;
    border-top: 1px solid var(--border-soft);
  }
</style>
