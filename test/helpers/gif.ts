import assert from 'node:assert/strict';

/*
 * Reading the bot's own GIFs back in tests: a plain GIF89a decoder written from the spec, apart
 * from the encoder in src/animations/images/gif.ts, so a mistake in one isn't hidden by the other.
 * It only understands what the encoder writes (a global palette, no interlace), and draws each
 * frame over the one before (disposal 1), as a viewer does, so `frames` are the full pictures seen.
 */

export interface ReadGif {
  width: number;
  height: number;
  /** How many times it plays: 1 when there is no NETSCAPE2.0 block, 0 for forever. */
  plays: number;
  /** Each picture as seen (drawn over the one before), and the rectangle the file stored for it. */
  frames: { delayMs: number; rgb: Uint8Array; stored: { left: number; top: number; width: number; height: number } }[];
}

function unlzw(data: Uint8Array, minCodeSize: number, pixels: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = new Uint8Array(pixels);
  let written = 0;
  let codeSize = minCodeSize + 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clearCode; i++) table.push([i]);
    table.push([], []);
    codeSize = minCodeSize + 1;
  };
  reset();
  let previous: number[] | null = null;
  let bitPos = 0;
  const read = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++, bitPos++) {
      const byte = data[bitPos >> 3];
      assert.ok(byte !== undefined, 'LZW data ended before the end code');
      code |= ((byte >> (bitPos & 7)) & 1) << i;
    }
    return code;
  };
  for (;;) {
    const code = read();
    if (code === clearCode) {
      reset();
      previous = null;
      continue;
    }
    if (code === endCode) break;
    let entry: number[];
    if (code < table.length) entry = table[code] as number[];
    else {
      // The one code that isn't in the table yet: the previous entry plus its own first value.
      if (previous === null || code !== table.length) throw new assert.AssertionError({ message: `bad LZW code ${code}` });
      entry = [...previous, previous[0] as number];
    }
    for (const v of entry) out[written++] = v;
    if (previous && table.length < 4096) {
      table.push([...previous, entry[0] as number]);
      if (table.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = entry;
  }
  assert.equal(written, pixels, 'every pixel decoded');
  return out;
}

export function readGif(gif: Uint8Array): ReadGif {
  const bytes = Buffer.from(gif.buffer, gif.byteOffset, gif.byteLength);
  assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a', 'GIF signature');
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  const packed = bytes[10] as number;
  assert.ok(packed & 0x80, 'has a global palette');
  const paletteSize = 2 << (packed & 7);
  const palette = bytes.subarray(13, 13 + paletteSize * 3);
  let at = 13 + paletteSize * 3;
  let plays = 1;
  let delayMs = 0;
  let transparent: number | null = null;
  const frames: ReadGif['frames'] = [];
  let screen = new Uint8Array(width * height * 3);
  for (;;) {
    const kind = bytes[at++];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = bytes[at++];
      if (label === 0xf9) {
        const flags = bytes[at + 1] as number;
        assert.equal((flags >> 2) & 7, 1, 'disposal 1: frames are drawn over the one before');
        delayMs = bytes.readUInt16LE(at + 2) * 10;
        transparent = flags & 1 ? (bytes[at + 4] as number) : null;
      }
      if (label === 0xff && bytes.subarray(at + 1, at + 12).toString('ascii') === 'NETSCAPE2.0') {
        const repeats = bytes.readUInt16LE(at + 14);
        plays = repeats === 0 ? 0 : repeats + 1;
      }
      while (bytes[at] !== 0) at += (bytes[at] as number) + 1;
      at++;
      continue;
    }
    assert.equal(kind, 0x2c, `unexpected block 0x${kind?.toString(16)}`);
    const left = bytes.readUInt16LE(at);
    const top = bytes.readUInt16LE(at + 2);
    const w = bytes.readUInt16LE(at + 4);
    const h = bytes.readUInt16LE(at + 6);
    assert.ok(w > 0 && h > 0 && left + w <= width && top + h <= height, 'frame fits on the screen');
    if (frames.length === 0) assert.deepEqual([left, top, w, h], [0, 0, width, height], 'the first frame covers the whole screen');
    assert.equal(bytes[at + 8], 0, 'no local palette, no interlace');
    at += 9;
    const minCodeSize = bytes[at++] as number;
    const parts: Buffer[] = [];
    while (bytes[at] !== 0) {
      const size = bytes[at] as number;
      parts.push(bytes.subarray(at + 1, at + 1 + size));
      at += size + 1;
    }
    at++;
    const indices = unlzw(Buffer.concat(parts), minCodeSize, w * h);
    const rgb = screen.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = indices[y * w + x] as number;
        if (index === transparent) continue;
        rgb.set(palette.subarray(index * 3, index * 3 + 3), ((top + y) * width + left + x) * 3);
      }
    }
    screen = rgb;
    frames.push({ delayMs, rgb, stored: { left, top, width: w, height: h } });
  }
  return { width, height, plays, frames };
}

/** The RGB of one pixel of a frame. */
export const gifPixel = (gif: ReadGif, frame: number, x: number, y: number): number[] => {
  const at = (y * gif.width + x) * 3;
  return [...(gif.frames[frame] as ReadGif['frames'][number]).rgb.subarray(at, at + 3)];
};
