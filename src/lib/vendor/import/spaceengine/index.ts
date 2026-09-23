// VENDORED from Star System Explorer, src/lib/import/spaceengine/index.ts — copied on 2026-09-23.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
// SpaceEngine (.sc / .pak) import — public API. Mirrors the ubox importer's shape.
import { readScSources } from './parse';
import { convertSc, previewSc as previewScSources, SE_RECOMMENDED_MIN_MASS_KG } from './convert';
import { ScError } from './parse';
import type { ScImportOptions, ScImportResult, ScBodyPreview } from './convert';

export { ScError } from './parse';
export { SE_RECOMMENDED_MIN_MASS_KG } from './convert';
export { buildImportReview, reviewToText } from '../shared/review';
export type { ScImportOptions, ScImportResult, ScBodyPreview } from './convert';
export type { ImportReview, ReviewRow, ReviewBucket } from '../shared/review';

export interface ScPreview { name: string; bodies: ScBodyPreview[] }

/** Cheap pre-scan for the mass slider. */
export function previewSc(bytes: Uint8Array): ScPreview {
  const sources = readScSources(bytes);
  return previewScSources(sources);
}

/** Convert a .sc file or .pak archive into an UNPROCESSED authored-inputs SSG system + audit snapshot. */
export function importSc(bytes: Uint8Array, options: ScImportOptions = {}): ScImportResult {
  const sources = readScSources(bytes);
  const result = convertSc(sources, options);
  if (!result.system.nodes.length) {
    throw new ScError('no-bodies', 'That SpaceEngine file produced no importable bodies (try lowering the mass threshold).');
  }
  return result;
}
