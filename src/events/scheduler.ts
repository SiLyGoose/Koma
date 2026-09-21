import type { Client } from 'discord.js';
import { CONFIG } from '../config.js';
import { EVENTS } from '../constants.js';
import { claimEventSlot, listEventGuilds } from '../services/events.js';
import { GAME_EVENTS } from './registry.js';
import { startRandomEvent } from './runner.js';
import { decideTick, randomGapMs } from './timing.js';
import type { GameEvent } from './types.js';

/*
 * Every EVENTS.tickMs the bot looks at each server that has an events channel and starts an
 * event in the ones that are due (see decideTick). The next time is written with one conditional
 * update (claimEventSlot), so if two copies of the bot run at once only one of them wins each
 * slot and there is never a doubled event.
 */

/** What one tick did in one server. */
export interface TickOutcome {
  guildId: string;
  action: 'waited' | 'scheduled' | 'skipped' | 'lost' | 'missing' | 'refused' | 'started';
  /** For 'started': resolves when the event is over. */
  done?: Promise<void>;
}

/** Does one tick for every server with events on. A problem in one server never stops the others. */
export async function runSchedulerTick(client: Client, now: Date = new Date(), events: readonly GameEvent[] = GAME_EVENTS): Promise<TickOutcome[]> {
  const outcomes: TickOutcome[] = [];
  for (const guildInfo of await listEventGuilds()) {
    const { guildId } = guildInfo;
    try {
      const decision = decideTick(now.getTime(), guildInfo.nextEventAt?.getTime() ?? null, EVENTS.staleMs);
      if (decision === 'wait') {
        outcomes.push({ guildId, action: 'waited' });
        continue;
      }

      // Take the slot first, so that only one bot copy goes on to start anything.
      const next = new Date(now.getTime() + randomGapMs(CONFIG.events.minMinutes, CONFIG.events.maxMinutes));
      const won = await claimEventSlot(guildId, guildInfo.nextEventAt, next, decision === 'fire', now);
      if (!won) {
        outcomes.push({ guildId, action: 'lost' });
        continue;
      }
      if (decision !== 'fire') {
        outcomes.push({ guildId, action: decision === 'schedule' ? 'scheduled' : 'skipped' });
        continue;
      }

      const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) {
        console.error(`An event was due in ${guildId} but the bot is not in that server any more.`);
        outcomes.push({ guildId, action: 'missing' });
        continue;
      }

      const started = await startRandomEvent(guild, events);
      if (!started.ok) {
        console.error(`An event was due in ${guildId} but did not start: ${started.reason}${'problem' in started ? ` (${started.problem})` : ''}`);
        outcomes.push({ guildId, action: 'refused' });
        continue;
      }
      outcomes.push({ guildId, action: 'started', done: started.done });
    } catch (err) {
      console.error(`The event check failed for ${guildId}:`, err);
    }
  }
  return outcomes;
}

/** Starts checking every EVENTS.tickMs. Returns a function that stops it. */
export function startEventScheduler(client: Client): () => void {
  let ticking = false;
  const timer = setInterval(() => {
    // A slow tick is never joined by the next one.
    if (ticking) return;
    ticking = true;
    runSchedulerTick(client)
      .catch((err) => console.error('The event scheduler failed:', err))
      .finally(() => {
        ticking = false;
      });
  }, EVENTS.tickMs);
  timer.unref();
  return () => clearInterval(timer);
}
