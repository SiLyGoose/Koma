import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { crc32, PNG_SIGNATURE } from '../../src/animations/images/png.js';

/*
 * Reading the bot's own PNGs back in tests. This is stricter than the bot's decoder
 * (src/animations/images/png-decode.ts) on purpose: it checks that our encoder writes exactly what
 * it should (every checksum right, 8-bit RGBA, no filtering), where the bot's decoder accepts any PNG.
 */

export interface ReadPng {
  width: number;
  height: number;
  /** 8-bit RGBA, row after row. */
  pixels: Uint8Array;
  /** The chunk types in file order, like ["IHDR", "IDAT", "IEND"]. */
  chunks: string[];
}

const asBuffer = (png: Uint8Array): Buffer => Buffer.from(png.buffer, png.byteOffset, png.byteLength);

/** The width and height from a PNG's header (and a check of its signature). */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const bytes = asBuffer(png);
  assert.deepEqual([...bytes.subarray(0, 8)], PNG_SIGNATURE, 'PNG signature');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Reads a PNG made by our encoder apart: its chunks (with their checksums checked) and its pixels. */
export function readPng(png: Uint8Array): ReadPng {
  const bytes = asBuffer(png);
  assert.deepEqual([...bytes.subarray(0, 8)], PNG_SIGNATURE, 'PNG signature');
  const chunks: string[] = [];
  const data: Buffer[] = [];
  let width = 0;
  let height = 0;
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('ascii');
    const body = bytes.subarray(at + 8, at + 8 + length);
    assert.equal(bytes.readUInt32BE(at + 8 + length), crc32(bytes.subarray(at + 4, at + 8 + length)), `${type} checksum`);
    chunks.push(type);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.equal(body[8], 8, 'bit depth');
      assert.equal(body[9], 6, 'RGBA');
    }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  assert.equal(raw.length, (width * 4 + 1) * height);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width * 4 + 1)], 0, 'filter type 0');
    raw.copy(pixels, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  }
  return { width, height, pixels, chunks };
}

/** The RGBA of one pixel of a read PNG. */
export const pixelAt = (img: { width: number; pixels: Uint8Array }, x: number, y: number): number[] => {
  const at = (y * img.width + x) * 4;
  return [...img.pixels.subarray(at, at + 4)];
};
