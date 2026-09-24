import { randomInt } from 'node:crypto';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import type { CommandContext, EditOptions, ReplyOptions, SentReply } from '../discord/types.js';
import { sleep } from '../lib/time.js';


/** How an animation is timed: one picture change per `frameMs`, for `minSeconds` to `maxSeconds`. */
export interface AnimationTiming {
  frameMs: number;
  minSeconds: number;
  maxSeconds: number;
}

/** How many picture changes this spin takes: it lasts between minSeconds and maxSeconds, one change per frameMs. */
export function stepsFor({ frameMs, minSeconds, maxSeconds }: AnimationTiming): number {
  const fewest = Math.max(1, Math.round((minSeconds * 1000) / frameMs));
  const most = Math.max(fewest, Math.round((maxSeconds * 1000) / frameMs));
  return randomInt(fewest, most + 1);
}

/** What one animation shows. */
export interface AnimationPlan {
  /** How many pictures the spin has before the result. */
  steps: number;
  frameMs: number;
  /** The title and text of the "spinning" message. */
  title: string;
  text: string;
  /** The name of the attached picture. */
  imageName: string;
  /** Draws picture `step` (0 up to but not including `steps`) of the spin. */
  frame(step: number): Buffer;
  /** Draws the finished picture that goes with the result. */
  finish(): Buffer;
}

/**
 * Sends the result of a claim or rob as a short animation: first a "spinning" message with the
 * first picture, then the picture is swapped every `frameMs` (slowing down) until the spin ends
 * and the message becomes `embed`, the real result. The points were already paid out before this
 * is called, so the animation is only for show: if any picture can't be drawn or sent, the
 * result still ends up in the channel.
 *
 * Discord limits how fast a message can be edited. If an edit is slow, frames are skipped rather
 * than letting the spin run long.
 *
 * `makePlan` is called first; if it throws, the result is sent at once without a picture.
 */
export async function playAnimation(
  ctx: CommandContext,
  embed: BotEmbed,
  makePlan: () => AnimationPlan,
  options: Pick<ReplyOptions, 'allowedMentions'> = {},
): Promise<void> {
  let plan: AnimationPlan | null = null;
  let sent: SentReply | null = null;
  let imageUrl = '';
  let file = (png: Buffer): { attachment: Buffer; name: string } => ({ attachment: png, name: '' });
  const spinning = createEmbed();

  try {
    plan = makePlan();
    const { imageName, title, text } = plan;
    imageUrl = `attachment://${imageName}`;
    file = (png) => ({ attachment: png, name: imageName });
    spinning.setTitle(title).setDescription(text).setImage(imageUrl);
    sent = await ctx.reply({ embeds: [spinning], files: [file(plan.frame(0))], ...options });
  } catch (err) {
    // No animation: just send the result.
    console.error('Could not start the animation:', err);
    await ctx.reply({ embeds: [embed], ...options });
    return;
  }

  await playFrames(sent, plan, embed, spinning, {
    onEditFailed: async (files) => {
      await ctx.reply({ embeds: [embed], files, ...options });
    },
  });
}

/** Something whose message can be edited: a reply the bot sent, or the message a button was pressed on. */
export interface FrameSurface {
  edit(options: EditOptions): Promise<void>;
}

/**
 * The rest of an animation, once its first picture is showing on `surface`: swaps in pictures
 * 1 up to `plan.steps` every `plan.frameMs` (skipping any it is too late for, if Discord is
 * slow), then replaces the message with `embed`, the real result, and the finished picture.
 * `components` (buttons) are added to that last edit. If the last edit fails, `onEditFailed`
 * is called with the finished picture so the result can still be sent another way.
 */
export async function playFrames(
  surface: FrameSurface,
  plan: AnimationPlan,
  embed: BotEmbed,
  spinning: BotEmbed,
  options: { components?: EditOptions['components']; onEditFailed: (files: { attachment: Buffer; name: string }[]) => Promise<void> },
): Promise<void> {
  const imageUrl = `attachment://${plan.imageName}`;
  const file = (png: Buffer): { attachment: Buffer; name: string } => ({ attachment: png, name: plan.imageName });
  const { steps, frameMs } = plan;
  const start = Date.now();
  try {
    for (let step = 1; step < steps; step++) {
      const wait = start + step * frameMs - Date.now();
      if (wait < -frameMs / 2) continue; // running behind (Discord is slow): skip this picture
      if (wait > 0) await sleep(wait);
      await surface.edit({ embeds: [spinning], files: [file(plan.frame(step))], attachments: [] });
    }
    const wait = start + steps * frameMs - Date.now();
    if (wait > 0) await sleep(wait);
  } catch (err) {
    console.error('The animation stopped early:', err);
  }

  // The spin has stopped: swap in the real result with the finished picture.
  let files: { attachment: Buffer; name: string }[] = [];
  try {
    files = [file(plan.finish())];
    embed.setImage(imageUrl);
  } catch (err) {
    console.error('Could not draw the finished picture:', err);
  }
  try {
    await surface.edit({ embeds: [embed], files, attachments: [], ...(options.components ? { components: options.components } : {}) });
  } catch (err) {
    console.error('Could not show the result, sending it as a new message:', err);
    await options.onEditFailed(files);
  }
}
