<script lang="ts">
  import { detectFormat, FORMATS, type FormatId } from '$lib/convert/formats';
  import { LINKS } from '$lib/links';

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

  const size = (n: number) =>
    n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
</script>

<svelte:head>
  <title>Star System Converter</title>
</svelte:head>

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="drop"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <p class="drop-title">Drop a save file here</p>
  <label class="browse">
    <input
      type="file"
      accept=".ubox,.sc,.pak,.json,.zip"
      onchange={(e) => take(e.currentTarget.files?.[0])}
    />
    <span class="cta">Choose a file</span>
  </label>
  <p class="hint">.ubox &middot; .sc &middot; .pak &middot; .json &middot; .sse.zip</p>
</section>

{#if problem}
  <p class="problem">{problem}</p>
{/if}

{#if file && detected}
  <section class="panel found">
    <h2>{file.name}</h2>
    <p>Read as <strong>{FORMATS[detected].label}</strong> &middot; {size(file.bytes.length)}</p>
    <p class="pending">
      Conversion is being wired up next — this build identifies the file and stops there.
    </p>
  </section>
{/if}

<section class="prose">
  <h2>What travels, and what does not</h2>
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
    are summarised into a ring, and bodies on escape trajectories are left out rather than forced
    onto an orbit they are not on. <strong>SpaceEngine</strong> states its orbits and parents
    outright, so that side is close to one-for-one, though ocean coverage is not something the format
    records. <strong>Star System Explorer</strong> carries ships, stations, Lagrange points, tags and
    GM notes that the other two have no equivalent for, and those stay behind.
  </p>

  <h2>It does no physics, deliberately</h2>
  <p>
    This tool converts; it does not simulate. Star System Explorer works out temperatures, albedo,
    climate and classification itself when a system arrives, so doing any of that here would only
    produce numbers the engine immediately replaces. What you export carries what your source file
    actually stated — no more, and nothing invented.
  </p>
</section>

<style>
  strong { color: var(--ink); font-weight: 600; }

  .drop {
    border: 1px dashed var(--edge);
    border-radius: var(--radius);
    padding: 38px 24px;
    text-align: center;
    background: var(--panel);
    transition: border-color 0.15s, background 0.15s;
  }
  .drop.dragging { border-color: var(--accent); background: var(--panel-2); }
  .drop-title { margin: 0 0 14px; color: var(--ink-dim); }
  .hint { font-size: 0.82rem; color: var(--ink-faint); margin: 14px 0 0; }
  .browse input { display: none; }
  .browse .cta { cursor: pointer; }

  .problem {
    margin: 16px 0 0; padding: 12px 14px; border-radius: var(--radius);
    background: var(--panel); border-left: 3px solid var(--bad);
    color: var(--bad); font-size: 0.94rem;
  }

  .found { margin: 24px 0 0; }
  .found h2 { margin: 0 0 4px; }
  .found p { margin: 4px 0 0; color: var(--ink-dim); font-size: 0.94rem; }
  .pending { color: var(--ink-faint) !important; font-style: italic; }

  .prose { margin: 48px 0 0; }
  .prose h2 { margin-top: 28px; }
</style>
