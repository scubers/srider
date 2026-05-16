<script lang="ts">
  import { isSafeFaviconUrl } from '$shared/url';

  let {
    src,
    host,
    size = 14,
  }: {
    src?: string | null;
    host: string;
    size?: number;
  } = $props();

  /** Stable hue from the host string. Same host → same color. */
  function hostHue(h: string): number {
    let hash = 0;
    for (let i = 0; i < h.length; i++) {
      hash = (hash * 31 + h.charCodeAt(i)) | 0;
    }
    return ((hash % 360) + 360) % 360;
  }

  const letter = $derived((host || '?').replace(/^www\./i, '').charAt(0).toUpperCase());
  const hue = $derived(hostHue(host || ''));
  const safeSrc = $derived(src && isSafeFaviconUrl(src) ? src : null);

  // Falls back to the letter tile if the <img> fails to load.
  let imgFailed = $state(false);
  $effect(() => {
    // Reset failure flag when the src changes (Svelte 5 idiom).
    imgFailed = false;
    void safeSrc;
  });
</script>

{#if safeSrc && !imgFailed}
  <img
    class="favicon"
    src={safeSrc}
    alt=""
    width={size}
    height={size}
    style:width="{size}px"
    style:height="{size}px"
    onerror={() => (imgFailed = true)}
  />
{:else}
  <span
    class="tile"
    aria-hidden="true"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{Math.max(2, Math.round(size * 0.22))}px"
    style:font-size="{Math.round(size * 0.62)}px"
    style:background="hsl({hue} 55% 45%)"
  >{letter}</span>
{/if}

<style>
  .favicon {
    object-fit: contain;
    flex-shrink: 0;
  }

  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
