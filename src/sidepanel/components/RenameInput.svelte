<script lang="ts">
  let {
    initial,
    onCommit,
    onCancel,
  }: {
    initial: string;
    onCommit: (name: string) => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  // Snapshot intentional: once editing starts, the input owns the value and
  // should not be re-synced from the prop.
  let value = $state(initial);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    inputEl?.focus();
    inputEl?.select();
  });

  function commit() {
    void onCommit(value.trim());
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<input
  bind:this={inputEl}
  bind:value
  class="rename-input"
  type="text"
  onblur={commit}
  onkeydown={onKeydown}
  maxlength="80"
/>

<style>
  .rename-input {
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-weight: 500;
    outline: none;
  }
</style>
