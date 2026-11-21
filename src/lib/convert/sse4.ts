// READING A STAR SYSTEM EXPLORER 4 SYSTEM, so it can go anywhere the other formats go, Star System
// Explorer 3 included (owner, 21 Nov 2026: V4 to V3 is a best-effort export with a loss report).
//
// WHAT IS READ. SSE4 keeps a system as a chronicle of facts, and this tool does no physics, so it
// cannot replay one. SSE4 hands over what its kernel already resolved: the `resolved_system` reply
// (every fact, with its evidence), wrapped as `sse.system-export/1` with the kernel's version:
//
//   { "format": "sse.system-export/1", "kernel": { "kernel_version": "…" }, "resolved": { … } }
//
// A bare `resolved_system` reply (`"type": "system_resolved"`) is read too. Values are SI and angles
// are radians, the kernel's convention (FrunkQ/star-system-explorer, crates/sse-atoms).
//
// WHAT COMES OUT. The pivot every conversion passes through: a V3 system. Each SSE4 fact either maps
// to a V3 field, or restores a V3 field SSE4 kept as `v3.<name>` from an earlier V3 import (so a V3
// system that went to SSE4 and back comes home nearly as it left), or is listed as left behind with
// the reason. SSE4's own values win over a kept `v3.*` copy where both exist, because the SSE4 value
// is the newer one.
import type { System } from '$lib/vendor/types';

export const SSE4_EXPORT_FORMAT = 'sse.system-export/1';

const AU_M = 1.495978707e11;
const G = 6.6743e-11;
const SECONDS_PER_GYR = 3.15576e16; // Julian years, the kernel's year
const DEG = 180 / Math.PI;

type Facts = Record<string, Record<string, unknown>>;
type Evidence = Record<string, Record<string, { evidence?: string; by?: string }>>;

interface Resolved {
  type?: string;
  system: string;
  source?: string;
  facts: Facts;
  evidence?: Evidence;
}

export interface Sse4Doc { format?: string; kernel?: { kernel_version?: string }; resolved?: Resolved; type?: string }

/** True when the text is an SSE4 export (or a bare resolved_system reply), from its head alone. */
export function looksLikeSse4(head: string): boolean {
  return /"format"\s*:\s*"sse\.system-export\/1"/.test(head) || /"type"\s*:\s*"system_resolved"/.test(head);
}

export function readSse4Doc(text: string): { resolved: Resolved; kernelVersion: string | null } {
  const doc = JSON.parse(text) as Sse4Doc & Resolved;
  const resolved = doc.format === SSE4_EXPORT_FORMAT ? doc.resolved : doc.type === 'system_resolved' ? doc : undefined;
  if (!resolved?.facts || typeof resolved.system !== 'string') {
    throw new Error('it is not a Star System Explorer 4 system export');
  }
  return { resolved, kernelVersion: doc.kernel?.kernel_version ?? null };
}

/** SSE4 fields this reader turns into V3 fields. Everything else is restored from `v3.*` or listed. */
const MAPPED = new Set([
  'name', 'parent', 'orbit.host', 'body.kind', 'body.mass', 'body.radius', 'star.effective_temperature',
  'body.rotation_period', 'body.axial_tilt', 'orbit.semi_major_axis', 'orbit.eccentricity',
  'orbit.inclination', 'orbit.ascending_node', 'orbit.argument_of_periapsis', 'orbit.mean_anomaly_at_epoch',
  'orbit.epoch_v3_ms', 'system.age', 'system.position_map_units'
]);

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** `u:x/sys:40/star:1` -> `star:1`; the last segment names the object inside its system. */
const tail = (a: string) => a.slice(a.lastIndexOf('/') + 1);

/** A V3 role from SSE4's kind, its address and what it orbits. */
function roleFor(addr: string, f: Record<string, unknown>, hostRole: string | undefined): string {
  const v3 = str(f['v3.roleHint']);
  if (v3) return v3;
  const kind = str(f['body.kind']);
  if (kind === 'star' || tail(addr).startsWith('star:') || f['star.phase'] !== undefined) return 'star';
  if (tail(addr).startsWith('craft:')) return 'construct';
  if (kind === 'belt' || kind === 'ring') return kind;
  if (kind === 'moon') return 'moon';
  if (kind === 'planet' || kind === 'dwarf_planet') return hostRole === 'star' || !hostRole ? 'planet' : 'moon';
  return hostRole && hostRole !== 'star' && hostRole !== 'barycenter' ? 'moon' : 'planet';
}

export interface Sse4Read {
  system: System;
  assumptions: string[];
  skipped: { name: string; reason: string }[];
}

/** One SSE4 system to the V3 pivot, with an account of everything that did not travel. */
export function sse4ToSystem(text: string): Sse4Read {
  const { resolved, kernelVersion } = readSse4Doc(text);
  const sysAddr = resolved.system;
  const sysFacts = resolved.facts[sysAddr] ?? {};
  const evidence = resolved.evidence ?? {};
  const members = Object.keys(resolved.facts).filter((a) => a !== sysAddr && a.startsWith(sysAddr + '/'));

  // Ids: the V3 id SSE4 kept, else the address's last segment, made unique.
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const a of members) {
    let id = str(resolved.facts[a]['v3.id']) ?? tail(a).replace(':', '-');
    while (used.has(id)) id += '_';
    used.add(id);
    ids.set(a, id);
  }

  // Roles need the host's role first, so resolve hosts before their satellites.
  const hostOf = (a: string) => str(resolved.facts[a]['orbit.host']) ?? str(resolved.facts[a]['parent']);
  const roles = new Map<string, string>();
  const roleOf = (a: string, depth = 0): string => {
    const known = roles.get(a);
    if (known) return known;
    const h = hostOf(a);
    const hostRole = h && h !== sysAddr && resolved.facts[h] && depth < 32 ? roleOf(h, depth + 1) : undefined;
    const r = roleFor(a, resolved.facts[a], hostRole);
    roles.set(a, r);
    return r;
  };

  const counters: Record<string, number> = {};
  const left: Map<string, { count: number; derived: boolean }> = new Map();
  const nodes: Record<string, unknown>[] = [];
  let unnamed = false;

  for (const a of members) {
    const f = resolved.facts[a];
    const role = roleOf(a);
    const kind = str(f['v3.kind']) ?? (role === 'construct' ? 'construct' : 'body');
    counters[role] = (counters[role] ?? 0) + 1;
    const fallbackName = `${role[0].toUpperCase()}${role.slice(1)} ${counters[role]}`;
    const node: Record<string, unknown> = {};

    // Kept V3 fields first, so SSE4's own values below take precedence.
    for (const [k, v] of Object.entries(f)) {
      if (k.startsWith('v3.') && !k.startsWith('v3.node.')) node[k.slice(3)] = v;
    }
    node.id = ids.get(a);
    node.name = str(f['name']) ?? str(f['v3.name']) ?? fallbackName;
    if (node.name === fallbackName) unnamed = true;
    node.kind = kind;
    node.roleHint = role;
    const host = hostOf(a);
    node.parentId = host && host !== sysAddr ? (ids.get(host) ?? null) : null;

    const mass = num(f['body.mass']);
    if (mass !== undefined) {
      if (kind === 'construct') node.physical_parameters = { ...(node.physical_parameters as object), massKg: mass };
      else node.massKg = mass;
    }
    const r = num(f['body.radius']);
    if (r !== undefined) node.radiusKm = r / 1000;
    const teff = num(f['star.effective_temperature']);
    if (teff !== undefined) node.temperatureK = teff;
    const rot = num(f['body.rotation_period']);
    if (rot !== undefined) node.rotation_period_hours = rot / 3600;
    const tilt = num(f['body.axial_tilt']);
    if (tilt !== undefined) node.axial_tilt_deg = tilt * DEG;

    const a_m = num(f['orbit.semi_major_axis']);
    if (a_m !== undefined && host && host !== sysAddr) {
      const hostMass = num(resolved.facts[host]?.['body.mass']);
      const prior = (node.orbit ?? {}) as Record<string, unknown>;
      node.orbit = {
        ...prior,
        hostId: ids.get(host),
        t0: num(f['orbit.epoch_v3_ms']) ?? 0,
        ...(hostMass !== undefined ? { hostMu: G * hostMass } : {}),
        elements: {
          a_AU: a_m / AU_M,
          e: num(f['orbit.eccentricity']) ?? 0,
          i_deg: (num(f['orbit.inclination']) ?? 0) * DEG,
          Omega_deg: (num(f['orbit.ascending_node']) ?? 0) * DEG,
          omega_deg: (num(f['orbit.argument_of_periapsis']) ?? 0) * DEG,
          M0_rad: num(f['orbit.mean_anomaly_at_epoch']) ?? 0
        }
      };
    }

    for (const k of Object.keys(f)) {
      if (MAPPED.has(k) || k.startsWith('v3.')) continue;
      const ev = evidence[a]?.[k]?.evidence ?? '';
      const e = left.get(k) ?? { count: 0, derived: true };
      e.count++;
      e.derived = e.derived && ev !== 'authored' && !ev.startsWith('authored');
      left.set(k, e);
    }
    nodes.push(node);
  }

  // The system itself.
  const system: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sysFacts)) if (k.startsWith('v3.') && !k.startsWith('v3.node.')) system[k.slice(3)] = v;
  system.id = str(sysFacts['v3.id']) ?? tail(sysAddr).replace(':', '-');
  system.name = str(sysFacts['name']) ?? str(sysFacts['v3.name']) ?? str(sysFacts['v3.node.name']) ?? `System ${tail(sysAddr).split(':')[1] ?? ''}`.trim();
  const age = num(sysFacts['system.age']);
  if (age !== undefined) system.age_Gyr = age / SECONDS_PER_GYR;
  system.nodes = nodes;
  for (const k of Object.keys(sysFacts)) {
    if (MAPPED.has(k) || k.startsWith('v3.')) continue;
    const ev = evidence[sysAddr]?.[k]?.evidence ?? '';
    left.set(`system: ${k}`, { count: 1, derived: !ev.startsWith('authored') });
  }

  const skipped = [...left.entries()]
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([k, e]) => ({
      name: e.count > 1 ? `${k} (on ${e.count} objects)` : k,
      reason: e.derived ? 'worked out by SSE4; the receiving program works out its own' : 'set by hand in SSE4; no field for it here'
    }));

  const assumptions = [
    `Read from Star System Explorer 4${kernelVersion ? ` (kernel ${kernelVersion})` : ''}, as the system stands at the campaign's now.`,
    'History, flows, light, weather, surfaces and the record stay in SSE4: a single system file has no place for them.',
    ...(unnamed ? ['Objects SSE4 has not named are called by their kind and a number.'] : [])
  ];
  return { system: system as unknown as System, assumptions, skipped };
}
