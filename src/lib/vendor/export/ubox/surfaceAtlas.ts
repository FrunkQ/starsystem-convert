// VENDORED from Star System Explorer, src/lib/export/ubox/surfaceAtlas.ts — copied on 2026-09-23.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// The terrain archive Universe Sandbox expects beside every simulation, written blank.
//
// Every save it writes carries `<name>-surface.zip`: five layers (`data.surface`, `material0..3.surface`),
// each `size x size` texels of 32 bytes, and an `info` file naming the size. A body with a surface owns
// one 64 x 64 tile, numbered by its SurfaceGridComponent.AtlasIndex; stars and black holes own none
// (-1). Measured on the program's own saves: a 512 atlas holding 31 bodies fills exactly its top four
// rows of tiles. The exporter gives every planet and moon a tile and a zero elevation ratio, so the
// layers are all zeros - a smooth body with nothing painted on it, which the program then simulates.
//
// WHY IT IS BUILT BY HAND. A 2048 atlas is 670 MB of zeros. Pushing that through a general deflater
// blocks a browser tab for seconds (measured: 4 s in Node); a deflate stream of N zero bytes is instead
// a fixed pattern - one literal zero, then back-references of 258 bytes at distance 1 - written here in
// milliseconds, and its CRC is a constant per size.

/** Texels on a side of one body's tile. */
export const ATLAS_TILE = 64;

/** The two sizes Universe Sandbox's own saves use: 512 holds 64 tiles, 2048 holds 1024. */
export function atlasSizeFor(tiles: number): 512 | 2048 {
  return tiles <= (512 / ATLAS_TILE) ** 2 ? 512 : 2048;
}

const BYTES_PER_TEXEL = 32;
const LAYERS = ['data.surface', 'material0.surface', 'material1.surface', 'material2.surface', 'material3.surface'];

/** CRC-32 of `size * size * 32` zero bytes, computed once with zlib for each size `atlasSizeFor` returns. */
export const ZERO_LAYER_CRC: Record<number, number> = { 512: 0x1ad2bc45, 2048: 0x80654151 };

class BitWriter {
  private out: Uint8Array;
  private pos = 0;
  private bit = 0;
  private cur = 0;
  constructor(capacity: number) { this.out = new Uint8Array(capacity); }
  /** `n` bits of `value`, least significant first: deflate's order for header fields. */
  bits(value: number, n: number) { for (let i = 0; i < n; i++) this.push((value >>> i) & 1); }
  /** A Huffman code of `n` bits, most significant first: deflate's order for codes. */
  code(value: number, n: number) { for (let i = n - 1; i >= 0; i--) this.push((value >>> i) & 1); }
  private push(b: number) {
    this.cur |= b << this.bit;
    if (++this.bit === 8) { this.out[this.pos++] = this.cur; this.cur = 0; this.bit = 0; }
  }
  finish(): Uint8Array {
    if (this.bit) this.out[this.pos++] = this.cur;
    return this.out.subarray(0, this.pos);
  }
}

/** A raw deflate stream (RFC 1951, one fixed-Huffman block) that inflates to `n` zero bytes. */
export function deflateZeros(n: number): Uint8Array {
  const matches = Math.max(0, Math.floor((n - 1) / 258));
  const tail = Math.max(0, n - 1 - matches * 258);
  const w = new BitWriter(Math.ceil((3 + 8 + matches * 13 + tail * 8 + 7) / 8) + 1);
  w.bits(1, 1);                       // BFINAL: the only block
  w.bits(1, 2);                       // BTYPE 01: fixed Huffman codes
  if (n > 0) w.code(0x30, 8);         // literal 0
  for (let i = 0; i < matches; i++) {
    w.code(0xc5, 8);                  // length 258 (code 285, no extra bits)
    w.code(0, 5);                     // distance 1 (code 0, no extra bits)
  }
  for (let i = 0; i < tail; i++) w.code(0x30, 8);
  w.code(0, 7);                       // end of block (code 256)
  return w.finish();
}

let crcTable: Uint32Array | null = null;
/** CRC-32 (zip's); pass the previous result as `seed` to continue it across chunks. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; method: 0 | 8; crc: number; size: number; data: Uint8Array }

/** A plain zip (no ZIP64, no data descriptors) from entries whose bytes are already prepared. */
function assembleZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.name));
  const localSize = entries.reduce((s, e, i) => s + 30 + names[i].length + e.data.length, 0);
  const centralSize = entries.reduce((s, _e, i) => s + 46 + names[i].length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const DOS_DATE_1980_01_01 = 0x21;
  let p = 0;
  const offsets: number[] = [];
  entries.forEach((e, i) => {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 0x0800, true);            // UTF-8 names, as the program writes them
    view.setUint16(p + 8, e.method, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, DOS_DATE_1980_01_01, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.data.length, true);
    view.setUint32(p + 22, e.size, true);
    view.setUint16(p + 26, names[i].length, true);
    view.setUint16(p + 28, 0, true);
    out.set(names[i], p + 30);
    out.set(e.data, p + 30 + names[i].length);
    p += 30 + names[i].length + e.data.length;
  });
  const centralStart = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, e.method, true);
    view.setUint16(p + 12, 0, true);
    view.setUint16(p + 14, DOS_DATE_1980_01_01, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.data.length, true);
    view.setUint32(p + 24, e.size, true);
    view.setUint16(p + 28, names[i].length, true);
    // extra, comment, disk, internal and external attributes: all zero
    view.setUint32(p + 42, offsets[i], true);
    out.set(names[i], p + 46);
    p += 46 + names[i].length;
  });
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - centralStart, true);
  view.setUint32(p + 16, centralStart, true);
  return out;
}

/** The blank terrain archive for an atlas of `size` texels on a side. */
export function blankSurfaceZip(size: 512 | 2048): Uint8Array {
  const layerBytes = size * size * BYTES_PER_TEXEL;
  const zeros = deflateZeros(layerBytes);
  const info = new TextEncoder().encode(`{\r\n"size":${size}\r\n}`);
  return assembleZip([
    ...LAYERS.map((name): ZipEntry => ({ name, method: 8, crc: ZERO_LAYER_CRC[size], size: layerBytes, data: zeros })),
    { name: 'info', method: 0, crc: crc32(info), size: info.length, data: info }
  ]);
}
