<script lang="ts">
  import '../app.css';
  import { version } from '$app/environment';
  import { LINKS } from '$lib/links';
  import PixelText from '$lib/components/PixelText.svelte';
  let { children } = $props();
</script>

<a class="skip" href="#main">Skip to content</a>

<header>
  <nav>
    <a class="wordmark" href="/">
      <PixelText text="StarSystemX" scale={2} />
      <span class="mark-sub">Converter</span>
    </a>
    <div class="spacer"></div>
    <a class="plain" href={LINKS.hub} target="_blank" rel="noopener noreferrer">Explorers hub</a>
    <a class="plain" href={LINKS.discordInvite} target="_blank" rel="noopener noreferrer">Discord</a>
    <a class="plain" href={LINKS.repo} target="_blank" rel="noopener noreferrer">Source</a>
  </nav>
</header>

<!-- THE ADVERT, and it is placed where an advert goes: above the tool, on every page, before anybody
     has scrolled. Somebody who arrived to convert a file is by definition a person who builds star
     systems, which makes them exactly the person the Explorer is for — and the two things most
     likely to stop them trying it are the two things it does not ask for, so those are the words
     that carry rather than a feature list. -->
<aside class="promo">
  <div class="promo-in">
    <div class="promo-title">
      <PixelText text="Star System Explorer" scale={2} colour="var(--accent)" />
    </div>
    <p>
      Opens every format on this page, and a lot more besides. Runs in your browser — no account, no
      sign-up, no installation, nothing to pay. Build a system, age a star, fly the transfer, hand
      your players a live map.
    </p>
    <a class="cta" href={LINKS.engine} target="_blank" rel="noopener noreferrer">Try it, free</a>
  </div>
</aside>

<main id="main">
  {@render children()}
</main>

<footer>
  <div class="what">
    <h2>Converted something? Open it in Star System Explorer</h2>
    <p>
      The Explorer takes it from here — it works out temperatures, climate and classification for
      itself, and can fill in the moons, atmospheres and worlds your source file never held. Free, in
      the browser, no account needed.
    </p>
    <a class="cta" href={LINKS.engine} target="_blank" rel="noopener noreferrer">Open the Explorer</a>
  </div>

  <div class="foot-bottom">
    <p class="fan">
      Star System Converter is a free companion tool for Star System Explorer. Universe Sandbox and
      SpaceEngine are the work and trademarks of their own makers; this tool is not affiliated with
      or endorsed by either, and reads and writes their file formats only.
    </p>
    <p class="small">
      <a href={LINKS.discordInvite} target="_blank" rel="noopener noreferrer">Discord</a>
      <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">Source</a>
      <a href={LINKS.engineRepo} target="_blank" rel="noopener noreferrer">Engine source</a>
      <a href={LINKS.engine} target="_blank" rel="noopener noreferrer">Star System Explorer</a>
      <span>v{version}</span>
    </p>
  </div>
</footer>

<style>
  .mark-sub { color: var(--ink-faint); font-weight: 500; }

  .promo {
    border-bottom: 1px solid var(--edge);
    background: linear-gradient(180deg, #121a2c 0%, var(--bg) 100%);
  }
  .promo-in {
    max-width: var(--max);
    margin: 0 auto;
    padding: 16px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 24px;
  }
  /* The pixel title sits in its own full-width ROW, but the SVG inside must keep its natural size.
     An <svg> made a flex item and told to fill the row stretches, and its viewBox then centres the
     drawing inside all that width — so the title silently centred itself. The wrapper takes the
     row; the SVG keeps its own width attribute. */
  .promo-title { flex-basis: 100%; line-height: 0; }
  .promo-in p {
    margin: 0;
    color: var(--ink-dim);
    font-size: 0.94rem;
    max-width: 62ch;
    flex: 1 1 34ch;
  }
  /* `margin-left: auto` only where there is a bar for the button to sit at the end of. On a phone
     everything stacks and a lone button shoved to the right edge reads as a mistake. */
  @media (min-width: 760px) {
    .promo-in .cta { margin-left: auto; }
  }
</style>
