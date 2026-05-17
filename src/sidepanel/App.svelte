<script lang="ts">
  import { appDataStore, settingsStore } from '$shared/stores.svelte';
  import { applyTheme, watchSystemTheme } from '$shared/theme';
  import { sendMessage } from '$shared/messages';
  import Header from './components/Header.svelte';
  import StatsBar from './components/StatsBar.svelte';
  import GroupList from './components/GroupList.svelte';
  import UntrackedSection from './components/UntrackedSection.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import { setupGlobalDnD } from './dnd';
  import { activeTabStore } from './active-tab.svelte';
  import type { WindowState } from '$shared/types';

  let chromeWindowId = $state<number | null>(null);
  let windowState = $derived<WindowState | null>(
    chromeWindowId === null
      ? null
      : Object.values(appDataStore.data.windows).find(
          (w) => w.chromeWindowId === chromeWindowId,
        ) ?? null,
  );

  // Lifecycle: initialize stores, resolve current window, install DnD monitor.
  $effect(() => {
    let unwatchTheme: (() => void) | null = null;
    let unwatchDnd: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await Promise.all([appDataStore.init(), settingsStore.init()]);
      if (cancelled) return;

      const w = await chrome.windows.getCurrent();
      if (cancelled) return;
      chromeWindowId = w.id ?? null;

      if (chromeWindowId !== null) {
        await activeTabStore.init(chromeWindowId);
      }
      if (cancelled) return;

      applyTheme(settingsStore.value.theme);
      unwatchTheme = watchSystemTheme(() => applyTheme(settingsStore.value.theme));

      unwatchDnd = setupGlobalDnD(() => windowState);
    })();

    return () => {
      cancelled = true;
      unwatchTheme?.();
      unwatchDnd?.();
      activeTabStore.destroy();
      appDataStore.destroy();
      settingsStore.destroy();
    };
  });

  // Re-apply theme whenever it changes in settings.
  $effect(() => {
    if (settingsStore.loaded) applyTheme(settingsStore.value.theme);
  });

  /**
   * Follow the active Chrome tab: when the user actually switches tabs,
   * expand the new tab's group if it's collapsed and scroll the row into
   * view. The expand/scroll fires ONLY on real tab switches — if the user
   * later collapses the active tab's group manually, we leave it collapsed.
   *
   * The effect inevitably re-runs whenever anything reactive it reads
   * changes (group.collapsed, group.tabs, etc.), so we guard with
   * lastHandledTabId: any re-run where chromeTabId is unchanged is a no-op
   * EXCEPT for finishing a pending scroll that was queued behind an expand.
   */
  let lastHandledTabId: number | null = null;
  let pendingScrollTabRefId: string | null = null;

  function scrollTabIntoView(tabRefId: string): void {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-tab-id="${CSS.escape(tabRefId)}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  $effect(() => {
    const activeChromeTabId = activeTabStore.chromeTabId;
    if (activeChromeTabId === null) return;
    const w = windowState;
    if (!w) return;

    let foundTabRefId: string | null = null;
    let collapsedGroupId: string | null = null;

    for (const g of w.groups) {
      const tab = g.tabs.find((t) => t.chromeTabId === activeChromeTabId);
      if (!tab) continue;
      foundTabRefId = tab.id;
      if (g.collapsed) collapsedGroupId = g.id;
      break;
    }
    if (foundTabRefId === null) {
      const u = w.untrackedTabs.find((t) => t.chromeTabId === activeChromeTabId);
      if (u) foundTabRefId = u.id;
    }
    if (foundTabRefId === null) return;

    const tabChanged = activeChromeTabId !== lastHandledTabId;

    if (tabChanged) {
      lastHandledTabId = activeChromeTabId;
      if (collapsedGroupId !== null) {
        // Auto-expand on switch and defer scrolling until the next effect
        // run sees the group expanded.
        pendingScrollTabRefId = foundTabRefId;
        void sendMessage({
          type: 'toggleGroupCollapsed',
          windowId: w.id,
          groupId: collapsedGroupId,
          collapsed: false,
        });
        return;
      }
      pendingScrollTabRefId = null;
      scrollTabIntoView(foundTabRefId);
      return;
    }

    // Tab unchanged: only act if we still owe a scroll to the same row and
    // its group is now expanded. Anything else (user manually collapsing
    // this card, an unrelated reactive change) is left alone.
    if (
      pendingScrollTabRefId === foundTabRefId &&
      collapsedGroupId === null
    ) {
      pendingScrollTabRefId = null;
      scrollTabIntoView(foundTabRefId);
    }
  });
</script>

<div class="app">
  {#if !appDataStore.loaded || !settingsStore.loaded || chromeWindowId === null}
    <div class="loading">加载中…</div>
  {:else if !windowState}
    <div class="loading">正在匹配窗口…</div>
  {:else}
    <Header window={windowState} />
    <StatsBar window={windowState} />
    <main class="content">
      {#if windowState.groups.length === 0 && windowState.untrackedTabs.length === 0}
        <EmptyState />
      {:else}
        <GroupList window={windowState} />
        {#if windowState.untrackedTabs.length > 0}
          <UntrackedSection window={windowState} />
        {/if}
      {/if}
    </main>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 0 10px 14px;
  }

  .loading {
    padding: 24px;
    color: var(--text-mute);
    text-align: center;
  }
</style>
