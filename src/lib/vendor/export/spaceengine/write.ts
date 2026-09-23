// VENDORED from Star System Explorer, src/lib/export/spaceengine/write.ts — copied on 2026-09-23.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// SSG system -> SpaceEngine `.sc`. The import read back to front, with three things that only exist
// in this direction.
//
// 1. NAMES ARE THE FOREIGN KEY. SpaceEngine resolves `ParentBody` by NAME, and SSG cheerfully allows
//    two moons called "I". Emitting them as written would silently re-home one under the other, which
//    is the `DwarfPlanet` failure all over again: no error, a wrong system. Every body is therefore
//    given a name unique within the file BEFORE anything is written, and the map is used for the
//    body's own label and for every reference to it.
// 2. SOME THINGS HAVE NOWHERE TO GO. Ships, stations, Lagrange placements and belts have no
//    SpaceEngine equivalent; a ring is not a body there at all but a `Rings` block on its planet.
//    Each is reported rather than dropped quietly.
// 3. SPACEENGINE'S OWN TAXONOMY. A planet carries a `Class` — Terra, Ferria, Aquaria, Jupiter,
//    Neptune — decided by composition, and a body over about 13 Jupiter masses is a `Star` to
//    SpaceEngine even though SSG only calls it one above the hydrogen-burning limit. Those are
//    SpaceEngine's questions and they get SpaceEngine's answers.
import { AU_KM, EARTH_MASS_KG, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../../constants';
import { BAR_PER_ATM } from '../../import/spaceengine/convert';
import type { System, CelestialBody, Barycenter, Makeup } from '../../types';

export interface ScExportResult {
  text: string;
  /** Things that could not be represented, in words a person can act on. */
  notes: string[];
}

/** SpaceEngine calls anything above ~13 Jupiter masses a star (its own brown-dwarf boundary), where
 *  SSG uses the hydrogen-burning limit at ~78. A body between the two is a `Star` block here and a
 *  substellar object at home, and both are right in their own terms. */
const SE_STAR_CUTOFF_KG = 3e28;
/** Below this a planet is a `DwarfPlanet` and a moon a `DwarfMoon`. Pluto is 0.0022 Earth masses. */
const DWARF_CUTOFF_KG = 0.01 * EARTH_MASS_KG;

const JUPITER_MASS_KG = 1.898e27;

// --- names -------------------------------------------------------------------------------------
/** A name SpaceEngine can carry: no quotes, no newlines, never empty. */
const clean = (s: string | undefined, fallback: string) =>
  (s ?? '').replace(/["\r\n]/g, '').trim() || fallback;

/**
 * One unique name per node. A clash takes a numeric suffix rather than being silently merged, and
 * the SECOND occurrence is the one renamed, so the first body of a given name keeps it.
 */
function uniqueNames(nodes: (CelestialBody | Barycenter)[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const n of nodes) {
    const base = clean(n.name, n.kind === 'barycenter' ? 'Barycentre' : 'Body');
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    used.add(name.toLowerCase());
    out.set(n.id, name);
  }
  return out;
}

// --- SpaceEngine's planet taxonomy ---------------------------------------------------------------
/**
 * The boundaries SpaceEngine itself publishes, read off composition — which is exactly what SSG's
 * `makeup` holds. Hydrogen first because a giant is a giant whatever else is in it.
 */
function planetClass(body: CelestialBody): string {
  const mk: Makeup = body.makeup ?? {};
  const pct = (v: number | undefined) => (v ?? 0) * 100;
  const gas = pct(mk.gas);
  if (gas > 0.01) return gas < 25 ? 'Neptune' : 'Jupiter';
  if (pct(mk.metal) > 50) return 'Ferria';
  // Ice OR a real ocean: SpaceEngine's Aquaria is a water world, and SSG can say so two ways.
  if (pct(mk.ice) > 25 || (body.hydrosphere?.coverage ?? 0) > 0.9) return 'Aquaria';
  return 'Terra';
}

/** A star's designation as SpaceEngine writes it: `star/G2V` -> `G2V`. The FULL class, never the band. */
function starClassOf(body: CelestialBody): string {
  const classes = body.classes ?? [];
  const full = classes.find((c) => c.startsWith('star/')) ?? classes[0] ?? '';
  return full.replace(/^star\//, '') || 'G2V';
}

// --- composition ---------------------------------------------------------------------------------
// SSG -> SpaceEngine is one-to-many in reverse: the reader folds Ice/Ices/Water/WaterIce all into
// `ice`, so writing it back is a CHOICE, and the choice is the spelling SpaceEngine's own catalogues
// use. `gas` splits three-to-one into hydrogen and helium, which is roughly cosmic and sums back to
// the same figure on re-import.
function interiorBlock(mk: Makeup | undefined, indent: string): string[] {
  if (!mk) return [];
  const parts: [string, number][] = [];
  const add = (k: string, v: number | undefined) => { if (v && v > 0) parts.push([k, v * 100]); };
  add('Metals', mk.metal);
  add('Silicates', mk.rock);
  add('Carbon', mk.carbon);
  add('Ices', mk.ice);
  if (mk.gas && mk.gas > 0) { parts.push(['Hydrogen', mk.gas * 75]); parts.push(['Helium', mk.gas * 25]); }
  if (!parts.length) return [];
  const total = parts.reduce((s, [, v]) => s + v, 0);
  const lines = [`${indent}Interior`, `${indent}{`, `${indent}\tComposition // mass fraction, values in percent`, `${indent}\t{`];
  // Normalised so the block sums to 100 even when the makeup did not.
  for (const [k, v] of parts) lines.push(`${indent}\t\t${k.padEnd(12)}${(v * 100 / total).toFixed(2)}`);
  lines.push(`${indent}\t}`, `${indent}}`);
  return lines;
}

function atmosphereBlock(body: CelestialBody, indent: string): string[] {
  const atm = body.atmosphere;
  const bar = atm?.pressure_bar ?? 0;
  const comp = atm?.composition ?? {};
  const species = Object.entries(comp).filter(([, f]) => (f ?? 0) > 0);
  if (!(bar > 0) && !species.length) return [];
  const lines = [`${indent}Atmosphere`, `${indent}{`];
  // bar -> atm, the one conversion shared with the reader.
  if (bar > 0) lines.push(`${indent}\tPressure${' '.repeat(7)}${(bar / BAR_PER_ATM).toPrecision(5)}\t// atm`);
  if (species.length) {
    const total = species.reduce((s, [, f]) => s + (f ?? 0), 0);
    lines.push(`${indent}\tComposition // values in percent`, `${indent}\t{`);
    for (const [k, f] of species) lines.push(`${indent}\t\t${k.padEnd(8)}${((f ?? 0) * 100 / total).toFixed(2)}`);
    lines.push(`${indent}\t}`);
  }
  lines.push(`${indent}}`);
  return lines;
}

function oceanBlock(body: CelestialBody, indent: string): string[] {
  const h = body.hydrosphere;
  if (!h || !((h.coverage ?? 0) > 0)) return [];
  const lines = [`${indent}Ocean`, `${indent}{`];
  if (h.depth_m && h.depth_m > 0) lines.push(`${indent}\tHeight${' '.repeat(9)}${(h.depth_m / 1000).toPrecision(4)}\t// km`);
  lines.push(`${indent}}`);
  return lines;
}

function ringsBlock(ring: CelestialBody | undefined, indent: string): string[] {
  if (!ring?.radiusInnerKm || !ring.radiusOuterKm) return [];
  return [
    `${indent}Rings`, `${indent}{`,
    `${indent}\tInnerRadius${' '.repeat(4)}${Math.round(ring.radiusInnerKm)}`,
    `${indent}\tOuterRadius${' '.repeat(4)}${Math.round(ring.radiusOuterKm)}`,
    `${indent}}`
  ];
}

function orbitBlock(node: CelestialBody | Barycenter, indent: string): string[] {
  const o = node.orbit;
  if (!o?.elements || !(o.elements.a_AU > 0)) return [];
  const e = o.elements;
  const deg = (v: number | undefined) => +(v ?? 0).toFixed(4);
  const M0deg = +(((e.M0_rad ?? 0) * 180) / Math.PI).toFixed(4);
  // ECCENTRICITY IS NOT AN ANGLE and must not be rounded like one. Four decimal places is a
  // ten-thousandth of a degree on an inclination and perfectly fine; on a dimensionless number that
  // is 0.0167 for Earth it throws away three significant figures, and the round trip came back with
  // a visibly different orbit. Significant figures, not decimal places.
  const ecc = (e.e ?? 0) > 0 ? (e.e as number).toPrecision(8) : '0';
  return [
    `${indent}Orbit`, `${indent}{`,
    `${indent}\tSemiMajorAxis${' '.repeat(3)}${e.a_AU.toPrecision(10)}`,
    `${indent}\tEccentricity${' '.repeat(4)}${ecc}`,
    `${indent}\tInclination${' '.repeat(5)}${deg(e.i_deg)}`,
    `${indent}\tAscendingNode${' '.repeat(3)}${deg(e.Omega_deg)}`,
    `${indent}\tArgOfPericen${' '.repeat(4)}${deg(e.omega_deg)}`,
    `${indent}\tMeanAnomaly${' '.repeat(5)}${M0deg}`,
    `${indent}}`
  ];
}

// --- the walk ------------------------------------------------------------------------------------
export function exportSc(system: System): ScExportResult {
  const nodes = system.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const notes: string[] = [];

  const roleOf = (n: CelestialBody | Barycenter) => (n.kind === 'barycenter' ? 'barycenter' : (n as CelestialBody).roleHint);

  // A ring is not a body in SpaceEngine — it is a block on its planet. Pull them out first so the
  // walk never has to think about them again.
  const ringByHost = new Map<string, CelestialBody>();
  for (const n of nodes) if (roleOf(n) === 'ring' && n.parentId) ringByHost.set(n.parentId, n as CelestialBody);

  // What cannot travel, counted honestly and named once.
  const dropped = new Map<string, number>();
  const emit: (CelestialBody | Barycenter)[] = [];
  for (const n of nodes) {
    const role = roleOf(n);
    if (role === 'ring') continue;                                    // folded into its host
    if (role === 'star' || role === 'planet' || role === 'moon' || role === 'barycenter') { emit.push(n); continue; }
    dropped.set(role ?? 'other', (dropped.get(role ?? 'other') ?? 0) + 1);
  }
  for (const [role, count] of dropped) {
    notes.push(
      role === 'belt'
        ? `${count} belt${count === 1 ? '' : 's'} left out — SpaceEngine has no belt object, only rings on a planet.`
        : `${count} ${role}${count === 1 ? '' : 's'} left out — SpaceEngine has nothing to put them in.`
    );
  }

  const names = uniqueNames(emit);
  const renamed = emit.filter((n) => names.get(n.id) !== clean(n.name, '')).length;
  if (renamed) notes.push(`${renamed} object${renamed === 1 ? '' : 's'} renamed to keep every name unique — SpaceEngine matches a parent by name, so duplicates would re-home the wrong body.`);

  // Parents before children, so the file reads top-down the way a person would write it.
  const childrenOf = new Map<string, (CelestialBody | Barycenter)[]>();
  for (const n of emit) {
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : '__root__';
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(n);
  }
  const ordered: (CelestialBody | Barycenter)[] = [];
  const walk = (key: string) => {
    for (const child of childrenOf.get(key) ?? []) { ordered.push(child); walk(child.id); }
  };
  walk('__root__');
  // Anything whose parent was dropped still gets written, as a root.
  for (const n of emit) if (!ordered.includes(n)) ordered.push(n);

  const blockType = (n: CelestialBody | Barycenter): string => {
    if (n.kind === 'barycenter') {
      // SpaceEngine indexes a multiple-STAR system's root under `StarBarycenter`; a nested one, or
      // one holding planets, is a plain `Barycenter`.
      const members = (n as Barycenter).memberIds ?? [];
      const allStars = members.length > 0 && members.every((id) => (byId.get(id) as CelestialBody)?.roleHint === 'star');
      return !n.parentId && allStars ? 'StarBarycenter' : 'Barycenter';
    }
    const body = n as CelestialBody;
    const mass = body.massKg ?? 0;
    if (body.roleHint === 'star') return mass >= SE_STAR_CUTOFF_KG ? 'Star' : 'Planet';
    // A substellar object SSG does not call a star may still be one to SpaceEngine.
    if (mass >= SE_STAR_CUTOFF_KG) return 'Star';
    if (body.roleHint === 'moon') return mass < DWARF_CUTOFF_KG ? 'DwarfMoon' : 'Moon';
    return mass < DWARF_CUTOFF_KG ? 'DwarfPlanet' : 'Planet';
  };

  const L: string[] = [
    `// Star system exported from Star System Explorer.`,
    `// ${system.name ?? 'Untitled'} — ${ordered.length} objects, system age ${(system.age_Gyr ?? 0).toFixed(2)} Gyr.`,
    `// Place this in SpaceEngine's addon catalogue directory to load it.`,
    ''
  ];

  for (const n of ordered) {
    const type = blockType(n);
    const name = names.get(n.id)!;
    const isStarBlock = type === 'Star';
    const body = n.kind === 'body' ? (n as CelestialBody) : null;

    L.push(`${type} "${name}"`, '{');
    const parentName = n.parentId ? names.get(n.parentId) : undefined;
    if (parentName) L.push(`\tParentBody${' '.repeat(6)}"${parentName}"`);

    if (body) {
      const mass = body.massKg ?? 0;
      if (isStarBlock) {
        L.push(`\tClass${' '.repeat(11)}"${starClassOf(body)}"`);
        if (mass > 0) L.push(`\tMassSol${' '.repeat(9)}${(mass / SOLAR_MASS_KG).toPrecision(6)}`);
        if (body.radiusKm) L.push(`\tRadSol${' '.repeat(10)}${(body.radiusKm / SOLAR_RADIUS_KM).toPrecision(6)}`);
        if (body.temperatureK) L.push(`\tTemperature${' '.repeat(5)}${Math.round(body.temperatureK)}`);
        if (system.age_Gyr) L.push(`\tAge${' '.repeat(13)}${system.age_Gyr.toPrecision(4)}\t// Gyr`);
      } else {
        L.push(`\tClass${' '.repeat(11)}"${planetClass(body)}"`);
        // Planets and moons are in EARTH masses; a giant also gets its Jupiter figure as a comment,
        // because that is the number a person reading the file will be checking against.
        if (mass > 0) {
          const jup = mass / JUPITER_MASS_KG;
          L.push(`\tMass${' '.repeat(12)}${(mass / EARTH_MASS_KG).toPrecision(6)}${jup >= 0.1 ? `\t// ${jup.toPrecision(3)} Jupiter masses` : ''}`);
        }
        if (body.radiusKm) L.push(`\tRadius${' '.repeat(10)}${body.radiusKm.toPrecision(7)}\t// km`);
        if (body.rotation_period_hours) L.push(`\tRotationPeriod${' '.repeat(2)}${body.rotation_period_hours.toPrecision(6)}\t// hours`);
        const tilt = (body as CelestialBody & { axial_tilt_deg?: number }).axial_tilt_deg;
        if (typeof tilt === 'number') L.push(`\tObliquity${' '.repeat(7)}${tilt.toFixed(2)}`);
      }
    }

    const inner = '\t';
    if (body && !isStarBlock) {
      const rings = ringsBlock(ringByHost.get(n.id), inner);
      if (!rings.length) L.push(`\tNoRings${' '.repeat(9)}true`);
      L.push(...interiorBlock(body.makeup, inner));
      const atm = atmosphereBlock(body, inner);
      if (atm.length) L.push(...atm); else L.push(`\tNoAtmosphere${' '.repeat(4)}true`);
      L.push(...oceanBlock(body, inner));
      L.push(...rings);
    }
    L.push(...orbitBlock(n, inner));
    L.push('}', '');
  }

  return { text: L.join('\n'), notes };
}
