// THERE ARE NO CONSTRUCTS HERE, so the two functions that place them answer accordingly.
//
// `computeWorldStates3D` — the whole reason the Universe Sandbox exporter can exist, since it turns
// a tree of orbits into the absolute positions and velocities that format needs — asks
// `constructs/docking` where a docked ship sits relative to its structure. That module reaches the
// mega-construct catalogue and its geometry, which imports **three.js**: a 3D rendering library, in a
// tool that converts text files.
//
// It is not needed, and not because it was awkward. A conversion carries stars, planets, moons,
// rings and belts; ships, stations and anything docked to one have no representation in a `.ubox` or
// a `.sc` and are reported as left behind. So the construct branch of that walk is unreachable here,
// and these are the answers it would give if it ran: `effectiveAttachment` returns null for anything
// without an `attachedTo` or a ladder docking mode, and `attachedOffsetAu` returns null without a
// mega-type definition. Nothing is stubbed away that a converted system could contain.
//
// If constructs ever DO need to travel — they would need a home in the target format first — this is
// the file to delete, and `constructs/docking` comes back through the vendor script's normal walk.

// The return types are deliberately the NULLABLE shapes, not the literal `null` these always give.
// Typed as `null`, the compiler narrows the caller's `att` to `never` inside the branch that handles
// an attachment and then rejects the engine's own code for reading `.id` off it — a stub whose
// honesty about always returning null made the file it was standing in for fail to compile.
interface Attachment { id: string; level?: string }
interface Vec3 { x: number; y: number; z: number }

/** A docked construct's attachment, or null. Always null here: there are no constructs. */
export function effectiveAttachment(_node: unknown): Attachment | null {
  return null;
}

/** Where a docked construct sits relative to its structure, or null. Always null here. */
export function attachedOffsetAu(
  _att: Attachment, _structure: unknown, _host: unknown, _timeMs: number, _system?: unknown
): Vec3 | null {
  return null;
}
