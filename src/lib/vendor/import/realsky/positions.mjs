// @ts-nocheck - vendored plain JavaScript; see scripts/vendor.mjs for why it is not type-checked.
// VENDORED from Star System Explorer, src/lib/import/realsky/positions.mjs — copied on 2026-09-23.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// Real-sky import — position mathematics.
//
// One set of functions turns catalogue astrometry (ICRS RA/Dec + parallax)
// into SSE map coordinates, for both the build kit and the in-app importer.
// The exact-cut sphere filter lives beside the placement maths deliberately:
// the region filter and the final positions must come from the same numbers
// so they can never disagree (design §1b).
//
// Frame: right-handed equatorial Cartesian, +z toward the north celestial
// pole, +x toward RA 0h Dec 0, +y toward RA 6h Dec 0. Units: light years
// until the final pixel scaling.

import { LY_PER_PC, PIXELS_PER_LY, DEFAULT_MAP_CENTRE_PX } from './constants.mjs';

// Deterministic 0..1 hash (same recipe as SystemProcessor.hash01) — used for
// orbital phase angles so builds and imports are reproducible, never random.
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export const parallaxMasToLy = (plxMas) => (1000 / plxMas) * LY_PER_PC;

// ICRS RA/Dec (degrees) + distance (ly) → equatorial Cartesian, in light years.
export function radecToXyzLy(raDeg, decDeg, distLy) {
  const ra = (raDeg * Math.PI) / 180, dec = (decDeg * Math.PI) / 180;
  return {
    x: distLy * Math.cos(dec) * Math.cos(ra),
    y: distLy * Math.cos(dec) * Math.sin(ra),
    z: distLy * Math.sin(dec)
  };
}

// Cartesian offset (ly) from the region centre → map pixels. The centre lands
// at `mapCentrePx` with z = 0; everything else sits at its true offset at
// PIXELS_PER_LY. Passing centreXyzLy {0,0,0} (the default) reproduces the
// bundled maps' Sol-centred placement bit-for-bit.
export function xyzToMapPx(xyzLy, centreXyzLy = { x: 0, y: 0, z: 0 }, mapCentrePx = DEFAULT_MAP_CENTRE_PX) {
  return {
    x: round(mapCentrePx.x + PIXELS_PER_LY * (xyzLy.x - centreXyzLy.x)),
    y: round(mapCentrePx.y + PIXELS_PER_LY * (xyzLy.y - centreXyzLy.y)),
    z: round(PIXELS_PER_LY * (xyzLy.z - centreXyzLy.z))
  };
}

// Astrometry straight to a map position (the composition the build kit uses).
export function mapPositionFromAstrometry(raDeg, decDeg, plxMas, centreXyzLy, mapCentrePx) {
  const distanceLy = parallaxMasToLy(plxMas);
  return {
    distanceLy,
    position: xyzToMapPx(radecToXyzLy(raDeg, decDeg, distanceLy), centreXyzLy, mapCentrePx)
  };
}

export function distanceLy(aXyzLy, bXyzLy) {
  const dx = aXyzLy.x - bXyzLy.x, dy = aXyzLy.y - bXyzLy.y, dz = aXyzLy.z - bXyzLy.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// The exact cut for region queries: is this candidate inside the true 3D
// sphere? (The TAP query over-fetches a cone + distance shell; this decides.)
export function inSphere(candidateXyzLy, centreXyzLy, radiusLy) {
  return distanceLy(candidateXyzLy, centreXyzLy) <= radiusLy;
}

// THE SAME SHAPE AS THE QUERY: `radiusLy` across the sky, `depthLy` along the line of sight from Sol.
// An ellipsoid, and exactly the sphere above whenever depth is the radius - which is every region
// that does not ask for depth, so nothing that already works can move.
//
// WHY A REGION NEEDS IT (measured 2026-09-23): GJ 667 C sits ~230 AU from its primary pair GJ 667 AB,
// but the catalogues place them 1.33 ly apart ALONG THE LINE OF SIGHT - Gaia's parallax for C is
// 138.07 mas, Hipparcos' for AB 146.29. The grouping rightly joins them (projected separation, and
// parallaxes within 10%), and then a SPHERE cut on the group's primary threw the whole system away,
// five planets included, because the primary was "behind" it. The query was already deep and the
// grouping already tolerant of distance; this was the one test left that was not.
export function inRegion(candidateXyzLy, centreXyzLy, radiusLy, depthLy = radiusLy) {
  const d = Math.hypot(centreXyzLy.x, centreXyzLy.y, centreXyzLy.z);
  if (!(depthLy > radiusLy) || !(d > 0)) return inSphere(candidateXyzLy, centreXyzLy, radiusLy);
  const ux = centreXyzLy.x / d, uy = centreXyzLy.y / d, uz = centreXyzLy.z / d;
  const ox = candidateXyzLy.x - centreXyzLy.x;
  const oy = candidateXyzLy.y - centreXyzLy.y;
  const oz = candidateXyzLy.z - centreXyzLy.z;
  const along = ox * ux + oy * uy + oz * uz;
  const across2 = Math.max(0, ox * ox + oy * oy + oz * oz - along * along);
  return across2 / (radiusLy * radiusLy) + (along * along) / (depthLy * depthLy) <= 1;
}
