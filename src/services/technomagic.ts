import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { keptPerks } from '../data/transcend.js';
import { collections } from '../db.js';
import { dayKey } from '../lib/events/raid-week.js';
import { raidGear } from '../lib/game/heroes.js';
import { tmDropCount } from '../constants/technomagic.js';
import { MOST_TICKS, rollTmDrop, rollTmPotentials, rollTmSkill, SIM_VERSION, STEP_SECONDS, TM_BOSS } from '../lib/game/technomagic.js';
import type { ItemDef, TmPotential, TmRunDoc, TmSetId } from '../types.js';
import { addCopy } from './economy/index.js';

/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then, and whether it is one of the player's first `hero.rewardsPerDay` runs
 * that day (settled as it begins). A run that is lost doesn't count toward those, so only the runs that are won
 * (or still going) use them up: one that was never finished (the bot stopped during its fight) stops counting once
 * its fight would have been over. The bot runs the fight itself; a win gives each player whose run it is
 * TechnoMagic items (TM_DROP_COUNTS, by the stage), each copy with an additional skill and its potentials rolled for it
 * (ItemCopyDoc.tmSkill, tmPotentials).
 */

/** The longest a run can be going: its fight's longest (the raid's time and the boss's rage after it), and a minute more. */
export const RUN_LASTS_MS = Math.ceil(MOST_TICKS * STEP_SECONDS * 1000) + 60_000;

/** The runs of a member's, begun on `day`, that give gear and have used one up at `now`: those won, and those still going. */
export const rewardsUsedFilter = (guildId: string, userId: string, day: string, now: Date) => ({
  guildId,
  userId,
  day,
  rewardable: true,
  $or: [{ result: 'won' as const }, { result: { $exists: false }, startedAt: { $gt: new Date(now.getTime() - RUN_LASTS_MS) } }],
});

/** How many of the runs a member has begun on `day` that give gear have used one up. */
function rewardsUsed(guildId: string, userId: string, day: string, now: Date): Promise<number> {
  return collections().tmRuns.countDocuments(rewardsUsedFilter(guildId, userId, day, now));
}

/** The ids of the heroes a member owns (that still exist). */
export async function ownedHeroes(guildId: string, userId: string): Promise<string[]> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
  return Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id));
}

/** How many more runs they can begin today that give gear for a win. */
export async function rewardsLeft(guildId: string, userId: string, now: Date = new Date()): Promise<number> {
  return Math.max(0, CONFIG.hero.rewardsPerDay - (await rewardsUsed(guildId, userId, dayKey(now), now)));
}

/** A room's run, begun: its id and seed, and for each player the heroes they own, each one's gear, and whether a win gives them gear. */
export interface BegunRun {
  id: string;
  seed: number;
  players: Map<string, { owned: Set<string>; gear: Map<string, Record<string, number>>; sets: Map<string, TmSetId | null>; uws: Map<string, number | null>; skills: Map<string, string[]>; perks: Map<string, string[]>; rewardable: boolean }>;
}

/**
 * Begins a room's run at `stage` for each of its players with their `heroes` (the lineup's): reads what each
 * owns and their gear, and keeps a run for each (whether it gives gear, by how many have used one up today).
 */
export async function beginRun(guildId: string, stage: number, players: readonly { userId: string; heroes: readonly { id: string; skin: number }[] }[], now: Date = new Date()): Promise<BegunRun> {
  const { items, members, tmRuns } = collections();
  const run: BegunRun = { id: randomBytes(12).toString('base64url'), seed: randomBytes(4).readUInt32LE(0), players: new Map() };
  const day = dayKey(now);
  for (const { userId, heroes } of players) {
    const [member, copies, begun] = await Promise.all([
      members.findOne({ guildId, userId }, { projection: { heroes: 1 } }),
      items.find({ guildId, userId }).toArray(),
      rewardsUsed(guildId, userId, day, now),
    ]);
    const owned = new Set(Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id)));
    const loadouts = raidGear(copies, member);
    const gear = new Map([...owned].map((id) => [id, { ...(loadouts.get(id)?.bonus ?? {}) }]));
    const sets = new Map([...owned].map((id) => [id, loadouts.get(id)?.set ?? null]));
    const uws = new Map([...owned].map((id) => [id, loadouts.get(id)?.uw ?? null]));
    const skills = new Map([...owned].map((id) => [id, loadouts.get(id)?.skills ?? []]));
    // Its transcendence perks: those picked, as far as it is transcended.
    const perks = new Map([...owned].map((id) => [id, keptPerks(member?.heroes?.[id]?.perks, member?.heroes?.[id]?.transcend)]));
    const rewardable = begun < CONFIG.hero.rewardsPerDay;
    run.players.set(userId, { owned, gear, sets, uws, skills, perks, rewardable });
    const doc: TmRunDoc = {
      _id: `${run.id}:${userId}`,
      run: run.id,
      guildId,
      userId,
      boss: TM_BOSS,
      seed: run.seed,
      stage,
      heroes: heroes.filter((hero) => owned.has(hero.id)).map((hero) => ({ ...hero, gear: gear.get(hero.id) ?? {}, set: sets.get(hero.id) ?? null, uw: uws.get(hero.id) ?? null, skills: skills.get(hero.id) ?? [], perks: perks.get(hero.id) ?? [] })),
      version: SIM_VERSION,
      startedAt: now,
      day,
      rewardable,
    };
    await tmRuns.insertOne(doc);
  }
  return run;
}

/** What a player found: a TechnoMagic item, and the additional skill and potentials its copy came with. */
export interface TmFind {
  item: ItemDef;
  skill: string;
  potentials: TmPotential[];
}

/**
 * A room's run is over (`result`, after `ticks` steps): a win at `stage` gives each player whose run gives gear
 * that stage's TechnoMagic items (tmDropCount), each copy with an additional skill and its potentials rolled for
 * it. Returns what each found.
 */
export async function finishRun(guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, now: Date = new Date()): Promise<Map<string, TmFind[]>> {
  const found = new Map<string, TmFind[]>();
  for (const [userId, player] of run.players) {
    const drops: TmFind[] = [];
    for (let n = result === 'won' && player.rewardable ? tmDropCount(stage) : 0; n > 0; n--) {
      const item = rollTmDrop(TM_BOSS);
      if (!item) break;
      const { copy } = await addCopy(guildId, userId, item.id);
      // Its additional skill (the same list whatever its set) and its potentials, rolled now.
      const skill = rollTmSkill();
      const potentials = rollTmPotentials();
      await collections().items.updateOne({ _id: copy._id }, { $set: { tmSkill: skill, tmPotentials: potentials } });
      drops.push({ item, skill, potentials });
    }
    found.set(userId, drops);
    await collections().tmRuns.updateOne({ _id: `${run.id}:${userId}` }, { $set: { claimedAt: now, result, ticks, drops: drops.map(({ item }) => item.id) } });
  }
  return found;
}
