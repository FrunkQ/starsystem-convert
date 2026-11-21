import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { open, write, checkSse4, detect } from '$lib/module';

// Both fixtures are real kernel output (resolved_system, wrapped as sse.system-export/1): Sol after
// adopting SSE4's own synthetic-sol V3 fixture, and Kestrel 40 grown by the formation pipeline.
const bytes = (f: string) => new Uint8Array(fs.readFileSync(`src/lib/sse4/fixtures/${f}`));
type Node = { id: string; name: string; parentId: string | null; roleHint: string; massKg?: number; orbit?: { hostId: string; elements: { a_AU: number; i_deg: number } }; tags?: unknown[] };

describe('reading Star System Explorer 4', () => {
  it('is recognised by its bytes', () => {
    expect(detect('whatever.json', bytes('sol.sse4.json'))).toBe('sse4');
    // A V3 save is still V3.
    expect(detect('synthetic-sol.json', bytes('synthetic-sol.json'))).toBe('sse');
  });

  it('brings a system that came from V3 home nearly as it left', () => {
    const { system, report } = open('sol.sse4.json', bytes('sol.sse4.json')).read();
    const nodes = system.nodes as Node[];
    expect(system.name).toBe('Sol');
    expect(nodes.map((n) => n.name)).toEqual(['Sun', 'Earth', 'Moon', 'Station']);
    const earth = nodes.find((n) => n.name === 'Earth')!;
    expect(earth.id).toBe('earth');
    expect(earth.parentId).toBe('sun');
    expect(earth.orbit!.elements.a_AU).toBeCloseTo(1, 6);
    // V3's own tags came back from SSE4's kept v3.* facts.
    expect(earth.tags?.length).toBeGreaterThan(0);
    const moon = nodes.find((n) => n.name === 'Moon')!;
    expect(moon.parentId).toBe('earth');
    expect(moon.roleHint).toBe('moon');
    expect(moon.orbit!.elements.i_deg).toBeCloseTo(5.145, 3);
    expect(report.counts).toMatchObject({ stars: 1, planets: 1, moons: 1 });
    expect(report.assumptions.join(' ')).toMatch(/stay in SSE4/);
  });

  it('reads a grown system and says what did not travel', () => {
    const { system, report } = open('kestrel.sse4.json', bytes('kestrel.sse4.json')).read();
    const nodes = system.nodes as Node[];
    expect(report.counts.stars).toBe(3);
    expect(report.counts.planets + report.counts.moons).toBeGreaterThan(5);
    // Every satellite's host is in the file.
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) if (n.parentId) expect(ids.has(n.parentId)).toBe(true);
    const left = report.skipped.map((s) => s.name).join(' | ');
    expect(left).toMatch(/star\.luminosity/);
    expect(left).toMatch(/star\.phase/);
    expect(report.assumptions.join(' ')).toMatch(/kind and a number/);
  });

  it('goes on to every writable format', () => {
    for (const to of ['sse', 'spaceengine', 'ubox'] as const) {
      const { system } = open('kestrel.sse4.json', bytes('kestrel.sse4.json')).read();
      const { file } = write(system, to);
      expect(file.text ?? file.bytes).toBeTruthy();
    }
  });

  it('survives the loop SSE4 to V3 to SSE4: its own importer counts the same bodies', async () => {
    const { system } = open('sol.sse4.json', bytes('sol.sse4.json')).read();
    const c = await checkSse4(system);
    expect(c.counts.bodies).toBe(3);
    expect(c.counts.constructs).toBe(1);
  });
});
