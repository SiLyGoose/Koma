import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { keptPerks } from '../data/transcend.js';
import { collections } from '../db.js';
import { raidGear } from '../lib/game/heroes.js';
import { tmDropCount } from '../constants/technomagic.js';
import { dragonPay, isDragon, rollDragonEssences, rollDragonGear } from '../lib/game/dragon.js';
import { rollTmArmorDef, rollTmDrop, rollTmPotentials, rollTmSkill, SIM_VERSION, TM_BOSS } from '../lib/game/technomagic.js';
import type { EssenceId } from '../data/transcend.js';
import type { ItemDef, TmArmorDef, TmPotential, TmRunDoc, TmSetId } from '../types.js';
import { addCopy, ensureMember } from './economy/index.js';
import { giveEssences } from './economy/essences.js';
import { recordLedger } from './economy/shared.js';

/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then. The bot runs the fight itself; a win gives each player in it (however many
 * runs they have won that day: there is no daily limit) TechnoMagic items (TM_DROP_COUNTS, by the stage), each copy with an additional skill and its potentials rolled for it
 * (ItemCopyDoc.tmSkill, tmPotentials; an armor's main stat's DEF too, tmArmorDef), and `hero.winPoints` points.
 * The Dragon Raid's runs are kept the same way (their boss a dragon: lib/game/dragon.ts), and a win gives each player hero
 * gear (raid items: DRAGON_DROPS), points and hero essences of its dragon's kinds, more at the higher stages (`dragon.*`).
 */

/** The ids of the heroes a member owns (that still exist). */
export async function ownedHeroes(guildId: string, userId: string): Promise<string[]> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
  return Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id));
}

/** The highest stage a member has won a run against `boss` at (0: none yet). */
export async function clearedStage(guildId: string, userId: string, boss: string = TM_BOSS): Promise<number> {
  const best = await collections().tmRuns.findOne({ guildId, userId, boss, result: 'won' }, { sort: { stage: -1 }, projection: { stage: 1 } });
  return best?.stage ?? 0;
}

/** A room's run, begun: its id, boss and seed, and for each player the heroes they own and each one's gear. */
export interface BegunRun {
  id: string;
  boss: string;
  seed: number;
  players: Map<string, { owned: Set<string>; gear: Map<string, Record<string, number>>; sets: Map<string, TmSetId | null>; uws: Map<string, number | null>; uts: Map<string, { skill: number; tier: number } | null>; skills: Map<string, string[]>; perks: Map<string, string[]> }>;
}

/**
 * Begins a room's run against `boss` at `stage` for each of its players with their `heroes` (the lineup's): reads what each
 * owns and their gear, and keeps a run for each.
 */
export async function beginRun(guildId: string, stage: number, players: readonly { userId: string; heroes: readonly { id: string; skin: number }[] }[], now: Date = new Date(), boss: string = TM_BOSS): Promise<BegunRun> {
  const { items, members, tmRuns } = collections();
  const run: BegunRun = { id: randomBytes(12).toString('base64url'), boss, seed: randomBytes(4).readUInt32LE(0), players: new Map() };
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
      boss,
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

/** What a player found: a TechnoMagic item, and the additional skill and potentials its copy came with (an armor's main stat's DEF too); or (the Dragon Raid's) a raid item, with none. */
export interface TmFind {
  item: ItemDef;
  skill: string | null;
  potentials: TmPotential[];
  armorDef?: TmArmorDef;
}

/** What a run over gave a player: the items they found, the points they were paid, and (the Dragon Raid's) the hero essences. */
export interface TmWin {
  finds: TmFind[];
  points: number;
  essences?: Partial<Record<EssenceId, number>>;
}

/**
 * A room's run is over (`result`, after `ticks` steps): a win at `stage` pays each of its players (payTmWin, or a dragon's:
 * payDragonWin); those who left it (`forfeited`) get nothing. Returns what each got.
 */
export async function finishRun(guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, forfeited: ReadonlySet<string> = new Set(), now: Date = new Date()): Promise<Map<string, TmWin>> {
  const found = new Map<string, TmWin>();
  const dragon = isDragon(run.boss);
  for (const userId of run.players.keys()) {
    // One who left it (forfeited) is paid nothing, and it counts as lost for them (it opens no stage).
    const paid = result === 'won' && !forfeited.has(userId);
    const won: TmWin = !paid ? { finds: [], points: 0 } : dragon ? await payDragonWin(guildId, userId, run.boss, stage) : await payTmWin(guildId, userId, run.boss, stage);
    found.set(userId, won);
    await collections().tmRuns.updateOne(
      { _id: `${run.id}:${userId}` },
      { $set: { claimedAt: now, result: forfeited.has(userId) ? 'lost' : result, ticks, drops: won.finds.map(({ item }) => item.id), ...(won.essences && { essences: won.essences }) } },
    );
  }
  return found;
}

/** Pays `points` points for a won run (`reason`: whose). */
async function payPoints(guildId: string, userId: string, points: number, reason: 'tm_win' | 'dragon_win'): Promise<void> {
  if (points <= 0) return;
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, { $inc: { points } });
  await recordLedger([{ guildId, userId, delta: points, reason }]);
}

/**
 * A TechnoMagic Raid win at `stage`: that stage's TechnoMagic items of the boss's set (tmDropCount), each copy with an
 * additional skill and its potentials rolled for it, and `hero.winPoints` points.
 */
async function payTmWin(guildId: string, userId: string, boss: string, stage: number): Promise<TmWin> {
  const finds: TmFind[] = [];
  for (let n = tmDropCount(stage); n > 0; n--) {
    const item = rollTmDrop(boss);
    if (!item) break;
    const { copy } = await addCopy(guildId, userId, item.id);
    // Its additional skill (the same list whatever its set) and its potentials, rolled now; and an armor's main stat's DEF.
    const skill = rollTmSkill();
    const potentials = rollTmPotentials();
    const armorDef = item.slot === 'armor' ? rollTmArmorDef() : undefined;
    await collections().items.updateOne({ _id: copy._id }, { $set: { tmSkill: skill, tmPotentials: potentials, ...(armorDef && { tmArmorDef: armorDef }) } });
    finds.push({ item, skill, potentials, ...(armorDef && { armorDef }) });
  }
  const points = Math.max(0, CONFIG.hero.winPoints);
  await payPoints(guildId, userId, points, 'tm_win');
  return { finds, points };
}

/** A Dragon Raid win at `stage` against `dragon`: its hero gear (raid items: rollDragonGear), its points, and its dragon's essences (dragonPay). */
async function payDragonWin(guildId: string, userId: string, dragon: string, stage: number): Promise<TmWin> {
  const finds: TmFind[] = [];
  for (const item of rollDragonGear(stage)) {
    await addCopy(guildId, userId, item.id);
    finds.push({ item, skill: null, potentials: [] });
  }
  const pay = dragonPay(stage);
  await payPoints(guildId, userId, pay.points, 'dragon_win');
  const essences = rollDragonEssences(dragon, pay.essences);
  await giveEssences(guildId, userId, essences, 'dragon_essences');
  return { finds, points: pay.points, essences };
}
