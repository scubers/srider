<script lang="ts">
  import type { TabRef, WindowState } from '$shared/types';
  import { activeTabStore } from '../active-tab.svelte';
  import TabItem from './TabItem.svelte';

  let { window: win }: { window: WindowState } = $props();

  /**
   * Find the TabRef in this window that maps to the currently-focused Chrome
   * tab. Returns null if not tracked yet (e.g., the SW hasn't observed
   * onCreated for the very first tab on cold start).
   */
  const activeLocation = $derived.by<
    | { tab: TabRef; groupId: string | null }
    | null
  >(() => {
    const id = activeTabStore.chromeTabId;
    if (id === null) return null;
    for (const g of win.groups) {
      const t = g.tabs.find((t) => t.chromeTabId === id);
      if (t) return { tab: t, groupId: g.id };
    }
    const u = win.untrackedTabs.find((t) => t.chromeTabId === id);
    if (u) return { tab: u, groupId: null };
    return null;
  });
</script>

{#if activeLocation}
  <section class="card">
    <div class="header">
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path
            fill="currentColor"
            d="M8 1.6 9.85 5.7l4.55.66-3.3 3.16.78 4.46L8 11.86l-3.88 2.12.78-4.46-3.3-3.16 4.55-.66z"
          />
        </svg>
      </span>
      <span class="title">当前页</span>
      <span class="count tnum">1</span>
    </div>
    <div class="body">
      <TabItem
        tab={activeLocation.tab}
        groupId={activeLocation.groupId}
        window={win}
        iconVariant="favicon"
      />
    </div>
  </section>
{/if}

<style>
  .card {
    background: linear-gradient(180deg, var(--accent-bg-soft), transparent);
    border: 1px solid var(--accent-border);
    border-radius: 8px;
    margin-top: 4px;
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
  }

  .icon {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
  }

  .title {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.005em;
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

  .body {
    padding: 4px 4px 6px;
    border-top: 1px solid var(--border-soft);
  }
</style>
