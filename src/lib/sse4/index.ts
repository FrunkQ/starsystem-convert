// WHAT STAR SYSTEM EXPLORER 4 WILL MAKE OF A SYSTEM, from SSE4's own importer.
//
// SSE4 reads V3 saves through one importer in its kernel, and that importer is vendored here as
// wasm (see README.md), so there is still only one implementation. The file SSE4 opens is the V3
// save this tool already writes; what the importer adds is the honest account of it: which values
// V4 keeps as authored, which it works out again and how far its answer is from V3's, which fields it
// does not know, and which bodies carry an impossible-but-authored mark.
//
// Loaded lazily: the wasm is about 700 KB, and nobody who never asks about SSE4 should pay for it.
import { initSync, import_v3, importer_version } from './vendor/sse_convert_wasm.js';
import wasmDataUrl from './vendor/sse_convert_wasm_bg.wasm?inline';
import pinText from './vendor/PIN?raw';

let ready = false;
function init() {
  if (ready) return;
  const b64 = wasmDataUrl.slice(wasmDataUrl.indexOf(',') + 1);
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  initSync({ module: bytes });
  ready = true;
}

export interface Sse4Pin { sse4Commit: string; importer: string; reportFormat: string }

export function pin(): Sse4Pin {
  init();
  const v = JSON.parse(importer_version()) as { importer: string; report_format: string };
  const commit = pinText.match(/^sse4_commit\s+(\S+)/m)?.[1] ?? 'unknown';
  return { sse4Commit: commit, importer: v.importer, reportFormat: v.report_format };
}

/** The importer's own report, as SSE4 writes it (format `sse.v3-import-report/1`). */
export interface ImporterReport {
  format: string;
  importer_version: string;
  source_kind: 'starmap' | 'system';
  counts: { systems: number; bodies: number; barycentres: number; constructs: number; facts: number };
  differences: { address: string; name: string; field: string; v3: number; v4: number; relative: number; tolerance: number; within: boolean; via: string }[];
  derived_not_compared: Record<string, number>;
  presentation: Record<string, number>;
  dropped: Record<string, number>;
  unclassified: Record<string, number>;
  honesty_marks: string[];
  warnings: string[];
  state_hash: string;
}

export interface Sse4Import {
  universe: string;
  facts: Record<string, Record<string, { value: unknown; evidence: string }>>;
  report: ImporterReport;
}

/** Run SSE4's importer on V3 save text. Throws with the importer's own words when it refuses. */
export function importV3(saveText: string, universeId = 'convert'): Sse4Import {
  init();
  const out = JSON.parse(import_v3(saveText, universeId)) as Sse4Import | { error: string };
  if ('error' in out) throw new Error(out.error);
  return out;
}
