// VENDORED from Star System Explorer, src/lib/export/fallbackMakeup.ts — copied on 2026-09-24.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// A stand-in interior for a body the system states no composition for.
//
// Both foreign formats need one where SSG can do without: Universe Sandbox stores a body's MASS as
// what it is made of, and SpaceEngine names a planet's class from its interior. Each exporter used to
// choose for itself, which is how one gas giant with no stated makeup went to Universe Sandbox as
// hydrogen and to SpaceEngine as a water world. One rule, by mass and bulk density, used by both, and
// each exporter says when it used it.
import { EARTH_MASS_KG } from '../constants';
import type { CelestialBody, Makeup } from '../types';

export function fallbackMakeup(massKg: number, radiusKm: number | undefined): Makeup {
  const r = (radiusKm ?? 0) * 1000;
  const density = r > 0 ? massKg / ((4 / 3) * Math.PI * r ** 3) : 5500;
  const earths = massKg / EARTH_MASS_KG;
  // A gas giant: heavy enough to hold hydrogen, or too light for its size to be anything else.
  if (earths >= 50 || (earths > 2 && density < 1000)) return { metal: 0.05, rock: 0.05, gas: 0.9 };
  // An ice giant: Neptune's own split, roughly - mostly water, ammonia and methane under a thin envelope.
  if (earths > 10 || (earths > 2 && density < 2000)) return { metal: 0.05, rock: 0.1, ice: 0.7, gas: 0.15 };
  if (density < 2500) return { rock: 0.5, ice: 0.5 };
  return { metal: 0.32, rock: 0.68 };
}

/** The body's stated makeup when it has a usable one, otherwise the stand-in, flagged as such. */
export function makeupOrStandIn(body: CelestialBody): { makeup: Makeup; standIn: boolean } {
  const mk = body.makeup;
  const total = mk ? (Object.values(mk) as (number | undefined)[]).reduce<number>((s, v) => s + (v ?? 0), 0) : 0;
  if (mk && total > 0) return { makeup: mk, standIn: false };
  return { makeup: fallbackMakeup(body.massKg ?? 0, body.radiusKm), standIn: true };
}
