import { GACHA_ANIMATION_NAME, TEXT } from '../constants/index.js';
import type { BotEmbed } from '../lib/embed.js';
import type { Stars } from '../types.js';
import { cometDurationMs, cometGif, type Pull } from './images/comet-image.js';
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
 * Draws every tier's animations (single and multi) ahead of time, one at a time with a pause
 * between, so the first pull of each doesn't wait for it and the bot keeps answering meanwhile.
 */
export function prepareShootingStars(tiers: readonly Stars[], gapMs = 1_000): void {
  const pulls: Pull[] = ['single', 'multi'];
  const jobs = pulls.flatMap((pull) => tiers.map((stars) => ({ stars, pull })));
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
