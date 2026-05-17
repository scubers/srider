<script lang="ts">
  import { t } from '$shared/i18n/index.svelte';

  // Pre-split the subtitle on \n so the {#each} can render it as separate
  // lines. Templating it directly with {@html} would fight i18n + a11y.
  const subtitleLines = $derived(t('empty.subtitle').split('\n'));
</script>

<div class="empty">
  <div class="icon">📂</div>
  <p class="primary">{t('empty.title')}</p>
  <p class="secondary">
    {#each subtitleLines as line, i (i)}
      {line}{#if i < subtitleLines.length - 1}<br />{/if}
    {/each}
  </p>
</div>

<style>
  .empty {
    padding: 48px 16px;
    text-align: center;
    color: var(--text-mute);
  }

  .icon {
    font-size: 32px;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .primary {
    margin: 0 0 6px;
    font-weight: 500;
    color: var(--text);
  }

  .secondary {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
  }
</style>
