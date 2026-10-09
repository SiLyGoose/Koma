import { CONFIG } from '../config.js';
import { DEFAULT_OUTFIT, OUTFITS_BY_ID } from '../data/outfits.js';
import { collections } from '../db.js';
import type { MemberDoc } from '../types.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { gearChanged } from './items/gear-events.js';

/*
 * Outfits (data/outfits.ts): the character a member is drawn as on the site. Everyone has the default
 * one; the others are bought in the site's shop, once each, for outfit.price points (burned), and
 * worn from then on whenever they like. Buying one puts it on. Buying is one conditional update that
 * only matches while they have the points and don't own it yet, so two buys at once can't both pay.
 * Changing outfits counts as a gear change (items/gear-events.ts), so an open Pinecraft page redraws
 * the miner in it.
 */

type OutfitsOf = Pick<MemberDoc, 'outfits' | 'outfit'> | null | undefined;

/** The outfits a member has, in the shop's order: the default, and those they bought that still exist. */
export const ownedOutfits = (member: OutfitsOf): string[] => {
  const bought = new Set(member?.outfits ?? []);
  return [...OUTFITS_BY_ID.keys()].filter((id) => id === DEFAULT_OUTFIT || bought.has(id));
};

/** The outfit a member wears: the default when they never picked one (or it's no longer theirs). */
export const wornOutfit = (member: OutfitsOf): string => {
  const outfit = member?.outfit;
  return outfit && ownedOutfits(member).includes(outfit) ? outfit : DEFAULT_OUTFIT;
};

/** The outfit member `userId` wears in `guildId`. */
export async function outfitOf(guildId: string, userId: string): Promise<string> {
  return wornOutfit(await collections().members.findOne({ guildId, userId }, { projection: { outfits: 1, outfit: 1 } }));
}

export type BuyOutfitResult = { ok: true; paid: number; balance: number } | { ok: false; reason: 'not_found' | 'owned' | 'too_poor' };

/** Buys outfit `id` for the member, and puts it on. */
export async function buyOutfit(guildId: string, userId: string, id: string): Promise<BuyOutfitResult> {
  if (!OUTFITS_BY_ID.has(id)) return { ok: false, reason: 'not_found' };
  if (id === DEFAULT_OUTFIT) return { ok: false, reason: 'owned' };
  const price = CONFIG.outfit.price;
  const { members } = collections();
  await ensureMember(guildId, userId);
  const bought = await members.findOneAndUpdate(
    { guildId, userId, outfits: { $ne: id }, points: { $gte: price } },
    { $inc: { points: -price }, $addToSet: { outfits: id }, $set: { outfit: id } },
    { returnDocument: 'after' },
  );
  if (!bought) {
    const member = await members.findOne({ guildId, userId });
    return { ok: false, reason: member?.outfits?.includes(id) ? 'owned' : 'too_poor' };
  }
  if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason: 'outfit', itemId: id }]);
  gearChanged(guildId, userId);
  return { ok: true, paid: price, balance: bought.points };
}

export type WearOutfitResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_owned' };

/** Puts on outfit `id`, which must be one of the member's. */
export async function wearOutfit(guildId: string, userId: string, id: string): Promise<WearOutfitResult> {
  if (!OUTFITS_BY_ID.has(id)) return { ok: false, reason: 'not_found' };
  const { members } = collections();
  if (id === DEFAULT_OUTFIT) {
    await members.updateOne({ guildId, userId }, { $set: { outfit: null } });
  } else {
    const worn = await members.updateOne({ guildId, userId, outfits: id }, { $set: { outfit: id } });
    if (worn.matchedCount === 0) return { ok: false, reason: 'not_owned' };
  }
  gearChanged(guildId, userId);
  return { ok: true };
}
