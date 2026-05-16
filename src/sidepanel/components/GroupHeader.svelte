<script lang="ts">
  import type { Group, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { isSafeFaviconUrl } from '$shared/url';
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

  const isAuto = $derived(group.kind === 'auto-domain');
  const groupIcon = $derived.by(() => {
    if (!isAuto) return null;
    for (const t of group.tabs) {
      if (t.favIconUrl && isSafeFaviconUrl(t.favIconUrl)) return t.favIconUrl;
    }
    return null;
  });
  const liveCount = $derived(group.tabs.filter((t) => t.chromeTabId !== null).length);

  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let menuBtnEl: HTMLButtonElement | undefined = $state();
  let menuPopupEl: HTMLDivElement | undefined = $state();
  /** Viewport-relative coords for the position:fixed menu. */
  let menuPos = $state<{ left: number; top: number } | null>(null);

  const APPROX_MENU_WIDTH = 144;
  const APPROX_MENU_HEIGHT = 76;

  function computeMenuPos(): void {
    if (!menuBtnEl) return;
    const rect = menuBtnEl.getBoundingClientRect();
    // Right-align with the menu button.
    let left = rect.right - APPROX_MENU_WIDTH;
    // Keep within viewport horizontally.
    if (left < 4) left = 4;
    if (left + APPROX_MENU_WIDTH > window.innerWidth - 4) {
      left = window.innerWidth - APPROX_MENU_WIDTH - 4;
    }
    // Open below unless that would clip the viewport bottom.
    let top = rect.bottom + 4;
    if (top + APPROX_MENU_HEIGHT > window.innerHeight - 4) {
      top = rect.top - APPROX_MENU_HEIGHT - 4;
    }
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

  function onRowClick(e: MouseEvent) {
    if (renaming) return;
    // Ignore clicks routed to the menu or its items.
    if ((e.target as HTMLElement | null)?.closest('.menu-wrap, .menu')) return;
    void onToggle();
  }

  function onRowKeydown(e: KeyboardEvent) {
    if (renaming) return;
    // Only handle keys on the row itself; child controls handle their own.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onToggle();
    }
  }

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuEl?.contains(t)) return;       // click inside the wrap (button)
      if (menuPopupEl?.contains(t)) return;  // click inside the fixed-position popup
      menuOpen = false;
    };
    document.addEventListener('mousedown', onDocClick);
    // Close on scroll / resize to avoid stale coords.
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

  async function commitRename(name: string) {
    renaming = false;
    if (!name || name === group.name) return;
    await sendMessage({ type: 'renameGroup', windowId: win.id, groupId: group.id, name });
  }

  async function deleteGroup() {
    menuOpen = false;
    if (!confirm(`删除分组「${group.name}」？\n（已打开的标签会移到"未归类"，已保存的标签将丢失）`)) return;
    await sendMessage({ type: 'deleteGroup', windowId: win.id, groupId: group.id });
  }
</script>

<div
  class="header"
  role="button"
  tabindex="0"
  aria-expanded={!group.collapsed}
  onclick={onRowClick}
  onkeydown={onRowKeydown}
>
  <span class="caret" aria-hidden="true">{group.collapsed ? '▶' : '▼'}</span>

  {#if renaming}
    <RenameInput initial={group.name} onCommit={commitRename} onCancel={() => (renaming = false)} />
  {:else}
    <span class="name" class:auto={isAuto} title={isAuto && group.autoDomain ? `自动分组（域名：${group.autoDomain}）` : group.name}>
      {#if isAuto}
        <span class="auto-icon" aria-hidden="true">
          {#if groupIcon}
            <img src={groupIcon} alt="" width="14" height="14" />
          {:else}
            <span class="auto-fallback">⌘</span>
          {/if}
        </span>
      {/if}
      <span class="name-text">{group.name}</span>
      <span class="count">({liveCount}/{group.tabs.length})</span>
    </span>
  {/if}

  <!-- Menu lives in its own container; row-click ignores anything inside it. -->
  <div class="menu-wrap" bind:this={menuEl}>
    <button bind:this={menuBtnEl} class="menu-btn" onclick={toggleMenu} aria-label="更多操作">⋯</button>
  </div>
</div>

{#if menuOpen && menuPos}
  <!-- Rendered outside the scroll container via position:fixed so it can't be
       clipped by .content's overflow. -->
  <div
    bind:this={menuPopupEl}
    class="menu"
    role="menu"
    style:left="{menuPos.left}px"
    style:top="{menuPos.top}px"
  >
    <button role="menuitem" onclick={() => { renaming = true; menuOpen = false; }}>重命名</button>
    <button role="menuitem" class="danger" onclick={deleteGroup}>删除分组</button>
  </div>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px;
    background: var(--bg-elevated);
    min-width: 0;
    cursor: pointer;
    user-select: none;
  }

  .header:hover {
    background: var(--bg-hover);
  }

  .header:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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

  .name {
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
  }

  .auto-icon {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .auto-icon img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  .auto-fallback {
    font-size: 10px;
    color: var(--fg-muted);
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
    background: var(--bg-active);
    color: var(--fg);
  }

  .menu {
    /* Inline left/top set by computeMenuPos so it can't be clipped by
       .content's overflow. */
    position: fixed;
    min-width: 140px;
    max-width: 200px;
    background: var(--bg);
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
