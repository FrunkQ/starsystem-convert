// COPY SSE4'S V3 IMPORTER (as wasm) INTO THIS REPO.
//
// Star System Explorer 4 is the only source of the V3-to-V4 importer (owner, 21 Nov 2026: one
// implementation, hosted with the other formats). SSE4 builds it as a small browser module,
// `crates/sse-convert-wasm`, with `scripts/build-convert-wasm.sh`, which writes the files and a PIN
// (the SSE4 commit and each file's sha256). This script copies them here and checks the PIN, so what
// is committed is provably what SSE4 built.
//
//   (in an SSE4 checkout on a main commit)  scripts/build-convert-wasm.sh
//   node scripts/vendor-sse4.mjs ../star-system-explorer
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/vendor-sse4.mjs <path-to-sse4-checkout>');
  process.exit(2);
}
const SRC = path.resolve(root, 'target/convert-wasm');
const OUT = path.resolve('src/lib/sse4/vendor');
const FILES = ['sse_convert_wasm.js', 'sse_convert_wasm.d.ts', 'sse_convert_wasm_bg.wasm', 'PIN'];

for (const f of FILES) {
  if (!fs.existsSync(path.join(SRC, f))) {
    console.error(`${f} missing from ${SRC}: run scripts/build-convert-wasm.sh in the SSE4 checkout first.`);
    process.exit(2);
  }
}
const pin = fs.readFileSync(path.join(SRC, 'PIN'), 'utf8');
if (/-dirty\b/.test(pin)) {
  console.error('The SSE4 build was made from a tree with uncommitted changes. Build from a clean main commit.');
  process.exit(2);
}
for (const line of pin.split('\n')) {
  const m = line.match(/^([0-9a-f]{64})\s+(\S+)$/);
  if (!m) continue;
  const got = createHash('sha256').update(fs.readFileSync(path.join(SRC, m[2]))).digest('hex');
  if (got !== m[1]) {
    console.error(`${m[2]} does not match its PIN (${got} != ${m[1]}).`);
    process.exit(1);
  }
}
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
console.log(`vendored ${pin.split('\n')[0]}`);
