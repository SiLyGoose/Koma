import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { DRAGON_ROOM, TM_CRYSTALS, TM_ROOM, tmStoneName } from '../constants/technomagic.js';
import { ESSENCE_NAME, type EssenceId } from '../data/transcend.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { KR_RUNES_BY_ID, tieredName } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { lootBoxOf } from '../data/loot-boxes.js';
import { DRAGONS } from '../lib/game/dragon.js';
import { STEP_SECONDS, TM_BOSSES, type Run } from '../lib/game/technomagic.js';
import type { RaidMode } from '../protocol/technomagic.js';
import type { MailAttachment, TmBatchDoc, TmBatchGot } from '../types.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { sendMail } from './mail.js';
import { beginRun, clearedStages, finishRun, ownedHeroes, type BegunRun, type TmWin } from './technomagic.js';

/*
 * Background raids (TmBatchDoc, the `tm_batches` collection): a member's batch of up to TM_BATCH_MOST TechnoMagic or Dragon Raid
 * runs against one boss, at one stage and mode, with one lineup (alone: Main Team and Sub Team), started from a room of
 * their own on the raid's page. The bot fights them one after another while they're away, each as a room's run is: it
 * costs hero.backgroundPrice points as it begins (out of points, the batch ends), is begun with their heroes' gear and
 * outfits as they are then (./technomagic.ts beginRun), fought out on Auto (as a raid's heroes start: the fights' worker,
 * Fights.fightOut), and over (finishRun) once as long has gone by as it would have taken played: its steps, and
 * BATCH_BETWEEN_MS for the loading and the results between runs. A win clears its stage then (its first clears' komaGems
 * paid), and gives one of King's Raid's Dispatch Battle Loot of its boss, mode and stage (data/loot-boxes.ts) in place of the
 * rest; a lost one pays nothing and the batch goes on. Stopped, the run being fought is given up (it pays nothing). Ended, for
 * whatever reason, a mail says how the runs went and carries the boxes they won (claimed, they're held in the Inventory's
 * Others until opened: ./loot-boxes.ts). One batch runs at a time a member; while it does, they can't fight in the raids' rooms (their
 * server.ts). Each step is kept in the batch's document, so a bot started again picks every batch up where it was
 * (resumeBatches).
 */

/** The most runs a batch takes. */
export const TM_BATCH_MOST = 200;

/** Between one run and the next, as a room has it: its loading, the march in, and the results screen. */
export const BATCH_BETWEEN_MS = 15_000;

/** How long a run of `ticks` steps takes, as it would played (ms): its fight in real time, and what comes between runs in a room. */
export const batchRunMs = (ticks: number): number => Math.round(ticks * STEP_SECONDS * 1000) + BATCH_BETWEEN_MS;

/** What a batch's runs are fought with: a whole fight, fought out (the fights' worker: web/games/technomagic/fight.ts). */
export interface BatchFights {
  fightOut(run: Run): Promise<{ result: 'won' | 'lost'; ticks: number } | string>;
}

/** What starting a batch asks for: the raid, its boss, mode and stage, the lineup (each hero, and whether in the Sub Team), and how many runs. */
export interface BatchAsk {
  raid: 'technomagic' | 'dragon';
  boss: string;
  mode: RaidMode;
  stage: number;
  heroes: readonly { id: string; sub?: boolean }[];
  count: number;
}

/** Why a batch couldn't be started. */
export type BatchRefusal = 'running' | 'fighting' | 'bad_count' | 'boss' | 'mode' | 'locked' | 'heroes' | 'not_owned' | 'team_full' | 'too_poor';

const newBatchId = (): string => randomBytes(12).toString('base64url');

/** Nothing got yet. */
const nothingGot = (): TmBatchGot => ({ points: 0, gems: 0, essences: {}, stones: {}, crystals: {}, items: {}, salvaged: {}, runes: {}, firstClears: 0, boxes: 0 });

/** A member's batch running (null: none). */
export const runningBatch = (guildId: string, userId: string): Promise<TmBatchDoc | null> => collections().tmBatches.findOne({ guildId, userId, state: 'running' });

/** A member's latest batch, running or not (null: none ever). */
export const latestBatch = (guildId: string, userId: string): Promise<TmBatchDoc | null> => collections().tmBatches.findOne({ guildId, userId }, { sort: { startedAt: -1 } });

/** The raid's bosses (the TechnoMagic Raid's, or the Dragon Raid's dragons) and its lineup's sizes alone. */
const raidOf = (raid: BatchAsk['raid']) => (raid === 'dragon' ? { bosses: DRAGONS, room: DRAGON_ROOM } : { bosses: TM_BOSSES, room: TM_ROOM });

/** What's wrong with a batch asked for, as a room of their own would have it (null: nothing). */
export async function checkBatch(guildId: string, userId: string, ask: BatchAsk): Promise<BatchRefusal | null> {
  if (!Number.isInteger(ask.count) || ask.count < 1 || ask.count > TM_BATCH_MOST) return 'bad_count';
  const { bosses, room } = raidOf(ask.raid);
  const boss = bosses.find((one) => one.id === ask.boss);
  if (!boss) return 'boss';
  if (ask.mode !== 'hard' && !(ask.mode === 'normal' && boss.normal)) return 'mode';
  const stages = ask.mode === 'normal' ? (boss.normal ?? 0) : boss.stages;
  // A stage they could pick in a room: up to the one after the highest they have won.
  const cleared = await clearedStages(guildId, userId, boss.id);
  if (!Number.isInteger(ask.stage) || ask.stage < 1 || ask.stage > stages || ask.stage > cleared[ask.mode] + 1) return 'locked';
  const ids = ask.heroes.map((hero) => hero.id);
  const main = ask.heroes.filter((hero) => !hero.sub).length;
  if (ids.length === 0 || main === 0 || new Set(ids).size !== ids.length) return 'heroes';
  if (main > room.mainTeam || ids.length - main > room.soloSlots - room.mainTeam) return 'team_full';
  const owned = await ownedHeroes(guildId, userId);
  if (!ids.every((id) => owned.has(id))) return 'not_owned';
  return null;
}

/** Starts a batch (the raid's page has sent them away from its rooms first): it, or why not. Its first run begins straight away. */
export async function startBatch(guildId: string, userId: string, ask: BatchAsk, now: Date = new Date()): Promise<TmBatchDoc | BatchRefusal> {
  const wrong = await checkBatch(guildId, userId, ask);
  if (wrong) return wrong;
  if (await runningBatch(guildId, userId)) return 'running';
  await ensureMember(guildId, userId);
  const member = await collections().members.findOne({ guildId, userId }, { projection: { points: 1 } });
  if ((member?.points ?? 0) < CONFIG.hero.backgroundPrice) return 'too_poor';
  const doc: TmBatchDoc = {
    _id: newBatchId(),
    guildId,
    userId,
    raid: ask.raid,
    boss: ask.boss,
    ...(ask.mode === 'normal' && { mode: 'normal' as const }),
    stage: ask.stage,
    heroes: ask.heroes.map(({ id, sub }) => ({ id, ...(sub && { sub: true }) })),
    count: ask.count,
    done: 0,
    won: 0,
    lost: 0,
    spent: 0,
    state: 'running',
    current: null,
    got: nothingGot(),
    startedAt: now,
  };
  try {
    await collections().tmBatches.insertOne(doc);
  } catch (err) {
    // (One running a member, by its index: a second started at the same time.)
    if ((err as { code?: number }).code === 11000) return 'running';
    throw err;
  }
  schedule(doc._id, now.getTime());
  return doc;
}

/** Stops a member's batch: the run being fought given up (it pays nothing), and the mail sent. False: none running. */
export async function stopBatch(guildId: string, userId: string): Promise<boolean> {
  const batch = await collections().tmBatches.findOneAndUpdate({ guildId, userId, state: 'running' }, { $set: { stopAsked: true } }, { returnDocument: 'after' });
  if (!batch) return false;
  schedule(batch._id, Date.now());
  return true;
}

// ---------------------------------------------------------------------------------------------- the runs, one after another

let fights: BatchFights | null = null;
const timers = new Map<string, NodeJS.Timeout>();
/** The batches being stepped right now; and those asked to step again meanwhile (once that's done). */
const stepping = new Set<string>();
const again = new Set<string>();

/** Steps batch `id` on at `at` (ms): its run paid, its next begun. */
function schedule(id: string, at: number): void {
  clearTimeout(timers.get(id));
  if (!fights) return;
  timers.set(
    id,
    setTimeout(() => void step(id), Math.max(0, at - Date.now())),
  );
}

/** Starts the background raids: every batch running picked up where it was (the bot started again), its runs fought with `with`. */
export async function resumeBatches(with_: BatchFights): Promise<void> {
  fights = with_;
  const running = await collections().tmBatches.find({ state: 'running' }).toArray();
  for (const batch of running) schedule(batch._id, batch.current ? batch.current.endsAt.getTime() : Date.now());
}

/** Stops stepping every batch (the bot going away); they're picked up again as it starts. */
export function pauseBatches(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  fights = null;
}

async function step(id: string): Promise<void> {
  if (stepping.has(id)) {
    again.add(id);
    return;
  }
  stepping.add(id);
  timers.delete(id);
  try {
    await stepOnce(id);
  } catch (err) {
    console.error(`A batch of background raids (${id}) could not go on:`, err);
    // (Tried again a little later: the database or the worker may be back.)
    schedule(id, Date.now() + 60_000);
  } finally {
    stepping.delete(id);
    if (again.delete(id)) void step(id);
  }
}

/** One step of a batch: its run over paid (or, stopped, given up), then its next begun, or it ended. */
async function stepOnce(id: string): Promise<void> {
  const { tmBatches } = collections();
  const batch = await tmBatches.findOne({ _id: id, state: 'running' });
  if (!batch) return;
  const now = new Date();
  if (batch.current) {
    if (!batch.stopAsked && now < batch.current.endsAt) return schedule(id, batch.current.endsAt.getTime());
    await payCurrent(batch, batch.stopAsked === true, now);
  }
  if (batch.stopAsked) return endBatch(batch, 'stopped', now);
  if (batch.done >= batch.count) return endBatch(batch, 'finished', now);
  await beginNext(batch, now);
}

/** A batch's run as finishRun takes it back: its id, boss, mode and seed, and the member's heroes in it. */
function begunAgain(batch: TmBatchDoc, current: NonNullable<TmBatchDoc['current']>): BegunRun {
  const heroes = current.heroes;
  const each = <T>(value: T) => new Map(heroes.map((hero) => [hero, value]));
  return {
    id: current.run,
    boss: batch.boss,
    ...(batch.mode && { mode: batch.mode }),
    seed: current.seed,
    players: new Map([[batch.userId, { owned: new Set(heroes), gear: each({}), sets: each(null), uws: each(null), uts: each(null), artifacts: each(null), skills: each([]), perks: each([]) }]]),
  };
}

/** Adds what a run gave to what the batch has got. */
function add(got: TmBatchGot, won: TmWin): void {
  const more = (into: Record<string, number>, key: string, n = 1): void => {
    into[key] = (into[key] ?? 0) + n;
  };
  got.points += won.points;
  got.gems += won.gems ?? 0;
  for (const [kind, n] of Object.entries(won.essences ?? {})) more(got.essences as Record<string, number>, kind, n ?? 0);
  if (won.stones) more(got.stones, won.stones.class, won.stones.count);
  if (won.crystals) more(got.crystals, won.crystals.set, won.crystals.count);
  for (const find of won.finds) more(find.salvaged === undefined ? got.items : got.salvaged, find.item.id);
  for (const rune of won.runes ?? []) more(got.runes, rune);
  got.firstClears += won.firstClears ?? 0;
}

/** Ends the batch's run over (`givenUp`: stopped, it pays nothing and counts as lost): a win's first clears paid, and its box counted, into the batch (`batch` follows). */
async function payCurrent(batch: TmBatchDoc, givenUp: boolean, now: Date): Promise<void> {
  const current = batch.current as NonNullable<TmBatchDoc['current']>;
  // (Paid once: a bot stopped after paying it, but before saying so in the batch, doesn't pay it again.)
  const record = await collections().tmRuns.findOne({ _id: `${current.run}:${batch.userId}` }, { projection: { claimedAt: 1 } });
  const result = givenUp ? 'lost' : current.result;
  if (!record?.claimedAt) {
    const paid = await finishRun(batch.guildId, begunAgain(batch, current), batch.stage, current.result, current.ticks, givenUp ? new Set([batch.userId]) : new Set(), now, true);
    const won = paid.get(batch.userId);
    if (won) add(batch.got, won);
  }
  batch.done += 1;
  // (Its Dispatch Battle Loot, counted with the win: the batch's mail carries them.)
  if (result === 'won') {
    batch.won += 1;
    batch.got.boxes = (batch.got.boxes ?? 0) + 1;
  } else batch.lost += 1;
  batch.current = null;
  await collections().tmBatches.updateOne({ _id: batch._id, 'current.run': current.run }, { $set: { current: null, got: batch.got, done: batch.done, won: batch.won, lost: batch.lost } });
}

/** Begins the batch's next run: paid for, begun, fought out, and its end waited for. Can't be (out of points, heroes gone): it ends. */
async function beginNext(batch: TmBatchDoc, now: Date): Promise<void> {
  const { members, tmBatches } = collections();
  const { guildId, userId } = batch;
  const price = CONFIG.hero.backgroundPrice;
  const paid = price === 0 || (await members.findOneAndUpdate({ guildId, userId, points: { $gte: price } }, { $inc: { points: -price } }));
  if (!paid) return endBatch(batch, 'too_poor', now);
  const refund = async (): Promise<void> => {
    if (price > 0) await members.updateOne({ guildId, userId }, { $inc: { points: price } });
  };
  if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason: 'tm_background', itemId: batch._id }]);

  const mode: RaidMode = batch.mode === 'normal' ? 'normal' : 'hard';
  const begun = await beginRun(guildId, batch.stage, [{ userId, heroes: batch.heroes.map(({ id }) => ({ id, skin: 0 })) }], now, batch.boss, mode);
  const player = begun.players.get(userId);
  // Those of the lineup still theirs (one sold meanwhile is left out), in it as each is now.
  const heroes = batch.heroes.filter((hero) => player?.owned.has(hero.id));
  if (!player || !heroes.some((hero) => !hero.sub)) {
    await refund();
    return endBatch(batch, 'no_heroes', now);
  }
  const run: Run = {
    boss: batch.boss,
    seed: begun.seed,
    stage: batch.stage,
    solo: true,
    ...(batch.mode && { mode: batch.mode }),
    heroes: heroes.map(({ id, sub }) => ({
      id,
      skin: player.skins?.get(id) ?? 0,
      gear: player.gear.get(id) ?? {},
      set: player.sets.get(id) ?? null,
      uw: player.uws.get(id) ?? null,
      ut: player.uts.get(id) ?? null,
      artifact: player.artifacts.get(id) ?? null,
      skills: player.skills.get(id) ?? [],
      perks: player.perks.get(id) ?? [],
      ...(sub && { sub: true }),
    })),
  };
  const fought = fights ? await fights.fightOut(run) : 'no fights';
  if (typeof fought === 'string') {
    console.error(`A background raid could not be fought (${fought}).`);
    await refund();
    return endBatch(batch, 'failed', now);
  }
  const endsAt = new Date(now.getTime() + batchRunMs(fought.ticks));
  batch.current = { run: begun.id, seed: begun.seed, result: fought.result, ticks: fought.ticks, startedAt: now, endsAt, heroes: heroes.map((hero) => hero.id) };
  batch.spent += price;
  await tmBatches.updateOne({ _id: batch._id }, { $set: { current: batch.current, spent: batch.spent } });
  schedule(batch._id, endsAt.getTime());
}

/** Ends a batch, saying why, and sends its mail. */
async function endBatch(batch: TmBatchDoc, end: NonNullable<TmBatchDoc['end']>, now: Date): Promise<void> {
  const ended = await collections().tmBatches.findOneAndUpdate({ _id: batch._id, state: 'running' }, { $set: { state: 'done', end, endedAt: now, current: null }, $unset: { stopAsked: '' } }, { returnDocument: 'after' });
  clearTimeout(timers.get(batch._id));
  timers.delete(batch._id);
  if (!ended) return;
  await sendMail(batch.guildId, [batch.userId], { from: 'system', title: batchTitle(ended), message: batchReport(ended), attachments: batchLoot(ended) }, now);
}

// ---------------------------------------------------------------------------------------------- its mail

const bossName = (batch: Pick<TmBatchDoc, 'raid' | 'boss'>): string => raidOf(batch.raid).bosses.find((boss) => boss.id === batch.boss)?.name ?? batch.boss;

/** Where a batch fought: "Galgoria, stage 5", or a dragon's "Temeraire, Hard 7". */
export function batchWhere(batch: Pick<TmBatchDoc, 'raid' | 'boss' | 'mode' | 'stage'>): string {
  return batch.raid === 'dragon' ? `${bossName(batch)}, ${batch.mode === 'normal' ? 'Normal' : 'Hard'} ${batch.stage}` : `${bossName(batch)}, stage ${batch.stage}`;
}

export const batchTitle = (batch: TmBatchDoc): string => `Background raids: ${batchWhere(batch)}`;

const ENDED: Record<NonNullable<TmBatchDoc['end']>, string> = {
  finished: 'Every raid was fought.',
  stopped: 'You stopped them (the raid being fought then was given up, and paid nothing).',
  too_poor: "They stopped when you couldn't pay for the next raid.",
  no_heroes: 'They stopped when the heroes in the lineup were no longer yours.',
  failed: 'They stopped when a raid could not be fought (it was refunded).',
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** How long a batch took: "2 h 5 min", "14 min", "under a minute". */
function took(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/** The Dispatch Battle Loot a batch's wins gave (data/loot-boxes.ts), as its mail carries them (none: none won, or a batch from before them). */
export function batchLoot(batch: TmBatchDoc): MailAttachment[] {
  const box = lootBoxOf(batch.boss, batch.mode === 'normal' ? 'normal' : 'hard', batch.stage);
  const count = batch.got.boxes ?? 0;
  return box && count > 0 ? [{ kind: 'box', boxId: box.id, count }] : [];
}

/**
 * A batch's mail: how many runs were fought, won and lost, how long they took and what they cost, why it ended, the stages
 * they cleared for the first time, and where its Dispatch Battle Loot go (the mail carries them: batchLoot). A batch from before
 * the boxes (its wins paid as they ended) says what they gave too.
 */
export function batchReport(batch: TmBatchDoc): string {
  const { got } = batch;
  const rate = batch.done > 0 ? Math.round((batch.won / batch.done) * 1000) / 10 : 0;
  const lines: string[] = [
    `${plural(batch.done, 'raid')} of ${batch.count} fought against ${batchWhere(batch)}: ${batch.won} won, ${batch.lost} lost (${rate}% won).`,
    ENDED[batch.end ?? 'finished'],
    `They took ${took((batch.endedAt ?? batch.startedAt).getTime() - batch.startedAt.getTime())} and cost ${plural(batch.spent, 'zeiucoin')}.`,
  ];
  if (got.firstClears > 0) lines.push(`${plural(got.firstClears, 'stage')} cleared for the first time${got.gems > 0 ? `: ${plural(got.gems, 'komaGem')}, already yours` : ''}.`);
  const loot = batchLoot(batch)[0];
  if (loot?.kind === 'box') lines.push('', `Each win gave a Dispatch Battle Loot. Claim ${loot.count === 1 ? 'it' : `all ${loot.count.toLocaleString('en-US')}`}, then open ${loot.count === 1 ? 'it' : 'them'} in your Inventory's Others.`);
  else if (batch.won === 0) lines.push('', 'No raid was won, so there is no loot.');

  // (A batch from before the boxes: its wins paid as they ended.)
  const gave: string[] = [];
  if (got.points > 0) gave.push(plural(got.points, 'zeiucoin'));
  for (const [kind, n] of Object.entries(got.essences)) if (n) gave.push(`${n.toLocaleString('en-US')} ${ESSENCE_NAME[kind as EssenceId] ?? kind}`);
  for (const [cls, n] of Object.entries(got.stones)) gave.push(`${n.toLocaleString('en-US')} ${tmStoneName(cls)}`);
  for (const [set, n] of Object.entries(got.crystals)) gave.push(`${n.toLocaleString('en-US')} Crystal of ${TM_CRYSTALS.boss[set as keyof typeof TM_CRYSTALS.boss] ?? set}`);
  for (const [rune, n] of Object.entries(got.runes)) gave.push(`${n}× ${KR_RUNES_BY_ID.get(rune)?.name ?? rune}`);
  const itemName = (id: string): string => {
    const item = ITEMS_BY_ID.get(id);
    return item ? tieredName(item) : id;
  };
  for (const [id, n] of Object.entries(got.items)) gave.push(`${n}× ${itemName(id)}`);
  for (const [id, n] of Object.entries(got.salvaged)) gave.push(`${n}× ${itemName(id)} (salvaged as it dropped, by your rule)`);
  if (gave.length > 0) lines.push('', 'The raids won before the loot boxes gave (already yours):', ...gave.map((one) => `• ${one}`));
  return lines.join('\n');
}
