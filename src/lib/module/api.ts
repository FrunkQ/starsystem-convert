// THE CONVERTER'S PUBLIC INTERFACE, as types only.
//
// This file imports nothing, on purpose: it is compiled on its own into `convert.d.ts` for whoever
// loads the module (Star System Explorer 4, the Explorers site, this site's own page), so it cannot
// lean on anything inside the vendored engine. A `System` crosses the boundary as plain JSON in the
// Star System Explorer 3 save shape, which is the pivot every conversion passes through.

/** Bumped only when a caller would have to change. Additions keep the number. */
export const API_VERSION = 1;

export type FormatId = 'ubox' | 'spaceengine' | 'sse';

export interface FormatDescriptor {
  id: FormatId;
  label: string;
  /** What a person calls the file when they go looking for it. */
  extensions: string[];
  readable: boolean;
  writable: boolean;
  /** Extension and MIME type the writer produces, when `writable`. */
  output?: { extension: string; mime: string; note: string };
}

/** A Star System Explorer 3 system, as JSON. Opaque to callers; hand it back to `write`. */
export type SseSystem = { name?: string; nodes?: unknown[] } & Record<string, unknown>;

export interface BodyPreview { name: string; massKg: number }

export interface Counts { stars: number; planets: number; moons: number; rings: number; other: number }

/** What a conversion did that a person should know about: the tool says, rather than converting quietly. */
export interface Report {
  counts: Counts;
  /** Things the reader had to assume because the source did not say. */
  assumptions: string[];
  /** Things in the source that were left behind, each with the reason. */
  skipped: { name: string; reason: string }[];
  /** Things the target format cannot hold, from the writer. Empty until `write`. */
  losses: string[];
}

export interface OpenedFile {
  format: FormatId;
  label: string;
  /** A line about the file as a whole, e.g. "campaign, 4 systems". May be empty. */
  subtitle: string;
  /** The systems in the file; most formats hold one. */
  systems: { name: string }[];
  /** Present when a mass cut-off means something for this format (not for a curated save). */
  massFilter: { recommendedMinKg: number } | null;
  /** Bodies of one system, heaviest first, for a preview or a mass slider. */
  bodies(system?: number): BodyPreview[];
  /** Read one system into the pivot. */
  read(options?: ReadOptions): ReadResult;
}

export interface ReadOptions {
  /** Which system in the file, from `systems`. Default 0. */
  system?: number;
  /** Bodies lighter than this are left out. Ignored where `massFilter` is null. Default: none. */
  minBodyMassKg?: number;
}

export interface ReadResult { system: SseSystem; report: Report }

export interface WriteOptions {
  /** Universe Sandbox only: how many bodies stand in for each ring. 0 (the default) writes no rings. */
  particlesPerRing?: number;
}

export interface WrittenFile {
  fileName: string;
  mime: string;
  /** Exactly one of `text` and `bytes` is set. */
  text?: string;
  bytes?: Uint8Array;
}

export interface ConvertOptions extends ReadOptions, WriteOptions { to: FormatId }

export interface ConvertResult { file: WrittenFile; system: SseSystem; report: Report }

export interface ModuleInfo {
  name: 'starsystem-convert';
  /** The release, from package.json. */
  version: string;
  api: number;
}
