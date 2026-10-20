import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { keptPerks } from '../data/transcend.js';
import { collections } from '../db.js';
import { raidGear } from '../lib/game/heroes.js';
import { dragonClearGems, tmDropCount } from '../constants/technomagic.js';
import { dragonPay, isDragon, rollDragonEssences } from '../lib/game/dragon.js';
import { rollArtifact, rollDragonPieces, rollRunes, rollTmDrop, rollTmSkill, SIM_VERSION, TM_BOSS } from '../lib/game/technomagic.js';
import { rollKrOptions } from '../data/kr-gear.js';
import type { EssenceId } from '../data/transcend.js';
import type { ItemDef, KrOption, TmArmorDef, TmPotential, TmRunDoc, TmSetId } from '../types.js';
import type { RaidMode } from '../protocol/technomagic.js';
import { addCopy, ensureMember, giveGems } from './economy/index.js';
import { giveEssences } from './economy/essences.js';
import { recordLedger } from './economy/shared.js';

/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then. The bot runs the fight itself; a win gives each player in it (however many
 * runs they have won that day: there is no daily limit) TechnoMagic items (TM_DROP_COUNTS, by the stage), each copy with an additional skill and its potentials rolled for it
 * (ItemCopyDoc.tmSkill, tmPotentials; an armor's main stat's DEF too, tmArmorDef), and `hero.winPoints` points.
 * The Dragon Raid's runs are kept the same way (their boss a dragon: lib/game/dragon.ts), and a win gives each player hero
 * gear (raid items: DRAGON_DROPS), points and hero essences of its dragon's kinds, more at the higher stages (`dragon.*`), and
 * komaGems for each stage up to it they hadn't cleared before (DRAGON_GEMS).
 * A dragon's run is in its Normal or Hard mode (TmRunDoc.mode), each with stages of its own, opened apart.
 */

/** The ids of the heroes a member owns (that still exist). */
export async function ownedHeroes(guildId: string, userId: string): Promise<string[]> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
  return Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id));
}

/** The highest stage a member has won a run against `boss` at, in `mode` (0: none yet). A run with no mode is a Hard one (every run from before Normal). */
export async function clearedStage(guildId: string, userId: string, boss: string = TM_BOSS, mode: RaidMode = 'hard'): Promise<number> {
  const best = await collections().tmRuns.findOne({ guildId, userId, boss, result: 'won', mode: mode === 'normal' ? 'normal' : { $ne: 'normal' } }, { sort: { stage: -1 }, projection: { stage: 1 } });
  return best?.stage ?? 0;
}

/** The highest stage a member has won against `boss` in each mode (0: none yet). */
export async function clearedStages(guildId: string, userId: string, boss: string = TM_BOSS): Promise<Record<RaidMode, number>> {
  const [hard, normal] = await Promise.all([clearedStage(guildId, userId, boss, 'hard'), isDragon(boss) ? clearedStage(guildId, userId, boss, 'normal') : 0]);
  return { hard, normal };
}

/** A room's run, begun: its id, boss, the boss's mode (none: Hard) and the seed, and for each player the heroes they own and each one's gear. */
export interface BegunRun {
  id: string;
  boss: string;
  mode?: RaidMode;
  seed: number;
  players: Map<
    string,
    {
      owned: Set<string>;
      gear: Map<string, Record<string, number>>;
      sets: Map<string, TmSetId | null>;
      uws: Map<string, number | null>;
      uts: Map<string, { skill: number; tier: number } | null>;
      artifacts: Map<string, { id: string; tier: number } | null>;
      skills: Map<string, string[]>;
      perks: Map<string, string[]>;
    }
  >;
}

/**
 * Begins a room's run against `boss` (in `mode`) at `stage` for each of its players with their `heroes` (the lineup's): reads
 * what each owns and their gear, and keeps a run for each.
 */
export async function beginRun(guildId: string, stage: number, players: readonly { userId: string; heroes: readonly { id: string; skin: number }[] }[], now: Date = new Date(), boss: string = TM_BOSS, mode: RaidMode = 'hard'): Promise<BegunRun> {
  const { items, members, tmRuns } = collections();
  const run: BegunRun = { id: randomBytes(12).toString('base64url'), boss, mode, seed: randomBytes(4).readUInt32LE(0), players: new Map() };
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
    const artifacts = new Map([...owned].map((id) => [id, loadouts.get(id)?.artifact ?? null]));
    const skills = new Map([...owned].map((id) => [id, loadouts.get(id)?.skills ?? []]));
    // Its transcendence perks: those picked, as far as it is transcended.
    const perks = new Map([...owned].map((id) => [id, keptPerks(member?.heroes?.[id]?.perks, member?.heroes?.[id]?.transcend)]));
    run.players.set(userId, { owned, gear, sets, uws, uts, artifacts, skills, perks });
    const doc: TmRunDoc = {
      _id: `${run.id}:${userId}`,
      run: run.id,
      guildId,
      userId,
      boss,
      ...(mode === 'normal' && { mode }),
      seed: run.seed,
      stage,
      heroes: heroes.filter((hero) => owned.has(hero.id)).map((hero) => ({ ...hero, gear: gear.get(hero.id) ?? {}, set: sets.get(hero.id) ?? null, uw: uws.get(hero.id) ?? null, ut: uts.get(hero.id) ?? null, artifact: artifacts.get(hero.id) ?? null, skills: skills.get(hero.id) ?? [], perks: perks.get(hero.id) ?? [] })),
      version: SIM_VERSION,
      startedAt: now,
    };
    await tmRuns.insertOne(doc);
  }
  return run;
}

/**
 * What a player found: a piece (or an artifact), and the options and unique option (its additional skill) its copy came with;
 * the old TechnoMagic gear's potentials and armor DEF, for what still reads them.
 */
export interface TmFind {
  item: ItemDef;
  skill: string | null;
  potentials: TmPotential[];
  options?: KrOption[];
  armorDef?: TmArmorDef;
}

/**
 * What a run over gave a player: the items they found, the runes (their ids), the points they were paid, and (the Dragon Raid's)
 * the hero essences and komaGems, and how many stages it cleared for the first time (each pays komaGems: it and those under it).
 */
export interface TmWin {
  finds: TmFind[];
  runes?: string[];
  points: number;
  essences?: Partial<Record<EssenceId, number>>;
  gems?: number;
  firstClears?: number;
}

/** A piece found: a copy of it, with its options and (TechnoMagic gear) its additional skill rolled for it. */
async function findPiece(guildId: string, userId: string, item: ItemDef): Promise<TmFind> {
  const { copy } = await addCopy(guildId, userId, item.id);
  const options = item.kr ? rollKrOptions(item.kr) : [];
  const skill = item.kr?.unique ? rollTmSkill() : null;
  if (options.length > 0 || skill) await collections().items.updateOne({ _id: copy._id }, { $set: { ...(options.length > 0 && { options }), ...(skill && { tmSkill: skill }) } });
  return { item, skill, potentials: [], ...(options.length > 0 && { options }) };
}

/** Runes found: added to the member's. */
async function giveRunes(guildId: string, userId: string, runes: readonly string[]): Promise<void> {
  if (runes.length === 0) return;
  const inc: Record<string, number> = {};
  for (const id of runes) inc[`runes.${id}`] = (inc[`runes.${id}`] ?? 0) + 1;
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, { $inc: inc });
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
    const won: TmWin = !paid ? { finds: [], points: 0 } : dragon ? await payDragonWin(guildId, userId, run.boss, stage, run.mode) : await payTmWin(guildId, userId, run.boss, stage);
    found.set(userId, won);
    await collections().tmRuns.updateOne(
      { _id: `${run.id}:${userId}` },
      { $set: { claimedAt: now, result: forfeited.has(userId) ? 'lost' : result, ticks, drops: won.finds.map(({ item }) => item.id), ...(won.runes && { runes: won.runes }), ...(won.essences && { essences: won.essences }), ...(won.gems && { gems: won.gems }) } },
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
 * A TechnoMagic Raid win at `stage`: that stage's pieces of the boss's set (tmDropCount), each copy with its options and its
 * additional skill rolled for it; its runes; now and then an artifact; and `hero.winPoints` points.
 */
async function payTmWin(guildId: string, userId: string, boss: string, stage: number): Promise<TmWin> {
  const finds: TmFind[] = [];
  for (let n = tmDropCount(stage); n > 0; n--) {
    const item = rollTmDrop(boss);
    if (!item) break;
    finds.push(await findPiece(guildId, userId, item));
  }
  const artifact = rollArtifact(stage);
  if (artifact) finds.push(await findPiece(guildId, userId, artifact));
  const runes = rollRunes(stage, false);
  await giveRunes(guildId, userId, runes);
  const points = Math.max(0, CONFIG.hero.winPoints);
  await payPoints(guildId, userId, points, 'tm_win');
  return { finds, runes, points };
}

/**
 * A Dragon Raid win at `stage` against `dragon` (in `mode`): pieces of its set (rollDragonPieces), its runes, its points, its
 * dragon's essences (dragonPay), and komaGems for each stage up to it they hadn't cleared (dragonClearGems: a win clears every
 * stage under it too, as their progress is the highest they have won; this run isn't marked won yet).
 */
async function payDragonWin(guildId: string, userId: string, dragon: string, stage: number, mode: RaidMode = 'hard'): Promise<TmWin> {
  const cleared = await clearedStage(guildId, userId, dragon, mode);
  const finds: TmFind[] = [];
  for (const item of rollDragonPieces(dragon, stage, undefined, mode)) finds.push(await findPiece(guildId, userId, item));
  const runes = rollRunes(stage, true, undefined, mode);
  await giveRunes(guildId, userId, runes);
  const pay = dragonPay(stage, undefined, mode);
  await payPoints(guildId, userId, pay.points, 'dragon_win');
  const essences = rollDragonEssences(dragon, pay.essences);
  await giveEssences(guildId, userId, essences, 'dragon_essences');
  const gems = dragonClearGems(cleared, stage, mode);
  if (gems > 0) await giveGems(guildId, userId, gems, 'dragon_gems');
  return { finds, runes, points: pay.points, essences, gems, firstClears: Math.max(0, stage - cleared) };
}
