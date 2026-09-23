// ONE SHAPE PER FORMAT, so the page never learns what a .ubox is.
//
// This is the engine's own `src/lib/import/adapters.ts` idea, rebuilt for this tool: every format
// normalises to the small surface the page needs — what systems are in this file, what bodies are in
// one of them, and convert it. Adding SIMBAD later is another entry in this table and no change to
// the page, which is the whole reason the engine wrote it this way after shipping two import modals
// and deleting one.
//
// EVERY CONVERSION GOES THROUGH THE SSE `System`. Three formats in and three out is nine conversions
// written as three readers and three writers, and the pivot is the engine's format because it is the
// only one of the three that can hold what the other two say.
import type { System, CelestialBody } from '$lib/vendor/types';
import { readZipMembers, decodeMember } from '$lib/vendor/import/shared/zip';
import * as ubox from '$lib/vendor/import/ubox';
import * as se from '$lib/vendor/import/spaceengine';
import type { FormatId } from './formats';

export interface SourceSystem { name: string }
export interface BodyPreview { name: string; mass: number }

export interface ConvertResult {
  system: System;
  counts: { stars: number; planets: number; moons: number; other: number; rings: number };
  assumptions: string[];
  skipped: { name: string; reason: string }[];
}

export interface SourceAdapter {
  label: string;
  /** Formats where a mass threshold is meaningful — a saved SSE system has already been curated. */
  massSlider: boolean;
  recommendedMinMass: number;
  subtitle(bytes: Uint8Array): string;
  systems(bytes: Uint8Array): SourceSystem[];
  bodies(bytes: Uint8Array, index: number): BodyPreview[];
  convert(bytes: Uint8Array, index: number, minMassKg: number): ConvertResult;
}

const countNodes = (system: System): ConvertResult['counts'] => {
  const counts = { stars: 0, planets: 0, moons: 0, other: 0, rings: 0 };
  for (const n of system.nodes ?? []) {
    if (n.kind === 'barycenter') { counts.other++; continue; }
    const role = (n as CelestialBody).roleHint;
    if (role === 'star') counts.stars++;
    else if (role === 'planet') counts.planets++;
    else if (role === 'moon') counts.moons++;
    else if (role === 'ring') counts.rings++;
    else counts.other++;
  }
  return counts;
};

export const uboxAdapter: SourceAdapter = {
  label: 'Universe Sandbox',
  massSlider: true,
  recommendedMinMass: ubox.RECOMMENDED_MIN_MASS_KG,
  subtitle: (b) => { try { return ubox.listUboxSimulations(b).buildName; } catch { return ''; } },
  systems: (b) => ubox.listUboxSimulations(b).simulations.map((s) => ({ name: s.name })),
  bodies: (b, i) => ubox.previewUbox(b, i).bodies.map((x) => ({ name: x.name, mass: x.mass })),
  convert: (b, i, m) => {
    const r = ubox.importUbox(b, { simulation: i, minBodyMassKg: m });
    return { system: r.system, counts: r.counts, assumptions: r.assumptions, skipped: r.skipped };
  }
};

export const spaceengineAdapter: SourceAdapter = {
  label: 'SpaceEngine',
  massSlider: true,
  recommendedMinMass: se.SE_RECOMMENDED_MIN_MASS_KG,
  subtitle: () => '',
  systems: (b) => [{ name: se.previewSc(b).name }],
  bodies: (b) => se.previewSc(b).bodies.map((x) => ({ name: x.name, mass: x.mass })),
  convert: (b, _i, m) => {
    const r = se.importSc(b, { minBodyMassKg: m });
    return { system: r.system, counts: r.counts, assumptions: r.assumptions, skipped: r.skipped };
  }
};

// --- Star System Explorer ------------------------------------------------------------------------
// A save is either ONE system (it has `nodes`) or a campaign of many (it has `systems`, each entry
// wrapping a `system`). A `.sse.zip` bundle is the same document with its heavy assets stored beside
// it as real files; only the document is read, and the assets — models, photographs, player artwork —
// are exactly the things a conversion does not carry anyway.
interface SseDoc { nodes?: unknown[]; systems?: { name?: string; system?: System }[] }

function readSseDoc(bytes: Uint8Array): SseDoc {
  // The zip magic decides, not the extension — a renamed file still loads.
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const members = readZipMembers(bytes, ['.json']);
    const name = Object.keys(members).find((k) => /(^|\/)(system|starmap)\.json$/i.test(k)) ?? Object.keys(members)[0];
    return JSON.parse(decodeMember(members[name]));
  }
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

const sseSystems = (doc: SseDoc): System[] =>
  Array.isArray(doc.systems)
    ? doc.systems.map((e, i) => ({ ...(e.system as System), name: e.system?.name ?? e.name ?? `System ${i + 1}` }))
    : [doc as unknown as System];

export const sseAdapter: SourceAdapter = {
  label: 'Star System Explorer',
  // A saved system has already been through the engine and the GM. Re-applying a mass threshold here
  // would silently delete bodies somebody deliberately made, which is not a conversion.
  massSlider: false,
  recommendedMinMass: 0,
  subtitle: (b) => { const d = readSseDoc(b); return Array.isArray(d.systems) ? `campaign, ${d.systems.length} systems` : ''; },
  systems: (b) => sseSystems(readSseDoc(b)).map((s) => ({ name: s.name ?? 'Untitled system' })),
  bodies: (b, i) => (sseSystems(readSseDoc(b))[i]?.nodes ?? [])
    .filter((n) => n.kind === 'body')
    .map((n) => ({ name: n.name, mass: (n as CelestialBody).massKg ?? 0 }))
    .sort((x, y) => y.mass - x.mass),
  convert: (b, i) => {
    const system = sseSystems(readSseDoc(b))[i];
    if (!system?.nodes?.length) throw new Error('That file has no system in it that this tool can read.');
    return { system, counts: countNodes(system), assumptions: [], skipped: [] };
  }
};

export const ADAPTERS: Record<FormatId, SourceAdapter> = {
  ubox: uboxAdapter,
  spaceengine: spaceengineAdapter,
  sse: sseAdapter
};
