<script lang="ts">
  import { detectFormat, FORMATS, type FormatId } from '$lib/convert/formats';
  import { ADAPTERS, type SourceAdapter, type ConvertResult, type BodyPreview } from '$lib/convert/adapters';
  import { OUTPUTS, toSseJson, fileNameFor, download } from '$lib/convert/output';
  import { LINKS } from '$lib/links';

  type Phase = 'idle' | 'loaded' | 'working' | 'done' | 'error';

  let phase = $state<Phase>('idle');
  let dragging = $state(false);
  let problem = $state('');

  let fileName = $state('');
  let bytes = $state<Uint8Array | null>(null);
  let format = $state<FormatId | null>(null);
  let adapter = $state<SourceAdapter | null>(null);
  let subtitle = $state('');
  let systems = $state<{ name: string }[]>([]);
  let chosen = $state(0);
  let bodies = $state<BodyPreview[]>([]);

  // The mass slider is logarithmic because the range it covers is: a ring particle and a gas giant
  // are twelve orders of magnitude apart, and a linear control spends all its travel in the last
  // inch. Bodies at or above the threshold are converted.
  let logThreshold = $state(20);
  const threshold = $derived(Math.pow(10, logThreshold));
  // log10 -> pow10 does not round-trip exactly, and the error lands exactly on the body whose own
  // mass set an endpoint. A hair of tolerance keeps the boundary body counted, and the SAME number
  // is handed to the converter so the count and the result cannot disagree.
  const effectiveThreshold = $derived(threshold * (1 - 1e-9));
  const included = $derived(bodies.filter((b) => b.mass >= effectiveThreshold).length);

  let result = $state<ConvertResult | null>(null);

  const EARTH = 5.972e24;
  const fmtMass = (kg: number) =>
    kg >= EARTH / 100 ? `${(kg / EARTH).toPrecision(2)} Earth masses` : `${kg.toExponential(1)} kg`;
  const fmtSize = (n: number) =>
    n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  function reset() {
    phase = 'idle'; problem = ''; bytes = null; format = null; adapter = null;
    subtitle = ''; systems = []; chosen = 0; bodies = []; result = null;
  }

  async function take(f: File | null | undefined) {
    if (!f) return;
    reset();
    fileName = f.name;
    const raw = new Uint8Array(await f.arrayBuffer());
    const id = detectFormat(f.name, raw);
    if (!id) {
      problem = `${f.name} is not a format this tool reads. Drop a .ubox, .sc, .pak, .json or .sse.zip.`;
      phase = 'error';
      return;
    }
    bytes = raw; format = id; adapter = ADAPTERS[id];
    try {
      subtitle = adapter.subtitle(raw);
      systems = adapter.systems(raw);
      loadBodies();
      logThreshold = adapter.massSlider ? Math.log10(adapter.recommendedMinMass) : 0;
      phase = 'loaded';
    } catch (e) {
      problem = `${f.name} could not be read: ${(e as Error).message}`;
      phase = 'error';
    }
  }

  function loadBodies() {
    if (!adapter || !bytes) return;
    try { bodies = adapter.bodies(bytes, chosen); } catch { bodies = []; }
  }

  function pick(i: number) { chosen = i; loadBodies(); }

  async function convert() {
    if (!adapter || !bytes) return;
    phase = 'working';
    // Yield once so the browser paints the working state before a multi-megabyte file blocks the
    // thread. Without it the page appears frozen for the whole conversion.
    await new Promise((r) => setTimeout(r, 20));
    try {
      result = adapter.convert(bytes, chosen, adapter.massSlider ? effectiveThreshold : 0);
      phase = 'done';
    } catch (e) {
      problem = `That file could not be converted: ${(e as Error).message}`;
      phase = 'error';
    }
  }

  function save() {
    if (!result) return;
    download(toSseJson(result.system), fileNameFor(result.system, '.json'));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    take(e.dataTransfer?.files?.[0]);
  }

  const total = $derived(
    result ? result.counts.stars + result.counts.planets + result.counts.moons + result.counts.rings + result.counts.other : 0
  );
</script>

<svelte:head><title>Star System Converter</title></svelte:head>

<h1>Star System Converter</h1>
<p class="lede">
  Move a star system between <strong>Universe Sandbox</strong>, <strong>SpaceEngine</strong> and
  <strong>Star System Explorer</strong>. It all happens in this tab — your save is never uploaded
  anywhere, because there is no server here to upload it to.
</p>

<div class="notice">
  <h2>Beta, and honestly a bit thrown together</h2>
  <p>
    This is built out of the import code that already runs inside Star System Explorer, wired up to a
    web page over a couple of sittings. It works, but it has not met many files yet, and yours may
    well be the one that breaks it.
  </p>
  <p>
    That is genuinely useful to us — if something comes out wrong, or will not load at all, please
    say so in
    <a href={LINKS.discordChannel} target="_blank" rel="noopener noreferrer">{LINKS.discordChannelName}</a>
    on <a href={LINKS.discordInvite} target="_blank" rel="noopener noreferrer">our Discord</a> (that
    second link is the one to use if you are not in the server yet), or open an issue on
    <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">GitHub</a>. A copy of the file that
    went wrong helps enormously.
  </p>
</div>

{#if phase === 'idle' || phase === 'error'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <section
    class="drop" class:dragging
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <p class="drop-title">Drop a save file here</p>
    <label class="browse">
      <input type="file" accept=".ubox,.sc,.pak,.json,.zip" onchange={(e) => take(e.currentTarget.files?.[0])} />
      <span class="cta">Choose a file</span>
    </label>
    <p class="hint">.ubox &middot; .sc &middot; .pak &middot; .json &middot; .sse.zip</p>
  </section>
{/if}

{#if problem}
  <p class="problem">{problem}</p>
{/if}

{#if phase === 'loaded' || phase === 'working'}
  <section class="panel step">
    <h2>{fileName}</h2>
    <p class="sub">
      {adapter?.label}{subtitle ? ` · ${subtitle}` : ''} · {fmtSize(bytes?.length ?? 0)}
    </p>

    {#if systems.length > 1}
      <div class="field">
        <span class="label">Which system?</span>
        <div class="choices">
          {#each systems as s, i (i)}
            <button class="choice" class:on={i === chosen} onclick={() => pick(i)}>{s.name}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#if adapter?.massSlider && bodies.length}
      <div class="field">
        <span class="label">How much to bring across</span>
        <input type="range" min="15" max="30" step="0.1" bind:value={logThreshold} />
        <p class="hint left">
          <strong>{included}</strong> of {bodies.length} bodies — everything down to {fmtMass(threshold)}.
          {#if included > 150}<br /><em>That is a lot of bodies; the conversion may take a moment.</em>{/if}
        </p>
      </div>
    {/if}

    <div class="actions">
      <button class="cta" onclick={convert} disabled={phase === 'working'}>
        {phase === 'working' ? 'Converting…' : 'Convert'}
      </button>
      <button class="plainbtn" onclick={reset}>Start again</button>
    </div>
  </section>
{/if}

{#if phase === 'done' && result}
  <section class="panel step">
    <h2>{result.system.name || 'Converted system'}</h2>
    <p class="sub">
      {total} objects — {result.counts.stars} star{result.counts.stars === 1 ? '' : 's'},
      {result.counts.planets} planet{result.counts.planets === 1 ? '' : 's'},
      {result.counts.moons} moon{result.counts.moons === 1 ? '' : 's'}{#if result.counts.rings}, {result.counts.rings} ring{result.counts.rings === 1 ? '' : 's'}{/if}{#if result.counts.other}, {result.counts.other} other{/if}
    </p>

    <div class="outputs">
      {#each OUTPUTS as o (o.id)}
        {#if o.available}
          <button class="cta" onclick={save}>Download {o.label} {o.extension}</button>
        {:else}
          <span class="soon" title={o.note}>{o.label} {o.extension} — soon</span>
        {/if}
      {/each}
    </div>

    {#if result.assumptions.length}
      <details class="sub-fold">
        <summary>{result.assumptions.length} assumption{result.assumptions.length === 1 ? '' : 's'} made</summary>
        <ul>{#each result.assumptions as a, i (i)}<li>{a}</li>{/each}</ul>
      </details>
    {/if}

    {#if result.skipped.length}
      <details class="sub-fold">
        <summary>{result.skipped.length} thing{result.skipped.length === 1 ? '' : 's'} left behind</summary>
        <ul>{#each result.skipped as s, i (i)}<li>{s.name} <span class="why">({s.reason.replace(/-/g, ' ')})</span></li>{/each}</ul>
      </details>
    {/if}

    <div class="actions">
      <button class="plainbtn" onclick={reset}>Convert another</button>
    </div>
  </section>
{/if}

<!-- FOLDED AWAY BY DEFAULT. This is the answer to a question somebody asks once — usually after a
     conversion has surprised them — and leaving it open pushed the tool itself off the first screen.
     `<details>` rather than a scripted toggle: it opens without JavaScript, it is keyboard-operable
     and screen-reader-announced for free, and the browser finds the text inside it when someone hits
     Ctrl+F. -->
<details class="folded">
  <summary><h2>What travels, and what does not</h2></summary>
  <div class="prose">
  <p>
    A conversion carries <strong>numbers and hierarchy</strong>: masses, radii, orbits, rotation and
    tilt, interior composition, atmospheres, oceans, rings, and what orbits what. It does not carry
    textures, 3D models, photographs, procedural surface seeds or render settings — the receiving
    program draws the system from its own art. That is the scope on purpose, not a gap: the data file
    is the part that means the same thing in all three programs.
  </p>
  <p>
    Each format then loses its own things, and the tool tells you which applied to your file rather
    than converting quietly. <strong>Universe Sandbox</strong> stores no parent for anything, so the
    hierarchy is worked out from each body's position and velocity rather than read; ring particles
    are summarised into a ring, a belt of them round a star becomes a belt, and bodies on escape
    trajectories are left out rather than forced onto an orbit they are not on.
    <strong>SpaceEngine</strong> states its orbits and parents outright, so that side is close to
    one-for-one, though ocean coverage is not something the format records.
    <strong>Star System Explorer</strong> carries ships, stations, Lagrange points, tags and GM notes
    that the other two have no equivalent for, and those stay behind.
  </p>

  <h2>It does no physics, deliberately</h2>
  <p>
    This tool converts; it does not simulate. Star System Explorer works out temperatures, albedo,
    climate and classification itself when a system arrives, so doing any of that here would only
    produce numbers the engine immediately replaces. What you export carries what your source file
    actually stated — no more, and nothing invented.
  </p>
  </div>
</details>

<style>
  strong { color: var(--ink); font-weight: 600; }

  .drop {
    border: 1px dashed var(--edge); border-radius: var(--radius);
    padding: 38px 24px; text-align: center; background: var(--panel);
    transition: border-color 0.15s, background 0.15s;
  }
  .drop.dragging { border-color: var(--accent); background: var(--panel-2); }
  .drop-title { margin: 0 0 14px; color: var(--ink-dim); }
  .hint { font-size: 0.82rem; color: var(--ink-faint); margin: 14px 0 0; }
  .hint.left { text-align: left; margin: 8px 0 0; }
  .browse input { display: none; }
  .browse .cta { cursor: pointer; }

  .problem {
    margin: 16px 0 0; padding: 12px 14px; border-radius: var(--radius);
    background: var(--panel); border-left: 3px solid var(--bad);
    color: var(--bad); font-size: 0.94rem;
  }

  .step { margin: 24px 0 0; }
  .step h2 { margin: 0 0 4px; }
  .sub { margin: 0; color: var(--ink-dim); font-size: 0.94rem; }

  .field { margin: 20px 0 0; }
  .label { display: block; color: var(--ink-dim); font-size: 0.9rem; margin-bottom: 8px; }
  .field input[type='range'] { width: 100%; accent-color: var(--accent); }

  .choices { display: flex; flex-wrap: wrap; gap: 8px; }
  .choice {
    background: var(--panel-2); border: 1px solid var(--edge); border-radius: var(--radius);
    color: var(--ink-dim); padding: 6px 12px; font: inherit; font-size: 0.9rem; cursor: pointer;
  }
  .choice.on { border-color: var(--accent); color: var(--ink); }

  .actions { margin: 22px 0 0; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  button.cta { border: 0; font: inherit; font-weight: 600; cursor: pointer; }
  button.cta:disabled { opacity: 0.6; cursor: default; }
  .plainbtn { background: none; border: 0; color: var(--ink-faint); font: inherit; font-size: 0.9rem; cursor: pointer; text-decoration: underline; }
  .plainbtn:hover { color: var(--ink-dim); }

  .outputs { margin: 20px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  .soon { color: var(--ink-faint); font-size: 0.9rem; border: 1px dashed var(--edge); border-radius: var(--radius); padding: 7px 13px; cursor: help; }

  .sub-fold { margin: 16px 0 0; font-size: 0.92rem; }
  .sub-fold summary { cursor: pointer; color: var(--ink-dim); }
  .sub-fold summary:hover { color: var(--ink); }
  .sub-fold ul { margin: 8px 0 0; padding-left: 20px; color: var(--ink-dim); }
  .sub-fold li { margin-bottom: 5px; }
  .why { color: var(--ink-faint); }

  .folded { margin: 40px 0 0; border-top: 1px solid var(--edge); padding-top: 14px; }
  .folded summary { cursor: pointer; list-style-position: outside; color: var(--ink-dim); }
  .folded summary:hover { color: var(--ink); }
  .folded summary h2 { display: inline; font-size: 1.05rem; }
  .folded .prose { margin: 14px 0 0; }
  .folded .prose h2 { margin-top: 26px; font-size: 1rem; }
</style>
