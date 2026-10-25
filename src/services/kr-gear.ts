import { TM_CRYSTALS } from '../constants/technomagic.js';
import { isTmPiece } from '../data/kr-gear.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { KR_RUNES_BY_ID, rerollKrOption, rerollPrice, runeFits, UNIQUE_REROLL_GEMS, upgradable, upgradeKrOption, upgradePrice, type KrRng } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { partOf, socketsOf } from '../lib/game/heroes.js';
import { enhanceUtOptions, rollTmSkill } from '../lib/game/technomagic.js';
import { UT_ENHANCE } from '../data/tm-potentials.js';
import type { HeroKeep, HeroOptionError, HeroRuneError } from '../protocol/heroes.js';
import type { ItemCopyDoc } from '../types.js';
import { recordLedger } from './economy/shared.js';
import { RUNE_KEEP_PRICE } from '../protocol/runes.js';

/*
 * King's Raid's hero gear in the database (the rules are data/kr-gear.ts's): runes put in a copy's sockets and taken out
 * (the member's runes, MemberDoc.runes: one used up as it goes in, given back as it comes out for RUNE_KEEP_PRICE points), and a copy's options rerolled
 * or their amounts rolled again (enhanced) for points (King's Raid's gem prices: data/kr-gear.ts's REROLL_PRICES and UPGRADE_PRICES). Each spends first,
 * then changes the copy only as it was (its options as read): anything else changed it meanwhile, it is paid back.
 */

export type RuneResult = { ok: true } | { ok: false; reason: HeroRuneError };
export type OptionResult = { ok: true } | { ok: false; reason: HeroOptionError };

/** A copy's sockets, as many as it has, each its rune or null. */
const socketsOfCopy = (copy: Pick<ItemCopyDoc, 'runes'>, count: number): (string | null)[] => Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);

/**
 * Puts one of the member's runes (`runeId`) in a socket of one of their copies (its `socket`th, from 0): the rune that was
 * in it (if any) given back for RUNE_KEEP_PRICE points (too few: 'too_poor'). Not a socket it has ('no_socket'), a rune not
 * of its part ('wrong_part'), none of it ('no_rune').
 */
export async function socketRune(guildId: string, userId: string, copyId: string, socket: number, runeId: string): Promise<RuneResult> {
  const { items, members } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  if (!copy || !item) return { ok: false, reason: 'not_found' };
  const count = socketsOf(item);
  if (!Number.isInteger(socket) || socket < 0 || socket >= count) return { ok: false, reason: 'no_socket' };
  const rune = KR_RUNES_BY_ID.get(runeId);
  const part = partOf(item);
  if (!rune || !part || !runeFits(rune, part)) return { ok: false, reason: 'wrong_part' };
  const before = socketsOfCopy(copy, count);
  const old = before[socket] ?? null;
  const fee = old ? RUNE_KEEP_PRICE : 0;
  if (!(await pay(guildId, userId, fee))) return { ok: false, reason: 'too_poor' };
  const taken = await members.updateOne({ guildId, userId, [`runes.${runeId}`]: { $gte: 1 } }, { $inc: { [`runes.${runeId}`]: -1 } });
  if (taken.modifiedCount === 0) {
    await refund(guildId, userId, fee);
    return { ok: false, reason: 'no_rune' };
  }
  const after = before.map((one, i) => (i === socket ? runeId : one));
  const put = await items.updateOne({ guildId, userId, _id: copyId, ...(copy.runes ? { runes: copy.runes } : { runes: { $exists: false } }) }, { $set: { runes: after } });
  if (put.modifiedCount === 0) {
    await members.updateOne({ guildId, userId }, { $inc: { [`runes.${runeId}`]: 1, points: fee } });
    return { ok: false, reason: 'busy' };
  }
  if (old) {
    await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
    await recordLedger([{ guildId, userId, delta: -fee, reason: 'rune_keep', itemId: item.id }]);
  }
  return { ok: true };
}

/**
 * Takes the rune out of a socket of one of their copies (its `socket`th), back to the member's runes, for RUNE_KEEP_PRICE
 * points (too few: 'too_poor'; King's Raid's Rune Preserve). An empty one: 'no_rune'.
 */
export async function unsocketRune(guildId: string, userId: string, copyId: string, socket: number): Promise<RuneResult> {
  const { items, members } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  if (!copy || !item) return { ok: false, reason: 'not_found' };
  const count = socketsOf(item);
  if (!Number.isInteger(socket) || socket < 0 || socket >= count) return { ok: false, reason: 'no_socket' };
  const before = socketsOfCopy(copy, count);
  const old = before[socket];
  if (!old) return { ok: false, reason: 'no_rune' };
  if (!(await pay(guildId, userId, RUNE_KEEP_PRICE))) return { ok: false, reason: 'too_poor' };
  const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
  if (out.modifiedCount === 0) {
    await refund(guildId, userId, RUNE_KEEP_PRICE);
    return { ok: false, reason: 'busy' };
  }
  await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
  await recordLedger([{ guildId, userId, delta: -RUNE_KEEP_PRICE, reason: 'rune_keep', itemId: item.id }]);
  return { ok: true };
}

/** Takes `cost` points from the member (false: they haven't so many). */
async function pay(guildId: string, userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true;
  const paid = await collections().members.updateOne({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } });
  return paid.modifiedCount > 0;
}

/** Gives `cost` points back (what was changed meanwhile wasn't changed after all). */
const refund = async (guildId: string, userId: string, cost: number): Promise<void> => {
  if (cost > 0) await collections().members.updateOne({ guildId, userId }, { $inc: { points: cost } });
};

/** Takes `gems` komaGems from the member (false: they haven't so many). */
async function payGems(guildId: string, userId: string, gems: number): Promise<boolean> {
  if (gems <= 0) return true;
  const paid = await collections().members.updateOne({ guildId, userId, gems: { $gte: gems } }, { $inc: { gems: -gems } });
  return paid.modifiedCount > 0;
}

/** Gives `gems` komaGems back. */
const refundGems = async (guildId: string, userId: string, gems: number): Promise<void> => {
  if (gems > 0) await collections().members.updateOne({ guildId, userId }, { $inc: { gems } });
};

/**
 * Rerolls one of a copy's options (its `index`th, from 0), for points, the price climbing with how many times that one was
 * rerolled (a TechnoMagic piece's: TM_CRYSTALS.reroll of its set's Boss Crystals, King's Raid's; too few: 'no_crystals'); or (`index` 'unique') its unique option (TechnoMagic gear's additional skill), for UNIQUE_REROLL_GEMS komaGems
 * (too few: 'no_gems'): the skill rolled waits beside the one it has (tmSkillPending) for the member to pick one (keepTmSkill),
 * and till then it isn't rerolled again ('pending'). An option rolled waits the same (optionPending, keepOption: King's Raid's
 * Reforge keeps the old one or the new), and till then none of its options is rerolled or enhanced.
 */
export async function rerollOption(guildId: string, userId: string, copyId: string, index: number | 'unique', rng?: KrRng): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  const kr = item?.kr;
  if (!copy || !item || !kr) return { ok: false, reason: 'not_found' };
  if (index === 'unique') {
    if (!kr.unique) return { ok: false, reason: 'no_option' };
    if (copy.tmSkillPending !== undefined) return { ok: false, reason: 'pending' };
    const gems = UNIQUE_REROLL_GEMS;
    if (!(await payGems(guildId, userId, gems))) return { ok: false, reason: 'no_gems' };
    const done = await items.updateOne(
      { guildId, userId, _id: copyId, tmSkill: copy.tmSkill ?? { $exists: false }, tmSkillRerolls: copy.tmSkillRerolls ?? { $exists: false }, tmSkillPending: { $exists: false } },
      { $set: { tmSkillPending: rollTmSkill(rng), tmSkillRerolls: (copy.tmSkillRerolls ?? 0) + 1 } },
    );
    if (done.modifiedCount === 0) {
      await refundGems(guildId, userId, gems);
      return { ok: false, reason: 'busy' };
    }
    await recordLedger([{ guildId, userId, delta: 0, gemDelta: -gems, reason: 'kr_reroll', itemId: item.id }]);
    return { ok: true };
  }
  const options = copy.options ?? [];
  const old = options[index];
  if (!Number.isInteger(index) || !old) return { ok: false, reason: 'no_option' };
  if (copy.optionPending !== undefined) return { ok: false, reason: 'pending' };
  const rolled = rerollKrOption(kr, options, index, rng)?.[index];
  if (!rolled) return { ok: false, reason: 'no_option' };
  // (The option rolled waits beside the one it has: the copy keeps its options till the member picks.)
  const unchanged = { guildId, userId, _id: copyId, options, optionPending: { $exists: false } };
  const pending = { $set: { optionPending: { index, option: rolled } } };
  // (A TechnoMagic piece's: its set's Boss Crystals, King's Raid's, not points.)
  const set = isTmPiece(item) ? kr.set : undefined;
  if (set) {
    const crystals = TM_CRYSTALS.reroll;
    const field = `crystals.${set}`;
    const paid = await collections().members.updateOne({ guildId, userId, [field]: { $gte: crystals } }, { $inc: { [field]: -crystals } });
    if (paid.modifiedCount === 0) return { ok: false, reason: 'no_crystals' };
    const done = await items.updateOne(unchanged, pending);
    if (done.modifiedCount === 0) {
      await collections().members.updateOne({ guildId, userId }, { $inc: { [field]: crystals } });
      return { ok: false, reason: 'busy' };
    }
    return { ok: true };
  }
  const cost = rerollPrice(old.rerolls ?? 0);
  if (!(await pay(guildId, userId, cost))) return { ok: false, reason: 'too_poor' };
  const done = await items.updateOne(unchanged, pending);
  if (done.modifiedCount === 0) {
    await refund(guildId, userId, cost);
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_reroll', itemId: item.id }]);
  return { ok: true };
}

/**
 * Settles a TechnoMagic copy's rerolled additional skill: `keep` 'new' takes the one rolled (tmSkillPending), 'old' keeps the
 * one it had; the one rolled is gone either way (already paid for). None rolled: 'no_option'.
 */
export async function keepTmSkill(guildId: string, userId: string, copyId: string, keep: HeroKeep): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  if (!copy) return { ok: false, reason: 'not_found' };
  const rolled = copy.tmSkillPending;
  if (rolled === undefined) return { ok: false, reason: 'no_option' };
  const done = await items.updateOne(
    { guildId, userId, _id: copyId, tmSkillPending: rolled },
    keep === 'new' ? { $set: { tmSkill: rolled }, $unset: { tmSkillPending: '' } } : { $unset: { tmSkillPending: '' } },
  );
  return done.modifiedCount === 0 ? { ok: false, reason: 'busy' } : { ok: true };
}

/**
 * Settles a copy's rerolled option (optionPending): `keep` 'new' puts the one rolled in its place, 'old' keeps the one it had;
 * the one rolled is gone either way (already paid for), but the old one counts the reroll too (its price climbs as if taken).
 * None rolled (or not its `index`th): 'no_option'.
 */
export async function keepOption(guildId: string, userId: string, copyId: string, keep: HeroKeep, index: number): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  if (!copy) return { ok: false, reason: 'not_found' };
  const rolled = copy.optionPending;
  const options = copy.options ?? [];
  const old = rolled ? options[rolled.index] : undefined;
  if (!rolled || !old || rolled.index !== index) return { ok: false, reason: 'no_option' };
  const kept = keep === 'new' ? rolled.option : { ...old, rerolls: rolled.option.rerolls ?? old.rerolls };
  const done = await items.updateOne(
    { guildId, userId, _id: copyId, options, optionPending: rolled },
    { $set: { options: options.map((one, i) => (i === rolled.index ? kept : one)) }, $unset: { optionPending: '' } },
  );
  return done.modifiedCount === 0 ? { ok: false, reason: 'busy' } : { ok: true };
}

/**
 * Enhances one of a copy's options (its `index`th, from 0): its amount rolled again, its stat kept (it may go down), for points
 * by its tier; a unique treasure's, as UT_ENHANCE has it (refining it doesn't). Not an option it has: 'no_option'.
 */
export async function upgradeOption(guildId: string, userId: string, copyId: string, index: number, rng?: KrRng): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  if (copy && item?.uniqueTreasure) {
    const options = copy.tmPotentials ?? [];
    const after = enhanceUtOptions(options, index, rng);
    if (!after) return { ok: false, reason: 'no_option' };
    if (!(await pay(guildId, userId, UT_ENHANCE.price))) return { ok: false, reason: 'too_poor' };
    const done = await items.updateOne({ guildId, userId, _id: copyId, tmPotentials: options }, { $set: { tmPotentials: after } });
    if (done.modifiedCount === 0) {
      await refund(guildId, userId, UT_ENHANCE.price);
      return { ok: false, reason: 'busy' };
    }
    await recordLedger([{ guildId, userId, delta: -UT_ENHANCE.price, reason: 'kr_upgrade', itemId: item.id }]);
    return { ok: true };
  }
  const kr = item?.kr;
  if (!copy || !item || !kr) return { ok: false, reason: 'not_found' };
  if (!upgradable(kr)) return { ok: false, reason: 'no_option' };
  // (A rerolled option not yet kept: the member picks first.)
  if (copy.optionPending !== undefined) return { ok: false, reason: 'pending' };
  const options = copy.options ?? [];
  const after = upgradeKrOption(kr, options, index, rng);
  if (!after) return { ok: false, reason: 'no_option' };
  const cost = upgradePrice(kr);
  if (!(await pay(guildId, userId, cost))) return { ok: false, reason: 'too_poor' };
  const done = await items.updateOne({ guildId, userId, _id: copyId, options, optionPending: { $exists: false } }, { $set: { options: after } });
  if (done.modifiedCount === 0) {
    await refund(guildId, userId, cost);
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_upgrade', itemId: item.id }]);
  return { ok: true };
}
