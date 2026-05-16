<script lang="ts">
  import type { WindowState } from '$shared/types';
  import Group from './Group.svelte';

  let { window }: { window: WindowState } = $props();
</script>

<ul class="group-list" role="list">
  {#each window.groups as group (group.id)}
    <li>
      <Group {group} {window} />
    </li>
  {/each}
</ul>

<style>
  .group-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
