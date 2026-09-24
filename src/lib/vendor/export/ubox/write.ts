// VENDORED from Star System Explorer, src/lib/export/ubox/write.ts — copied on 2026-09-24.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// SSG system -> Universe Sandbox `.ubox`. The import turned inside out.
//
// UNIVERSE SANDBOX HAS NO ORBITS. Every body is a position and a velocity at one instant, and the
// simulation works out the rest — which is why the importer had to infer the entire hierarchy from
// state vectors in the first place. Going out, that is a gift rather than a problem: the engine
// already computes exactly this. `computeWorldStates3D` walks the tree once and returns every node's
// ABSOLUTE position and velocity, with barycentres resolved and satellite frames applied, because
// re-homing a body needed the same answer (DATA-R39). So the physics of this exporter is three lines:
// scale to metres, swap the axes, join with semicolons.
//
// THE WORK IS THE FILE, and Universe Sandbox is strict about it. A save it will list under Simulations
// is six members named after the simulation - the simulation, a thumbnail, a preview, a terrain atlas,
// a UI state and a workshop record - indexed by a manifest with an asset id for each, and every body in
// it carries the program's full field set: 47 keys and six or seven component blocks. The first version
// of this file wrote two members and a dozen keys per body; the reader here accepted it, and Universe
// Sandbox did not list it at all. So every body is now a CLONE of one the program wrote itself
// (`template.json`, from its own built-in scenarios - see scripts/ubox-template/extract.mjs), and only
// the fields this system knows are overwritten. Key order and component order are the program's.
//
// WHAT CANNOT GO. Barycentres simply dissolve: they are not objects in Universe Sandbox, and their
// members already carry the absolute state that encodes the same arrangement, so nothing is lost.
// Ships, stations and Lagrange placements have no equivalent. Rings and belts can optionally be
// scattered back into particles, which is how Universe Sandbox represents them and how the importer
// reads them back.
import { zipSync, strToU8 } from 'fflate';
import { G, AU_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM, STEFAN_BOLTZMANN_CONSTANT } from '../../constants';
import { makeupOrStandIn } from '../../export/fallbackMakeup';
import { computeWorldStates3D } from '../../physics/worldPositions';
import type { System, CelestialBody, Barycenter, Makeup } from '../../types';
import templateJson from './template.json';
import { atlasSizeFor, blankSurfaceZip } from './surfaceAtlas';
import { THUMBNAIL_PNG_BASE64, PREVIEW_JPEG_BASE64, base64Bytes } from './placeholderImages';

const AU_M = AU_KM * 1000;
const GYR_S = 3.156e16;
const L_SUN = 3.846e26;

// The template is the program's own JSON; its shape is the program's business, so it is handled as
// data and cloned before anything is written into it.
type Json = Record<string, any>;
const TEMPLATE = templateJson as unknown as {
  build: { revision: number; name: string };
  simulation: Json; star: Json; body: Json; particle: Json; info: Json; uiState: Json;
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface UboxExportOptions {
  /** The instant the exported snapshot is taken at. Positions are a moment in time, not a shape. */
  atTimeMs?: number;
  /** Scatter rings and belts back into particles, the way Universe Sandbox stores them. */
  particlesPerRing?: number;
}

export interface UboxExportResult {
  bytes: Uint8Array;
  notes: string[];
}

// Inverse of the reader's depot maps, written ONLY in materials Universe Sandbox has. Its saves use
// thirteen - Hydrogen, Helium, Water, Methane, Ammonia, Silicate, Iron, Oxygen, Argon, Carbon Dioxide,
// Nitrogen, Sulfur Dioxide, Degenerate Matter - and nothing else, in 417 bodies across five saves.
// There is no "Water Ice": water is one material whatever its phase, and the program decides the
// phase from temperature. This map once said 'Water Ice' and 'Carbon', neither of which the program
// knows, so an icy body carried much of its mass in a material the program has no entry for - 40% of
// Yohura's - and testers reported masses coming out wrong.
const MAKEUP_DEPOT: Record<Exclude<keyof Makeup, 'gas'>, string> = {
  metal: 'Iron', rock: 'Silicate', ice: 'Water',
  // No carbon material exists; silicate is the nearest in density, and the export says so.
  carbon: 'Silicate'
};
const GAS_DEPOT: Record<string, [string, number]> = {
  N2: ['Nitrogen', 28], O2: ['Oxygen', 32], Ar: ['Argon', 40], CO2: ['Carbon Dioxide', 44],
  H2: ['Hydrogen', 2], He: ['Helium', 4], CH4: ['Methane', 16], NH3: ['Ammonia', 17], SO2: ['Sulfur Dioxide', 64]
};
/** Hydrogen's share of a primordial gas envelope by mass; helium is the rest. The program's own Sun
 *  is split 0.738 / 0.262, and the same split serves a gas giant's envelope. */
const HYDROGEN_MASS_FRACTION = 0.738;

type V3 = [number, number, number];

/** Universe Sandbox is Y-up and the engine is Z-up. The reader swaps once on the way in; this is the
 *  same swap, which is its own inverse. Doing it in one named place is why there is no fudge factor
 *  anywhere else in this file. The swap also flips handedness, so a prograde orbit's r x v, taken in
 *  Universe Sandbox's numbers, points down -y - which is why the program's own Sun spins about -y. */
const toUs = (x: number, y: number, z: number): V3 => [x, z, y];
const fin = (n: number) => (Number.isFinite(n) ? n : 0);
const vec = (v: number[]) => v.map(fin).join(';');
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 | null => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; };

/** The local spin axis every body is written with; the orientation carries the tilt. */
const LOCAL_SPIN_AXIS: V3 = [0, -1, 0];

/**
 * The spin axis in world space, and the orientation that carries the local axis onto it.
 *
 * The reader measures obliquity as the angle between the world spin axis and the orbit normal, and
 * verified it against Earth at 23.4 and Uranus at 97.8. Writing it back tilts the axis away from THIS
 * body's own orbit normal (about its host) by that angle. The direction of the tilt around the normal
 * is not information the engine holds, so it is a choice, and is recorded as one.
 */
function spinFrame(tiltDeg: number, orbitNormal: V3 | null): { axis: V3; quat: [number, number, number, number] } {
  const n = orbitNormal ?? LOCAL_SPIN_AXIS;
  const p = unit(cross(n, [1, 0, 0])) ?? unit(cross(n, [0, 0, 1]))!;
  const t = ((tiltDeg || 0) * Math.PI) / 180;
  const pn = cross(p, n);
  const axis: V3 = [
    n[0] * Math.cos(t) + pn[0] * Math.sin(t),
    n[1] * Math.cos(t) + pn[1] * Math.sin(t),
    n[2] * Math.cos(t) + pn[2] * Math.sin(t)
  ];
  const d = dot(LOCAL_SPIN_AXIS, axis);
  if (d < -0.999999) return { axis, quat: [1, 0, 0, 0] };           // half a turn about x
  const c = cross(LOCAL_SPIN_AXIS, axis);
  const w = 1 + d;
  const l = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2] + w * w);
  return { axis, quat: [c[0] / l, c[1] / l, c[2] / l, w / l] };
}

/** Mass of water implied by a coverage fraction — the inverse of the reader's hydrosphere estimate. */
function waterMassFor(coverage: number, radiusM: number): number {
  if (!(coverage > 0) || !(radiusM > 0)) return 0;
  const depthM = 2790 * Math.pow(Math.min(1, coverage) / 0.71, 2);
  return depthM * 1000 * 4 * Math.PI * radiusM * radiusM;
}

/** Mass of atmosphere implied by a surface pressure — the inverse of the reader's column estimate. */
function atmosphereMassFor(pressureBar: number, massKg: number, radiusM: number): number {
  if (!(pressureBar > 0) || !(radiusM > 0) || !(massKg > 0)) return 0;
  const g = (G * massKg) / (radiusM * radiusM);
  return (pressureBar * 1e5 * 4 * Math.PI * radiusM * radiusM) / g;
}

/**
 * The mass inventory Universe Sandbox stores for a body, summing exactly to its mass - the program's
 * own saves do, so a body cannot go out with none. A body with no stated composition gets the shared
 * stand-in (export/fallbackMakeup.ts), and the export reports it.
 */
function inventory(
  body: CelestialBody, isStar: boolean, massKg: number, radiusM: number,
  onFallback: () => void, onCarbon: () => void
): { depots: Record<string, number>; atmMass: number } {
  const depots: Record<string, number> = {};
  const add = (name: string, m: number) => { if (m > 0) depots[name] = (depots[name] ?? 0) + m; };
  let atmMass = 0;
  if (isStar) {
    add('Hydrogen', massKg * HYDROGEN_MASS_FRACTION);
    add('Helium', massKg * (1 - HYDROGEN_MASS_FRACTION));
  } else {
    let waterMass = waterMassFor(body.hydrosphere?.coverage ?? 0, radiusM);
    atmMass = atmosphereMassFor(body.atmosphere?.pressure_bar ?? 0, massKg, radiusM);
    // A deep ocean and a thick atmosphere estimated separately can over-claim a small body; neither
    // may leave the interior less than half of it.
    const skin = waterMass + atmMass;
    if (skin > 0.5 * massKg) { const k = (0.5 * massKg) / skin; waterMass *= k; atmMass *= k; }
    const interior = massKg - waterMass - atmMass;

    const { makeup: mk, standIn } = makeupOrStandIn({ ...body, radiusKm: radiusM / 1000 });
    if (standIn) onFallback();
    const sum = (Object.values(mk) as number[]).reduce((s, v) => s + (v ?? 0), 0);
    for (const [key, frac] of Object.entries(mk) as [keyof Makeup, number][]) {
      if (!(frac > 0)) continue;
      if (key === 'carbon') onCarbon();
      const m = (frac / sum) * interior;
      if (key === 'gas') { add('Hydrogen', m * HYDROGEN_MASS_FRACTION); add('Helium', m * (1 - HYDROGEN_MASS_FRACTION)); }
      else add(MAKEUP_DEPOT[key], m);
    }
    add('Water', waterMass);
    if (atmMass > 0) {
      // Mole fractions back to masses: weight each species by its molecular mass, then normalise so
      // the depots sum to exactly the atmosphere mass the pressure implies.
      const weighted: [string, number][] = [];
      let wsum = 0;
      for (const [species, frac] of Object.entries(body.atmosphere?.composition ?? {})) {
        const gas = GAS_DEPOT[species];
        if (!gas || !(frac > 0)) continue;
        weighted.push([gas[0], frac * gas[1]]);
        wsum += frac * gas[1];
      }
      if (wsum > 0) for (const [depot, w] of weighted) add(depot, (w / wsum) * atmMass);
      else add('Nitrogen', atmMass);
    }
  }
  // Rounding leaves the sum a few ulps off the mass; the largest depot absorbs it.
  const names = Object.keys(depots);
  if (names.length) {
    const biggest = names.reduce((a, b) => (depots[a] >= depots[b] ? a : b));
    depots[biggest] += massKg - names.reduce((s, k) => s + depots[k], 0);
  }
  return { depots, atmMass };
}

const comp = (e: Json, type: string): Json => e.Components.find((c: Json) => c.$type === type);

/** The program's asset id: a GUID's 16 bytes in URL-safe base64, as its own manifests spell them. */
function assetId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const pad = (n: number) => String(n).padStart(2, '0');
const usStamp = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const usDate = (d: Date) => usStamp(d).slice(0, 16);

export function exportUbox(system: System, options: UboxExportOptions = {}): UboxExportResult {
  const notes: string[] = [];
  const atTimeMs = options.atTimeMs ?? system.epochT0 ?? 0;
  const nodes = system.nodes ?? [];
  const states = computeWorldStates3D(system, atTimeMs);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const now = new Date();
  const stamp = usStamp(now);
  const ageS = system.age_Gyr ? system.age_Gyr * GYR_S : 0;

  const roleOf = (n: CelestialBody | Barycenter) =>
    n.kind === 'barycenter' ? 'barycenter' : (n as CelestialBody).roleHint;
  const usState = (id: string) => {
    const s = states.get(id);
    return s ? { r: toUs(s.r.x * AU_M, s.r.y * AU_M, s.r.z * AU_M), v: toUs(s.v.x * AU_M, s.v.y * AU_M, s.v.z * AU_M) } : null;
  };

  // --- which bodies go, in the order the program numbers them: stars first, heaviest first ---
  const dropped = new Map<string, number>();
  const drop = (why: string) => dropped.set(why, (dropped.get(why) ?? 0) + 1);
  let barycentres = 0;
  const going: CelestialBody[] = [];
  for (const n of nodes) {
    const role = roleOf(n);
    if (role === 'barycenter') { barycentres++; continue; }
    if (role === 'ring' || role === 'belt') continue;            // reported with the particles below
    if (role !== 'star' && role !== 'planet' && role !== 'moon') { drop(role ?? 'other'); continue; }
    if (!states.get(n.id)) { drop('unplaced'); continue; }
    if (!((n as CelestialBody).massKg! > 0)) { drop('massless body'); continue; }
    going.push(n as CelestialBody);
  }
  const stars = going.filter((b) => b.roleHint === 'star').sort((a, b) => (b.massKg ?? 0) - (a.massKg ?? 0));
  const ordered = [...stars, ...going.filter((b) => b.roleHint !== 'star')];
  const idOf = new Map(ordered.map((b, i) => [b.id, i + 1]));
  // Everything is written relative to the heaviest star, as the program's own saves are to theirs.
  const rootId = ordered.length ? 1 : 0;
  const tiles = ordered.length - stars.length;
  const atlasSize = atlasSizeFor(tiles);

  const entities: Json[] = [];
  let nextTile = 0;
  let fallbacks = 0;
  let radiusGuesses = 0;
  const carbonBodies = new Set<string>();
  for (const body of ordered) {
    const isStar = body.roleHint === 'star';
    const st = usState(body.id)!;
    const massKg = body.massKg!;
    let radiusM = (body.radiusKm ?? 0) * 1000;
    if (!(radiusM > 0)) {
      // A body with no size would be a point in a program that collides spheres. Stars scale with mass
      // on the main sequence; anything else gets a rocky density.
      radiusM = isStar
        ? SOLAR_RADIUS_KM * 1000 * Math.pow(massKg / SOLAR_MASS_KG, 0.8)
        : Math.cbrt((3 * massKg) / (4 * Math.PI * 5500));
      radiusGuesses++;
    }
    const e = clone(isStar ? TEMPLATE.star : TEMPLATE.body);

    // --- spin: tilted from this body's own orbit about its host ---
    const host = body.parentId ? byId.get(body.parentId) : undefined;
    const hostState = host ? usState(host.id) : null;
    const orbitNormal = hostState
      ? unit(cross(
          [st.r[0] - hostState.r[0], st.r[1] - hostState.r[1], st.r[2] - hostState.r[2]],
          [st.v[0] - hostState.v[0], st.v[1] - hostState.v[1], st.v[2] - hostState.v[2]]
        ))
      : null;
    const tilt = (body as CelestialBody & { axial_tilt_deg?: number }).axial_tilt_deg ?? 0;
    const { axis, quat } = spinFrame(tilt, orbitNormal);
    const rotationHours = Math.abs(body.rotation_period_hours ?? 0);
    const omega = rotationHours > 0 ? (2 * Math.PI) / (rotationHours * 3600) : 0;

    const name = (body.name ?? `Body ${idOf.get(body.id)}`).replace(/[\r\n]/g, ' ').trim();
    e.Header.LastModifiedUTC = stamp;
    Object.assign(e, {
      Name: name,
      Id: idOf.get(body.id),
      HorizonID: '',
      // Universe Sandbox stores age per body, in SECONDS. The system's age goes on every body, which
      // is what the program's own Solar System looks like, and the reader takes it from the star.
      Age: ageS,
      PhysicsMass: massKg,
      Mass: massKg,
      Radius: radiusM,
      Density: massKg / ((4 / 3) * Math.PI * radiusM ** 3),
      Orientation: vec(quat),
      AngularVelocity: vec(axis.map((a) => a * omega)),
      RotationAxis: vec(LOCAL_SPIN_AXIS),
      Position: vec(st.r),
      Velocity: vec(st.v),
      Category: body.roleHint,
      RelativeTo: rootId
    });

    const { depots, atmMass } = inventory(body, isStar, massKg, radiusM, () => fallbacks++, () => carbonBodies.add(body.id));
    const temperatureK = body.temperatureK ?? 0;
    const luminosity = isStar
      ? ((body as CelestialBody & { radiationOutput?: number }).radiationOutput
          ? (body as CelestialBody & { radiationOutput?: number }).radiationOutput! * L_SUN
          : temperatureK > 0 ? 4 * Math.PI * radiusM ** 2 * STEFAN_BOLTZMANN_CONSTANT * temperatureK ** 4 : 0)
      : 0;

    Object.assign(comp(e, 'Celestial'), {
      AtmosphereMass: atmMass,
      Luminosity: luminosity,
      MagneticField: body.magneticField?.strengthGauss ?? 0
    });
    const composition = comp(e, 'CompositionComponent');
    composition.targetRadius = radiusM;
    // KEEP THE STATED SIZE. Left on, the program re-derives the radius from composition with its own
    // model, so a world stated at one density arrives at another. The program itself switches this off
    // for any body whose size or density was set by hand (every such body in the saves measured), and
    // a converted body's size was set by whoever made it.
    composition.SimulateRadius = false;
    for (const [depot, m] of Object.entries(depots)) composition.depots[depot] = { Mass: m, LockSurfaceTracking: false };
    // The trail is a fixed ring buffer the program writes out in full; an empty one has every slot at
    // the origin and its cursor at zero.
    const trail = comp(e, 'TrailComponent');
    trail.Positions.array = new Array(trail.Positions.max).fill('0;0;0');
    // Stars own no terrain tile, as in the program's saves; every planet and moon owns one, blank and
    // flat (see surfaceAtlas.ts).
    comp(e, 'SurfaceGridComponent').AtlasIndex = isStar ? -1 : nextTile++;
    const heat = comp(e, 'HeatComponent');
    Object.assign(heat, {
      SurfaceTemperature: temperatureK,
      // A body with no stated temperature is handed to the program to work out, not written at 0 K.
      TemperatureInitialized: temperatureK > 0,
      Albedo: typeof body.albedoBreakdown?.albedo === 'number' ? body.albedoBreakdown.albedo : heat.Albedo,
      CustomLuminosity: luminosity
    });
    entities.push(e);
  }

  // --- rings and belts, optionally scattered back into particles ---
  const perRing = options.particlesPerRing ?? 0;
  let particles = 0;
  if (perRing > 0) {
    const PARTICLE_MASS_KG = 1e12;
    const particleRadiusM = Math.cbrt((3 * PARTICLE_MASS_KG) / (4 * Math.PI * 1500));
    let nextId = ordered.length + 1;
    for (const n of nodes) {
      const role = roleOf(n);
      if (role !== 'ring' && role !== 'belt') continue;
      const ring = n as CelestialBody;
      const host = ring.parentId ? byId.get(ring.parentId) : undefined;
      const hostState = host ? usState(host.id) : null;
      const hostMass = host && host.kind === 'body' ? (host as CelestialBody).massKg ?? 0 : 0;
      const inner = (ring.radiusInnerKm ?? 0) * 1000;
      const outer = (ring.radiusOuterKm ?? 0) * 1000;
      if (!hostState || !(outer > inner) || !(hostMass > 0)) continue;
      for (let i = 0; i < perRing; i++) {
        const r = inner + ((outer - inner) * i) / Math.max(1, perRing - 1);
        const theta = (2 * Math.PI * i * 0.618) % (2 * Math.PI);   // golden angle: no visible spokes
        const speed = Math.sqrt((G * hostMass) / r);
        const e = clone(TEMPLATE.particle);
        e.Header.LastModifiedUTC = stamp;
        // A particle carries NO Celestial component, which is exactly what marks it a particle to the
        // reader — and its name is what lets the reader group it back onto this host.
        Object.assign(e, {
          Name: `${host!.name} Ring Particle`,
          Id: nextId++,
          Age: ageS,
          PhysicsMass: PARTICLE_MASS_KG,
          Mass: PARTICLE_MASS_KG,
          Radius: particleRadiusM,
          Density: 1500,
          Position: vec([hostState.r[0] + r * Math.cos(theta), hostState.r[1], hostState.r[2] + r * Math.sin(theta)]),
          Velocity: vec([hostState.v[0] - speed * Math.sin(theta), hostState.v[1], hostState.v[2] + speed * Math.cos(theta)]),
          RelativeTo: rootId
        });
        comp(e, 'ParticleComponent').Materials = { Silicate: PARTICLE_MASS_KG };
        comp(e, 'HeatComponent').TemperatureInitialized = false;
        entities.push(e);
        particles++;
      }
    }
    if (particles) notes.push(`${particles} ring particles written — Universe Sandbox has no ring object, so a ring is a cloud of bodies there.`);
  } else if (nodes.some((n) => roleOf(n) === 'ring' || roleOf(n) === 'belt')) {
    notes.push('Rings and belts were left out. Universe Sandbox has no ring object — it would need thousands of individual particles.');
  }

  if (barycentres) {
    notes.push(`${barycentres} barycentre${barycentres === 1 ? '' : 's'} dissolved — Universe Sandbox has no such object, and its members already carry the positions and velocities that put them in the same places.`);
  }
  for (const [role, count] of dropped) {
    notes.push(`${count} ${role}${count === 1 ? '' : 's'} left out — Universe Sandbox has nothing to put them in.`);
  }
  if (carbonBodies.size) {
    notes.push(`Carbon in ${carbonBodies.size} bod${carbonBodies.size === 1 ? 'y' : 'ies'} went out as silicate — Universe Sandbox has no carbon material.`);
  }
  if (fallbacks) {
    notes.push(`${fallbacks} bod${fallbacks === 1 ? 'y has' : 'ies have'} no composition in this system, so ${fallbacks === 1 ? 'it was' : 'they were'} given a typical one for ${fallbacks === 1 ? 'its' : 'their'} density — Universe Sandbox stores a body's mass as what it is made of.`);
  }
  if (radiusGuesses) {
    notes.push(`${radiusGuesses} bod${radiusGuesses === 1 ? 'y has' : 'ies have'} no size in this system, so ${radiusGuesses === 1 ? 'one was' : 'sizes were'} estimated from mass.`);
  }

  // --- the simulation: the program's own settings, this system's bodies ---
  const simName = (system.name ?? 'Star System Explorer import').replace(/[\r\n]/g, ' ').trim() || 'Exported System';
  const description = 'Made with Star System Explorer - starsystemx.com';
  const simulation = clone(TEMPLATE.simulation);
  simulation.Header.LastModifiedUTC = stamp;
  Object.assign(simulation, {
    Name: simName,
    Description: description,
    Date: usDate(atTimeMs > 0 ? new Date(atTimeMs) : new Date(Date.UTC(2000, 0, 1, 12, 0))),
    TimePassed: 0
  });
  // Point the camera at the heaviest star, from the template's angle, far enough back to take in that
  // star's own worlds. Not everything: a wide companion thousands of AU out would leave its planets
  // as dots, and the companion is one click away in the program's list.
  const settings = simulation.Settings;
  settings.CameraTargetId = rootId;
  if (ordered.length) {
    const root = ordered[0];
    const origin = usState(root.id)!.r;
    const starOf = (b: CelestialBody): string | null => {
      for (let n = b.parentId ? byId.get(b.parentId) : undefined; n; n = n.parentId ? byId.get(n.parentId) : undefined) {
        if (roleOf(n) === 'star') return n.id;
      }
      return null;
    };
    const own = ordered.filter((b) => b.roleHint !== 'star' && starOf(b) === root.id);
    const reach = (own.length ? own : ordered).reduce((m, b) => {
      const p = usState(b.id)!.r;
      return Math.max(m, len([p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]));
    }, 0);
    const distance = Math.max(2.5 * reach, 20 * (entities[0].Radius as number));
    const dir = unit(String(settings.CameraPosition).split(';').map(Number) as V3) ?? [0, 0.34, -0.94];
    settings.CameraTargetDistance = distance;
    settings.CameraPosition = vec(dir.map((d, i) => origin[i] + d * distance));
  }
  simulation.Entities = entities;

  // --- the archive: six members and the manifest that indexes them ---
  const fileBase = `simulation-${simName.replace(/[\\/:*?"<>|]/g, '_')}`;
  const ids = { sim: assetId(), thumb: assetId(), large: assetId(), surface: assetId(), ui: assetId(), info: assetId() };
  const rev = TEMPLATE.build.revision;
  const paths = {
    sim: `${fileBase}.json`,
    thumb: `${fileBase}-thumbnail.png`,
    large: `${fileBase}-large.jpg`,
    surface: `${fileBase}-surface.zip`,
    ui: `${fileBase}-ui-state.json`,
    info: `${fileBase}-info.json`
  };
  const entry = (fields: Json, id: string, path: string, dependencies: string[] = []) => ({
    ...fields, BuildRevision: rev, LastModifiedUTC: stamp, Path: path, ID: id,
    Dependencies: dependencies.map(($v) => ({ $v }))
  });
  // The reader finds the simulation through the entry whose BaseType is 'Simulation'; the program
  // lists it through the whole set, with the simulation depending on the other five.
  const manifest = {
    Header: { BuildRevision: rev, BuildName: TEMPLATE.build.name, LastModifiedUTC: stamp, EntryPoints: [ids.sim], EntryPoint: ids.sim },
    Entries: [
      entry({ Name: simName, AssetType: 'JSON', BaseType: 'Simulation', TypeName: 'simulation.json' }, ids.sim, paths.sim,
        [ids.thumb, ids.large, ids.surface, ids.ui, ids.info]),
      entry({ AssetType: 'Thumbnail', TypeName: 'thumbnail.png' }, ids.thumb, paths.thumb),
      entry({ AssetType: 'Preview', TypeName: 'large.jpg' }, ids.large, paths.large),
      entry({ AssetType: 'Ubox', BaseType: 'SurfaceData', TypeName: 'surface.zip' }, ids.surface, paths.surface),
      entry({ AssetType: 'JSON', BaseType: 'UIState', TypeName: 'ui-state.json' }, ids.ui, paths.ui),
      entry({ Name: `${fileBase}-info`, AssetType: 'JSON', BaseType: 'WorkshopItem', TypeName: 'info.json' }, ids.info, paths.info)
    ]
  };

  const info = clone(TEMPLATE.info);
  info.Header.LastModifiedUTC = stamp;
  Object.assign(info, { Name: simName, Description: description, Metadata: assetId(), TimeUpdated: String(Math.floor(now.getTime() / 1000)) });
  const uiState = clone(TEMPLATE.uiState);
  uiState.Header.LastModifiedUTC = stamp;

  const json = (x: unknown) => strToU8(JSON.stringify(x));
  const bytes = zipSync(
    {
      [paths.sim]: json(simulation),
      [paths.thumb]: [base64Bytes(THUMBNAIL_PNG_BASE64), { level: 0 }],
      [paths.large]: [base64Bytes(PREVIEW_JPEG_BASE64), { level: 0 }],
      // Stored, not compressed again: it is an archive already, and the program stores it the same way.
      [paths.surface]: [blankSurfaceZip(atlasSize), { level: 0 }],
      [paths.ui]: json(uiState),
      [paths.info]: json(info),
      'manifest.json': json(manifest)
    },
    { level: 6 }
  );

  return { bytes, notes };
}
