<script lang="ts">
  // A line of text in the hub's 5x7 bitmap font, as crisp SVG. Vendored from
  // starsystemx-creator-hub `src/lib/components/PixelText.svelte`.
  import { textRows, runs, gridWidth } from '$lib/pixel';
  let {
    text, scale = 2, colour = 'currentColor', class: cls = ''
  }: { text: string; scale?: number; colour?: string; class?: string } = $props();

  const rows = $derived(textRows(text));
  const w = $derived(gridWidth(rows));
  const rects = $derived(runs(rows));
</script>

<svg class="pixel-text {cls}" width={w * scale} height={7 * scale} viewBox="0 0 {w} 7"
  shape-rendering="crispEdges" role="img" aria-label={text}>
  <title>{text}</title>
  {#each rects as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height="1" fill={colour} />{/each}
</svg>

<style>
  .pixel-text { display: inline-block; vertical-align: middle; }
</style>
