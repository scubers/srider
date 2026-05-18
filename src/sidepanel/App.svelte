<script lang="ts">
  import {
    appDataStore,
    sessionDataStore,
    settingsStore,
    viewStore,
  } from '$shared/stores.svelte';
  import { applyTheme, watchSystemTheme } from '$shared/theme';
  import { sendMessage } from '$shared/messages';
  import Header from './components/Header.svelte';
  import Switcher from './components/Switcher.svelte';
  import StatsBar from './components/StatsBar.svelte';
  import TabsView from './components/TabsView.svelte';
  import StashView from './components/StashView.svelte';
  import { setupGlobalDnD } from './dnd';
  import { activeTabStore } from './active-tab.svelte';
  import { searchStore } from './search.svelte';
  import { t } from '$shared/i18n/index.svelte';
  import type { WindowState } from '$shared/types';

  let chromeWindowId = $state<number | null>(null);
  let windowState = $derived<WindowState | null>(
    chromeWindowId === null
      ? null
      : sessionDataStore.data.windows[chromeWindowId] ?? null,
  );
  let allLoaded = $derived(
    appDataStore.loaded &&
      sessionDataStore.loaded &&
      settingsStore.loaded &&
      chromeWindowId !== null,
  );

  $effect(() => {
    let unwatchTheme: (() => void) | null = null;
    let unwatchDnd: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await Promise.all([
        appDataStore.init(),
        sessionDataStore.init(),
        settingsStore.init(),
      ]);
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
      sessionDataStore.destroy();
      settingsStore.destroy();
    };
  });

  $effect(() => {
    if (settingsStore.loaded) applyTheme(settingsStore.value.theme);
  });

  /**
   * Active-tab follow: when the user switches Chrome tabs, expand its group
   * (only on real tab switches; respects manual collapses afterward) and
   * scroll the row into view. Only meaningful in Tabs view.
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
    if (viewStore.mode !== 'tabs') return;
    const activeChromeTabId = activeTabStore.chromeTabId;
    if (activeChromeTabId === null) return;
    if (searchStore.active) return;
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
        pendingScrollTabRefId = foundTabRefId;
        void sendMessage({
          type: 'toggleGroupCollapsed',
          chromeWindowId: w.chromeWindowId,
          groupId: collapsedGroupId,
          collapsed: false,
        });
        return;
      }
      pendingScrollTabRefId = null;
      scrollTabIntoView(foundTabRefId);
      return;
    }

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
  {#if !allLoaded}
    <div class="loading">{t('app.loading')}</div>
  {:else}
    <Header window={windowState} />
    <Switcher />
    <StatsBar window={windowState} />
    <main class="content">
      {#if viewStore.mode === 'tabs'}
        {#if windowState}
          <TabsView window={windowState} />
        {:else}
          <div class="loading">{t('app.loading')}</div>
        {/if}
      {:else}
        <StashView chromeWindowId={chromeWindowId!} />
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
