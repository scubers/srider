<script lang="ts">
  import { appDataStore, settingsStore } from '$shared/stores.svelte';
  import { applyTheme, watchSystemTheme } from '$shared/theme';
  import Header from './components/Header.svelte';
  import GroupList from './components/GroupList.svelte';
  import UntrackedSection from './components/UntrackedSection.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import { setupGlobalDnD } from './dnd';
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

      applyTheme(settingsStore.value.theme);
      unwatchTheme = watchSystemTheme(() => applyTheme(settingsStore.value.theme));

      unwatchDnd = setupGlobalDnD(() => windowState);
    })();

    return () => {
      cancelled = true;
      unwatchTheme?.();
      unwatchDnd?.();
      appDataStore.destroy();
      settingsStore.destroy();
    };
  });

  // Re-apply theme whenever it changes in settings.
  $effect(() => {
    if (settingsStore.loaded) applyTheme(settingsStore.value.theme);
  });
</script>

<div class="app">
  {#if !appDataStore.loaded || !settingsStore.loaded || chromeWindowId === null}
    <div class="loading">加载中…</div>
  {:else if !windowState}
    <div class="loading">正在匹配窗口…</div>
  {:else}
    <Header window={windowState} />
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
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0 12px;
  }

  .loading {
    padding: 24px;
    color: var(--fg-muted);
    text-align: center;
  }
</style>
