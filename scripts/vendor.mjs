// COPY THE IMPORT AND EXPORT CODE OVER FROM THE ENGINE.
//
// The owner's decision (2026-09-23): this repo COPIES from Star System Explorer rather than sharing a
// package with it. Fixes are applied in both places by hand and are expected to be rare, because the
// copied surface is parsers and geometry — the part of the engine that changes least — and not the
// physics model, which does change and which this tool deliberately does not run.
//
// IT FOLLOWS THE IMPORTS RATHER THAN BEING TOLD THE FILES. An earlier version carried a hand-written
// list of fourteen paths, which was fine until the exporters arrived needing fourteen more. A list
// like that is only correct on the day it is written: the engine adds an import, the copy silently
// lacks a file, and the failure surfaces as "module not found" a long way from the cause. So the
// entry points are named, the closure is walked, and the SUBSTITUTIONS below are the only things the
// walk is told to stop at.
//
//   node scripts/vendor.mjs ../star-system-explorer-v2/sse2-convert
//
// WHAT IS SUBSTITUTED, AND WHY EACH ONE EARNS IT. `guessSystemAge` and `resolveImportedStarClass`
// drag stellar evolution, the star generator, the RNG, BodyFactory and star imagery into a tool whose
// premise is that it runs no physics — and the engine re-resolves both on arrival anyway, which is
// why its importers set `autoClassify`. The other four are single leaf functions living in modules of
// 900 and 578 lines whose own closures reach the tag system and Lagrange. Copying a function is
// honest; copying its module to reach it would bring half the engine.
import fs from 'node:fs';
import path from 'node:path';

const engine = process.argv[2];
if (!engine) {
  console.error('usage: node scripts/vendor.mjs <path-to-engine-checkout>');
  process.exit(2);
}
const SRC = path.resolve(engine, 'src/lib');
if (!fs.existsSync(SRC)) {
  console.error(`No src/lib under ${engine} — is that an engine checkout?`);
  process.exit(2);
}
const OUT = path.resolve('src/lib/vendor');

/** Where the walk starts: everything this tool actually calls. */
const ENTRIES = [
  'import/ubox/index.ts',
  'import/spaceengine/index.ts',
  'export/ubox/write.ts',
  'export/spaceengine/write.ts'
];

/**
 * Modules the walk STOPS at, and what replaces them. The value is a path relative to src/lib/vendor;
 * the copier works out how many `../` each importing file needs.
 */
const SUBSTITUTIONS = {
  'physics/systemAge': 'systemAge',
  'physics/importedStarClass': 'starClass',
  'physics/stability': 'physicsLeaf',
  'physics/barycenterReconcile': 'physicsLeaf',
  'system/barycentres': 'physicsLeaf',
  'import/realsky/stars.mjs': 'physicsLeaf',
  // `computeWorldStates3D` asks this where a docked ship sits; it reaches the mega-construct
  // catalogue and its geometry, which imports three.js — a 3D rendering library, in a text converter.
  // Constructs cannot travel to either target format anyway, so the branch is unreachable here.
  'constructs/docking': 'noConstructs'
};

/**
 * Type-only imports IN `types.ts` ONLY, describing fields this tool never reads. See vendor/stubs.ts.
 *
 * Scoped to that one file deliberately. Applied everywhere, `physics/orbits` on this list also caught
 * `constructs/docking`'s real, value-level import of `parkingOrbitRadiusKm` from the same module and
 * pointed it at a stub that does not export it — a list meant to erase eight unused type references
 * quietly breaking a working one.
 */
const TYPE_STUB_HOST = 'types.ts';
const TYPE_STUBS = [
  'physics/orbits', 'physics/circumbinary', 'physics/geoActivity', 'physics/volatileRetention',
  'system/classification', 'traveller/types', 'transit/types', 'rulepackDelta', 'player/presetTypes'
];

const rel = (abs) => path.relative(SRC, abs).split(path.sep).join('/');

function resolveSpec(spec, fromAbs) {
  let p;
  if (spec.startsWith('$lib/')) p = path.join(SRC, spec.slice(5));
  else if (spec.startsWith('.')) p = path.resolve(path.dirname(fromAbs), spec);
  else return null;                                   // a bare package (fflate) — left alone
  for (const c of [p, p + '.ts', p + '.mjs', p + '.js', path.join(p, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** Every module specifier in a file, from both `from '...'` and inline `import('...')`. */
function specifiersIn(text) {
  const out = [];
  const from = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\bfrom\s+['"]([^'"]+)['"]/g;
  const inline = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = from.exec(text))) out.push(m[1]);
  while ((m = inline.exec(text))) out.push(m[1]);
  return out;
}

/** Is this specifier one we stop at? Returns the vendor-relative replacement, or null. */
const substitutionFor = (spec) => {
  const key = spec.replace(/^\$lib\//, '').replace(/^\.\.?\//, '');
  for (const [from, to] of Object.entries(SUBSTITUTIONS)) {
    if (key === from || spec.endsWith(from)) return to;
  }
  return null;
};
const isTypeStub = (spec, key) => key === TYPE_STUB_HOST && TYPE_STUBS.some((t) => spec.endsWith(t));

// --- walk ----------------------------------------------------------------------------------------
const wanted = new Set();
function walk(abs) {
  const key = rel(abs);
  if (wanted.has(key)) return;
  wanted.add(key);
  if (key.endsWith('.json')) return;
  const text = fs.readFileSync(abs, 'utf8');
  for (const spec of specifiersIn(text)) {
    if (substitutionFor(spec) || isTypeStub(spec, key)) continue;
    const target = resolveSpec(spec, abs);
    if (target) walk(target);
  }
}
for (const e of ENTRIES) {
  const abs = path.join(SRC, e);
  if (!fs.existsSync(abs)) { console.error(`MISSING entry in engine: ${e}`); process.exit(1); }
  walk(abs);
}

// --- copy ----------------------------------------------------------------------------------------
const stamp = new Date().toISOString().slice(0, 10);
let copied = 0;
for (const key of [...wanted].sort()) {
  const from = path.join(SRC, key);
  const depth = key.split('/').length - 1;
  const up = depth === 0 ? './' : '../'.repeat(depth);
  let text = fs.readFileSync(from, 'utf8');

  if (!key.endsWith('.json')) {
    // Every specifier is rewritten in one pass, so a substitution and a plain path cannot disagree
    // about how many `../` they need.
    const rewrite = (spec) => {
      const sub = substitutionFor(spec);
      if (sub) return `${up}${sub}`;
      if (isTypeStub(spec, key)) return `${up}stubs`;
      if (spec.startsWith('$lib/')) return `${up}${spec.slice(5)}`;
      return spec;                                     // relative or bare — already correct
    };
    text = text
      .replace(/(\bfrom\s+)['"]([^'"]+)['"]/g, (m, pre, spec) => `${pre}'${rewrite(spec)}'`)
      .replace(/(\bimport\(\s*)['"]([^'"]+)['"]/g, (m, pre, spec) => `${pre}'${rewrite(spec)}'`);
  }

  const banner = key.endsWith('.json') ? '' :
    `// VENDORED from Star System Explorer, src/lib/${key} — copied on ${stamp}.\n` +
    `// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the\n` +
    `// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import\n` +
    `// paths and that script's declared substitutions are the only intended differences.\n`;

  const to = path.join(OUT, key);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, banner + text);
  copied++;
}

let head = '';
try { head = fs.readFileSync(path.resolve(engine, '.git/HEAD'), 'utf8').trim(); } catch { /* fine */ }
console.log(`vendored ${copied} files from ${path.resolve(engine)}${head ? ` (${head})` : ''}`);
console.log('Read the diff before committing — an unexpected change is the engine having moved.');
