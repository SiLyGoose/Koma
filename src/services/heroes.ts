import { CONFIG } from '../config.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { transcendCost, transcendLevel, transcendPicks } from '../data/transcend.js';
import { collections } from '../db.js';
import { fitsSlot, heroEquipMoves, heroWearable, wieldedBy } from '../lib/game/heroes.js';
import { HERO_SLOTS, type HeroSlot } from '../types.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The TechnoMagic Raid's heroes (data/heroes.ts): bought in the site's shop, once each, for hero.price
 * points (burned), and geared on its heroes page (lib/game/heroes.ts has the rules). Buying is one
 * conditional update that only matches while they have the points and don't have the hero yet, so two
 * buys at once can't both pay. Putting a copy on a hero takes it off any other hero (or other slot) it
 * was on, in the same update, which only matches while the copy is still where it was read to be.
 * Transcending one (data/transcend.ts) is one conditional update too: it only matches while the hero is
 * still at the level read and they have the essences and komaGems it costs.
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

export type HeroEquipResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_owned' | 'wrong_slot' | 'wrong_hero' | 'duplicate' | 'busy' };

/**
 * Puts the member's copy `copyId` in their hero `heroId`'s `slot` (one its item goes in: heroSlotsFor), taking it
 * off wherever else among their heroes it is. 'not_found': no such hero of theirs; 'not_owned': not a
 * copy of theirs a hero can wear; 'wrong_slot': a slot it doesn't go in (a unique weapon only goes in the first
 * weapon slot, a unique treasure only in its treasure slot or a sub treasure slot); 'wrong_hero': another hero's unique
 * weapon or treasure; 'duplicate': a unique treasure the hero already wears another copy of, in another slot (each of
 * its four once, as King's Raid's); 'busy': their heroes' gear kept changing meanwhile (nothing changed).
 */
export async function equipHero(guildId: string, userId: string, heroId: string, slot: HeroSlot, copyId: string): Promise<HeroEquipResult> {
  const { items, members } = collections();
  const copy = await items.findOne({ guildId, userId, _id: copyId });
  const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
  if (!copy || !item || !heroWearable(item)) return { ok: false, reason: 'not_owned' };
  if (!fitsSlot(item, slot)) return { ok: false, reason: 'wrong_slot' };
  if (!wieldedBy(item, heroId)) return { ok: false, reason: 'wrong_hero' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
    if (!HEROES_BY_ID.has(heroId) || !member?.heroes?.[heroId]) return { ok: false, reason: 'not_found' };
    // (A unique treasure: not another copy of it in another of this hero's slots.)
    if (item.uniqueTreasure) {
      const others = HERO_SLOTS.filter((one) => one !== slot)
        .map((one) => member.heroes?.[heroId]?.equipment?.[one])
        .filter((id): id is string => typeof id === 'string' && id !== '' && id !== copyId);
      if (others.length > 0 && (await items.countDocuments({ guildId, userId, _id: { $in: others }, itemId: item.id })) > 0) return { ok: false, reason: 'duplicate' };
    }
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

export type HeroPerksResult = { ok: true } | { ok: false; reason: 'not_found' | 'perk_locked' | 'too_many_points' };

/**
 * Picks the member's hero's transcendence perks (data/transcend.ts), all of them at once (none: reset): 'not_found'
 * for a hero that isn't theirs, 'perk_locked' for one of a tier past its level, 'too_many_points' for perks costing
 * more TP than it has (nothing changed).
 */
export async function pickHeroPerks(guildId: string, userId: string, heroId: string, perks: readonly string[]): Promise<HeroPerksResult> {
  if (!HEROES_BY_ID.has(heroId)) return { ok: false, reason: 'not_found' };
  const { members } = collections();
  const member = await members.findOne({ guildId, userId });
  const hero = member?.heroes?.[heroId];
  if (!hero) return { ok: false, reason: 'not_found' };
  const picked = transcendPicks(perks, hero.transcend);
  if (typeof picked === 'string') return { ok: false, reason: picked };
  // (Only at the level read: one transcended meanwhile is fine, as it only has more TP.)
  const result = await members.updateOne({ guildId, userId, [`heroes.${heroId}`]: { $exists: true } }, { $set: { [`heroes.${heroId}.perks`]: picked } });
  return result.matchedCount > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

export type HeroTranscendResult = { ok: true; level: number } | { ok: false; reason: 'not_found' | 'maxed' | 'too_poor' | 'busy' };

/**
 * Transcends the member's hero one level, paying its class's essences and komaGems (data/transcend.ts's transcendCost):
 * 'not_found' for a hero that isn't theirs, 'maxed' at TRANSCEND_MAX, 'too_poor' without enough of either, 'busy' when
 * it was transcended meanwhile (nothing was spent).
 */
export async function transcendHero(guildId: string, userId: string, heroId: string): Promise<HeroTranscendResult> {
  const def = HEROES_BY_ID.get(heroId);
  if (!def) return { ok: false, reason: 'not_found' };
  const { members } = collections();
  const member = await members.findOne({ guildId, userId });
  const hero = member?.heroes?.[heroId];
  if (!hero) return { ok: false, reason: 'not_found' };
  const level = transcendLevel(hero.transcend);
  const cost = transcendCost(def.class, level);
  if (!cost) return { ok: false, reason: 'maxed' };
  const essences = Object.entries(cost.essences);
  if ((member.gems ?? 0) < cost.gems || essences.some(([id, amount]) => (member.essences?.[id as keyof typeof cost.essences] ?? 0) < amount)) return { ok: false, reason: 'too_poor' };
  const paid = await members.updateOne(
    {
      guildId,
      userId,
      // Still at that level (missing is level 0), with enough of everything.
      [`heroes.${heroId}.transcend`]: level === 0 ? { $in: [null, 0] } : level,
      gems: { $gte: cost.gems },
      ...Object.fromEntries(essences.map(([id, amount]) => [`essences.${id}`, { $gte: amount }])),
    },
    {
      $set: { [`heroes.${heroId}.transcend`]: level + 1 },
      $inc: { gems: -cost.gems, ...Object.fromEntries(essences.map(([id, amount]) => [`essences.${id}`, -amount])) },
    },
  );
  if (paid.matchedCount === 0) return { ok: false, reason: 'busy' };
  await recordLedger([{ guildId, userId, delta: 0, gemDelta: -cost.gems, essenceDelta: Object.fromEntries(essences.map(([id, amount]) => [id, -amount])), reason: 'transcend', itemId: heroId }]);
  return { ok: true, level: level + 1 };
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
