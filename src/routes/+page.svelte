<script lang="ts">
  import { detectFormat, FORMATS, type FormatId } from '$lib/convert/formats';

  let dragging = $state(false);
  let file = $state<{ name: string; bytes: Uint8Array } | null>(null);
  let detected = $state<FormatId | null>(null);
  let problem = $state('');

  async function take(f: File | null | undefined) {
    problem = '';
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const id = detectFormat(f.name, bytes);
    if (!id) {
      file = null;
      detected = null;
      problem = `${f.name} is not a format this tool reads. Drop a .ubox, .sc, .pak, .json or .sse.zip.`;
      return;
    }
    file = { name: f.name, bytes };
    detected = id;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    take(e.dataTransfer?.files?.[0]);
  }

  const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
</script>

<svelte:head><title>Star System Converter</title></svelte:head>

<main>
  <header>
    <h1>Star System Converter</h1>
    <p class="lede">
      Move a star system between <strong>Universe Sandbox</strong>, <strong>SpaceEngine</strong> and
      <strong>Star System Explorer</strong>. Everything happens in this tab — your save is never uploaded.
    </p>
  </header>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <section
    class="drop"
    class:dragging
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <p>Drop a save file here</p>
    <label class="browse">
      <input type="file" accept=".ubox,.sc,.pak,.json,.zip" onchange={(e) => take(e.currentTarget.files?.[0])} />
      <span>or choose a file</span>
    </label>
    <p class="hint">.ubox &middot; .sc &middot; .pak &middot; .json &middot; .sse.zip</p>
  </section>

  {#if problem}
    <p class="problem">{problem}</p>
  {/if}

  {#if file && detected}
    <section class="found">
      <h2>{file.name}</h2>
      <p>
        Read as <strong>{FORMATS[detected].label}</strong> &middot; {kb(file.bytes.length)}
      </p>
      <p class="pending">
        Conversion is being wired up next — this build detects the format and nothing more.
      </p>
    </section>
  {/if}

  <section class="matrix">
    <h2>What travels, and what does not</h2>
    <p>
      A conversion carries <strong>numbers and hierarchy</strong>: masses, radii, orbits, rotation,
      composition, atmospheres, and what orbits what. It does not carry textures, 3D models,
      photographs, procedural surface seeds or render settings — the receiving app draws the system
      from its own art. That is a deliberate scope, not a gap: the data file is the part that means
      the same thing in all three programs.
    </p>
    <p>
      Universe Sandbox stores no parent for anything, so the hierarchy is <em>reconstructed</em> from
      each body's position and velocity rather than read. SpaceEngine states its orbits outright, so
      that side is close to one-for-one. Star System Explorer works out the physics itself when the
      system arrives, which is why this tool does none.
    </p>
  </section>

  <footer>
    <p>
      A companion to <a href="https://starsystemx.com">Star System Explorer</a>, which can take a
      converted system and fill in the moons, atmospheres and worlds the source never held.
    </p>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0b0e17;
    color: #c9d3e6;
    font: 15px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main { max-width: 720px; margin: 0 auto; padding: 48px 16px 64px; }
  h1 { font-size: 1.9rem; font-weight: 600; margin: 0 0 8px; color: #eaf0fb; letter-spacing: -0.01em; }
  h2 { font-size: 1.05rem; font-weight: 600; margin: 0 0 6px; color: #eaf0fb; }
  .lede { margin: 0 0 32px; color: #8e9bb5; }
  strong { color: #cfe0ff; font-weight: 600; }

  .drop {
    border: 1px dashed #2b3550;
    border-radius: 10px;
    padding: 40px 24px;
    text-align: center;
    background: #111726;
    transition: border-color 0.15s, background 0.15s;
  }
  .drop.dragging { border-color: #4d7cff; background: #141d33; }
  .drop p { margin: 0 0 12px; color: #9aa7c2; }
  .hint { font-size: 0.82rem; color: #5d6883; margin: 14px 0 0 !important; }
  .browse input { display: none; }
  .browse span {
    display: inline-block; padding: 8px 18px; border-radius: 6px;
    background: #1d2942; color: #cfe0ff; cursor: pointer; font-size: 0.9rem;
  }
  .browse span:hover { background: #253356; }

  .problem { margin: 16px 0 0; padding: 12px 14px; border-radius: 8px; background: #2a1720; color: #ffb4be; font-size: 0.9rem; }
  .found { margin: 24px 0 0; padding: 18px 20px; border-radius: 10px; background: #111726; border: 1px solid #1e2740; }
  .found p { margin: 4px 0 0; color: #8e9bb5; font-size: 0.92rem; }
  .pending { color: #6f7c99 !important; font-style: italic; }

  .matrix { margin: 48px 0 0; }
  .matrix p { color: #8e9bb5; }
  footer { margin: 48px 0 0; padding-top: 20px; border-top: 1px solid #1a2238; font-size: 0.88rem; color: #6f7c99; }
  a { color: #7fa6ff; }
</style>
