// LOOK UP A REAL STAR AND BUILD ITS SYSTEM.
//
// The engine's own real-sky importer, driven the way its dialogue drives it: resolve a name through
// SIMBAD, fetch the stars, planets and measured sizes around it, and hand them to `convertRegion`.
// The resolve logic below is the dialogue's (RealSkyImportModal.svelte) lifted out of a component —
// exact name, then the catalogue's own spelling, then a pair's components, then a short suggestion
// list — because every one of those steps is there to answer a way somebody actually got stuck.
//
// ONE SYSTEM, NOT A STARMAP. The engine imports a REGION and makes a map of it. This tool converts one
// system at a time, so it asks for a small region around the star, lets the census group what is
// bound together, and offers the group containing the star that was asked for.
//
// NO INFILL. The engine can add the moons, belts and outer worlds a catalogue never lists; that is
// the engine's job, and doing it here would be simulating. What comes out is what has been measured.
import {
  runTap, simbadResolveAdql, simbadSearchAdql, simbadComponentsAdql, SUGGEST_LIMIT,
  loadStarRows, loadArchiveRows, loadStarSizes, loadContainerComponents,
  convertRegion, cleanStarName,
  toAsciiQuery, displayStarName, designationFor, toCatalogueTerm, systemStarName,
  parallaxMasToLy, HOST_MATCH_DIST_FRAC,
  ORBIT_AUTHOR_MAX_PERIOD_YR, separationForPeriodAu, starParamsFromType, SOLAR_MASS_KG, AU_PER_LY, isContainerRow
} from './realskyApi';
import statTemplates from '$lib/vendor/data/statTemplates.json';
import type { System, CelestialBody } from '$lib/vendor/types';

/** A row from SIMBAD's `basic` table, as the resolve queries return it. */
export interface SimbadRow { main_id: string; ra: number; dec: number; plx_value: number | null; sp_type?: string; otype?: string }

export type Resolution =
  | { kind: 'star'; hit: SimbadRow; note: string }
  | { kind: 'choose'; candidates: SimbadRow[]; note: string };

export interface FoundSystem { name: string; system: System; containsQuery: boolean }

/** What `convertRegion` returns, declared at the one place its untyped result enters typed code. */
interface RegionResult {
  systems: { name: string; position: { x: number; y: number; z?: number }; system: System }[];
  skipped: { hostname: string; reason: string }[];
}
export interface Lookup {
  systems: FoundSystem[];
  /** Index into `systems` of the one holding the star that was searched for, else the nearest to it. */
  chosen: number;
  /** True when `chosen` was found by name; false when it is only the nearest system. */
  matched: boolean;
  /** Set when the searched star was itself dropped by the census — the reason, in the census's words. */
  targetDropped?: string;
  /** Said out loud: which source answered, and anything that came from a fallback. */
  warnings: string[];
  skipped: { hostname: string; reason: string }[];
}

// THE ENGINE'S STATIC FALLBACKS LIVE ON THE ENGINE'S ORIGIN. The loaders ask for `/realsky/…` as a
// relative path because in the engine that IS its own server. Here it would 404, so those two
// snapshot files are fetched from starsystemx.com instead — measured: both are served with
// `Access-Control-Allow-Origin: *`. `/api/realsky-tap` is deliberately left relative: this site
// serves that route itself (the archive sends no CORS headers, so a browser cannot ask it directly).
const ENGINE_ORIGIN = 'https://starsystemx.com';
const fetchImpl: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return fetch(url.startsWith('/realsky/') ? `${ENGINE_ORIGIN}${url}` : input, init);
};

const SUGGEST_TIMEOUT_MS = 3000;

// --- resolving a name -----------------------------------------------------------------------------

export async function resolveStar(typed: string): Promise<Resolution> {
  // SIMBAD REJECTS NON-ASCII outright ("α Scorpii" is an HTTP 400), so a Greek letter becomes its
  // name first — and the page SAYS so, because a rewrite nobody sees teaches nothing.
  const sent = toAsciiQuery(typed.trim());
  const rewrote = sent !== typed.trim()
    ? `Searched for ${typed.trim()} as “${sent}” — the catalogue only accepts plain letters.`
    : '';
  if (!sent) throw new Error(`“${typed}” has no letters or numbers the catalogue can search for.`);

  try {
    let hit: SimbadRow | undefined = (await runTap('simbad', simbadResolveAdql(sent), { fetchImpl }))[0];
    let via = '';
    // The catalogue files stars under its own spelling — "Epsilon Eridani" is "eps Eri" — so fold
    // and ask once more. One fast lookup, one star, instead of a list of everything called Epsilon.
    const folded = toCatalogueTerm(sent);
    if (!hit && folded && folded !== sent) {
      hit = (await runTap('simbad', simbadResolveAdql(folded), { fetchImpl }))[0];
      if (hit) via = `Found under the catalogue’s own name for it, “${folded}”.`;
    }
    if (!hit) return await suggestFor(sent, rewrote);

    // A HIT WITH NO PARALLAX IS A SYSTEM RECORD, NOT A STAR. "61 Cygni" resolves to the pair, which
    // has no distance of its own; its components do. Offer those rather than dead-ending.
    if (!(Number(hit.plx_value) > 0)) {
      const name = displayStarName(hit.main_id);
      const parts: SimbadRow[] = await runTap('simbad', simbadComponentsAdql(hit.main_id), { fetchImpl });
      if (!parts.length) throw new Error(`${name} has no measured distance in the catalogue, so it cannot be placed.`);
      return {
        kind: 'choose', candidates: parts,
        note: [rewrote, `${name} is a ${parts.length === 2 ? 'pair' : 'system'} with no distance of its own. Pick a star in it:`].filter(Boolean).join(' ')
      };
    }
    const found = displayStarName(hit.main_id);
    const foundNote = found.toLowerCase() === sent.toLowerCase() ? '' : `Found ${found}.`;
    return { kind: 'star', hit, note: [rewrote, via, via.includes(found) ? '' : foundNote].filter(Boolean).join(' ') };
  } catch (e) {
    throw new Error(readableTapError(e, sent));
  }
}

async function suggestFor(sent: string, rewrote: string): Promise<Resolution> {
  const term = toCatalogueTerm(sent);
  // A multi-word prefix search defeats SIMBAD's index and takes eighteen seconds; it has already had
  // its exact and folded lookups, so there is nothing cheap left to try.
  if (/\s/.test(term)) throw new Error(notFoundMessage(sent));
  let rows: SimbadRow[] = [];
  try {
    // Optional, so it gets a budget: a prefix matching nothing can cost a full scan (measured: 20 s).
    rows = await runTap('simbad', simbadSearchAdql(term), { fetchImpl, signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS) });
  } catch {
    throw new Error(notFoundMessage(sent));
  }
  if (!rows.length) throw new Error(notFoundMessage(sent));
  if (rows.length > SUGGEST_LIMIT) {
    const example = designationFor(rows[0].main_id) ?? displayStarName(rows[0].main_id);
    throw new Error(`“${sent}” matches more than ${SUGGEST_LIMIT} stars — it names one in each constellation. Add the constellation, for example “${example}”.`);
  }
  return {
    kind: 'choose', candidates: rows,
    note: [rewrote, `No star is called exactly “${sent}”. ${rows.length === 1 ? 'The nearest match is' : `These ${rows.length} match`}, nearest first:`].filter(Boolean).join(' ')
  };
}

function notFoundMessage(sent: string) {
  const hint = /^[A-Za-z]+$/.test(sent)
    ? ' Try the full name, or a designation like “alf Cen” or “HD 95735”.'
    : ' Check the spelling, including any apostrophe — the catalogue matches names exactly.';
  return `The catalogue has no star called “${sent}”.${hint}`;
}

// Neither the browser's bare "Failed to fetch" nor several hundred characters of the service's own
// VOTable XML is something to show a person. Both become a sentence.
function readableTapError(e: unknown, sent: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (!/TAP: HTTP/.test(raw)) {
    return /fetch|network|load failed/i.test(raw)
      ? 'Could not reach the star catalogue. Check the connection and try again — it is occasionally down for maintenance.'
      : raw;
  }
  const status = /HTTP (\d+)/.exec(raw)?.[1] ?? '';
  const cause = /CAUSE:\s*([^<"\n]+)/.exec(raw)?.[1]?.trim();
  if (status === '400') return `The catalogue could not read “${sent}” as a name${cause ? ` (${cause})` : ''}.`;
  if (status.startsWith('5')) return 'The star catalogue is having trouble at its end. Try again in a moment.';
  return `The star catalogue refused the request${status ? ` (error ${status})` : ''}. Try a different name.`;
}

export const distanceLyOf = (row: SimbadRow) => (Number(row.plx_value) > 0 ? parallaxMasToLy(Number(row.plx_value)) : NaN);
export const nameOf = (row: SimbadRow) => displayStarName(row.main_id);

// --- building the system --------------------------------------------------------------------------

/**
 * WHERE TO LOOK: ONE SYSTEM'S WORTH OF SKY, SIZED BY GRAVITY RATHER THAN BY A ROUND NUMBER.
 *
 * ACROSS THE SKY - how far out a companion can be and still be part of this star's system. There are
 * two gravitational answers, about twenty times apart, and the difference is the whole design:
 *
 *  - The HILL SPHERE. For a star in the galaxy that is its tidal (Jacobi) radius, roughly
 *    1.37 pc x (M / Msun)^(1/3): nothing beyond it can be bound, so it is the CEILING on what any
 *    catalogue import may call one system. But it is large - 4.5 ly for a Sun-like star, 5.7 ly for
 *    alpha Centauri - and a catalogue holds positions, not velocities, so inside it a companion and a
 *    stranger look the same. Alpha Centauri's Hill sphere contains the Sun. As a TEST it would merge
 *    strangers.
 *  - The engine's GROUPING RULE, which is the test actually applied: two stars are one system when
 *    their orbit at that separation takes under ORBIT_AUTHOR_MAX_PERIOD_YR (a million years) - about
 *    0.2 ly for a Sun-like pair, always well inside the Hill sphere.
 *
 * So the search reaches exactly as far as the grouping can join: nothing beyond it could become part
 * of the system, and fetching it would only fetch strangers. The reach depends on the PAIR's mass, not
 * the searched star's alone - which is what lets a search from a small companion reach a heavy primary
 * further out - and the partner is not known until it is found, so the heaviest star the pack knows
 * stands in for it. Because reach grows only as the cube root of mass, that lands between ~0.73 ly (a
 * red dwarf) and ~0.93 ly (the heaviest pair possible) for any star.
 *
 * ALONG THE LINE OF SIGHT - exactly as far as the planet join will accept, `HOST_MATCH_DIST_FRAC` of
 * the distance, because the two catalogues disagree about distance far more than about position.
 */
const HEAVIEST_STAR_MSUN = Math.max(
  ...Object.entries(statTemplates as Record<string, { mass_solar?: number[] }>)
    .filter(([key, band]) => key.startsWith('star/') && Array.isArray(band.mass_solar))
    .map(([, band]) => band.mass_solar![1])
);

export function lookupRadiusLy(hit: SimbadRow): number {
  // A star whose class the pack cannot read is given the heaviest mass - the search can only grow.
  const ownMsun = starParamsFromType(hit.sp_type ?? '', statTemplates, { otype: hit.otype })?.massMsun ?? HEAVIEST_STAR_MSUN;
  const reachAu = separationForPeriodAu(ORBIT_AUTHOR_MAX_PERIOD_YR, (ownMsun + HEAVIEST_STAR_MSUN) * SOLAR_MASS_KG);
  return reachAu / AU_PER_LY;
}
export const lookupDepthLy = (distLy: number, radiusLy: number) => Math.max(radiusLy, HOST_MATCH_DIST_FRAC * distLy);

export async function systemsAround(hit: SimbadRow): Promise<Lookup> {
  const distLy = distanceLyOf(hit);
  const radiusLy = lookupRadiusLy(hit);
  const region = { centre: { raDeg: hit.ra, decDeg: hit.dec, distLy }, radiusLy, depthLy: lookupDepthLy(distLy, radiusLy) };

  // Sizes are pure enrichment: `loadStarSizes` swallows its own failures, because a missing size is a
  // less good star, never a failed lookup.
  const [stars, planets, sizes] = await Promise.all([
    loadStarRows(region, { fetchImpl }),
    loadArchiveRows(region, { fetchImpl }),
    loadStarSizes(region, { fetchImpl })
  ]);
  // A multiple-star container whose members have no parallax of their own gets them from SIMBAD's
  // hierarchy, and the census then drops the container because its components are present.
  const components = await loadContainerComponents(stars.rows, { fetchImpl });

  // Map positions are measured FROM the searched star when the map centre is zero, so a system's
  // position is its offset from what was asked for - which is what the fallback below reads.
  //
  // ONE TYPED BOUNDARY. `convertRegion` is untyped JavaScript, so TypeScript infers a loose shape from
  // its body (`kind: string`, nodes possibly undefined) that no engine type satisfies. Rather than
  // annotate around that at every use, the result is declared once, here, as what the engine's own
  // callers treat it as: a list of `{ name, position, system }`, where `system` is a saved System.
  const out = convertRegion(
    { starRows: [...stars.rows, ...components.rows], planetRows: planets.rows, statTemplates },
    { region, mapCentrePx: { x: 0, y: 0 }, starSizes: sizes.sizes, generated: new Date().toISOString().slice(0, 10) }
  ) as unknown as RegionResult;

  // WHICH RETURNED SYSTEM WAS ASKED FOR. The naming is entirely the engine's; this only compares
  // names it produced. A searched star must be present by its own name - a system-name match alone
  // once handed back GJ 667 C's companions while GJ 667 C itself had been dropped. A searched
  // container record is replaced by its components, so there the system's name is what matches.
  // Failing both, the nearest system - unless the searched star was dropped, which is reported.
  const hitIsContainer = isContainerRow({ otype: hit.otype, sp: hit.sp_type });
  const systemName = systemStarName(hit.main_id);
  const starName = cleanStarName(hit.main_id);
  const holdsStar = (s: { system: System }) => (s.system.nodes ?? []).some(
    (n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star' && n.name === starName
  );
  const systems: FoundSystem[] = out.systems.map((s) => ({
    name: s.name,
    system: s.system,
    containsQuery: holdsStar(s) || (hitIsContainer && s.name === systemName)
  }));
  const offset = (p: { x: number; y: number; z?: number }) => Math.hypot(p.x, p.y, p.z ?? 0);
  let chosen = systems.findIndex((s) => s.containsQuery);
  if (chosen < 0 && out.systems.length) {
    chosen = out.systems.reduce((best, s, i) => (offset(s.position) < offset(out.systems[best].position) ? i : best), 0);
  }
  chosen = Math.max(0, chosen);

  // A snapshot must never read as live data, so whichever source answered is said out loud.
  const warnings = [stars.warning, planets.warning, sizes.warning, components.warning]
    .filter((w): w is string => typeof w === 'string' && w.length > 0);

  // THE FALLBACK MUST NOT COVER FOR A DROPPED STAR. Nearest-by-distance is right when the searched
  // star is present but named differently. If the census DROPPED it - no usable spectral type, say -
  // then the nearest system is somebody else's star, and handing it back would be answering a
  // different question without saying so.
  const matched = systems.some((s) => s.containsQuery);
  // `skipped` names a star by `cleanStarName`, not by SIMBAD's raw main_id - so ask in that form.
  const dropped = hitIsContainer ? undefined : out.skipped.find((s) => s.hostname === starName || s.hostname === hit.main_id);

  return { systems, chosen, matched, targetDropped: matched ? undefined : dropped?.reason, warnings, skipped: out.skipped };
}
