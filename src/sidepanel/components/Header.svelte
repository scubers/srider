<script lang="ts">
  import { sendMessage } from '$shared/messages';
  import type { WindowState } from '$shared/types';

  let { window }: { window: WindowState } = $props();

  async function createGroup() {
    const name = prompt('新分组名称', '新分组');
    if (!name) return;
    await sendMessage({ type: 'createGroup', windowId: window.id, name });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }
</script>

<header class="header">
  <div class="title">Side Tab</div>
  <div class="actions">
    <button class="icon-btn" title="新建分组" onclick={createGroup} aria-label="新建分组">+</button>
    <button class="icon-btn" title="设置" onclick={openOptions} aria-label="设置">⚙</button>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .title {
    font-weight: 600;
    color: var(--fg);
  }

  .actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--fg);
  }
</style>
