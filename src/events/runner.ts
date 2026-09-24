import type { Client, Guild } from 'discord.js';
import { getChannelId } from '../services/channel.js';
import { claimGuild, isEventRunning } from './busy.js';
import { checkEventChannel, type ChannelProblem } from './channel.js';
import { GAME_EVENTS, pickEvent } from './registry.js';
import type { GameEvent } from './types.js';

/*
 * Starts events, one at a time in each server. An event is never started while another one is
 * still going in the same server, whether the scheduler or an admin asked for it.
 */

export { isEventRunning };

export type StartResult =
  | { ok: true; channelId: string; /** Resolves when the event is over. It never rejects. */ done: Promise<void> }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'no_channel' }
  | { ok: false; reason: 'bad_channel'; problem: ChannelProblem };

/**
 * Starts `event` in the server. It goes in `channelId`, or the server's events channel when that
 * is null. The result says at once whether it started (and `done` follows when it ends). The
 * server counts as busy from the very first line, before anything is awaited, so two starts at
 * the same moment cannot both get through.
 */
export async function startEvent(guild: Guild, event: GameEvent, channelId: string | null = null): Promise<StartResult> {
  const release = claimGuild(guild.id);
  if (!release) return { ok: false, reason: 'busy' };

  let handedOver = false;
  try {
    const target = channelId ?? (await getChannelId(guild.id));
    if (!target) return { ok: false, reason: 'no_channel' };
    const checked = await checkEventChannel(guild, target);
    if (!checked.ok) return { ok: false, reason: 'bad_channel', problem: checked.problem };

    const { channel } = checked;
    const done = (async () => {
      try {
        await event.run({ guild, channel });
      } catch (err) {
        console.error(`The ${event.id} event failed in ${guild.id}:`, err);
      } finally {
        release();
      }
    })();
    handedOver = true;
    return { ok: true, channelId: target, done };
  } finally {
    // Only an event that is actually running keeps the server busy.
    if (!handedOver) release();
  }
}

/** Starts a randomly chosen event in the server's events channel. */
export function startRandomEvent(guild: Guild, list: readonly GameEvent[] = GAME_EVENTS, roll?: number): Promise<StartResult> {
  return startEvent(guild, pickEvent(list, roll), null);
}

/** Lets every event that was left open when the bot last stopped pick itself up again. One that fails is logged and does not stop the others. */
export async function resumeOpenEvents(client: Client, list: readonly GameEvent[] = GAME_EVENTS): Promise<void> {
  for (const event of list) {
    if (!event.resume) continue;
    try {
      await event.resume(client);
    } catch (err) {
      console.error(`Could not resume the ${event.id} event:`, err);
    }
  }
}
