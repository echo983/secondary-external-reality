// EventObject extraction — ported from sdlpal's global.h EVENTOBJECT struct
// and global.c's loading code.
//
// SSS.MKF chunk 0 holds a flat array of EVENTOBJECT records, RAW (not YJ1
// compressed — global.c reads it with PAL_MKFReadChunk/LOAD_DATA, never
// PAL_MKFDecompressChunk). Every field is a 2-byte little-endian integer, 16
// fields per record = 32 bytes, record count = chunk size / 32.
//
// This only decodes the struct faithfully. It deliberately does NOT resolve
// wTriggerScript/wAutoScript into script content — those index into
// SCRIPTENTRY bytecode (SSS.MKF chunk 4), which this project is not parsing
// or reusing (docs/VISION-first-experience-instance-v1.0.md §3,
// FORMAT-NOTES.md). The two fields are kept on the decoded record only as
// raw numbers, for debugging/completeness — a later .pack conversion step
// should drop them and keep only position/sprite/trigger-mode/state.

import { MkfArchive } from "./mkf.ts";

export const EVENT_OBJECT_SIZE = 32;

export interface EventObject {
  index: number;
  vanishTime: number;
  x: number;
  y: number;
  layer: number;
  triggerScript: number; // raw script entry number — NOT resolved, NOT reused
  autoScript: number; // raw script entry number — NOT resolved, NOT reused
  state: number; // 0 = hidden, 1 = normal, 2 = blocker (OBJECTSTATE)
  triggerMode: number; // TRIGGERMODE enum: 0 none, 1-3 search near/normal/far, 4-8 touch near..farthest
  spriteNum: number;
  spriteFrames: number;
  direction: number;
  currentFrameNum: number;
}

function readEventObject(buf: Buffer, offset: number, index: number): EventObject {
  return {
    index,
    vanishTime: buf.readInt16LE(offset + 0),
    x: buf.readUInt16LE(offset + 2),
    y: buf.readUInt16LE(offset + 4),
    layer: buf.readInt16LE(offset + 6),
    triggerScript: buf.readUInt16LE(offset + 8),
    autoScript: buf.readUInt16LE(offset + 10),
    state: buf.readInt16LE(offset + 12),
    triggerMode: buf.readUInt16LE(offset + 14),
    spriteNum: buf.readUInt16LE(offset + 16),
    spriteFrames: buf.readUInt16LE(offset + 18),
    direction: buf.readUInt16LE(offset + 20),
    currentFrameNum: buf.readUInt16LE(offset + 22),
    // Remaining fields (nScriptIdleFrame, wSpritePtrOffset, nSpriteFramesAuto,
    // wScriptIdleFrameCountAuto — offsets 24/26/28/30) are runtime/animation
    // bookkeeping per global.h, not placement data; not decoded here.
  };
}

export function extractEventObjects(sssPath: string): EventObject[] {
  const archive = new MkfArchive(sssPath);
  const chunk = archive.readChunkRaw(0);
  const count = Math.floor(chunk.length / EVENT_OBJECT_SIZE);
  const objects: EventObject[] = [];
  for (let i = 0; i < count; i += 1) {
    objects.push(readEventObject(chunk, i * EVENT_OBJECT_SIZE, i));
  }
  return objects;
}

export const OBJECT_STATE_NAMES: Record<number, string> = { 0: "hidden", 1: "normal", 2: "blocker" };
export const TRIGGER_MODE_NAMES: Record<number, string> = {
  0: "none", 1: "search_near", 2: "search_normal", 3: "search_far",
  4: "touch_near", 5: "touch_normal", 6: "touch_far", 7: "touch_farther", 8: "touch_farthest",
};
