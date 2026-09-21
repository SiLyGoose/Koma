import { randomInt } from 'node:crypto';
import type { Message, MessageReplyOptions } from 'discord.js';
import { TEXT, WHEEL_ANIMATION, WHEEL_IMAGE_NAME } from '../constants.js';
import { WHEEL_SLICES } from '../data/wheel.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import type { WheelSpin } from '../lib/wheel.js';
import { renderSpinningWheel, renderWheel, spinTurns } from '../lib/wheel-image.js';
import { reply } from './reply.js';

const IMAGE_URL = `attachment://${WHEEL_IMAGE_NAME}`;
const file = (png: Buffer) => ({ attachment: png, name: WHEEL_IMAGE_NAME });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How many picture changes this spin takes: it lasts between minSeconds and maxSeconds, one change per frameMs. */
export function spinSteps(): number {
  const { frameMs, minSeconds, maxSeconds } = WHEEL_ANIMATION;
  const fewest = Math.max(1, Math.round((minSeconds * 1000) / frameMs));
  const most = Math.max(fewest, Math.round((maxSeconds * 1000) / frameMs));
  return randomInt(fewest, most + 1);
}

/**
 * Sends the result of a claim or rob that spun the wheel, as a short animation: first a
 * "spinning" message with the wheel picture, then the picture is swapped every
 * WHEEL_ANIMATION.frameMs (slowing down) until the wheel stops on the result and the message
 * becomes `embed`, the real result. The points were already paid out before this is called, so
 * the animation is only for show: if any picture can't be drawn or sent, the result still ends
 * up in the channel.
 *
 * Discord limits how fast a message can be edited. If an edit is slow, frames are skipped rather
 * than letting the spin run long.
 */
export async function replyWithWheel(
  message: Message,
  embed: BotEmbed,
  spin: WheelSpin,
  options: Pick<MessageReplyOptions, 'allowedMentions'> = {},
): Promise<void> {
  const steps = spinSteps();
  const spinning = createEmbed().setTitle(TEXT.wheel.spinningTitle).setDescription(TEXT.wheel.spinning(message.author.toString()));
  spinning.setImage(IMAGE_URL);

  let turns: number[];
  let sent: Message;
  try {
    turns = spinTurns(WHEEL_SLICES.length, spin, steps);
    const first = renderSpinningWheel(WHEEL_SLICES, turns[0] as number);
    sent = await reply(message, { embeds: [spinning], files: [file(first)], ...options });
  } catch (err) {
    // No animation: just send the result.
    console.error('Could not start the wheel animation:', err);
    await reply(message, { embeds: [embed], ...options });
    return;
  }

  const { frameMs } = WHEEL_ANIMATION;
  const start = Date.now();
  try {
    for (let step = 1; step < steps; step++) {
      const wait = start + step * frameMs - Date.now();
      if (wait < -frameMs / 2) continue; // running behind (Discord is slow): skip this picture
      if (wait > 0) await sleep(wait);
      await sent.edit({ embeds: [spinning], files: [file(renderSpinningWheel(WHEEL_SLICES, turns[step] as number))], attachments: [] });
    }
    const wait = start + steps * frameMs - Date.now();
    if (wait > 0) await sleep(wait);
  } catch (err) {
    console.error('The wheel animation stopped early:', err);
  }

  // The wheel has stopped: swap in the real result with the finished picture.
  let files: { attachment: Buffer; name: string }[] = [];
  try {
    files = [file(renderWheel(WHEEL_SLICES, spin))];
    embed.setImage(IMAGE_URL);
  } catch (err) {
    console.error('Could not draw the wheel:', err);
  }
  try {
    await sent.edit({ embeds: [embed], files, attachments: [] });
  } catch (err) {
    console.error('Could not show the wheel result, sending it as a new message:', err);
    await reply(message, { embeds: [embed], files, ...options });
  }
}
