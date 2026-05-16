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
  <div class="brand">
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 22 22" width="14" height="14"><rect x="3" y="4" width="16" height="14" rx="2" fill="none" stroke="#fff" stroke-width="2"/><rect x="3" y="4" width="6" height="14" rx="2" fill="#fff"/></svg>
    </span>
    <span class="title">Side Tab</span>
  </div>
  <div class="actions">
    <button class="pill" onclick={createGroup} title="新建分组">
      <span class="plus" aria-hidden="true">+</span>
      <span>新建</span>
    </button>
    <button class="icon-btn" onclick={openOptions} title="设置" aria-label="设置">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zm0 4a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8z"
        />
        <path
          fill="currentColor"
          d="M13.4 8c0-.27-.02-.53-.06-.78l1.34-1.05-1.3-2.24-1.6.54a4.5 4.5 0 0 0-1.34-.78l-.26-1.69H7.82l-.26 1.69a4.5 4.5 0 0 0-1.34.78l-1.6-.54-1.3 2.24L4.66 7.22A5 5 0 0 0 4.6 8c0 .27.02.53.06.78L3.32 9.83l1.3 2.24 1.6-.54c.4.32.85.58 1.34.78l.26 1.69h2.36l.26-1.69c.49-.2.94-.46 1.34-.78l1.6.54 1.3-2.24-1.34-1.05c.04-.25.06-.51.06-.78z"
        />
      </svg>
    </button>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 10;
    min-height: 44px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .logo {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.005em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px 0 8px;
    border-radius: 13px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 500;
    transition: background 80ms, color 80ms;
  }

  .pill:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .pill .plus {
    font-size: 15px;
    line-height: 1;
    color: var(--text-mute);
  }

  .icon-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    color: var(--text-mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 80ms, color 80ms;
  }

  .icon-btn:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
