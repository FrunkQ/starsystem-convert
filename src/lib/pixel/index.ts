// Pixels, deliberately — the same one bit of dress the Creator Hub wears, so the two sites read as
// one family. Vendored from the hub's `src/lib/pixel.ts`; drawn as SVG rectangles so it stays crisp
// at any size and costs no font file.
//
// A touch of it, not a theme. The body text stays a system font; the pixels are the trim.
import { GLYPHS, GLYPH_H, fold } from './font';

export interface Run { x: number; y: number; w: number; c: string }

/** Every horizontal run of one non-blank character in a grid of rows, as rectangles. `.` is blank. */
export function runs(rows: readonly string[]): Run[] {
  const out: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.') { x++; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  });
  return out;
}

/** A line of text as rows of `#` and `.`: one blank column between glyphs, in the cover font. */
export function textRows(text: string): string[] {
  const rows: string[] = Array.from({ length: GLYPH_H }, () => '');
  for (const ch of fold(text)) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let y = 0; y < GLYPH_H; y++) rows[y] += (rows[y] ? '.' : '') + g[y];
  }
  return rows;
}

/** The width of a grid, in pixels. */
export const gridWidth = (rows: readonly string[]): number => rows.reduce((a, r) => Math.max(a, r.length), 0);
