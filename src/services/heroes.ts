import { CONFIG } from '../config.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { collections } from '../db.js';
import { HERO_SLOT_KIND, heroEquipMoves, heroWearable } from '../lib/game/heroes.js';
import { HERO_SLOTS, type HeroSlot } from '../types.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The TechnoMagic Raid's heroes (data/heroes.ts): bought in the site's shop, once each, for hero.price
 * points (burned), and geared on its heroes page (lib/game/heroes.ts has the rules). Buying is one
 * conditional update that only matches while they have the points and don't have the hero yet, so two
 * buys at once can't both pay. Putting a copy on a hero takes it off any other hero (or other slot) it
 * was on, in the same update, which only matches while the copy is still where it was read to be.
 */

export type BuyHeroResult = { ok: true; paid: number; balance: number } | { ok: false; reason: 'not_found' | 'owned' | 'too_poor' };

/** Buys hero `id` for the member. */
export async function buyHero(guildId: string, userId: string, id: string): Promise<BuyHeroResult> {
  if (!HEROES_BY_ID.has(id)) return { ok: false, reason: 'not_found' };
  const price = CONFIG.hero.price;
  const { members } = collections();
  await ensureMember(guildId, userId);
  const bought = await members.findOneAndUpdate(
    { guildId, userId, [`heroes.${id}`]: { $exists: false }, points: { $gte: price } },
    { $inc: { points: -price }, $set: { [`heroes.${id}`]: { boughtAt: new Date(), equipment: {} } } },
    { returnDocument: 'after' },
  );
  if (!bought) {
    const member = await members.findOne({ guildId, userId });
    return { ok: false, reason: member?.heroes?.[id] ? 'owned' : 'too_poor' };
  }
  if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason: 'hero', itemId: id }]);
  return { ok: true, paid: price, balance: bought.points };
}

export type HeroEquipResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_owned' | 'wrong_slot' | 'busy' };

/**
 * Puts the member's copy `copyId` in their hero `heroId`'s `slot` (one its item's kind goes in), taking it
 * off wherever else among their heroes it is. 'not_found': no such hero of theirs; 'not_owned': not a
 * copy of theirs a hero can wear; 'busy': their heroes' gear kept changing meanwhile (nothing changed).
 */
export async function equipHero(guildId: string, userId: string, heroId: string, slot: HeroSlot, copyId: string): Promise<HeroEquipResult> {
  const { items, members } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  if (!copy || !item || !heroWearable(item)) return { ok: false, reason: 'not_owned' };
  if (HERO_SLOT_KIND[slot] !== item.slot) return { ok: false, reason: 'wrong_slot' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
    if (!HEROES_BY_ID.has(heroId) || !member?.heroes?.[heroId]) return { ok: false, reason: 'not_found' };
    const { from, elsewhere } = heroEquipMoves(member.heroes, heroId, slot, copyId);
    const moved = await members.updateOne(
      {
        guildId,
        userId,
        [`heroes.${heroId}`]: { $exists: true },
        ...Object.fromEntries(from.map((path) => [path, copyId])),
        ...Object.fromEntries(elsewhere.map((path) => [path, { $ne: copyId }])),
      },
      { $set: { [`heroes.${heroId}.equipment.${slot}`]: copyId, ...Object.fromEntries(from.map((path) => [path, null])) } },
    );
    if (moved.matchedCount > 0) return { ok: true };
  }
  return { ok: false, reason: 'busy' };
}

/** Empties one of the member's hero's slots, or (`slot` null) all of them. False when the hero isn't theirs. */
export async function unequipHero(guildId: string, userId: string, heroId: string, slot: HeroSlot | null): Promise<boolean> {
  if (!HEROES_BY_ID.has(heroId)) return false;
  const slots = slot === null ? HERO_SLOTS : [slot];
  const result = await collections().members.updateOne(
    { guildId, userId, [`heroes.${heroId}`]: { $exists: true } },
    { $set: Object.fromEntries(slots.map((one) => [`heroes.${heroId}.equipment.${one}`, null])) },
  );
  return result.matchedCount > 0;
}
