/*
 * A small animated-GIF writer, so the bot needs no image library (like png.ts for still pictures).
 * Discord plays a GIF in an embed smoothly, which a message edited once a second can't.
 *
 * A GIF has at most 256 colours, so the frames are reduced to one shared palette first: shared
 * across the whole animation so a still background doesn't flicker between frames. The palette is
 * picked by median cut (split the colour space where the most pixels are), and an ordered dither
 * spreads the rounding over neighbouring pixels so soft glows don't turn into visible bands.
 * https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 */

/** One picture of the animation: 8-bit RGBA (alpha is ignored), and how long it shows. */
export interface GifFrame {
  rgba: Uint8Array;
  delayMs: number;
}

export interface GifOptions {
  /** Spread rounding over neighbouring pixels (on by default). Off keeps flat colours exact. */
  dither?: boolean;
  /** How many times to play: 1 plays once and stays on the last frame (default), 0 loops forever. */
  plays?: number;
}

/** 4 by 4 ordered-dither thresholds, 0 to 15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Colours are sorted into 32 levels a channel (15 bits in all) before the palette is picked. */
const BITS = 5;
const LEVELS = 1 << BITS;
const STEP = 256 / LEVELS;

/** One channel value, with the dither offset added, as one of LEVELS levels. */
const levelOf = (value: number, offset: number): number => {
  const level = Math.floor((value + offset) / STEP);
  return level < 0 ? 0 : level >= LEVELS ? LEVELS - 1 : level;
};

/** The 15-bit bin of the pixel at `i` (an RGBA offset) at (x, y), with the dither offset added. */
function binOf(rgba: Uint8Array, i: number, x: number, y: number, dither: boolean): number {
  const offset = dither ? ((BAYER[(y & 3) * 4 + (x & 3)] as number) / 16 - 0.5) * STEP : 0;
  return (levelOf(rgba[i] as number, offset) << (BITS * 2)) | (levelOf(rgba[i + 1] as number, offset) << BITS) | levelOf(rgba[i + 2] as number, offset);
}

/** A byte buffer that grows as it is written to. */
class Bytes {
  private data = new Uint8Array(1 << 16);
  length = 0;

  push(byte: number): void {
    if (this.length === this.data.length) {
      const bigger = new Uint8Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data[this.length++] = byte;
  }

  pushAll(bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) this.push(bytes[i] as number);
  }

  setAt(at: number, byte: number): void {
    this.data[at] = byte;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.data.buffer, 0, this.length);
  }
}

/**
 * The LZW code table, as flat arrays: the code for "prefix code, then index k" is at
 * prefix * 256 + k, and only counts if its generation is the current one, so starting the table
 * over is one number going up instead of clearing a million entries. Made once and reused.
 */
const LZW_SLOTS = 4096 * 256;
let lzwCodes: Int16Array | null = null;
let lzwGeneration: Int32Array | null = null;
let generation = 0;

const channelOf = (bin: number, channel: number): number => (bin >> (BITS * (2 - channel))) & (LEVELS - 1);

/**
 * Picks up to 256 colours for the pixels counted in `counts` (one entry per 15-bit bin, with the
 * real colours of those pixels added up in `sums`, three per bin) by median cut, and returns the
 * palette plus which palette entry each bin maps to.
 */
function medianCut(counts: Uint32Array, sums: Float64Array): { palette: Uint8Array; lookup: Uint8Array } {
  const used: number[] = [];
  for (let bin = 0; bin < counts.length; bin++) if ((counts[bin] as number) > 0) used.push(bin);

  const boxes: number[][] = [used];
  while (boxes.length < 256) {
    // Split the box with the most pixels among those that still have more than one bin.
    let pick = -1;
    let most = 0;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b] as number[];
      if (box.length < 2) continue;
      let total = 0;
      for (const bin of box) total += counts[bin] as number;
      if (total > most) {
        most = total;
        pick = b;
      }
    }
    if (pick === -1) break;
    const box = boxes[pick] as number[];

    // Along its widest channel, at the pixel-weighted median.
    let widest = 0;
    let widestRange = -1;
    for (let channel = 0; channel < 3; channel++) {
      let low = LEVELS;
      let high = -1;
      for (const bin of box) {
        const v = channelOf(bin, channel);
        if (v < low) low = v;
        if (v > high) high = v;
      }
      if (high - low > widestRange) {
        widestRange = high - low;
        widest = channel;
      }
    }
    box.sort((a, b) => channelOf(a, widest) - channelOf(b, widest));
    let seen = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      seen += counts[box[i] as number] as number;
      cut = i + 1;
      if (seen * 2 >= most) break;
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }

  // Each box's colour is the average of the real colours of its pixels, so a flat colour stays exact.
  const palette = new Uint8Array(256 * 3);
  const lookup = new Uint8Array(counts.length);
  boxes.forEach((box, index) => {
    const sum = [0, 0, 0];
    let total = 0;
    for (const bin of box) {
      const n = counts[bin] as number;
      total += n;
      for (let channel = 0; channel < 3; channel++) sum[channel] = (sum[channel] as number) + (sums[bin * 3 + channel] as number);
      lookup[bin] = index;
    }
    for (let channel = 0; channel < 3; channel++) palette[index * 3 + channel] = Math.min(255, Math.round((sum[channel] as number) / Math.max(1, total)));
  });
  return { palette, lookup };
}

/** GIF's LZW compression of one frame's palette indices, written to `into` as data sub-blocks (8-bit codes to start). */
function lzw(indices: Uint8Array, into: Bytes): void {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const codes = (lzwCodes ??= new Int16Array(LZW_SLOTS));
  const generations = (lzwGeneration ??= new Int32Array(LZW_SLOTS));
  // Compressed bytes, cut into sub-blocks of at most 255 as they come: the length byte is filled in when a block is full.
  into.push(minCodeSize);
  let blockStart = into.length;
  into.push(0);
  let blockSize = 0;
  const out = (byte: number) => {
    into.push(byte);
    if (++blockSize === 255) {
      into.setAt(blockStart, 255);
      blockStart = into.length;
      into.push(0);
      blockSize = 0;
    }
  };
  let bits = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code: number) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out(bits & 255);
      bits >>>= 8;
      bitCount -= 8;
    }
  };

  generation++;
  let nextCode = endCode + 1;
  emit(clearCode);
  let prefix = indices[0] as number;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] as number;
    const key = (prefix << 8) | k;
    if (generations[key] === generation) {
      prefix = codes[key] as number;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      // The table is full: start over.
      emit(clearCode);
      generation++;
      nextCode = endCode + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (nextCode >= 1 << codeSize) codeSize++;
      generations[key] = generation;
      codes[key] = nextCode++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(endCode);
  if (bitCount > 0) out(bits & 255);

  // Close the last sub-block (if it has anything in it), then the empty block that ends the data.
  if (blockSize > 0) {
    into.setAt(blockStart, blockSize);
    into.push(0);
  } else into.setAt(blockStart, 0);
}

const u16 = (n: number): number[] => [n & 255, (n >> 8) & 255];

/** An animated GIF of `frames`, each `width` by `height`. */
export function encodeGif(width: number, height: number, frames: readonly GifFrame[], options: GifOptions = {}): Buffer {
  const { dither = true, plays = 1 } = options;
  if (frames.length === 0) throw new Error('A GIF needs at least one frame');
  for (const frame of frames) {
    if (frame.rgba.length !== width * height * 4) throw new Error(`A ${width}x${height} frame needs ${width * height * 4} bytes, got ${frame.rgba.length}`);
  }

  // One palette for every frame, from every frame's colours.
  const counts = new Uint32Array(1 << (BITS * 3));
  const sums = new Float64Array(counts.length * 3);
  const bins = frames.map((frame) => {
    const out = new Uint16Array(width * height);
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p++) {
        const bin = binOf(frame.rgba, p * 4, x, y, dither);
        out[p] = bin;
        counts[bin] = (counts[bin] as number) + 1;
        for (let channel = 0; channel < 3; channel++) sums[bin * 3 + channel] = (sums[bin * 3 + channel] as number) + (frame.rgba[p * 4 + channel] as number);
      }
    }
    return out;
  });
  const { palette, lookup } = medianCut(counts, sums);

  const bytes = new Bytes();
  const push = (...values: number[]) => bytes.pushAll(values);
  // Header and screen: a global 256-colour table follows.
  push(...Buffer.from('GIF89a', 'ascii'), ...u16(width), ...u16(height), 0xf7, 0, 0);
  bytes.pushAll(palette);
  // Looping: the NETSCAPE2.0 block counts repeats after the first play; leaving it out plays once.
  if (plays !== 1) push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'ascii'), 3, 1, ...u16(Math.max(0, plays - 1)), 0);

  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f] as GifFrame;
    const frameBins = bins[f] as Uint16Array;
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < indices.length; p++) indices[p] = lookup[frameBins[p] as number] as number;
    // Graphic control: each frame replaces the last (disposal 1), delay in hundredths of a second.
    push(0x21, 0xf9, 4, 0x04, ...u16(Math.max(2, Math.round(frame.delayMs / 10))), 0, 0);
    // The frame covers the whole screen and uses the global palette.
    push(0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0);
    lzw(indices, bytes);
  }
  push(0x3b);
  return bytes.toBuffer();
}
