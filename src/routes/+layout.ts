// EVERY PAGE IS PRERENDERED, AND A SAVE FILE NEVER REACHES A SERVER. The parsing, the conversion and
// the download all happen client-side: that is a privacy promise as much as an architecture. There is
// exactly ONE server route - `api/realsky-tap`, which asks the NASA Exoplanet Archive about planets
// because the archive sends no CORS headers - and it accepts a catalogue query and nothing else. Keep
// it that way: nothing a person drops onto this page has any route to leave it.
export const prerender = true;
export const ssr = true;
