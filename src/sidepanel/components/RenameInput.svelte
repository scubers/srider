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

  // Single latch covering both commit and cancel: once the input is "done"
  // it should never call back into the parent again, even on the blur event
  // that fires when Esc/Enter unmounts it.
  let done = false;

  function commit() {
    if (done) return;
    done = true;
    void onCommit(value.trim());
  }

  function cancel() {
    if (done) return;
    done = true;
    onCancel();
  }

  function onKeydown(e: KeyboardEvent) {
    // Don't treat the IME-confirm Enter (or the legacy keyCode 229) as a
    // commit — let the composing system close first, the user can press
    // Enter again to commit.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }
</script>

<!--
  Pointer/click events are stopped from bubbling so a draggable parent (e.g.
  pragmatic-drag-and-drop on a TabItem row) doesn't swallow them, and
  draggable={false} keeps native HTML5 drag from kicking in on the input.
-->
<input
  bind:this={inputEl}
  bind:value
  class="rename-input"
  type="text"
  draggable={false}
  onmousedown={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
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
