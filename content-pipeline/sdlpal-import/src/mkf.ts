// MKF archive container reader — ported from sdlpal's palcommon.c
// (PAL_MKFGetChunkCount / PAL_MKFGetChunkSize / PAL_MKFReadChunk).
//
// Format: the file starts with a little-endian uint32 giving the total
// header size in bytes, which is 4 * (chunkCount + 1) — one uint32 offset
// per chunk, plus one trailing offset used only to compute the last chunk's
// size. Chunk N's raw (possibly still YJ1/YJ2-compressed) bytes span
// [offset[N], offset[N+1]) in the file.

import { readFileSync } from "node:fs";

export class MkfArchive {
  private readonly buffer: Buffer;
  private readonly offsets: number[];

  constructor(path: string) {
    this.buffer = readFileSync(path);
    const headerSize = this.buffer.readUInt32LE(0);
    const chunkCount = (headerSize - 4) >> 2;
    this.offsets = [];
    for (let i = 0; i <= chunkCount; i += 1) {
      this.offsets.push(this.buffer.readUInt32LE(i * 4));
    }
  }

  get chunkCount(): number {
    return this.offsets.length - 1;
  }

  chunkSize(chunkNum: number): number {
    if (chunkNum < 0 || chunkNum >= this.chunkCount) return -1;
    return this.offsets[chunkNum + 1]! - this.offsets[chunkNum]!;
  }

  readChunkRaw(chunkNum: number): Buffer {
    const size = this.chunkSize(chunkNum);
    if (size < 0) throw new Error(`chunk ${chunkNum} does not exist (archive has ${this.chunkCount} chunks)`);
    const start = this.offsets[chunkNum]!;
    return this.buffer.subarray(start, start + size);
  }
}
