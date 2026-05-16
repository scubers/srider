<script lang="ts">
  import type { Group, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import Favicon from './Favicon.svelte';
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
      if (t.favIconUrl) return t.favIconUrl;
    }
    return null;
  });
  const totalCount = $derived(group.tabs.length);

  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let menuBtnEl: HTMLButtonElement | undefined = $state();
  let menuPopupEl: HTMLDivElement | undefined = $state();
  let menuPos = $state<{ left: number; top: number } | null>(null);

  const APPROX_MENU_WIDTH = 144;
  const APPROX_MENU_HEIGHT = 76;

  function computeMenuPos(): void {
    if (!menuBtnEl) return;
    const rect = menuBtnEl.getBoundingClientRect();
    let left = rect.right - APPROX_MENU_WIDTH;
    if (left < 4) left = 4;
    if (left + APPROX_MENU_WIDTH > window.innerWidth - 4) {
      left = window.innerWidth - APPROX_MENU_WIDTH - 4;
    }
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
    if ((e.target as HTMLElement | null)?.closest('.menu-wrap, .menu')) return;
    void onToggle();
  }

  function onRowKeydown(e: KeyboardEvent) {
    if (renaming) return;
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

  /** Display host for auto-domain favicon fallback letter. */
  const iconHost = $derived(group.autoDomain ?? group.name);
</script>

<div
  class="header"
  role="button"
  tabindex="0"
  aria-expanded={!group.collapsed}
  onclick={onRowClick}
  onkeydown={onRowKeydown}
>
  <span class="icon" aria-hidden="true">
    {#if isAuto}
      <Favicon src={groupIcon} host={iconHost} size={18} />
    {:else}
      <span class="manual-icon" title="手动分组">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M2 4a1.5 1.5 0 0 1 1.5-1.5h3.2a1.5 1.5 0 0 1 1.06.44L9 4.18h3.5A1.5 1.5 0 0 1 14 5.68V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4z"/></svg>
      </span>
    {/if}
  </span>

  {#if renaming}
    <RenameInput initial={group.name} onCommit={commitRename} onCancel={() => (renaming = false)} />
  {:else}
    <span
      class="name"
      title={isAuto && group.autoDomain
        ? `自动分组（域名：${group.autoDomain}）`
        : group.name}
    >
      <span class="name-text">{group.name}</span>
    </span>
    <span class="count tnum">{totalCount}</span>
  {/if}

  <span class="caret" class:collapsed={group.collapsed} aria-hidden="true">
    <svg viewBox="0 0 10 10" width="10" height="10">
      <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1.5 3.5 5 7l3.5-3.5"/>
    </svg>
  </span>

  <div class="menu-wrap" bind:this={menuEl}>
    <button bind:this={menuBtnEl} class="menu-btn" onclick={toggleMenu} aria-label="更多操作">⋯</button>
  </div>
</div>

{#if menuOpen && menuPos}
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
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 12px;
    background: transparent;
    min-width: 0;
    cursor: pointer;
    user-select: none;
  }

  .header:hover {
    background: var(--surface-hover);
  }

  .header:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .icon {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .manual-icon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-mute);
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
  }

  .name-text {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -0.005em;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .caret {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    color: var(--text-mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s;
  }

  .caret.collapsed {
    transform: rotate(-90deg);
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

  .menu button.danger {
    color: var(--danger);
  }
</style>
