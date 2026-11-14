import { tmStoneClass } from '../data/kr-gear.js';
import { LOOT_BOXES_BY_ID } from '../data/loot-boxes.js';
import { collections } from '../db.js';
import { payLootWins } from './technomagic.js';
/*
 * Opening King's Raid's Dispatch Battle Loot (data/loot-boxes.ts) a member holds (MemberDoc.lootBoxes, claimed from a background
 * raid's mail: ./tm-batches.ts): each gives what a win at its boss, mode and stage gives (./technomagic.ts payLootWins), rolled as
 * it is opened, its drops salvaged by their rule as a room's are. The boxes are taken first, all at once, and what they gave is
 * given at once too (a few writes however many are opened); when it couldn't be (the database gone meanwhile), they are given back.
 */
/** The most boxes opened at once (the site's Open All asks again for the rest). */
export const LOOT_OPEN_MOST = 200;
/** Opens `count` of a member's box `boxId`: what they gave, all told, or why none was opened. */
export async function openLootBoxes(guildId, userId, boxId, count) {
    const box = LOOT_BOXES_BY_ID.get(boxId);
    if (!box)
        return 'not_found';
    const { members } = collections();
    const field = `lootBoxes.${box.id}`;
    const taken = await members.findOneAndUpdate({ guildId, userId, [field]: { $gte: count } }, { $inc: { [field]: -count } });
    if (!taken)
        return 'not_enough';
    let wins;
    try {
        wins = await payLootWins(guildId, userId, box.boss, box.stage, box.mode, count);
    }
    catch (err) {
        console.error(`Could not open ${count} ${box.name}:`, err);
        await members.updateOne({ guildId, userId }, { $inc: { [field]: count } }).catch(() => { });
        throw err;
    }
    const opened = { box: box.id, count, points: 0, essences: {}, stones: {}, crystals: {}, runes: {}, copies: [], dust: 0 };
    const more = (into, key, n) => {
        if (n > 0)
            into[key] = (into[key] ?? 0) + n;
    };
    for (const won of wins) {
        opened.points += won.points;
        for (const [kind, n] of Object.entries(won.essences ?? {}))
            more(opened.essences, kind, n ?? 0);
        if (won.stones)
            more(opened.stones, won.stones.class, won.stones.count);
        if (won.crystals)
            more(opened.crystals, won.crystals.set, won.crystals.count);
        if (won.reports)
            opened.reports = (opened.reports ?? 0) + won.reports;
        for (const rune of won.runes ?? [])
            more(opened.runes, rune, 1);
        for (const find of won.finds) {
            if (find.copy)
                opened.copies.push(find.copy);
            // (Salvaged by their rule as it dropped: its komaDust, and a TechnoMagic piece's Upgrade Stones and Boss Crystals.)
            opened.dust += find.salvaged ?? 0;
            const cls = tmStoneClass(find.item);
            if (cls)
                more(opened.stones, cls, find.salvagedStones ?? 0);
            if (find.item.kr?.set)
                more(opened.crystals, find.item.kr.set, find.salvagedCrystals ?? 0);
        }
    }
    // (None left: the box gone from their Others.)
    await members.updateOne({ guildId, userId, [field]: { $lte: 0 } }, { $unset: { [field]: '' } });
    return opened;
}
//# sourceMappingURL=loot-boxes.js.map