// FOUR LEAF THINGS THE CONVERTERS NEED, lifted out of four very large engine modules.
//
// Each is a handful of lines living in a file whose runtime closure is enormous — `hillRadiusAU` sits
// in `physics/stability.ts` (905 lines, and its imports reach Svelte stores, the construct system and
// Lagrange), `pairThresholds` in `physics/barycenterReconcile.ts` (578), `UNKNOWN_STAR_CLASS` in a
// 408-line module whose job is talking to sky catalogues. Copying the function is honest; copying the
// module to get at the function would drag half the engine into a web page.
//
// VENDORED VERBATIM — the bodies below are the engine's, not a reimplementation. If one of them
// changes there, change it here. Sources:
//   hillRadiusAU        star-system-generator  src/lib/physics/stability.ts
//   pairThresholds      star-system-generator  src/lib/physics/barycenterReconcile.ts
//   autoPairName        star-system-generator  src/lib/system/barycentres.ts
//   UNKNOWN_STAR_CLASS  star-system-generator  src/lib/import/realsky/stars.mjs

// --- Hill radius -------------------------------------------------------------------------------
/** The Hill radius in AU, at periapsis, judged against the mass the owner ACTUALLY orbits. */
export function hillRadiusAU(aAU: number, e: number, massKg: number, hostMassKg: number): number {
  if (!(aAU > 0) || !(massKg > 0) || !(hostMassKg > 0)) return 0;
  const eClamped = Math.max(0, Math.min(0.999, e));
  return aAU * (1 - eClamped) * Math.cbrt(massKg / (3 * hostMassKg));
}

// --- Pair thresholds ---------------------------------------------------------------------------
export const DEFAULT_PROMOTE_RATIO = 0.08;
export const DEFAULT_DEMOTE_RATIO = 0.05;
export interface PairThresholds { promote: number; demote: number; }

/**
 * The mass ratio at which a satellite stops being a satellite and becomes half of a pair.
 *
 * This tool has no rule pack — it does not run the engine's physics and does not load one — so the
 * defaults are always what it gets. That is correct rather than a shortfall: the engine's load-time
 * reconciler re-judges every pair against whatever pack the GM actually uses, so a barycentre decided
 * here is a proposal the engine is free to revise.
 */
export function pairThresholds(pack?: unknown | null): PairThresholds {
  const g = (pack as { generation_parameters?: Record<string, unknown> } | null | undefined)
    ?.generation_parameters ?? {};
  const asked = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : fallback;
  const promote = asked(g.barycentre_promote_ratio, DEFAULT_PROMOTE_RATIO);
  let demote = asked(g.barycentre_demote_ratio, DEFAULT_DEMOTE_RATIO);
  // Strictly below, so no ratio can satisfy both tests at once.
  if (demote >= promote) demote = promote - Math.abs(promote) * Number.EPSILON;
  return { promote, demote };
}

// --- Pair naming -------------------------------------------------------------------------------
export function autoPairName(heavyName: string, lightName: string): string {
  const a = (heavyName ?? '').trim();
  const b = (lightName ?? '').trim();
  if (!a || !b) return `${a || b} Barycentre`;

  // Word-wise, so "Jupiter L4 Trojan" + "Jupiter L4 Trojan I" share three words, while "Kepler-16 A"
  // and "Kepler-16 B" share one. Never a partial word: "Mars"/"Marsha" have nothing in common.
  const aw = a.split(/\s+/);
  const bw = b.split(/\s+/);
  let shared = 0;
  while (shared < aw.length && shared < bw.length && aw[shared].toLowerCase() === bw[shared].toLowerCase()) shared++;

  // The whole of one name being a prefix of the other is the companion case above: name the pair
  // after the common part. "Pair" rather than "Barycentre" because that is what a GM calls it, and
  // it keeps the row short enough to read.
  if (shared > 0) return `${aw.slice(0, shared).join(' ')} Pair`;
  return `${a}-${b} Barycentre`;
}

// --- The one star constant ---------------------------------------------------------------------
export const UNKNOWN_STAR_CLASS = 'star/unknown';
