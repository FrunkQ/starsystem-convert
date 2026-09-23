// SYSTEM AGE, THE CONVERTER'S WAY: carry what the file stated, and say plainly when it stated nothing.
//
// This stands in for the engine's `physics/systemAge.ts`, which reaches stellar evolution and the star
// generator to work out how old a star of a given mass can plausibly be, and to clamp a stated age
// that is impossible (an O primary cannot be 4.6 Gyr old; it would be long dead).
//
// THE TRADE, STATED HONESTLY. Not clamping means a source file with a nonsensical age converts with
// that nonsensical age intact. For a format converter that is the right behaviour and the one the
// page promises — "carries what your source file actually stated, no more, and nothing invented" —
// but it IS a difference from importing the same file directly into Star System Explorer, which would
// notice and correct it. If age sanity turns out to matter more than the 3,200 lines it costs, the
// engine's version is the thing to vendor, not something to reimplement.
//
// Universe Sandbox stores an age per body, in seconds, on the star. SpaceEngine states one in Gyr on
// a Star block. Both arrive here already converted to Gyr.

export interface AgeGuess {
  ageGyr: number;
  bandGyr: [number, number];
  source: 'stated' | 'stated-clamped' | 'main-sequence-midlife' | 'giant-late-life' | 'wd-cooling' | 'remnant-median' | 'brown-dwarf-median' | 'no-star';
  estimated: boolean;
  flaringBelowGyr?: number;
  note: string;
}

export interface StarForAge {
  massKg?: number;
  temperatureK?: number;
  classes?: string[];
  statedAgeGyr?: number | null;
}

const GALAXY_AGE_GYR = 13.0;
/** The figure to fall back on, and it is a placeholder rather than a claim about anything. */
const FALLBACK_GYR = 4.6;
const FULL_BAND: [number, number] = [0.05, GALAXY_AGE_GYR];

export function guessSystemAge(star: StarForAge | null | undefined): AgeGuess {
  const stated = star?.statedAgeGyr;

  if (typeof stated === 'number' && stated > 0) {
    return {
      ageGyr: stated,
      bandGyr: FULL_BAND,
      source: 'stated',
      estimated: false,
      note: `Taken from the source file, which states ${stated.toFixed(2)} Gyr.`
    };
  }

  // Nothing stated. Say so rather than inventing a number that looks like a measurement — the note
  // is what the assumptions list shows the person, and it should send them somewhere useful.
  return {
    ageGyr: FALLBACK_GYR,
    bandGyr: FULL_BAND,
    source: star ? 'main-sequence-midlife' : 'no-star',
    estimated: true,
    note: star
      ? `The source file states no age, so ${FALLBACK_GYR} Gyr is a placeholder. Star System Explorer will estimate a better one from the primary star, or you can set it in System Settings.`
      : `No star was found, so nothing dates this system. ${FALLBACK_GYR} Gyr is a placeholder; set it in System Settings.`
  };
}
