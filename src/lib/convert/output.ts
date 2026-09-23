// WRITING THE RESULT OUT — all three targets.
//
// Star System Explorer's own `.json` is the simplest, because the pivot IS an SSE system: writing it
// is stamping it and handing it over. The other two are real exporters, vendored from the engine
// beside the readers they invert.
import type { System } from '$lib/vendor/types';
import { exportSc } from '$lib/vendor/export/spaceengine/write';
import { exportUbox } from '$lib/vendor/export/ubox/write';
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
  mime: string;
  /** What a person should know before they open the result in that program. */
  note: string;
}

export const OUTPUTS: OutputTarget[] = [
  {
    id: 'sse', label: 'Star System Explorer', extension: '.json', mime: 'application/json',
    note: 'Open it from the file menu, or drop it onto the map. The Explorer works out temperatures, climate and classification for itself once it arrives.'
  },
  {
    id: 'spaceengine', label: 'SpaceEngine', extension: '.sc', mime: 'text/plain',
    note: 'Put it in SpaceEngine’s addon catalogue folder, then restart SpaceEngine so it reads the catalogue again.'
  },
  {
    id: 'ubox', label: 'Universe Sandbox', extension: '.ubox', mime: 'application/zip',
    note: 'Open it from Universe Sandbox’s Home menu. The snapshot is one instant — Universe Sandbox has no orbits, only positions and velocities — so the simulation takes it from there.'
  }
];

/** What a conversion could not carry into a given format, so the page can say so before the download. */
export interface WrittenFile { text?: string; bytes?: Uint8Array; fileName: string; mime: string; notes: string[] }

/**
 * Write a system in the chosen format. `particlesPerRing` only means anything for Universe Sandbox,
 * which has no ring object: a ring there is a cloud of individual bodies, so it is a choice between
 * no rings and a few hundred more objects.
 */
export function writeFor(id: FormatId, system: System, opts: { particlesPerRing?: number } = {}): WrittenFile {
  const target = OUTPUTS.find((o) => o.id === id)!;
  const fileName = fileNameFor(system, target.extension);
  if (id === 'sse') return { text: toSseJson(system), fileName, mime: target.mime, notes: [] };
  if (id === 'spaceengine') {
    const out = exportSc(system);
    return { text: out.text, fileName, mime: target.mime, notes: out.notes };
  }
  const out = exportUbox(system, { particlesPerRing: opts.particlesPerRing ?? 0 });
  return { bytes: out.bytes, fileName, mime: target.mime, notes: out.notes };
}

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
export function download(body: string | Uint8Array, fileName: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([body as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
