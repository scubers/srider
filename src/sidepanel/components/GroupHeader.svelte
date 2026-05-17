<script lang="ts">
  import type { Group, WindowState } from '$shared/types';
  import { sendMessage } from '$shared/messages';
  import { t } from '$shared/i18n/index.svelte';
  import { searchStore } from '../search.svelte';
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
  /** Mirror of Group.svelte: search force-expands the card. Used so the
      caret rotation and aria-expanded reflect what the user actually sees. */
  const effectiveCollapsed = $derived(searchStore.active ? false : group.collapsed);
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

  const APPROX_MENU_WIDTH = 160;
  const APPROX_MENU_HEIGHT = 108;

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
    if (searchStore.active) return;
    if (renaming) return;
    if ((e.target as HTMLElement | null)?.closest('.menu-wrap, .menu')) return;
    void onToggle();
  }

  function onRowKeydown(e: KeyboardEvent) {
    if (searchStore.active) return;
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
    if (!confirm(t('group.confirm_delete', { name: group.name }))) return;
    await sendMessage({ type: 'deleteGroup', windowId: win.id, groupId: group.id });
  }

  /** Count of live (open) Chrome tabs in this group, used by close-all UX. */
  const liveCount = $derived(group.tabs.filter((t) => t.chromeTabId !== null).length);

  async function closeAll() {
    menuOpen = false;
    if (liveCount === 0) return;
    if (!confirm(t('group.confirm_close_all', { name: group.name, count: liveCount }))) return;
    await sendMessage({ type: 'closeAllInGroup', windowId: win.id, groupId: group.id });
  }

  async function addNewTab(e: MouseEvent) {
    e.stopPropagation();
    await sendMessage({ type: 'newTabInGroup', windowId: win.id, groupId: group.id });
  }

  /** Display host for auto-domain favicon fallback letter. */
  const iconHost = $derived(group.autoDomain ?? group.name);
</script>

<div
  class="header"
  role="button"
  tabindex="0"
  aria-expanded={!effectiveCollapsed}
  onclick={onRowClick}
  onkeydown={onRowKeydown}
>
  <span class="icon" aria-hidden="true">
    {#if isAuto}
      <Favicon src={groupIcon} host={iconHost} size={18} />
    {:else}
      <span class="manual-icon" title={t('group.manual_title')}>
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
        ? t('group.auto_title', { domain: group.autoDomain })
        : group.name}
    >
      <span class="name-text">{group.name}</span>
    </span>
    <span class="count tnum">{totalCount}</span>
  {/if}

  <span class="caret" class:collapsed={effectiveCollapsed} aria-hidden="true">
    <svg viewBox="0 0 10 10" width="10" height="10">
      <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1.5 3.5 5 7l3.5-3.5"/>
    </svg>
  </span>

  <button class="add-btn" onclick={addNewTab} title={t('group.add_tab_title')} aria-label={t('group.add_tab_title')}>
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M6 2.2v7.6M2.2 6h7.6"/>
    </svg>
  </button>

  <div class="menu-wrap" bind:this={menuEl}>
    <button bind:this={menuBtnEl} class="menu-btn" onclick={toggleMenu} aria-label={t('group.menu_aria')}>⋯</button>
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
    <button role="menuitem" onclick={() => { renaming = true; menuOpen = false; }}>{t('group.menu_rename')}</button>
    <button role="menuitem" disabled={liveCount === 0} onclick={closeAll}>
      {t('group.menu_close_all')} <span class="count-hint">({liveCount})</span>
    </button>
    <button role="menuitem" class="danger" onclick={deleteGroup}>{t('group.menu_delete')}</button>
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

  .add-btn,
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

  .add-btn:hover,
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

  .count-hint {
    color: var(--text-faint);
    font-size: 11px;
    margin-left: 2px;
  }
</style>
