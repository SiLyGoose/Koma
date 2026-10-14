import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { collections } from '../db.js';
import { dayKey } from '../lib/events/raid-week.js';
import { raidBonuses } from '../lib/game/heroes.js';
import { rollTmDrop, SIM_VERSION, TM_BOSS } from '../lib/game/technomagic.js';
import type { ItemDef, TmRunDoc } from '../types.js';
import { addCopy } from './economy/index.js';

/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then, and whether it is one of the player's first `hero.rewardsPerDay` runs
 * that day (settled as it begins, so leaving one that is going badly doesn't give another try). The bot runs
 * the fight itself; a win gives each player whose run it is one TechnoMagic item.
 */

/** The ids of the heroes a member owns (that still exist). */
export async function ownedHeroes(guildId: string, userId: string): Promise<string[]> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
  return Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id));
}

/** How many more runs they can begin today that give gear for a win. */
export async function rewardsLeft(guildId: string, userId: string, now: Date = new Date()): Promise<number> {
  const begun = await collections().tmRuns.countDocuments({ guildId, userId, day: dayKey(now), rewardable: true });
  return Math.max(0, CONFIG.hero.rewardsPerDay - begun);
}

/** A room's run, begun: its id and seed, and for each player the heroes they own, each one's gear, and whether a win gives them gear. */
export interface BegunRun {
  id: string;
  seed: number;
  players: Map<string, { owned: Set<string>; gear: Map<string, Record<string, number>>; rewardable: boolean }>;
}

/**
 * Begins a room's run at `stage` for each of its players with their `heroes` (the lineup's): reads what each
 * owns and their gear, and keeps a run for each (whether it gives gear, by how many they have begun today).
 */
export async function beginRun(guildId: string, stage: number, players: readonly { userId: string; heroes: readonly { id: string; skin: number }[] }[], now: Date = new Date()): Promise<BegunRun> {
  const { items, members, tmRuns } = collections();
  const run: BegunRun = { id: randomBytes(12).toString('base64url'), seed: randomBytes(4).readUInt32LE(0), players: new Map() };
  const day = dayKey(now);
  for (const { userId, heroes } of players) {
    const [member, copies, begun] = await Promise.all([
      members.findOne({ guildId, userId }, { projection: { heroes: 1 } }),
      items.find({ guildId, userId }).toArray(),
      tmRuns.countDocuments({ guildId, userId, day, rewardable: true }),
    ]);
    const owned = new Set(Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id)));
    const bonuses = raidBonuses(copies, member);
    const gear = new Map([...owned].map((id) => [id, { ...(bonuses.get(id) ?? {}) }]));
    const rewardable = begun < CONFIG.hero.rewardsPerDay;
    run.players.set(userId, { owned, gear, rewardable });
    const doc: TmRunDoc = {
      _id: `${run.id}:${userId}`,
      run: run.id,
      guildId,
      userId,
      boss: TM_BOSS,
      seed: run.seed,
      stage,
      heroes: heroes.filter((hero) => owned.has(hero.id)).map((hero) => ({ ...hero, gear: gear.get(hero.id) ?? {} })),
      version: SIM_VERSION,
      startedAt: now,
      day,
      rewardable,
    };
    await tmRuns.insertOne(doc);
  }
  return run;
}

/** A room's run is over (`result`, after `ticks` steps): a win gives each player whose run gives gear one TechnoMagic item. Returns what each found. */
export async function finishRun(guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, now: Date = new Date()): Promise<Map<string, ItemDef[]>> {
  const found = new Map<string, ItemDef[]>();
  for (const [userId, player] of run.players) {
    const drops: ItemDef[] = [];
    if (result === 'won' && player.rewardable) {
      const item = rollTmDrop(stage, CONFIG.hero);
      if (item) {
        await addCopy(guildId, userId, item.id);
        drops.push(item);
      }
    }
    found.set(userId, drops);
    await collections().tmRuns.updateOne({ _id: `${run.id}:${userId}` }, { $set: { claimedAt: now, result, ticks, drops: drops.map((item) => item.id) } });
  }
  return found;
}
