import { TEXT, WHEEL_ANIMATION, WHEEL_IMAGE_NAME } from '../constants.js';
import { WHEEL_SLICES } from '../data/wheel.js';
import type { BotEmbed } from '../lib/embed.js';
import type { WheelSpin } from '../lib/wheel.js';
import { renderSpinningWheel, renderWheel, spinTurns } from '../lib/wheel-image.js';
import { playAnimation, stepsFor } from './animation.js';
import type { CommandContext, ReplyOptions } from './types.js';

/** How many picture changes this spin takes: it lasts between minSeconds and maxSeconds, one change per frameMs. */
export function spinSteps(): number {
  return stepsFor(WHEEL_ANIMATION);
}

/**
 * Sends the result of a claim or rob that spun the wheel, as a short animation: first a
 * "spinning" message with the wheel picture, then the picture is swapped every
 * WHEEL_ANIMATION.frameMs (slowing down) until the wheel stops on the result and the message
 * becomes `embed`, the real result (see `playAnimation` for how failures and slow edits are handled).
 */
export async function replyWithWheel(
  ctx: CommandContext,
  embed: BotEmbed,
  spin: WheelSpin,
  options: Pick<ReplyOptions, 'allowedMentions'> = {},
): Promise<void> {
  await playAnimation(
    ctx,
    embed,
    () => {
      const steps = spinSteps();
      const turns = spinTurns(WHEEL_SLICES.length, spin, steps);
      return {
        steps,
        frameMs: WHEEL_ANIMATION.frameMs,
        title: TEXT.wheel.spinningTitle,
        text: TEXT.wheel.spinning(ctx.user.toString()),
        imageName: WHEEL_IMAGE_NAME,
        frame: (step) => renderSpinningWheel(WHEEL_SLICES, turns[step] as number),
        finish: () => renderWheel(WHEEL_SLICES, spin),
      };
    },
    options,
  );
}
