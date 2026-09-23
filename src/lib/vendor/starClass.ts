// STAR CLASS, THE CONVERTER'S WAY: report what the file said, and let the engine do the astrophysics.
//
// This stands in for the engine's `physics/importedStarClass.ts`, which is 143 lines that reach
// stellar evolution, the star generator, the spectral-band matcher, the RNG, BodyFactory and star
// imagery — 3,200 lines across 16 files at runtime, for a tool whose entire premise is that it does
// no physics.
//
// IT IS NOT A LOSS, because the engine does this work again on arrival. Its own converter comments
// say so: the importer "emits the honest BAND KEY ... and leaves `autoClassify` on;
// `importFixup.resolveLegacyStarClass`, which has the pack, then resolves the full designation against
// the pack's own bands." So the class a converter emits was always a proposal, and the engine was
// always going to re-decide it against the rule pack the GM actually uses. Passing through what the
// source stated and inferring nothing more is the honest version of the same contract.
//
// THE ONE THING THAT MUST NOT REGRESS: SpaceEngine states a FULL MK class ("G2V", "K3III",
// "M1.5Iab"), and the engine once kept only the first letter — so a K giant imported as a K dwarf.
// The stated designation is therefore kept exactly as written, and the band is derived from it rather
// than replacing it.
import { UNKNOWN_STAR_CLASS } from './physics';

export interface ImportedStarInput {
  /** A designation the source file stated, e.g. "G2V". Wins over everything when present. */
  stated?: string;
  temperatureK?: number;
  radiusKm?: number;
  massKg?: number;
  luminositySolar?: number;
}

export interface ImportedStarClass {
  classKey: string;
  bandKey: string;
  letter?: string;
  band?: 'I' | 'III' | 'V';
  bandSource: 'stated' | 'inferred-from-physics' | 'default-main-sequence' | 'remnant' | 'brown-dwarf' | 'unknown';
  physicsBand?: 'I' | 'III' | 'V';
  disagreement?: string;
}

// The Harvard sequence by effective temperature, carried down through the brown dwarfs. The engine
// once stopped at M and defaulted anything it did not recognise to G; both were faults, so this
// returns null rather than guessing when the temperature is absent or absurd.
const LETTER_BY_TEMP: [number, string][] = [
  [30000, 'O'], [10000, 'B'], [7500, 'A'], [6000, 'F'],
  [5200, 'G'], [3700, 'K'], [2400, 'M'], [1300, 'L'], [550, 'T']
];

function letterFromTemperature(tempK: number | undefined): string | null {
  if (typeof tempK !== 'number' || !(tempK > 0)) return null;
  for (const [floor, letter] of LETTER_BY_TEMP) if (tempK >= floor) return letter;
  return 'Y';
}

/** A remnant designation states itself and has no Harvard letter. */
const REMNANTS = new Set(['WD', 'BH', 'NS', 'PSR', 'X', 'Q']);

/**
 * Split a stated MK designation into its letter and luminosity class. "G2V" → G, V. "K3III" → K, III.
 * "M1.5Iab" → M, I. Anything that does not start with a Harvard letter is left alone.
 */
function partsOf(stated: string): { letter?: string; band?: 'I' | 'III' | 'V' } {
  const m = /^([OBAFGKMLTY])\s*[0-9.]*\s*(I{1,3}|IV|V)?/i.exec(stated.trim());
  if (!m) return {};
  const letter = m[1].toUpperCase();
  const roman = (m[2] ?? '').toUpperCase();
  // Only the three bands the engine's pack templates carry. IV is folded to V (a subgiant is closer
  // to the main sequence than to a giant) and II to III, as the engine's band keys do.
  const band = roman === 'III' || roman === 'II' ? 'III' : roman === 'I' ? 'I' : roman ? 'V' : undefined;
  return { letter, band };
}

const bandKeyFor = (letter: string, band?: 'I' | 'III' | 'V') =>
  band && band !== 'V' ? `star/${letter}-${band}` : `star/${letter}`;

export function resolveImportedStarClass(input: ImportedStarInput): ImportedStarClass {
  const stated = (input.stated ?? '').trim();

  if (stated) {
    const bare = stated.replace(/^star\//i, '');
    if (REMNANTS.has(bare.toUpperCase())) {
      const key = `star/${bare.toUpperCase()}`;
      return { classKey: key, bandKey: key, bandSource: 'remnant' };
    }
    const { letter, band } = partsOf(bare);
    if (letter) {
      // The designation as written is the class; the band is derived FROM it, never instead of it.
      return {
        classKey: `star/${bare}`,
        bandKey: bandKeyFor(letter, band),
        letter,
        band: band ?? 'V',
        bandSource: 'stated'
      };
    }
    // Stated, but not something this tool can parse. Keep it verbatim rather than discard it — the
    // engine may well know the designation even when this does not.
    return { classKey: `star/${bare}`, bandKey: `star/${bare}`, bandSource: 'stated' };
  }

  // Nothing stated — Universe Sandbox never states one. A letter from temperature is the whole of
  // what a format converter can honestly say, and the caller sets `autoClassify` so the engine
  // resolves the rest against its pack.
  const letter = letterFromTemperature(input.temperatureK);
  if (!letter) {
    return { classKey: UNKNOWN_STAR_CLASS, bandKey: UNKNOWN_STAR_CLASS, bandSource: 'unknown' };
  }
  const key = bandKeyFor(letter);
  return { classKey: key, bandKey: key, letter, bandSource: 'default-main-sequence' };
}
