import { describe, it, expect } from 'vitest';
import { detectFormat, isZip } from './formats';

const text = (s: string) => new TextEncoder().encode(s);
const zip = (name = 'x') => {
  // A minimal PK\x03\x04 header is all the sniffer reads; the rest is never parsed here.
  const head = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  return head;
};

describe('detectFormat', () => {
  it('reads a .sc by its opening keyword, whatever it is called', () => {
    const sc = text('// SolarSys\nStar "Sun/Sol"\n{\n\tClass "G2V"\n}\n');
    expect(detectFormat('SolarSys.sc', sc)).toBe('spaceengine');
    // The extension is a hint from a human; the bytes are the evidence.
    expect(detectFormat('renamed-by-a-friend.txt', sc)).toBe('spaceengine');
  });

  it('recognises a .sc whose first block is a StarBarycenter', () => {
    // The keyword the engine's own parser was missing — a file from the community US2-to-SE
    // converter opens exactly like this, and every one of them starts with the barycentre.
    const sc = text('StarBarycenter "Alpha Test"\n{\n}\n');
    expect(detectFormat('binary.sc', sc)).toBe('spaceengine');
  });

  it('reads an SSE save as JSON regardless of name, BOM and all', () => {
    const save = text('﻿{\n  "bundleFormat": 1,\n  "name": "Regina"\n}');
    expect(detectFormat('Regina-System.json', save)).toBe('sse');
    expect(detectFormat('no-extension', save)).toBe('sse');
  });

  it('separates the three archive formats by name, since all three are zips', () => {
    expect(detectFormat('Solar System.ubox', zip())).toBe('ubox');
    expect(detectFormat('addon.pak', zip())).toBe('spaceengine');
    expect(detectFormat('campaign.sse.zip', zip())).toBe('sse');
  });

  it('refuses what it cannot read rather than guessing', () => {
    expect(detectFormat('holiday.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(detectFormat('notes.txt', text('just some words'))).toBeNull();
    // A zip it has no name for is refused: silently picking one would be the DwarfPlanet mistake,
    // where an unrecognised thing was taken for something it was not.
    expect(detectFormat('mystery', zip())).toBeNull();
  });
});

describe('isZip', () => {
  it('reads the local-file-header magic, not the extension', () => {
    expect(isZip(zip())).toBe(true);
    expect(isZip(text('Star "Sun" {}'))).toBe(false);
    expect(isZip(new Uint8Array([0x50, 0x4b]))).toBe(false); // too short to be anything
  });
});
