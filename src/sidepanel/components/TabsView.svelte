<script lang="ts">
  import type { WindowState } from '$shared/types';
  import EmptyState from './EmptyState.svelte';
  import GroupList from './GroupList.svelte';
  import UntrackedSection from './UntrackedSection.svelte';

  let { window: win }: { window: WindowState } = $props();
</script>

<div class="tabs-view">
  {#if win.groups.length === 0 && win.untrackedTabs.length === 0}
    <EmptyState />
  {:else}
    <GroupList window={win} />
    {#if win.untrackedTabs.length > 0}
      <UntrackedSection window={win} />
    {/if}
  {/if}
</div>

<style>
  .tabs-view {
    display: flex;
    flex-direction: column;
  }
</style>
