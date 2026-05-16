<script lang="ts">
  // No props.
</script>

<div class="empty">
  <div class="icon">📂</div>
  <p class="primary">还没有分组</p>
  <p class="secondary">点击右上角的 + 新建分组<br />或把浏览器标签拖到这里</p>
</div>

<style>
  .empty {
    padding: 48px 16px;
    text-align: center;
    color: var(--fg-muted);
  }

  .icon {
    font-size: 32px;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .primary {
    margin: 0 0 6px;
    font-weight: 500;
    color: var(--fg);
  }

  .secondary {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
  }
</style>
