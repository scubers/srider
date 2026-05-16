<script lang="ts">
  import type { Group, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import RenameInput from './RenameInput.svelte';

  let {
    group,
    window: win,
    onToggle,
  }: {
    group: Group;
    window: WindowState;
    onToggle: () => void | Promise<void>;
  } = $props();

  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuEl) return;
      if (!menuEl.contains(e.target as Node)) menuOpen = false;
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  });

  const isActive = $derived(win.activeGroupId === group.id);
  const liveCount = $derived(group.tabs.filter((t) => t.chromeTabId !== null).length);

  async function commitRename(name: string) {
    renaming = false;
    if (!name || name === group.name) return;
    await sendMessage({ type: 'renameGroup', windowId: win.id, groupId: group.id, name });
  }

  async function setActive() {
    menuOpen = false;
    await sendMessage({ type: 'setActiveGroup', windowId: win.id, groupId: group.id });
  }

  async function deleteGroup() {
    menuOpen = false;
    if (!confirm(`删除分组「${group.name}」？\n（已打开的标签会移到"未归类"，已保存的标签将丢失）`)) return;
    await sendMessage({ type: 'deleteGroup', windowId: win.id, groupId: group.id });
  }
</script>

<div class="header" class:active={isActive}>
  <button
    class="caret"
    onclick={() => onToggle()}
    aria-label={group.collapsed ? '展开分组' : '折叠分组'}
  >
    {group.collapsed ? '▶' : '▼'}
  </button>

  {#if renaming}
    <RenameInput initial={group.name} onCommit={commitRename} onCancel={() => (renaming = false)} />
  {:else}
    <button
      class="name"
      ondblclick={() => (renaming = true)}
      title="双击重命名"
    >
      <span class="name-text">{group.name}</span>
      <span class="count">({liveCount}/{group.tabs.length})</span>
      {#if isActive}<span class="active-tag">活动</span>{/if}
    </button>
  {/if}

  <div class="menu-wrap" bind:this={menuEl}>
    <button class="menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="更多操作">⋯</button>
    {#if menuOpen}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => (renaming = true, (menuOpen = false))}>重命名</button>
        <button role="menuitem" disabled={isActive} onclick={setActive}>设为活动分组</button>
        <button role="menuitem" class="danger" onclick={deleteGroup}>删除分组</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px;
    background: var(--bg-elevated);
    border-bottom: 1px solid transparent;
    min-width: 0;
  }

  .header.active {
    border-bottom-color: var(--accent);
  }

  .caret {
    flex: 0 0 14px;
    width: 14px;
    height: 18px;
    color: var(--fg-muted);
    font-size: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .caret:hover {
    color: var(--fg);
  }

  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .name:hover {
    background: var(--bg-hover);
  }

  .name-text {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    color: var(--fg-muted);
    font-size: 11.5px;
    flex-shrink: 0;
  }

  .active-tag {
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .menu-wrap {
    position: relative;
  }

  .menu-btn {
    flex: 0 0 18px;
    width: 18px;
    height: 20px;
    color: var(--fg-muted);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
  }

  .menu-btn:hover {
    background: var(--bg-hover);
    color: var(--fg);
  }

  .menu {
    position: absolute;
    right: 0;
    top: 24px;
    min-width: 140px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: var(--shadow);
    padding: 4px;
    z-index: 20;
    display: flex;
    flex-direction: column;
  }

  .menu button {
    padding: 6px 10px;
    text-align: left;
    border-radius: 4px;
    font-size: 12px;
  }

  .menu button:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .menu button:disabled {
    color: var(--fg-faint);
    cursor: default;
  }

  .menu button.danger {
    color: var(--danger);
  }
</style>
