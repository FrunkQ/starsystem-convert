import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as convertModule from './index';
import { API_VERSION, ConvertError, convert, detect, formats, open, write, info } from './index';

const text = (s: string) => new TextEncoder().encode(s);

// A small SpaceEngine script: a star, one planet and its moon. The format states parents outright,
// so the result can be checked body by body.
const SC = text(`Star "Testa"
{
\tClass "G2V"
\tMassSol 1.0
\tRadSol 1.0
}

Planet "Testa b"
{
\tParentBody "Testa"
\tClass "Terra"
\tMassEarth 1.2
\tRadius 6800
\tOrbit
\t{
\t\tSemiMajorAxis 1.1
\t\tEccentricity 0.02
\t}
}

Moon "Testa b I"
{
\tParentBody "Testa b"
\tMassEarth 0.01
\tRadius 1700
\tOrbit
\t{
\t\tSemiMajorAxisKm 380000
\t}
}
`);

describe('the module surface', () => {
  it('says what it is', () => {
    expect(info.name).toBe('starsystem-convert');
    expect(info.api).toBe(API_VERSION);
  });

  it('lists three formats, each readable and writable, with an output for each', () => {
    const f = formats();
    expect(f.map((x) => x.id).sort()).toEqual(['spaceengine', 'sse', 'ubox']);
    for (const x of f) {
      expect(x.readable).toBe(true);
      expect(x.writable).toBe(true);
      expect(x.output?.extension).toMatch(/^\./);
    }
  });

  it('detects by the bytes, as the page does', () => {
    expect(detect('renamed.txt', SC)).toBe('spaceengine');
    expect(detect('notes.txt', text('just words'))).toBeNull();
  });

  it('opens a file and previews its bodies without converting', () => {
    const o = open('Testa.sc', SC);
    expect(o.format).toBe('spaceengine');
    expect(o.systems).toHaveLength(1);
    expect(o.massFilter).not.toBeNull();
    const bodies = o.bodies();
    expect(bodies.map((b) => b.name)).toContain('Testa b');
    // Heaviest first.
    expect(bodies[0].massKg).toBeGreaterThanOrEqual(bodies[bodies.length - 1].massKg);
  });

  it('reads into the pivot with counts, and the mass filter drops light bodies', () => {
    const all = open('Testa.sc', SC).read();
    expect(all.report.counts).toMatchObject({ stars: 1, planets: 1, moons: 1 });
    const heavy = open('Testa.sc', SC).read({ minBodyMassKg: 1e24 });
    expect(heavy.report.counts.moons).toBe(0);
  });

  it('converts to each format, and the SSE output reads back to the same bodies', () => {
    for (const to of ['sse', 'spaceengine', 'ubox'] as const) {
      const r = convert('Testa.sc', SC, { to });
      expect(r.file.text ?? r.file.bytes).toBeTruthy();
      expect(Array.isArray(r.report.losses)).toBe(true);
    }
    const sse = convert('Testa.sc', SC, { to: 'sse' });
    const back = open(sse.file.fileName, text(sse.file.text!)).read();
    expect(back.report.counts).toEqual(sse.report.counts);
    // And through SpaceEngine and back again: the format SE states outright survives one-for-one.
    const sc = write(back.system, 'spaceengine').file.text!;
    expect(open('again.sc', text(sc)).read().report.counts).toMatchObject({ stars: 1, planets: 1, moons: 1 });
  });

  it('refuses with a code a caller can act on', () => {
    expect(() => open('holiday.jpg', new Uint8Array([0xff, 0xd8, 0xff]))).toThrow(ConvertError);
    try { open('holiday.jpg', new Uint8Array([0xff, 0xd8, 0xff])); } catch (e) {
      expect((e as ConvertError).code).toBe('unknown_format');
    }
    const empty = open('broken.json', text('{ "nodes": [] }'));
    expect(() => empty.read()).toThrow(expect.objectContaining({ code: 'no_system' }));
    expect(() => write({ nodes: [] }, 'nope' as never)).toThrow(expect.objectContaining({ code: 'not_writable' }));
  });
});

// The built file (npm run build:module) must offer exactly what the source does. Skipped when it has
// not been built, so `npm test` on a fresh checkout still runs.
const BUILT = 'static/module/v1/convert.js';
describe.skipIf(!fs.existsSync(BUILT))('the built module', () => {
  it('exports the same names as the source and converts the same file the same way', async () => {
    const built = await import(/* @vite-ignore */ `${process.cwd()}/${BUILT}`);
    const names = (m: object) => Object.keys(m).sort();
    expect(names(built)).toEqual(names(convertModule));
    const a = built.convert('Testa.sc', SC, { to: 'sse' });
    const b = convert('Testa.sc', SC, { to: 'sse' });
    expect(a.report).toEqual(b.report);
    expect(built.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
