import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { keptPerks } from '../data/transcend.js';
import { collections } from '../db.js';
import { raidGear } from '../lib/game/heroes.js';
import { tmDropCount } from '../constants/technomagic.js';
import { rollTmArmorDef, rollTmDrop, rollTmPotentials, rollTmSkill, SIM_VERSION, TM_BOSS } from '../lib/game/technomagic.js';
import type { ItemDef, TmArmorDef, TmPotential, TmRunDoc, TmSetId } from '../types.js';
import { addCopy, ensureMember } from './economy/index.js';
import { recordLedger } from './economy/shared.js';

/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then. The bot runs the fight itself; a win gives each player in it (however many
 * runs they have won that day: there is no daily limit) TechnoMagic items (TM_DROP_COUNTS, by the stage), each copy with an additional skill and its potentials rolled for it
 * (ItemCopyDoc.tmSkill, tmPotentials; an armor's main stat's DEF too, tmArmorDef), and `hero.winPoints` points.
 */

/** The ids of the heroes a member owns (that still exist). */
export async function ownedHeroes(guildId: string, userId: string): Promise<string[]> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
  return Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id));
}

/** The highest stage a member has won a run at (0: none yet). */
export async function clearedStage(guildId: string, userId: string): Promise<number> {
  const best = await collections().tmRuns.findOne({ guildId, userId, result: 'won' }, { sort: { stage: -1 }, projection: { stage: 1 } });
  return best?.stage ?? 0;
}

/** A room's run, begun: its id and seed, and for each player the heroes they own and each one's gear. */
export interface BegunRun {
  id: string;
  seed: number;
  players: Map<string, { owned: Set<string>; gear: Map<string, Record<string, number>>; sets: Map<string, TmSetId | null>; uws: Map<string, number | null>; uts: Map<string, { skill: number; tier: number } | null>; skills: Map<string, string[]>; perks: Map<string, string[]> }>;
}

/**
 * Begins a room's run at `stage` for each of its players with their `heroes` (the lineup's): reads what each
 * owns and their gear, and keeps a run for each.
 */
export async function beginRun(guildId: string, stage: number, players: readonly { userId: string; heroes: readonly { id: string; skin: number }[] }[], now: Date = new Date()): Promise<BegunRun> {
  const { items, members, tmRuns } = collections();
  const run: BegunRun = { id: randomBytes(12).toString('base64url'), seed: randomBytes(4).readUInt32LE(0), players: new Map() };
  for (const { userId, heroes } of players) {
    const [member, copies] = await Promise.all([
      members.findOne({ guildId, userId }, { projection: { heroes: 1 } }),
      items.find({ guildId, userId }).toArray(),
    ]);
    const owned = new Set(Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id)));
    const loadouts = raidGear(copies, member);
    const gear = new Map([...owned].map((id) => [id, { ...(loadouts.get(id)?.bonus ?? {}) }]));
    const sets = new Map([...owned].map((id) => [id, loadouts.get(id)?.set ?? null]));
    const uws = new Map([...owned].map((id) => [id, loadouts.get(id)?.uw ?? null]));
    const uts = new Map([...owned].map((id) => [id, loadouts.get(id)?.ut ?? null]));
    const skills = new Map([...owned].map((id) => [id, loadouts.get(id)?.skills ?? []]));
    // Its transcendence perks: those picked, as far as it is transcended.
    const perks = new Map([...owned].map((id) => [id, keptPerks(member?.heroes?.[id]?.perks, member?.heroes?.[id]?.transcend)]));
    run.players.set(userId, { owned, gear, sets, uws, uts, skills, perks });
    const doc: TmRunDoc = {
      _id: `${run.id}:${userId}`,
      run: run.id,
      guildId,
      userId,
      boss: TM_BOSS,
      seed: run.seed,
      stage,
      heroes: heroes.filter((hero) => owned.has(hero.id)).map((hero) => ({ ...hero, gear: gear.get(hero.id) ?? {}, set: sets.get(hero.id) ?? null, uw: uws.get(hero.id) ?? null, ut: uts.get(hero.id) ?? null, skills: skills.get(hero.id) ?? [], perks: perks.get(hero.id) ?? [] })),
      version: SIM_VERSION,
      startedAt: now,
    };
    await tmRuns.insertOne(doc);
  }
  return run;
}

/** What a player found: a TechnoMagic item, and the additional skill and potentials its copy came with (an armor's main stat's DEF too). */
export interface TmFind {
  item: ItemDef;
  skill: string;
  potentials: TmPotential[];
  armorDef?: TmArmorDef;
}

/** What a run over gave a player: the TechnoMagic items they found, and the points they were paid. */
export interface TmWin {
  finds: TmFind[];
  points: number;
}

/**
 * A room's run is over (`result`, after `ticks` steps): a win at `stage` gives each of its players
 * that stage's TechnoMagic items (tmDropCount), each copy with an additional skill and its potentials rolled for
 * it, and pays them `hero.winPoints` points; those who left it (`forfeited`) get nothing. Returns what each got.
 */
export async function finishRun(guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, forfeited: ReadonlySet<string> = new Set(), now: Date = new Date()): Promise<Map<string, TmWin>> {
  const found = new Map<string, TmWin>();
  for (const [userId, player] of run.players) {
    // One who left it (forfeited) is paid nothing, and it counts as lost for them (it opens no stage).
    const paid = result === 'won' && !forfeited.has(userId);
    const drops: TmFind[] = [];
    for (let n = paid ? tmDropCount(stage) : 0; n > 0; n--) {
      const item = rollTmDrop(TM_BOSS);
      if (!item) break;
      const { copy } = await addCopy(guildId, userId, item.id);
      // Its additional skill (the same list whatever its set) and its potentials, rolled now; and an armor's main stat's DEF.
      const skill = rollTmSkill();
      const potentials = rollTmPotentials();
      const armorDef = item.slot === 'armor' ? rollTmArmorDef() : undefined;
      await collections().items.updateOne({ _id: copy._id }, { $set: { tmSkill: skill, tmPotentials: potentials, ...(armorDef && { tmArmorDef: armorDef }) } });
      drops.push({ item, skill, potentials, ...(armorDef && { armorDef }) });
    }
    const points = paid ? Math.max(0, CONFIG.hero.winPoints) : 0;
    if (points > 0) {
      await ensureMember(guildId, userId);
      await collections().members.updateOne({ guildId, userId }, { $inc: { points } });
      await recordLedger([{ guildId, userId, delta: points, reason: 'tm_win' }]);
    }
    found.set(userId, { finds: drops, points });
    await collections().tmRuns.updateOne({ _id: `${run.id}:${userId}` }, { $set: { claimedAt: now, result: forfeited.has(userId) ? 'lost' : result, ticks, drops: drops.map(({ item }) => item.id) } });
  }
  return found;
}
