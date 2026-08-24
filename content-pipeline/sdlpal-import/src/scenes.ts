// Scene table extraction — ported from sdlpal's global.h SCENE struct.
//
// SSS.MKF chunk 1 holds a fixed-size array of SCENE records, RAW (confirmed
// in global.c's PAL_LoadDefaultGame: read via plain PAL_MKFReadChunk, no
// decompression). 4 fields x 2 bytes little-endian = 8 bytes per record.
//
// wEventObjectIndex is NOT a per-scene count — scene.c uses it as a prefix-
// sum boundary: scene i (1-indexed) owns event objects in the half-open
// range [rgScene[i-1].wEventObjectIndex, rgScene[i].wEventObjectIndex).
// Index 0 is a sentinel with no real scene of its own; it only supplies the
// starting boundary (0) for scene 1.

import { MkfArchive } from "./mkf.ts";

export const SCENE_SIZE = 8;

export interface Scene {
  index: number; // position in rgScene — scene NUMBER used elsewhere is this same index
  mapNum: number;
  scriptOnEnter: number; // raw script entry number — NOT resolved, NOT reused
  scriptOnTeleport: number; // raw script entry number — NOT resolved, NOT reused
  eventObjectIndex: number; // prefix-sum boundary, see module comment — not a count
}

function readScene(buf: Buffer, offset: number, index: number): Scene {
  return {
    index,
    mapNum: buf.readUInt16LE(offset + 0),
    scriptOnEnter: buf.readUInt16LE(offset + 2),
    scriptOnTeleport: buf.readUInt16LE(offset + 4),
    eventObjectIndex: buf.readUInt16LE(offset + 6),
  };
}

export function extractScenes(sssPath: string): Scene[] {
  const archive = new MkfArchive(sssPath);
  const chunk = archive.readChunkRaw(1);
  const count = Math.floor(chunk.length / SCENE_SIZE);
  const scenes: Scene[] = [];
  for (let i = 0; i < count; i += 1) {
    scenes.push(readScene(chunk, i * SCENE_SIZE, i));
  }
  return scenes;
}

/** Half-open [start, end) event-object index range owned by scene number `sceneNumber` (1-indexed, matching scene.c's wNumScene convention). */
export function eventObjectRangeForScene(scenes: readonly Scene[], sceneNumber: number): { start: number; end: number } {
  if (sceneNumber < 1 || sceneNumber >= scenes.length) throw new Error(`scene number ${sceneNumber} out of range (1..${scenes.length - 1})`);
  return { start: scenes[sceneNumber - 1]!.eventObjectIndex, end: scenes[sceneNumber]!.eventObjectIndex };
}
