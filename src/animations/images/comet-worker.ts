import { parentPort, workerData } from 'node:worker_threads';
import type { Stars } from '../../types.js';
import { cometGif, type Pull } from './comet-image.js';

/*
 * Draws the shooting stars off the main thread (see prepareShootingStars in gacha-reply.ts): each
 * takes about a second of solid work, and on the main thread the bot can't answer anything while
 * one is being drawn. Sends each one back as soon as it's done.
 */

export interface CometJob {
  stars: Stars;
  pull: Pull;
}

export interface CometDrawn extends CometJob {
  gif: Uint8Array;
}

for (const { stars, pull } of workerData as CometJob[]) {
  // A copy, so its memory can be handed over instead of copied again.
  const gif = new Uint8Array(cometGif(stars, pull));
  parentPort?.postMessage({ stars, pull, gif } satisfies CometDrawn, [gif.buffer]);
}
