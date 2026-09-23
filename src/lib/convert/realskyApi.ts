// THE REAL-SKY MODULES, WITH THEIR CONTRACTS WRITTEN DOWN.
//
// The engine's real-sky code is plain JavaScript, and TypeScript infers a signature from each
// function's body - including from its DEFAULTS, which is where it goes wrong: `starRows = []` is
// inferred as an array of `never`, `statTemplates = null` as a parameter that only ever accepts null,
// and `runTap`'s `signal` option drops out of the inferred options type altogether. None of those is
// the real contract; every one would be a compile error at a perfectly correct call.
//
// So the functions this tool calls are declared ONCE, here, as the engine's own callers use them, and
// the rest of the tool imports them from this file. One boundary between untyped and typed code
// instead of a cast at every call site - and the signatures double as the list of exactly which
// parts of the vendored real-sky code this site depends on.
import * as query from '$lib/vendor/import/realsky/query.mjs';
import * as catalogue from '$lib/vendor/import/realsky/catalogue.mjs';
import * as convert from '$lib/vendor/import/realsky/convert.mjs';
import * as names from '$lib/vendor/import/realsky/starNames.mjs';
import * as positions from '$lib/vendor/import/realsky/positions.mjs';

type FetchOpts = { fetchImpl?: typeof fetch; signal?: AbortSignal };
/** A sphere of `radiusLy`, optionally with its distance shell lengthened to `depthLy` along the line
 *  of sight (the cone stays the sphere's). See `regionBounds` in the engine's query.mjs. */
export interface Region { centre: { raDeg: number; decDeg: number; distLy: number }; radiusLy: number; depthLy?: number }
/** Every loader answers with the rows, which source answered them, and a warning when it was not live. */
export interface Loaded<T> { rows: T[]; source: string; warning: string | null }

export const runTap = query.runTap as unknown as (service: 'simbad' | 'archive' | 'gaia', adql: string, opts?: FetchOpts) => Promise<any[]>;
export const simbadResolveAdql = query.simbadResolveAdql as unknown as (name: string) => string;
export const simbadSearchAdql = query.simbadSearchAdql as unknown as (term: string) => string;
export const simbadComponentsAdql = query.simbadComponentsAdql as unknown as (mainId: string) => string;
export const SUGGEST_LIMIT = query.SUGGEST_LIMIT as number;

export const loadStarRows = catalogue.loadStarRows as unknown as (region: Region, opts?: FetchOpts) => Promise<Loaded<any>>;
export const loadArchiveRows = catalogue.loadArchiveRows as unknown as (region: Region, opts?: FetchOpts) => Promise<Loaded<any>>;
/** Pure enrichment: swallows its own failures and returns an empty map rather than throwing. */
export const loadStarSizes = catalogue.loadStarSizes as unknown as (region: Region, opts?: FetchOpts) => Promise<{ sizes: Map<string, unknown>; warning: string | null }>;
export const loadContainerComponents = catalogue.loadContainerComponents as unknown as (rows: any[], opts?: FetchOpts) => Promise<{ rows: any[]; warning?: string | null }>;

export const convertRegion = convert.convertRegion as unknown as (
  data: { starRows: any[]; planetRows: any[]; solPreset?: unknown; statTemplates?: unknown },
  opts: { region: Region; mapCentrePx?: { x: number; y: number }; starSizes?: Map<string, unknown> | null; generated?: string; existingSystemIds?: string[] }
) => unknown;
export const cleanStarName = convert.cleanStarName as unknown as (mainId: string) => string;
/** How far apart, as a fraction of distance, the two catalogues may put a star and still be joined. */
export const HOST_MATCH_DIST_FRAC = convert.HOST_MATCH_DIST_FRAC as number;

export const toAsciiQuery = names.toAsciiQuery as unknown as (q: string) => string;
export const toCatalogueTerm = names.toCatalogueTerm as unknown as (q: string) => string;
export const displayStarName = names.displayStarName as unknown as (mainId: string) => string;
export const systemStarName = names.systemStarName as unknown as (mainId: string) => string;
export const designationFor = names.designationFor as unknown as (mainId: string) => string | null;

export const parallaxMasToLy = positions.parallaxMasToLy as unknown as (plxMas: number) => number;
