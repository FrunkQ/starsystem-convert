# Star System Converter

Move a star system between **Universe Sandbox** (`.ubox`), **SpaceEngine** (`.sc` / `.pak`) and
**Star System Explorer** (`.json` / `.sse.zip`). One page, in the browser; a save never leaves the tab
it was dropped into.

Live at `convert.starsystemx.com`. A companion to [Star System Explorer](https://starsystemx.com).

## What it converts

The **data file**, and only that: masses, radii, orbits, rotation and obliquity, interior
composition, atmospheres, oceans, rings, and what orbits what.

It does **not** carry textures, 3D models, body photographs, procedural surface seeds, cloud and
aurora render settings, camera or UI state, or scenario scripting. The receiving program draws the
system from its own art. That is the scope on purpose — the numbers are the part that means the same
thing in all three programs.

Each format then has its own losses, and the tool says which applied to your file rather than
converting quietly:

- **Universe Sandbox** stores no parent for anything, so the hierarchy is *reconstructed* from each
  body's position and velocity rather than read. Ring and fragment particles are summarised into a
  ring or dropped; objects far outside the local cluster are left behind; unbound bodies are skipped
  rather than forced onto an orbit they are not on.
- **SpaceEngine** states its orbits and parents outright, so that side is close to one-for-one. Ocean
  coverage is not stored in the format, so it is assumed; body types outside the recognised set are
  not read.
- **Star System Explorer** carries things the other two have no equivalent for — ships and stations,
  Lagrange placements, tags, biospheres, GM notes — and those do not travel outward.

## Star System Explorer 4

SSE4 opens the Star System Explorer `.json` this tool writes, and reads it with one importer, in its
kernel. That importer is vendored here as wasm (`src/lib/sse4/`, pinned to the SSE4 commit it was built
from), so after a conversion the page can say what SSE4 will make of the file: what it keeps as
authored, what it works out again and how far apart the answers are, and which fields it keeps but does
not use yet. It loads only when asked.

## As a module, for other sites

The same code is published as a browser module that other StarSystemX sites load instead of keeping
their own copies: `https://convert.starsystemx.com/module/v1/convert.js`, with types and a pinning
manifest beside it. The page on this site uses it too. See [`src/lib/module/README.md`](src/lib/module/README.md).

## No physics

This tool converts; it does not simulate. Star System Explorer derives temperatures, albedo, climate
and classification itself when a system arrives, so doing any of it here would only produce numbers
the engine then overwrites. A system exported to Universe Sandbox or SpaceEngine carries what the
source actually stated.

## Development

```bash
npm install
npm run dev
```

```bash
npm run build     # what Cloudflare runs (builds the module, then the site)
npm run build:module  # the module alone, into static/module/v1/
npm test          # vitest
npm run check     # svelte-check
```

### Deployment

A Cloudflare **Worker with static assets** (not a Pages project — see the note in `wrangler.toml`,
which records why the distinction matters). Workers Builds settings:

| Field | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview build command | `npm run build` |
| Preview deploy command | `npx wrangler versions upload` |
| Root directory | `/` |
| `NODE_VERSION` | `22` |

### Where the conversion code comes from

The import modules are **vendored from Star System Explorer** (`FrunkQ/star-system-generator`,
`src/lib/import/`) rather than depended on, and each vendored file says so in its header. This is a
deliberate copy, accepted because the vendored surface is parsers and geometry rather than the
physics model, and so changes rarely. Fixes have to be applied in both places by hand; the engine's
side of the current ones is written up in its `docs/dev/convert-tool-sse-fixes.md`.
