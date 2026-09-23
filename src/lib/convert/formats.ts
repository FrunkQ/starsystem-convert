// WHICH FORMAT IS THIS FILE — decided by looking inside it, not by trusting its name.
//
// The engine's own rule, worth carrying over verbatim: "`sniffBundle` decides by the zip magic number,
// never by the file extension — a renamed file still loads correctly." People rename saves, mail them,
// and unzip-and-rezip them; an extension is a hint from a human and the bytes are the evidence. The
// extension is still consulted, but only to break a tie the bytes genuinely cannot settle — a `.ubox`
// and a `.pak` are both zips, and telling them apart needs the member names.

export type FormatId = 'ubox' | 'spaceengine' | 'sse';

export interface FormatInfo {
  label: string;
  /** What a person calls the file when they go looking for it. */
  extensions: string[];
  /** True when this format can be WRITTEN as well as read. SIMBAD, when it lands, will be false. */
  exportable: boolean;
}

export const FORMATS: Record<FormatId, FormatInfo> = {
  ubox: { label: 'Universe Sandbox', extensions: ['.ubox'], exportable: true },
  spaceengine: { label: 'SpaceEngine', extensions: ['.sc', '.pak'], exportable: true },
  sse: { label: 'Star System Explorer', extensions: ['.json', '.sse.zip'], exportable: true }
};

/** PK\x03\x04 — the local file header every zip starts with. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// The SpaceEngine script sniffer. `StarBarycenter` belongs on this list AND in the parser's block
// keywords — it was on the engine's sniffer and missing from its parser, which is how every binary
// written by the community US2-to-SE converter imported as two stars stacked at the origin.
const SC_OPENER =
  /^\s*(\/\/|Star|StarBarycenter|Barycenter|Planet|DwarfPlanet|Planemo|Moon|DwarfMoon|Asteroid|Comet|Structure|LogLevel|Remove)/m;

const lower = (s: string) => s.toLowerCase();

/**
 * Identify a dropped file, or null when it is none of ours.
 *
 * Text first, because text is unambiguous: a `.sc` announces itself with a body keyword and a save is
 * JSON. Only zips need the filename, and only to choose between three archive formats that are
 * otherwise structurally similar.
 */
export function detectFormat(fileName: string, bytes: Uint8Array): FormatId | null {
  const name = lower(fileName);

  if (isZip(bytes)) {
    if (name.endsWith('.ubox')) return 'ubox';
    if (name.endsWith('.pak')) return 'spaceengine';
    if (name.endsWith('.zip')) return 'sse';
    return null;
  }

  // Not an archive, so it is text. Decode only the head: a starmap can be tens of megabytes and the
  // answer is always in the first few hundred bytes.
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096));
  const trimmed = head.replace(/^﻿/, '').trimStart();

  if (trimmed.startsWith('{')) return 'sse';
  if (SC_OPENER.test(trimmed)) return 'spaceengine';
  return null;
}
