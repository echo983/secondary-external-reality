// YJ1 decompression — ported as literally as possible from sdlpal's yj1.c
// (YJ1_Decompress), including variable names, to keep it checkable against
// the original. This is SDLPAL's own reverse-engineered reimplementation of
// the original PAL engine's proprietary compressor; the algorithm itself
// (Huffman-coded literals + LZSS back-references, per 0x4000-byte block) is
// not documented anywhere outside this kind of source, so literal fidelity
// to sdlpal's C is the only way to get it right.

interface BlockHeader {
  uncompressedLength: number;
  compressedLength: number;
  lzssRepeatTable: [number, number, number, number];
  lzssOffsetCodeLengthTable: [number, number, number, number];
  lzssRepeatCodeLengthTable: [number, number, number];
  codeCountCodeLengthTable: [number, number, number];
  codeCountTable: [number, number];
}

interface TreeNode {
  leaf: boolean;
  value: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

// Reads `count` bits (MSB-first within each little-endian 16-bit word),
// starting at absolute bit position `bitptr.value`, from `src` starting at
// `srcOffset`. Mirrors yj1_get_bits exactly, including the same 16-bit-word
// addressing scheme.
function getBits(src: Buffer, srcOffset: number, bitptr: { value: number }, count: number): number {
  const wordIndex = (bitptr.value >> 4) << 1;
  const t0 = src[srcOffset + wordIndex] ?? 0;
  const t1 = src[srcOffset + wordIndex + 1] ?? 0;
  const t2 = src[srcOffset + wordIndex + 2] ?? 0;
  const t3 = src[srcOffset + wordIndex + 3] ?? 0;
  const bptr = bitptr.value & 0xf;
  bitptr.value += count;
  if (count > 16 - bptr) {
    const spill = count + bptr - 16;
    const mask = 0xffff >> bptr;
    const hi = ((t0 | (t1 << 8)) & mask) << spill;
    const lo = (t2 | (t3 << 8)) >>> (16 - spill);
    return (hi | lo) & 0xffff;
  }
  const word = (t0 | (t1 << 8)) & 0xffff;
  return ((word << bptr) & 0xffff) >>> (16 - count);
}

function getLoop(src: Buffer, srcOffset: number, bitptr: { value: number }, header: BlockHeader): number {
  if (getBits(src, srcOffset, bitptr, 1)) return header.codeCountTable[0];
  const temp = getBits(src, srcOffset, bitptr, 2);
  if (temp) return getBits(src, srcOffset, bitptr, header.codeCountCodeLengthTable[temp - 1]!);
  return header.codeCountTable[1];
}

function getCount(src: Buffer, srcOffset: number, bitptr: { value: number }, header: BlockHeader): number {
  const temp = getBits(src, srcOffset, bitptr, 2);
  if (temp !== 0) {
    if (getBits(src, srcOffset, bitptr, 1)) return getBits(src, srcOffset, bitptr, header.lzssRepeatCodeLengthTable[temp - 1]!);
    return header.lzssRepeatTable[temp]!;
  }
  return header.lzssRepeatTable[0];
}

function readBlockHeader(src: Buffer, offset: number): BlockHeader {
  return {
    uncompressedLength: src.readUInt16LE(offset),
    compressedLength: src.readUInt16LE(offset + 2),
    lzssRepeatTable: [src.readUInt16LE(offset + 4), src.readUInt16LE(offset + 6), src.readUInt16LE(offset + 8), src.readUInt16LE(offset + 10)],
    lzssOffsetCodeLengthTable: [src[offset + 12]!, src[offset + 13]!, src[offset + 14]!, src[offset + 15]!],
    lzssRepeatCodeLengthTable: [src[offset + 16]!, src[offset + 17]!, src[offset + 18]!],
    codeCountCodeLengthTable: [src[offset + 19]!, src[offset + 20]!, src[offset + 21]!],
    codeCountTable: [src[offset + 22]!, src[offset + 23]!],
  };
}

export function yj1Decompress(source: Buffer, destSize: number): Buffer {
  if (source.readUInt32LE(0) !== 0x315f4a59) throw new Error(`bad YJ1 signature: ${source.subarray(0, 4).toString("hex")}`);
  const uncompressedLength = source.readUInt32LE(4);
  if (uncompressedLength > destSize) throw new Error(`declared uncompressed length ${uncompressedLength} exceeds destSize ${destSize}`);
  const blockCount = source.readUInt16LE(12);
  const huffmanTreeLength = source[15]!;

  const treeLen = huffmanTreeLength * 2;
  // root[0] is a synthetic root pointing at root[1]/root[2]; nodes 1..treeLen
  // are the real tree, each either a leaf (value = decompressed byte) or
  // internal (value indexes back into this same array to find its children).
  const nodes: TreeNode[] = new Array(treeLen + 1);
  const flagOffset = 16 + treeLen;
  const flagBitptr = { value: 0 };
  for (let i = 1; i <= treeLen; i += 1) {
    const leaf = getBits(source, flagOffset, flagBitptr, 1) === 0;
    const value = source[15 + i]!;
    nodes[i] = { leaf, value, left: null, right: null };
  }
  for (let i = 1; i <= treeLen; i += 1) {
    const node = nodes[i]!;
    if (!node.leaf) {
      node.left = nodes[(node.value << 1) + 1]!;
      node.right = nodes[(node.value << 1) + 2]!;
    }
  }
  // Synthetic root (index 0) always points at nodes 1/2, mirroring
  // yj1.c's root[0].left = root + 1; root[0].right = root + 2;
  nodes[0] = { leaf: false, value: 0, left: nodes[1]!, right: nodes[2]! };
  const flagBytes = ((treeLen & 0xf) ? (treeLen >> 4) + 1 : (treeLen >> 4)) << 1;
  let srcPos = 16 + treeLen + flagBytes;

  const dest = Buffer.alloc(destSize);
  let destPos = 0;

  for (let b = 0; b < blockCount; b += 1) {
    const headerPos = srcPos;
    const header = readBlockHeader(source, headerPos);
    if (header.compressedLength === 0) {
      source.copy(dest, destPos, headerPos + 4, headerPos + 4 + header.uncompressedLength);
      destPos += header.uncompressedLength;
      srcPos = headerPos + 4 + header.uncompressedLength;
      continue;
    }
    const bitstreamOffset = headerPos + 24;
    const bitptr = { value: 0 };
    for (;;) {
      let loop = getLoop(source, bitstreamOffset, bitptr, header);
      if (loop === 0) break;
      while (loop--) {
        let node = nodes[0]!;
        while (!node.leaf) node = getBits(source, bitstreamOffset, bitptr, 1) ? node.right! : node.left!;
        dest[destPos++] = node.value;
      }
      loop = getLoop(source, bitstreamOffset, bitptr, header);
      if (loop === 0) break;
      while (loop--) {
        const count = getCount(source, bitstreamOffset, bitptr, header);
        let pos = getBits(source, bitstreamOffset, bitptr, 2);
        pos = getBits(source, bitstreamOffset, bitptr, header.lzssOffsetCodeLengthTable[pos]!);
        for (let k = 0; k < count; k += 1) {
          dest[destPos] = dest[destPos - pos]!;
          destPos += 1;
        }
      }
    }
    srcPos = headerPos + header.compressedLength;
  }

  return dest;
}
