// WRITING THE RESULT OUT.
//
// Three targets are planned and one exists. Star System Explorer's own `.json` is the one that works,
// because the pivot IS an SSE system — writing it is stamping it and handing it over. Universe
// Sandbox and SpaceEngine need real exporters (state vectors and a zip container for the first, a
// back-to-front `.sc` writer for the second); they are declared here as unavailable rather than
// hidden, so the page can offer them greyed with a reason instead of pretending the tool is smaller
// than it is going to be.
import type { System } from '$lib/vendor/types';
import type { FormatId } from './formats';

/**
 * The container-format stamp the engine puts on every save it writes, and the reason it exists in its
 * words: `provenance.appVersion` is a BUILD stamp, so v3.0.1 and v3.9.0 may have identical or
 * incompatible layouts and nothing says which. This integer says which. A reader meeting a HIGHER
 * number should refuse politely rather than parse what it does not understand.
 *
 * Keep it in step with `BUNDLE_FORMAT` in the engine's `src/lib/io/bundle.ts`.
 */
export const BUNDLE_FORMAT = 1;

export interface OutputTarget {
  id: FormatId;
  label: string;
  extension: string;
  available: boolean;
  /** Shown when `available` is false — why not, in words a person can act on. */
  note?: string;
}

export const OUTPUTS: OutputTarget[] = [
  { id: 'sse', label: 'Star System Explorer', extension: '.json', available: true },
  {
    id: 'ubox', label: 'Universe Sandbox', extension: '.ubox', available: false,
    note: 'Being built. Universe Sandbox has no orbits — every body is a position and a velocity — so this one has to turn the whole system back into state vectors.'
  },
  {
    id: 'spaceengine', label: 'SpaceEngine', extension: '.sc', available: false,
    note: 'Being built. Close to a straight reversal of the import, with the catch that SpaceEngine matches parents by NAME, so every body has to end up uniquely named first.'
  }
];

/**
 * The engine's `plainSaveJson`: the stamp goes on FIRST, so a reader — or a person with a text
 * editor — meets it before a megabyte of nodes rather than hunting for it at the end. Any inherited
 * stamp is dropped before the current one goes on, so a document that came out of an old file cannot
 * carry an old claim into a new one.
 */
export function toSseJson(system: System): string {
  const { bundleFormat: _inherited, ...rest } = system as unknown as Record<string, unknown>;
  return JSON.stringify({ bundleFormat: BUNDLE_FORMAT, ...rest }, null, 2);
}

/** A filename a person can find again: the system's own name, made safe, never empty. */
export function fileNameFor(system: System, extension: string): string {
  const base = (system.name ?? '').trim().replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '_').slice(0, 60);
  return `${base || 'system'}${extension}`;
}

/** Hand the browser a file. Revoked on the next tick — a leaked object URL pins the whole blob. */
export function download(text: string, fileName: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
