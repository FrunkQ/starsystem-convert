// COPY THE IMPORT CODE OVER FROM THE ENGINE.
//
// The owner's decision (2026-09-23): this repo COPIES from Star System Explorer rather than sharing a
// package with it. Fixes are applied in both places by hand and are expected to be rare, because the
// copied surface is parsers and geometry — the part of the engine that changes least — and not the
// physics model, which does change and which this tool deliberately does not run.
//
// This script is the copy mechanism, not a sync system. It exists so that "copy it again" is one
// command with a written-down list rather than a person remembering eleven paths at midnight, and so
// that the PATCHES below are declared in one legible place instead of being discovered later as
// mysterious differences. Run it, read the diff, commit.
//
//   node scripts/vendor.mjs ../star-system-explorer-v2/sse2-convert
//
// WHAT IS NOT COPIED, and why it matters. The two star-physics helpers the engine's converters call,
// `guessSystemAge` and `resolveImportedStarClass`, drag 3,200 lines across 16 files at runtime —
// stellar evolution, the star generator, the RNG, BodyFactory, star imagery, ionising output. A format
// converter has no business carrying any of it, and the engine RE-RESOLVES both on load anyway
// (`importFixup.resolveLegacyStarClass` against the GM's own rule pack, which is why the converters
// set `autoClassify`). So they are replaced by `../starClass.ts` and `../systemAge.ts`, which pass
// through what the source file actually stated and leave the engine to do the rest.
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

/** Files copied as-is from the engine's src/lib, to the same relative path under src/lib/vendor. */
const FILES = [
  'types.ts',
  'constants.ts',
  'data/liquids.json',
  'import/shared/zip.ts',
  'import/shared/review.ts',
  'import/ubox/types.ts',
  'import/ubox/parse.ts',
  'import/ubox/kepler.ts',
  'import/ubox/hierarchy.ts',
  'import/ubox/convert.ts',
  'import/ubox/review.ts',
  'import/ubox/index.ts',
  'import/spaceengine/parse.ts',
  'import/spaceengine/convert.ts',
  'import/spaceengine/index.ts'
];

/**
 * PATCHES, applied to every copied file after the `$lib/` rewrite.
 *
 * Each one is a deliberate divergence from the engine and has to be justified here, because an
 * undeclared difference between the two copies is the thing that makes a copied codebase rot. Order
 * matters: the `$lib/` rewrite runs first, so these match the REWRITTEN text.
 */
// `{up}` is replaced with however many `../` it takes to get from THIS file back to src/lib/vendor.
// Hardcoding `../` instead put `import/spaceengine/convert.ts` two directories deep looking for
// `import/physics`, and every one of those failures reads as "module not found" a long way from the
// line that caused it.
const PATCHES = [
  // The two heavy star-physics helpers, swapped for the converter's own pass-through versions.
  [/from '(?:\.\.\/)+physics\/systemAge'/g, "from '{up}systemAge'"],
  [/from '(?:\.\.\/)+physics\/importedStarClass'/g, "from '{up}starClass'"],
  // Two leaf functions living in 900- and 578-line modules whose closures are enormous. Extracted
  // verbatim into vendor/physics.ts, which records where each came from.
  [/from '(?:\.\.\/)+physics\/stability'/g, "from '{up}physics'"],
  [/from '(?:\.\.\/)+physics\/barycenterReconcile'/g, "from '{up}physics'"],
  [/from '(?:\.\.\/)+system\/barycentres'/g, "from '{up}physics'"],
  // One constant, from a 408-line module that exists to talk to sky catalogues.
  [/from '(?:\.\.\/)+import\/realsky\/stars\.mjs'/g, "from '{up}physics'"],
  // Two more type-only imports, written inline rather than in the import block.
  [/import\('\.\/player\/presetTypes'\)/g, "import('./stubs')"],
  // types.ts pulls eight TYPE-ONLY imports from modules this tool has no use for. They are erased at
  // runtime, so the shapes come from stubs rather than 3,000 lines of engine.
  [/from '\.\/physics\/orbits'/g, "from './stubs'"],
  [/from '\.\/physics\/circumbinary'/g, "from './stubs'"],
  [/from '\.\/physics\/geoActivity'/g, "from './stubs'"],
  [/from '\.\/physics\/volatileRetention'/g, "from './stubs'"],
  [/from '\.\/system\/classification'/g, "from './stubs'"],
  [/from '\.\/traveller\/types'/g, "from './stubs'"],
  [/from '\.\/transit\/types'/g, "from './stubs'"],
  [/from '\.\/rulepackDelta'/g, "from './stubs'"]
];

/**
 * `$lib/x/y` → the right number of `../` to reach src/lib/vendor/x/y from this file.
 *
 * BOTH SPELLINGS. A statement import (`from '$lib/types'`) is the obvious one, but the engine also
 * writes inline type-imports (`Record<string, keyof import('$lib/types').Makeup>`), and rewriting
 * only the first left five live `$lib` references behind in one file — which resolve to nothing here
 * and fail at type-check, a long way from the line that caused them.
 */
function rewriteLibPaths(text, relPath) {
  const depth = relPath.split('/').length - 1;
  const up = depth === 0 ? './' : '../'.repeat(depth);
  return text
    .replace(/from '\$lib\/([^']+)'/g, (_m, p) => `from '${up}${p}'`)
    .replace(/import\('\$lib\/([^']+)'\)/g, (_m, p) => `import('${up}${p}')`);
}

const stamp = new Date().toISOString().slice(0, 10);
let head = '';
try {
  head = fs.readFileSync(path.resolve(engine, '.git/HEAD'), 'utf8').trim();
} catch { /* a checkout without .git is still a usable source */ }

let copied = 0;
for (const rel of FILES) {
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) {
    console.error(`MISSING in engine: ${rel}`);
    process.exit(1);
  }
  let text = fs.readFileSync(from, 'utf8');
  const depth = rel.split('/').length - 1;
  const up = depth === 0 ? './' : '../'.repeat(depth);

  if (!rel.endsWith('.json')) {
    text = rewriteLibPaths(text, rel);
    for (const [re, to] of PATCHES) text = text.replace(re, to.replaceAll('{up}', up));
  }

  // A JSON file takes no banner: it is data, and a comment would make it unparseable.
  const banner = rel.endsWith('.json') ? '' :
    `// VENDORED from Star System Explorer, src/lib/${rel} — copied on ${stamp}.\n` +
    `// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the\n` +
    `// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import\n` +
    `// paths and the declared substitutions in that script are the only intended differences.\n`;

  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, banner + text);
  copied++;
}

console.log(`vendored ${copied} files from ${path.resolve(engine)}${head ? ` (${head})` : ''}`);
console.log('Read the diff before committing — an unexpected change is the engine having moved.');
