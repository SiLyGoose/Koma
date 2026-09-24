import { D20_ANIMATION, D20_IMAGE_NAME, TEXT } from '../constants/index.js';
import type { D20Roll } from '../perks/index.js';
import { dieFrames, renderD20 } from './images/d20-image.js';
import type { BotEmbed } from '../lib/embed.js';
import { playAnimation, stepsFor } from './play.js';
import type { CommandContext, ReplyOptions } from '../discord/types.js';

/**
 * Sends the result of a claim that rolled the D20, as a short animation: a "rolling" message with
 * a tumbling die, its picture swapped every D20_ANIMATION.frameMs (slowing down, showing other
 * numbers) until the die lands on the real roll and the message becomes `embed`, the real result
 * (see `playAnimation` for how failures and slow edits are handled).
 */
export async function replyWithDice(
  ctx: CommandContext,
  embed: BotEmbed,
  d20: D20Roll,
  options: Pick<ReplyOptions, 'allowedMentions'> = {},
): Promise<void> {
  await playAnimation(
    ctx,
    embed,
    () => {
      const steps = stepsFor(D20_ANIMATION);
      const poses = dieFrames(steps, d20.roll);
      return {
        steps,
        frameMs: D20_ANIMATION.frameMs,
        title: TEXT.d20.spinningTitle,
        text: TEXT.d20.spinning(ctx.user.toString()),
        imageName: D20_IMAGE_NAME,
        frame: (step) => renderD20(poses[step] as (typeof poses)[number], false),
        finish: () => renderD20(poses[steps] as (typeof poses)[number], true),
      };
    },
    options,
  );
}
