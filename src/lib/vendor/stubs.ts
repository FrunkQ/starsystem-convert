// THE EIGHT TYPES `types.ts` IMPORTS AND THIS TOOL NEVER LOOKS AT.
//
// The engine's `types.ts` is the shape of a saved system and comes over whole, because a converter
// that reads and writes that format should be describing it with the same definitions rather than a
// hand-copied subset that quietly disagrees. But it opens with eight `import type` lines reaching
// into orbital mechanics, circumbinary geometry, geological activity, volatile retention,
// classification explanations, Traveller world data, journey logs and rule-pack deltas.
//
// Every one of those is TYPE-ONLY, so none of it exists at runtime — the imports are erased by the
// compiler and contribute nothing to the bundle. They only need to resolve for the type-checker.
// Vendoring eight more engine modules to satisfy a checker would be carrying several thousand lines
// to describe fields this tool neither reads nor writes: they ride along on a body when a system
// passes through, and are handed back out untouched.
//
// `any` is therefore the honest annotation, not a shortcut. It says "this tool has no opinion about
// the shape of this field", which is exactly true. If the converter ever DOES need to inspect one of
// them, vendor the real definition rather than filling in a guess here.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type OrbitalBoundaries = any;
export type CircumbinaryAnnulus = any;
export type GeoActivity = any;
export type VolatileRetention = any;
export type ClassExplanation = any;
export type TravellerWorldData = any;
export type ScheduledJourneyLog = any;
/** Generic in the engine (`PackListDelta<T>`), so the stub must take the parameter or every use of
 *  it is an arity error rather than the harmless `any` it is meant to be. */
export type PackListDelta<T = unknown> = any;

// Two more, imported inline further down `types.ts` rather than in its import block — the player
// view's saved presets and uploaded graphics. Same reasoning: they ride through untouched.
export type PlayerPreset = any;
export type PlayerAsset = any;

// `constants.ts` reads a build stamp that the engine's vite.config injects as a global define. It
// guards with `typeof ... !== 'undefined'`, so the value being absent here is fine and the constants
// fall back to their defaults; the declaration exists only so the name resolves for the checker.
// Deliberately not spelled out field by field. Enumerating it means keeping a second copy of the
// engine's build-stamp shape in step with vite.config's define, and getting it wrong shows up as
// four errors about a property that was only ever going to be undefined here anyway.
declare global {
  const __BUILD_INFO__: Record<string, string | undefined> | undefined;
}
