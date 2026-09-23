// VENDORED from Star System Explorer, src/lib/rendering/colorModeStore.ts — copied on 2026-09-23.
// DO NOT EDIT HERE without making the same change in the engine: this file has a twin, and the
// two drifting apart is the known cost of the copy. Re-copy with scripts/vendor.mjs; the import
// paths and that script's declared substitutions are the only intended differences.
import { writable } from 'svelte/store';

// Orrery colour mode: true = each body's derived apparent (real) colour; false = the broad
// 4-colour-per-class swatches (quick type read). Toggled from the orrery View controls.
const KEY = 'sse-true-color';
const initial = typeof window !== 'undefined' ? localStorage.getItem(KEY) !== '0' : true; // default: true colour
export const trueColorMode = writable<boolean>(initial);
if (typeof window !== 'undefined') {
  trueColorMode.subscribe((v) => localStorage.setItem(KEY, v ? '1' : '0'));
}
