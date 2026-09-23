// VENDORED from Star System Explorer, src/lib/export/ubox/write.ts — copied on 2026-09-23.
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
// The work is everything else — the archive, the manifest, and turning derived quantities back into
// the mass inventory Universe Sandbox actually stores.
//
// WHAT CANNOT GO. Barycentres simply dissolve: they are not objects in Universe Sandbox, and their
// members already carry the absolute state that encodes the same arrangement, so nothing is lost.
// Ships, stations and Lagrange placements have no equivalent. Rings and belts can optionally be
// scattered back into particles, which is how Universe Sandbox represents them and how the importer
// reads them back.
import { zipSync, strToU8 } from 'fflate';
import { G, AU_KM } from '../../constants';
import { computeWorldStates3D } from '../../physics/worldPositions';
import type { System, CelestialBody, Barycenter, Makeup } from '../../types';

const AU_M = AU_KM * 1000;
const GYR_S = 3.156e16;
const L_SUN = 3.846e26;

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

// Inverse of the reader's depot maps. One-to-many in reverse, so each is a CHOICE, made towards the
// spelling Universe Sandbox's own saves use.
const MAKEUP_DEPOT: Record<keyof Makeup, string> = {
  metal: 'Iron', rock: 'Silicate', carbon: 'Carbon', ice: 'Water Ice', gas: 'Hydrogen'
};
const GAS_DEPOT: Record<string, [string, number]> = {
  N2: ['Nitrogen', 28], O2: ['Oxygen', 32], Ar: ['Argon', 40], CO2: ['Carbon Dioxide', 44],
  H2: ['Hydrogen', 2], He: ['Helium', 4], CH4: ['Methane', 16], NH3: ['Ammonia', 17], SO2: ['Sulfur Dioxide', 64]
};

/** Universe Sandbox is Y-up and the engine is Z-up. The reader swaps once on the way in; this is the
 *  same swap, which is its own inverse. Doing it in one named place is why there is no fudge factor
 *  anywhere else in this file. */
const toUs = (x: number, y: number, z: number): [number, number, number] => [x, z, y];
const vec = (v: [number, number, number]) => `${v[0]};${v[1]};${v[2]}`;

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
 * A quaternion that tilts the body's spin axis away from the orbit normal by `tiltDeg`.
 *
 * The reader measures obliquity as the angle between the world spin axis and the orbit normal, and
 * verified it against Earth at 23.4 and Uranus at 97.8. Writing it back only has to produce SOME
 * orientation with that angle — the roll about the axis is not information the engine holds — so the
 * tilt is applied about the x-axis, which is a choice and is recorded as one.
 */
function tiltQuaternion(tiltDeg: number): [number, number, number, number] {
  const half = ((tiltDeg || 0) * Math.PI) / 360;
  return [Math.sin(half), 0, 0, Math.cos(half)];
}

export function exportUbox(system: System, options: UboxExportOptions = {}): UboxExportResult {
  const notes: string[] = [];
  const atTimeMs = options.atTimeMs ?? system.epochT0 ?? 0;
  const nodes = system.nodes ?? [];
  const states = computeWorldStates3D(system, atTimeMs);

  const roleOf = (n: CelestialBody | Barycenter) =>
    n.kind === 'barycenter' ? 'barycenter' : (n as CelestialBody).roleHint;

  const entities: Record<string, unknown>[] = [];
  const dropped = new Map<string, number>();
  let nextId = 1;
  let barycentres = 0;

  for (const n of nodes) {
    const role = roleOf(n);
    if (role === 'barycenter') { barycentres++; continue; }
    if (role !== 'star' && role !== 'planet' && role !== 'moon') {
      dropped.set(role ?? 'other', (dropped.get(role ?? 'other') ?? 0) + 1);
      continue;
    }
    const body = n as CelestialBody;
    const state = states.get(n.id);
    if (!state) { dropped.set('unplaced', (dropped.get('unplaced') ?? 0) + 1); continue; }

    const massKg = body.massKg ?? 0;
    const radiusM = (body.radiusKm ?? 0) * 1000;
    const pos = toUs(state.r.x * AU_M, state.r.y * AU_M, state.r.z * AU_M);
    const vel = toUs(state.v.x * AU_M, state.v.y * AU_M, state.v.z * AU_M);

    // --- the mass inventory, which is how Universe Sandbox stores composition ---
    const waterMass = waterMassFor(body.hydrosphere?.coverage ?? 0, radiusM);
    const atmMass = atmosphereMassFor(body.atmosphere?.pressure_bar ?? 0, massKg, radiusM);
    const interiorMass = Math.max(0, massKg - waterMass - atmMass);
    const depots: Record<string, { Mass: number }> = {};
    const mk = body.makeup;
    if (mk && interiorMass > 0) {
      const total = (Object.values(mk) as number[]).reduce((s, v) => s + (v ?? 0), 0);
      if (total > 0) {
        for (const [key, frac] of Object.entries(mk) as [keyof Makeup, number][]) {
          if (!(frac > 0)) continue;
          const depot = MAKEUP_DEPOT[key];
          depots[depot] = { Mass: (depots[depot]?.Mass ?? 0) + (frac / total) * interiorMass };
        }
      }
    }
    if (waterMass > 0) depots.Water = { Mass: waterMass };
    if (atmMass > 0) {
      const comp = body.atmosphere?.composition ?? {};
      // Mole fractions back to masses: weight each species by its molecular mass, then normalise so
      // the depots sum to exactly the atmosphere mass the pressure implies.
      const weighted: [string, number][] = [];
      let sum = 0;
      for (const [species, frac] of Object.entries(comp)) {
        const gas = GAS_DEPOT[species];
        if (!gas || !(frac > 0)) continue;
        const w = frac * gas[1];
        weighted.push([gas[0], w]);
        sum += w;
      }
      if (sum > 0) for (const [depot, w] of weighted) depots[depot] = { Mass: (depots[depot]?.Mass ?? 0) + (w / sum) * atmMass };
      else depots.Nitrogen = { Mass: atmMass };
    }

    const isStar = role === 'star';
    const components: Record<string, unknown>[] = [
      {
        $type: 'Celestial',
        Category: isStar ? 2 : 3,
        ...(isStar ? { StarType: 1 } : {}),
        ...(isStar && (body as CelestialBody & { radiationOutput?: number }).radiationOutput
          ? { Luminosity: (body as CelestialBody & { radiationOutput?: number }).radiationOutput! * L_SUN }
          : {}),
        ...(atmMass > 0 ? { AtmosphereMass: atmMass } : {}),
        ...(body.magneticField?.strengthGauss ? { MagneticField: body.magneticField.strengthGauss } : {})
      },
      {
        $type: 'HeatComponent',
        ...(body.temperatureK ? { SurfaceTemperature: body.temperatureK } : {}),
        ...(typeof body.albedoBreakdown?.albedo === 'number' ? { Albedo: body.albedoBreakdown.albedo } : {}),
        EmitsLight: isStar
      }
    ];
    if (Object.keys(depots).length) components.push({ $type: 'CompositionComponent', depots });

    const rotationHours = body.rotation_period_hours ?? 0;
    const omega = rotationHours > 0 ? (2 * Math.PI) / (rotationHours * 3600) : 0;
    const tilt = (body as CelestialBody & { axial_tilt_deg?: number }).axial_tilt_deg ?? 0;

    entities.push({
      $type: 'Body',
      Name: (n.name ?? `Body ${nextId}`).replace(/[\r\n]/g, ' ').trim(),
      Id: nextId++,
      Category: role,
      Mass: massKg,
      Radius: radiusM,
      ...(massKg > 0 && radiusM > 0
        ? { Density: massKg / ((4 / 3) * Math.PI * radiusM * radiusM * radiusM) }
        : {}),
      // Universe Sandbox stores age per body, in SECONDS. The system's age goes on every body, which
      // is what a save made in the program looks like.
      ...(system.age_Gyr ? { Age: system.age_Gyr * GYR_S } : {}),
      Position: vec(pos),
      Velocity: vec(vel),
      AngularVelocity: vec(toUs(0, omega, 0)),
      RotationAxis: vec([0, 1, 0]),
      Orientation: tiltQuaternion(tilt).join(';'),
      Parent: -1,      // Universe Sandbox stores no hierarchy; the state vectors carry it.
      HorizonID: null,
      // The components carry everything that is not geometry — category, luminosity, temperature and
      // the mass inventory. Without them a body still has a position and a mass, so it converts back
      // looking almost right, with its composition, atmosphere and ocean silently gone.
      Components: components
    });
  }

  // --- rings and belts, optionally scattered back into particles ---
  const perRing = options.particlesPerRing ?? 0;
  let particles = 0;
  if (perRing > 0) {
    for (const n of nodes) {
      const role = roleOf(n);
      if (role !== 'ring' && role !== 'belt') continue;
      const ring = n as CelestialBody;
      const host = nodes.find((x) => x.id === ring.parentId);
      const hostState = host ? states.get(host.id) : undefined;
      const hostMass = host && host.kind === 'body' ? (host as CelestialBody).massKg ?? 0 : 0;
      const inner = (ring.radiusInnerKm ?? 0) * 1000;
      const outer = (ring.radiusOuterKm ?? 0) * 1000;
      if (!hostState || !(outer > inner) || !(hostMass > 0)) continue;
      const hostPos = toUs(hostState.r.x * AU_M, hostState.r.y * AU_M, hostState.r.z * AU_M);
      const hostVel = toUs(hostState.v.x * AU_M, hostState.v.y * AU_M, hostState.v.z * AU_M);
      for (let i = 0; i < perRing; i++) {
        const r = inner + ((outer - inner) * i) / Math.max(1, perRing - 1);
        const theta = (2 * Math.PI * i * 0.618) % (2 * Math.PI);   // golden angle: no visible spokes
        const speed = Math.sqrt((G * hostMass) / r);
        // A particle carries NO Celestial component, which is exactly what marks it a particle to the
        // reader — and its name is what lets the reader group it back onto this host.
        entities.push({
          $type: 'Body',
          Name: `${host!.name} Ring Particle`,
          Id: nextId++,
          Mass: 1e12,
          Radius: 100,
          Position: vec([hostPos[0] + r * Math.cos(theta), hostPos[1], hostPos[2] + r * Math.sin(theta)]),
          Velocity: vec([hostVel[0] - speed * Math.sin(theta), hostVel[1], hostVel[2] + speed * Math.cos(theta)]),
          Parent: -1,
          HorizonID: null
        });
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

  const simName = (system.name ?? 'Star System Explorer import').replace(/[\r\n]/g, ' ').trim();
  const simPath = 'simulation-0.json';
  const simulation = { Name: simName, Date: new Date(atTimeMs || Date.now()).toISOString(), TimePassed: 0, Entities: entities };

  // The manifest is how the reader finds the simulation: it looks for an entry whose BaseType is
  // 'Simulation' and follows its Path, preferring the one the EntryPoint names.
  const manifest = {
    Header: { BuildRevision: 0, BuildName: 'Star System Explorer export', EntryPoint: 'sim-0', EntryPoints: ['sim-0'] },
    Entries: [{ Name: simName, BaseType: 'Simulation', TypeName: 'Simulation', AssetType: 'Simulation', Path: simPath, ID: 'sim-0' }]
  };

  const bytes = zipSync(
    {
      'manifest.json': strToU8(JSON.stringify(manifest, null, 1)),
      [simPath]: strToU8(JSON.stringify(simulation, null, 1))
    },
    { level: 6 }
  );

  return { bytes, notes };
}
