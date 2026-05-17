<script lang="ts">
  import { t } from '$shared/i18n/index.svelte';
  import type { WindowState } from '$shared/types';

  let { window: win }: { window: WindowState } = $props();

  const tabCount = $derived.by(() => {
    let n = win.untrackedTabs.length;
    for (const g of win.groups) n += g.tabs.length;
    return n;
  });
  const groupCount = $derived(win.groups.length);

  /** SidePanel JS heap usage in MB. Cheap to read; meaningful in dev. */
  let memMB = $state<string | null>(null);

  $effect(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    };
    function refresh() {
      const used = perf.memory?.usedJSHeapSize;
      if (typeof used !== 'number') {
        memMB = null;
        return;
      }
      const mb = used / 1024 / 1024;
      memMB = mb < 10 ? mb.toFixed(1) : Math.round(mb).toString();
    }
    refresh();
    const id = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(id);
  });
</script>

<section class="stats" aria-label={t('stats.aria_label')}>
  <div class="stat">
    <div class="value tnum">{tabCount}</div>
    <div class="label">{t('stats.tabs')}</div>
  </div>
  <div class="divider" aria-hidden="true"></div>
  <div class="stat">
    <div class="value tnum">{groupCount}</div>
    <div class="label">{t('stats.groups')}</div>
  </div>
  <div class="divider" aria-hidden="true"></div>
  <div class="stat">
    <div class="value tnum">
      {#if memMB !== null}
        {memMB}<span class="unit">m</span>
      {:else}
        —
      {/if}
    </div>
    <div class="label">{t('stats.memory')}</div>
  </div>
</section>

<style>
  .stats {
    display: flex;
    align-items: center;
    justify-content: space-around;
    margin: 4px 10px 8px;
    padding: 8px 6px;
    background: var(--bg-raised);
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    min-height: 48px;
  }

  .stat {
    flex: 1;
    text-align: center;
    min-width: 0;
  }

  .value {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
    line-height: 1.1;
  }

  .unit {
    font-size: 11px;
    color: var(--text-faint);
    margin-left: 2px;
    font-weight: 500;
  }

  .label {
    margin-top: 2px;
    font-size: 10.5px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .divider {
    width: 1px;
    height: 24px;
    background: var(--border-soft);
    flex-shrink: 0;
  }
</style>
