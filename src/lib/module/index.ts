// THE CONVERTER AS A MODULE: one entry point that every caller uses, this site's page included.
//
// Star System Explorer 4 and the Explorers site load this instead of keeping their own copies of the
// import and export code (owner's decision, 21 Nov 2026). Everything here is synchronous, pure and
// free of the DOM: bytes in, bytes and a report out. A file never leaves the tab that called it,
// which is the same promise the page makes.
//
//   const opened = open(file.name, bytes);
//   const { file, report } = convert(file.name, bytes, { to: 'spaceengine' });
//
// The real-sky lookup is not part of the module: it needs the network and this site's archive
// proxy, so it stays with the page.
import { ADAPTERS, countNodes } from '$lib/convert/adapters';
import { detectFormat as sniff, FORMATS } from '$lib/convert/formats';
import { OUTPUTS, writeFor } from '$lib/convert/output';
import type { System } from '$lib/vendor/types';
import {
  API_VERSION,
  type ConvertOptions,
  type ConvertResult,
  type FormatDescriptor,
  type FormatId,
  type ModuleInfo,
  type OpenedFile,
  type ReadOptions,
  type ReadResult,
  type Report,
  type SseSystem,
  type WriteOptions,
  type WrittenFile
} from './api';

export * from './api';

declare const __CONVERT_VERSION__: string;

export const info: ModuleInfo = {
  name: 'starsystem-convert',
  version: typeof __CONVERT_VERSION__ === 'string' ? __CONVERT_VERSION__ : '0.0.0-dev',
  api: API_VERSION
};

/** Every format, what it is called, and which way it goes. */
export function formats(): FormatDescriptor[] {
  return (Object.keys(FORMATS) as FormatId[]).map((id) => {
    const f = FORMATS[id];
    const out = OUTPUTS.find((o) => o.id === id);
    return {
      id,
      label: f.label,
      extensions: [...f.extensions],
      readable: id in ADAPTERS,
      writable: f.exportable && !!out,
      ...(out ? { output: { extension: out.extension, mime: out.mime, note: out.note } } : {})
    };
  });
}

/** Which format a file is, from its bytes (the name only breaks ties between zips), or null. */
export function detect(fileName: string, bytes: Uint8Array): FormatId | null {
  return sniff(fileName, bytes);
}

export class ConvertError extends Error {
  constructor(message: string, readonly code: 'unknown_format' | 'unreadable' | 'no_system' | 'not_writable') {
    super(message);
    this.name = 'ConvertError';
  }
}

/** Open a file: say what it is and what is in it, without converting anything yet. */
export function open(fileName: string, bytes: Uint8Array): OpenedFile {
  const format = sniff(fileName, bytes);
  if (!format) {
    throw new ConvertError(`${fileName} is not a format this tool reads.`, 'unknown_format');
  }
  const adapter = ADAPTERS[format];
  let systems: { name: string }[];
  let subtitle: string;
  try {
    systems = adapter.systems(bytes);
    subtitle = adapter.subtitle(bytes);
  } catch (e) {
    throw new ConvertError(`${fileName} could not be read: ${(e as Error).message}`, 'unreadable');
  }
  return {
    format,
    label: adapter.label,
    subtitle,
    systems,
    massFilter: adapter.massSlider ? { recommendedMinKg: adapter.recommendedMinMass } : null,
    bodies: (system = 0) =>
      adapter.bodies(bytes, system).map((b) => ({ name: b.name, massKg: b.mass })),
    read: (options: ReadOptions = {}): ReadResult => {
      const minMass = adapter.massSlider ? (options.minBodyMassKg ?? 0) : 0;
      let r;
      try {
        r = adapter.convert(bytes, options.system ?? 0, minMass);
      } catch (e) {
        throw new ConvertError(`That file could not be converted: ${(e as Error).message}`, 'no_system');
      }
      const report: Report = { counts: r.counts, assumptions: r.assumptions, skipped: r.skipped, losses: [] };
      return { system: r.system as unknown as SseSystem, report };
    }
  };
}

/** Write a pivot system in a format. `losses` are what that format could not hold. */
export function write(
  system: SseSystem,
  to: FormatId,
  options: WriteOptions = {}
): { file: WrittenFile; losses: string[] } {
  const target = formats().find((f) => f.id === to);
  if (!target?.writable) throw new ConvertError(`This tool cannot write ${to}.`, 'not_writable');
  const out = writeFor(to, system as unknown as System, { particlesPerRing: options.particlesPerRing ?? 0 });
  const file: WrittenFile = { fileName: out.fileName, mime: out.mime };
  if (out.text !== undefined) file.text = out.text;
  if (out.bytes !== undefined) file.bytes = out.bytes;
  return { file, losses: out.notes };
}

/** Open, read and write in one call. */
export function convert(fileName: string, bytes: Uint8Array, options: ConvertOptions): ConvertResult {
  const { system, report } = open(fileName, bytes).read(options);
  const { file, losses } = write(system, options.to, options);
  return { file, system, report: { ...report, losses } };
}

/** Counts for a system that did not come through `read` (e.g. one built from the catalogues). */
export function countBodies(system: SseSystem): Report['counts'] {
  return countNodes(system as unknown as System);
}
