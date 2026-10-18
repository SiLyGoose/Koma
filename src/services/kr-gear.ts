import { ITEMS_BY_ID } from '../data/items.js';
import { KR_RUNES_BY_ID, rerollKrOption, rerollPrice, runeFits, upgradable, upgradeKrOption, upgradePrice, type KrRng } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { partOf, socketsOf } from '../lib/game/heroes.js';
import { rollTmSkill } from '../lib/game/technomagic.js';
import type { HeroOptionError, HeroRuneError } from '../protocol/heroes.js';
import type { ItemCopyDoc } from '../types.js';
import { recordLedger } from './economy/shared.js';

/*
 * King's Raid's hero gear in the database (the rules are data/kr-gear.ts's): runes put in a copy's sockets and taken out
 * (the member's runes, MemberDoc.runes: one used up as it goes in, given back as it comes out), and a copy's options rerolled
 * or upgraded for points (King's Raid's gem prices: data/kr-gear.ts's REROLL_PRICES and UPGRADE_PRICES). Each spends first,
 * then changes the copy only as it was (its options as read): anything else changed it meanwhile, it is paid back.
 */

export type RuneResult = { ok: true } | { ok: false; reason: HeroRuneError };
export type OptionResult = { ok: true } | { ok: false; reason: HeroOptionError };

/** A copy's sockets, as many as it has, each its rune or null. */
const socketsOfCopy = (copy: Pick<ItemCopyDoc, 'runes'>, count: number): (string | null)[] => Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);

/**
 * Puts one of the member's runes (`runeId`) in a socket of one of their copies (its `socket`th, from 0): the rune that was
 * in it (if any) given back. Not a socket it has ('no_socket'), a rune not of its part ('wrong_part'), none of it ('no_rune').
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
  const taken = await members.updateOne({ guildId, userId, [`runes.${runeId}`]: { $gte: 1 } }, { $inc: { [`runes.${runeId}`]: -1 } });
  if (taken.modifiedCount === 0) return { ok: false, reason: 'no_rune' };
  const before = socketsOfCopy(copy, count);
  const old = before[socket] ?? null;
  const after = before.map((one, i) => (i === socket ? runeId : one));
  const put = await items.updateOne({ guildId, userId, _id: copyId, ...(copy.runes ? { runes: copy.runes } : { runes: { $exists: false } }) }, { $set: { runes: after } });
  if (put.modifiedCount === 0) {
    await members.updateOne({ guildId, userId }, { $inc: { [`runes.${runeId}`]: 1 } });
    return { ok: false, reason: 'busy' };
  }
  if (old) await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
  return { ok: true };
}

/** Takes the rune out of a socket of one of their copies (its `socket`th), back to the member's runes. An empty one: 'no_rune'. */
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
  const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
  if (out.modifiedCount === 0) return { ok: false, reason: 'busy' };
  await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
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

/**
 * Rerolls one of a copy's options (its `index`th, from 0) or (`index` 'unique') its unique option (TechnoMagic gear's
 * additional skill), for points, the price climbing with how many times that one was rerolled.
 */
export async function rerollOption(guildId: string, userId: string, copyId: string, index: number | 'unique', rng?: KrRng): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  const kr = item?.kr;
  if (!copy || !item || !kr) return { ok: false, reason: 'not_found' };
  if (index === 'unique') {
    if (!kr.unique) return { ok: false, reason: 'no_option' };
    const cost = rerollPrice(copy.tmSkillRerolls ?? 0);
    if (!(await pay(guildId, userId, cost))) return { ok: false, reason: 'too_poor' };
    const done = await items.updateOne(
      { guildId, userId, _id: copyId, tmSkill: copy.tmSkill ?? { $exists: false }, tmSkillRerolls: copy.tmSkillRerolls ?? { $exists: false } },
      { $set: { tmSkill: rollTmSkill(rng), tmSkillRerolls: (copy.tmSkillRerolls ?? 0) + 1 } },
    );
    if (done.modifiedCount === 0) {
      await refund(guildId, userId, cost);
      return { ok: false, reason: 'busy' };
    }
    await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_reroll', itemId: item.id }]);
    return { ok: true };
  }
  const options = copy.options ?? [];
  const old = options[index];
  if (!Number.isInteger(index) || !old) return { ok: false, reason: 'no_option' };
  const after = rerollKrOption(kr, options, index, rng);
  if (!after) return { ok: false, reason: 'no_option' };
  const cost = rerollPrice(old.rerolls ?? 0);
  if (!(await pay(guildId, userId, cost))) return { ok: false, reason: 'too_poor' };
  const done = await items.updateOne({ guildId, userId, _id: copyId, options }, { $set: { options: after } });
  if (done.modifiedCount === 0) {
    await refund(guildId, userId, cost);
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_reroll', itemId: item.id }]);
  return { ok: true };
}

/** Upgrades one of a copy's options a step (one at random of those not at their top), for points by its tier. All at their top: 'maxed'. */
export async function upgradeOption(guildId: string, userId: string, copyId: string, rng?: KrRng): Promise<OptionResult> {
  const { items } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  const kr = item?.kr;
  if (!copy || !item || !kr) return { ok: false, reason: 'not_found' };
  if (!upgradable(kr)) return { ok: false, reason: 'no_option' };
  const options = copy.options ?? [];
  const after = upgradeKrOption(kr, options, rng);
  if (!after) return { ok: false, reason: 'maxed' };
  const cost = upgradePrice(kr);
  if (!(await pay(guildId, userId, cost))) return { ok: false, reason: 'too_poor' };
  const done = await items.updateOne({ guildId, userId, _id: copyId, options }, { $set: { options: after } });
  if (done.modifiedCount === 0) {
    await refund(guildId, userId, cost);
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_upgrade', itemId: item.id }]);
  return { ok: true };
}
