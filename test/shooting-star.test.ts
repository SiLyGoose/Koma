import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GACHA_ANIMATION, STAR_COLORS, validateConstants } from '../src/constants/index.js';
import { COMET_REST, COMET_SIZE, cometDurationMs, cometGif, renderCometFrame } from '../src/animations/images/comet-image.js';
import { encodeGif } from '../src/animations/images/gif.js';
import { playFrames } from '../src/animations/play.js';
import { createEmbed } from '../src/lib/embed.js';
import { STARS } from '../src/types.js';
import { gifPixel, readGif } from './helpers/gif.js';

// ---------------------------------------------------------------------------
// GIF writer

const flat = (w: number, h: number, color: readonly number[]): Uint8Array => {
  const out = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) out.set([...color, 255], p * 4);
  return out;
};

test('gif: frames, their timing and flat colours come back exactly', () => {
  const gif = readGif(
    encodeGif(
      20,
      10,
      [
        { rgba: flat(20, 10, [0, 0, 0]), delayMs: 50 },
        { rgba: flat(20, 10, [255, 74, 90]), delayMs: 1250 },
      ],
      { dither: false },
    ),
  );
  assert.equal(gif.width, 20);
  assert.equal(gif.height, 10);
  assert.deepEqual(
    gif.frames.map((f) => f.delayMs),
    [50, 1250],
  );
  assert.deepEqual(gifPixel(gif, 0, 3, 3), [0, 0, 0]);
  assert.deepEqual(gifPixel(gif, 1, 19, 9), [255, 74, 90]);
  assert.equal(gif.plays, 1, 'plays once by default and stays on the last frame');
});

test('gif: more colours than fit and noisy pictures still decode (the compression table fills and restarts)', () => {
  const w = 200;
  const h = 150;
  const noisy = new Uint8Array(w * h * 4);
  let seed = 7;
  for (let i = 0; i < noisy.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noisy[i] = seed & 255;
  }
  const gif = readGif(encodeGif(w, h, [{ rgba: noisy, delayMs: 100 }]));
  assert.equal(gif.frames.length, 1);
  // Every pixel lands on a nearby palette colour.
  let far = 0;
  for (let p = 0; p < w * h; p++) {
    const got = gifPixel(gif, 0, p % w, Math.floor(p / w));
    const want = [...noisy.subarray(p * 4, p * 4 + 3)];
    if (got.some((v, c) => Math.abs(v - (want[c] as number)) > 64)) far++;
  }
  assert.ok(far < w * h * 0.02, `${far} pixels are far from their colour`);
  assert.equal(readGif(encodeGif(4, 4, [{ rgba: flat(4, 4, [1, 2, 3]), delayMs: 50 }], { plays: 0 })).plays, 0, 'can loop forever');
});

test('gif: a frame of the wrong size is refused', () => {
  assert.throws(() => encodeGif(4, 4, [{ rgba: new Uint8Array(10), delayMs: 50 }]), /needs 64 bytes/);
  assert.throws(() => encodeGif(4, 4, []), /at least one frame/);
});

// ---------------------------------------------------------------------------
// The shooting star

test('shooting star: one GIF per tier, the flight and the flash, holding on the last, played once, and drawn only once', () => {
  validateConstants();
  for (const stars of STARS) {
    const png = cometGif(stars);
    assert.equal(cometGif(stars), png, 'kept after the first time');
    const gif = readGif(png);
    assert.equal(gif.width, COMET_SIZE.width);
    assert.equal(gif.height, COMET_SIZE.height);
    assert.equal(gif.plays, 1);
    assert.equal(gif.frames.length, GACHA_ANIMATION.frames + GACHA_ANIMATION.flashFrames);
    assert.equal(gif.frames.at(-1)?.delayMs, GACHA_ANIMATION.frameMs + GACHA_ANIMATION.holdMs);
    assert.ok(png.length < 4 * 1024 * 1024, 'well under Discord upload limits');
  }
  assert.equal(cometDurationMs(), (GACHA_ANIMATION.frames + GACHA_ANIMATION.flashFrames) * GACHA_ANIMATION.frameMs + GACHA_ANIMATION.holdMs);
});

test('shooting star: every tier looks the same until it ignites, so the rarity is a surprise', () => {
  const { frames, igniteAt } = GACHA_ANIMATION;
  const lastSilver = Math.ceil(igniteAt * (frames - 1)) - 1;
  for (const frame of [0, Math.floor(lastSilver / 2), lastSilver]) {
    const first = renderCometFrame(1, frame, frames);
    for (const stars of STARS) assert.deepEqual(renderCometFrame(stars, frame, frames), first, `frame ${frame}, ${stars} stars`);
  }
  assert.notDeepEqual(renderCometFrame(1, frames - 1, frames), renderCometFrame(4, frames - 1, frames));
});

test('shooting star: at rest, the glow around the head is the tier colour (green, blue, purple, red)', () => {
  const [hx, hy] = COMET_REST.map(Math.round) as [number, number];
  assert.ok(hx > COMET_SIZE.width / 2 && hy < COMET_SIZE.height / 2, 'it comes to rest in the top-right quarter');
  const { frames } = GACHA_ANIMATION;
  const ring = (stars: (typeof STARS)[number]): number[] => {
    const rgba = renderCometFrame(stars, frames - 1, frames);
    const sum = [0, 0, 0];
    for (let a = 0; a < 16; a++) {
      const x = Math.round(hx + Math.cos((a / 16) * Math.PI * 2) * 10);
      const y = Math.round(hy + Math.sin((a / 16) * Math.PI * 2) * 10);
      const at = (y * COMET_SIZE.width + x) * 4;
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (rgba[at + c] as number);
    }
    return sum;
  };
  assertTierHue(ring);
  assert.equal(Object.keys(STAR_COLORS).length, STARS.length);
});

test('shooting star: every multi pull splits in two, whatever the tier, and no single pull does, even a 4-star', () => {
  const { frames, igniteAt } = GACHA_ANIMATION;
  const beforeIgnite = Math.ceil(igniteAt * (frames - 1)) - 1;
  for (const stars of STARS) {
    assert.deepEqual(renderCometFrame(stars, beforeIgnite, frames, 0, 'multi'), renderCometFrame(stars, beforeIgnite, frames, 0, 'single'), `${stars} stars: the same until it ignites`);
    assert.notDeepEqual(renderCometFrame(stars, frames - 1, frames, 0, 'multi'), renderCometFrame(stars, frames - 1, frames, 0, 'single'), `${stars} stars: a multi pull has a second star`);
  }
  // A single 4-star is drawn exactly like a single of any other tier apart from its colour: no second star.
  const single4 = renderCometFrame(4, frames - 1, frames, 0, 'single');
  const multi4 = renderCometFrame(4, frames - 1, frames, 0, 'multi');
  const lit = (rgba: Uint8Array) => {
    let count = 0;
    for (let i = 0; i < rgba.length; i += 4) if ((rgba[i] as number) + (rgba[i + 1] as number) + (rgba[i + 2] as number) > 400) count++;
    return count;
  };
  assert.ok(lit(multi4) > lit(single4), 'the second star lights more of the picture');
  assert.notEqual(cometGif(4, 'single'), cometGif(4, 'multi'), 'kept separately');
});

/** Checks `colorOf` gives each tier's hue: green, blue, purple, red. */
function assertTierHue(colorOf: (stars: (typeof STARS)[number]) => number[]): void {
  const [r1, g1, b1] = colorOf(1) as [number, number, number];
  assert.ok(g1 > r1 && g1 > b1, `1 star is green: ${[r1, g1, b1]}`);
  const [r2, g2, b2] = colorOf(2) as [number, number, number];
  assert.ok(b2 > r2 && b2 > g2, `2 stars are blue: ${[r2, g2, b2]}`);
  const [r3, g3, b3] = colorOf(3) as [number, number, number];
  assert.ok(b3 > g3 && r3 > g3, `3 stars are purple: ${[r3, g3, b3]}`);
  const [r4, g4, b4] = colorOf(4) as [number, number, number];
  assert.ok(r4 > g4 && r4 > b4, `4 stars are red: ${[r4, g4, b4]}`);
}

/** The average colour of a whole RGBA picture. */
function average(rgba: Uint8Array): number[] {
  const sum = [0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (rgba[i + c] as number);
  return sum.map((v) => v / (rgba.length / 4));
}

test('shooting star: the ending flash builds up and floods the whole picture with the tier colour (not plain white)', () => {
  const { frames, flashFrames } = GACHA_ANIMATION;
  const brightness = (rgba: Uint8Array) => average(rgba).reduce((a, b) => a + b, 0);
  for (const stars of STARS) {
    let last = brightness(renderCometFrame(stars, frames - 1, frames));
    for (let f = 1; f <= flashFrames; f++) {
      const now = brightness(renderCometFrame(stars, frames - 1 + f, frames, f / flashFrames));
      assert.ok(now > last, `${stars} stars: flash frame ${f} is brighter than the one before`);
      last = now;
    }
  }
  const peak = (stars: (typeof STARS)[number]) => average(renderCometFrame(stars, frames + flashFrames - 1, frames, 1));
  assertTierHue(peak);
  for (const stars of STARS) {
    const [r, g, b] = peak(stars) as [number, number, number];
    assert.ok(Math.min(r, g, b) < 235, `${stars} stars: the peak keeps its colour instead of washing out to white (${[r, g, b].map(Math.round)})`);
  }
});

test('animation player: an animation with no finished picture ends on the result alone, the animation taken away', async () => {
  const edits: { files: unknown[]; attachments?: unknown[]; image?: string }[] = [];
  const surface = {
    async edit(options: { files?: unknown[]; attachments?: unknown[]; embeds?: { data: { image?: { url: string } } }[] }) {
      edits.push({ files: options.files ?? [], attachments: options.attachments, image: options.embeds?.[0]?.data.image?.url });
    },
  };
  const plan = { steps: 1, frameMs: 5, title: 't', text: 'x', imageName: 'shooting-star.gif', frame: () => Buffer.from('gif') };
  await playFrames(surface as never, plan, createEmbed(), createEmbed(), { onEditFailed: async () => {} });
  assert.equal(edits.length, 1, 'one picture: no edits during the animation, one for the result');
  assert.deepEqual(edits[0]?.files, [], 'no new picture');
  assert.deepEqual(edits[0]?.attachments, [], 'the GIF is removed');
  assert.equal(edits[0]?.image, undefined, 'the result has no picture');
});
