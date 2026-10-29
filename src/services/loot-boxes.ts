import { tmStoneClass } from '../data/kr-gear.js';
import { LOOT_BOXES_BY_ID } from '../data/loot-boxes.js';
import { collections } from '../db.js';
import type { LootOpened, LootOpenError } from '../protocol/heroes.js';
import { payLootWin } from './technomagic.js';

/*
 * Opening King's Raid's Dispatch Battle Loot (data/loot-boxes.ts) a member holds (MemberDoc.lootBoxes, claimed from a background
 * raid's mail: ./tm-batches.ts): each gives what a win at its boss, mode and stage gives (./technomagic.ts payLootWin), rolled as
 * it is opened, its drops salvaged by their rule as a room's are. The boxes are taken first, all at once; one that couldn't be
 * opened (the database gone meanwhile) is given back.
 */

/** The most boxes opened at once (the site's Open All asks again for the rest). */
export const LOOT_OPEN_MOST = 200;

/** Opens `count` of a member's box `boxId`: what they gave, all told, or why none was opened. */
export async function openLootBoxes(guildId: string, userId: string, boxId: string, count: number): Promise<LootOpened | LootOpenError> {
  const box = LOOT_BOXES_BY_ID.get(boxId);
  if (!box) return 'not_found';
  const { members } = collections();
  const field = `lootBoxes.${box.id}`;
  const taken = await members.findOneAndUpdate({ guildId, userId, [field]: { $gte: count } }, { $inc: { [field]: -count } });
  if (!taken) return 'not_enough';

  const opened: LootOpened = { box: box.id, count: 0, points: 0, essences: {}, stones: {}, crystals: {}, runes: {}, copies: [], dust: 0 };
  const more = (into: Record<string, number>, key: string, n: number): void => {
    if (n > 0) into[key] = (into[key] ?? 0) + n;
  };
  try {
    for (; opened.count < count; opened.count++) {
      const won = await payLootWin(guildId, userId, box.boss, box.stage, box.mode);
      opened.points += won.points;
      for (const [kind, n] of Object.entries(won.essences ?? {})) more(opened.essences, kind, n ?? 0);
      if (won.stones) more(opened.stones, won.stones.class, won.stones.count);
      if (won.crystals) more(opened.crystals, won.crystals.set, won.crystals.count);
      for (const rune of won.runes ?? []) more(opened.runes, rune, 1);
      for (const find of won.finds) {
        if (find.copy) opened.copies.push(find.copy);
        // (Salvaged by their rule as it dropped: its komaDust, and a TechnoMagic piece's Upgrade Stones and Boss Crystals.)
        opened.dust += find.salvaged ?? 0;
        const cls = tmStoneClass(find.item);
        if (cls) more(opened.stones, cls, find.salvagedStones ?? 0);
        if (find.item.kr?.set) more(opened.crystals, find.item.kr.set, find.salvagedCrystals ?? 0);
      }
    }
  } catch (err) {
    console.error(`Could not open a ${box.name}:`, err);
    // (Those not opened, given back.)
    await members.updateOne({ guildId, userId }, { $inc: { [field]: count - opened.count } }).catch(() => {});
    if (opened.count === 0) throw err;
  }
  // (None left: the box gone from their Others.)
  await members.updateOne({ guildId, userId, [field]: { $lte: 0 } }, { $unset: { [field]: '' } });
  return opened;
}
