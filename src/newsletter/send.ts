import type { Client, Guild } from 'discord.js';
import { NEWSLETTER } from '../constants/index.js';
import { checkEventChannel } from '../events/channel.js';
import type { BotEmbed } from '../lib/embed.js';
import { raidWeek, type RaidWeek } from '../lib/events/raid-week.js';
import { claimNewsletterWeek, listNewsletterGuilds, weekFacts, type NewsletterGuild } from '../services/newsletter.js';
import { weeklyDigest, type Digest } from './digest.js';

/*
 * Sending the newsletter: the weekly digest, which goes out on its own when the raid week resets
 * (Saturday midnight Eastern, lib/events/raid-week.ts), and patch notes, which the bot admin sends
 * to every server at once. Both go to each server's newsletter channel (`config set newsletter`).
 *
 * Every NEWSLETTER.tickMs the bot looks for servers whose last digest was for an older week. Each
 * server's week is moved on with one conditional update (claimNewsletterWeek) before anything is
 * sent, so with two copies of the bot running only one sends it, and a bot that was down over the
 * reset sends it when it's back.
 */

/** Nobody is pinged by the newsletter: the people it names are only mentioned. */
const NO_PINGS = { parse: [] };

/** The server's guild, if the bot is still in it. */
async function findGuild(client: Client, guildId: string): Promise<Guild | null> {
  return client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
}

/** The week before `week`. */
const weekBefore = (week: RaidWeek): RaidWeek => raidWeek(new Date(week.start.getTime() - 1));

/** `guildId`'s weekly digest of the week before `week`, sent as `week` starts. */
export async function digestFor(guildId: string, week: RaidWeek): Promise<Digest> {
  const covered = weekBefore(week);
  return weeklyDigest(guildId, await weekFacts(guildId, covered), covered, week);
}

/** What the digest going out at the end of the week `now` is in looks like so far (`newsletter preview`). */
export async function previewDigest(guildId: string, now: Date = new Date()): Promise<Digest> {
  const covered = raidWeek(now);
  return weeklyDigest(guildId, await weekFacts(guildId, covered), covered, raidWeek(covered.next), true);
}

/** Posts `message` in the server's newsletter channel. False when the bot can't (it left, or the channel is gone or shut to it). */
async function post(client: Client, server: Pick<NewsletterGuild, 'guildId' | 'channelId'>, message: Digest | { embeds: BotEmbed[] }): Promise<boolean> {
  const guild = await findGuild(client, server.guildId);
  if (!guild) return false;
  const checked = await checkEventChannel(guild, server.channelId);
  if (!checked.ok) {
    console.error(`The newsletter could not go to ${server.channelId} in ${server.guildId}: ${checked.problem}`);
    return false;
  }
  await checked.channel.send({ ...message, allowedMentions: NO_PINGS });
  return true;
}

/** What one tick did in one server. */
export interface NewsletterOutcome {
  guildId: string;
  action: 'current' | 'lost' | 'started' | 'sent' | 'failed';
}

/** Sends the weekly digest to every server that hasn't had this week's yet. A problem in one server never stops the others. */
export async function runNewsletterTick(client: Client, now: Date = new Date()): Promise<NewsletterOutcome[]> {
  const week = raidWeek(now);
  const outcomes: NewsletterOutcome[] = [];
  for (const server of await listNewsletterGuilds()) {
    const { guildId } = server;
    if (server.week === week.key) {
      outcomes.push({ guildId, action: 'current' });
      continue;
    }
    try {
      if (!(await claimNewsletterWeek(guildId, server.week, week.key))) {
        outcomes.push({ guildId, action: 'lost' });
        continue;
      }
      // A channel chosen before the bot knew about weeks: it starts counting from this one.
      if (server.week === null) {
        outcomes.push({ guildId, action: 'started' });
        continue;
      }
      const sent = await post(client, server, await digestFor(guildId, week));
      outcomes.push({ guildId, action: sent ? 'sent' : 'failed' });
    } catch (err) {
      console.error(`The weekly newsletter failed in ${guildId}:`, err);
      outcomes.push({ guildId, action: 'failed' });
    }
  }
  return outcomes;
}

/** Sends patch notes (`embed`) to every server's newsletter channel: how many got them, and how many couldn't be reached. */
export async function broadcastPatchNotes(client: Client, embed: BotEmbed): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const server of await listNewsletterGuilds()) {
    try {
      if (await post(client, server, { embeds: [embed] })) sent++;
      else failed++;
    } catch (err) {
      console.error(`The patch notes could not be sent to ${server.guildId}:`, err);
      failed++;
    }
  }
  return { sent, failed };
}

/** Starts looking for weekly digests that are due. Returns a function that stops it. */
export function startNewsletterScheduler(client: Client): () => void {
  let ticking = false;
  const tick = (): void => {
    // A slow tick is never joined by the next one.
    if (ticking) return;
    ticking = true;
    runNewsletterTick(client)
      .catch((err) => console.error('The newsletter scheduler failed:', err))
      .finally(() => {
        ticking = false;
      });
  };
  const timer = setInterval(tick, NEWSLETTER.tickMs);
  timer.unref();
  // Straight away too, so a digest missed while the bot was down doesn't wait for the first tick.
  tick();
  return () => clearInterval(timer);
}
