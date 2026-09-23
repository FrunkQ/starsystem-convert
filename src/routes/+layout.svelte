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

<main id="main">
  {@render children()}
</main>

<footer>
  <!-- THE EXPLORER'S PITCH LIVES HERE, at the bottom on purpose: by here somebody has used the tool,
       and the offer is for them. (The star lookup also points at it, but only where it answers a need
       the page cannot - a whole neighbourhood, or the planets the catalogues never found.)
       Two doors, a question each, because they are two different people - one has just made
       something and wants to open it, the other has not decided yet and is better served by other
       people's work than by more of our copy. -->
  <div class="doors">
    <div class="door">
      <h2>Want to see it?</h2>
      <!-- The pitch that used to sit in a strip above the tool. Owner, 2026-09-23: push the Explorer,
           but not that hard - so it waits down here for somebody who has already made something. -->
      <p>
        Star System Explorer will open what you just made, and a lot more besides. It runs in your
        browser &mdash; no account, no sign-up, nothing to install or pay for. Build a system, age a
        star, fly the transfer, hand your players a live map.
      </p>
      <a class="cta" href={LINKS.engine} target="_blank" rel="noopener noreferrer">Take a look</a>
    </div>
    <div class="door">
      <h2>Curious what people build?</h2>
      <p>The Explorers hub is full of systems others have shared.</p>
      <a class="cta" href={LINKS.hub} target="_blank" rel="noopener noreferrer">Browse the hub</a>
    </div>
  </div>

  <div class="foot-bottom">
    <p class="fan">
      Universe Sandbox and SpaceEngine are the work and trademarks of their own makers. This tool is
      not affiliated with either, and only reads and writes their file formats.
      <!-- The archive asks for this acknowledgement in so many words, and the engine's About box
           carries it; a real-star lookup here uses both services live. -->
      Real-star lookups use the
      <a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener noreferrer">NASA Exoplanet Archive</a>,
      operated by the California Institute of Technology under contract with NASA under the Exoplanet
      Exploration Program, and the
      <a href="https://simbad.cds.unistra.fr/simbad/" target="_blank" rel="noopener noreferrer">SIMBAD database</a>,
      operated at CDS, Strasbourg, France.
    </p>
    <p class="small">
      <a href={LINKS.discordInvite} target="_blank" rel="noopener noreferrer">Discord</a>
      <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">Source</a>
      <a href={LINKS.kofi} target="_blank" rel="noopener noreferrer">Ko-fi</a>
      <a href={LINKS.engine} target="_blank" rel="noopener noreferrer">Star System Explorer</a>
      <span>v{version}</span>
    </p>
  </div>
</footer>

<style>
  .mark-sub { color: var(--ink-faint); font-weight: 500; }
</style>
