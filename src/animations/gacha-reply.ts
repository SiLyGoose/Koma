import { GACHA_ANIMATION_NAME, TEXT } from '../constants/index.js';
import type { BotEmbed } from '../lib/embed.js';
import type { Stars } from '../types.js';
import { Worker } from 'node:worker_threads';
import { cometDurationMs, cometGif, keepCometGif, type Pull } from './images/comet-image.js';
import type { CometDrawn, CometJob } from './images/comet-worker.js';
import { playAnimation } from './play.js';
import type { CommandContext } from '../discord/types.js';

/**
 * Sends the result of a gacha pull after the shooting star: a message with the animation (one
 * GIF, so it plays smoothly without editing the message), which ends in a flash of the tier's
 * colour; at the height of the flash the message becomes `embed`, the real result, and the
 * animation is taken away. `stars` is the best item pulled; a multi `pull`'s star splits in two.
 * The items were already given before this is called, so the animation is only for show (see
 * `playAnimation` for how failures are handled).
 */
export async function replyWithShootingStar(ctx: CommandContext, embed: BotEmbed, stars: Stars, pull: Pull): Promise<void> {
  await playAnimation(ctx, embed, () => ({
    // The whole animation is one picture: the result replaces it once it has played.
    steps: 1,
    frameMs: cometDurationMs(),
    title: TEXT.gacha.pullingTitle,
    text: TEXT.gacha.pulling(ctx.user.toString()),
    imageName: GACHA_ANIMATION_NAME,
    frame: () => cometGif(stars, pull),
  }));
}

/**
 * Draws every tier's animations (single and multi) ahead of time, so the first pull of each doesn't
 * wait for it. They're drawn on a worker thread (comet-worker.ts), so the bot keeps answering
 * meanwhile; a pull that comes before its animation is ready just draws it itself, as it always could.
 */
export function prepareShootingStars(tiers: readonly Stars[]): void {
  const pulls: Pull[] = ['single', 'multi'];
  const jobs: CometJob[] = pulls.flatMap((pull) => tiers.map((stars) => ({ stars, pull })));
  // The worker file sits next to this one's images/ folder: .js when built, .ts under tsx.
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  let worker: Worker;
  try {
    worker = new Worker(new URL(`./images/comet-worker${ext}`, import.meta.url), { workerData: jobs });
  } catch (err) {
    console.error('Could not start the shooting star worker, drawing them here instead:', err);
    drawInTurn(jobs);
    return;
  }
  const kept = new Set<string>();
  worker.on('message', ({ stars, pull, gif }: CometDrawn) => {
    keepCometGif(stars, pull, Buffer.from(gif.buffer, gif.byteOffset, gif.byteLength));
    kept.add(`${pull}:${stars}`);
  });
  worker.on('error', (err) => {
    console.error('The shooting star worker failed, drawing the rest here instead:', err);
    drawInTurn(jobs.filter(({ stars, pull }) => !kept.has(`${pull}:${stars}`)));
  });
  worker.unref();
}

/** The fallback: draws on this thread, one at a time with a pause between, so the bot still answers in the gaps. */
function drawInTurn(jobs: readonly CometJob[], gapMs = 1_000): void {
  jobs.forEach(({ stars, pull }, i) => {
    setTimeout(() => {
      try {
        cometGif(stars, pull);
      } catch (err) {
        console.error(`Could not draw the ${stars}-star ${pull} shooting star ahead of time:`, err);
      }
    }, gapMs * (i + 1)).unref();
  });
}
