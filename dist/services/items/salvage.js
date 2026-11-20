import { collections } from '../../db.js';
import { RAID_CLASS_IDS } from '../../constants/index.js';
import { partOf } from '../../lib/game/heroes.js';
import { itemSalvage } from '../../lib/game/items/sell.js';
import { tmSalvageCrystals, tmSalvageStones } from '../../constants/technomagic.js';
import { tmStoneClass } from '../../data/kr-gear.js';
import { salvageMatches } from '../../lib/game/items/salvage.js';
import { SALVAGE_PARTS, SALVAGE_STARS_MAX, SALVAGE_TIERS } from '../../protocol/heroes.js';
import { ensureMember } from '../economy/index.js';
import { recordLedger } from '../economy/shared.js';
/*
 * Salvaging hero gear as it drops: a member keeps a rule (protocol/heroes.ts SalvageRule: tiers, stars, parts, classes;
 * MemberDoc.autoSalvage), and the TechnoMagic Raid's and the Dragon Raid's drops that match it (services/technomagic.ts)
 * are never given: each pays its komaDust (lib/game/items/sell.ts itemSalvage) as a salvage of it would, ledger and all.
 */
/** `rule` with only what a rule can take (tiers, parts and classes it knows, each once; its stars in range); null: none, or one that takes no tier. */
export function cleanRule(rule) {
    if (!rule)
        return null;
    const tiers = SALVAGE_TIERS.filter((tier) => rule.tiers?.includes(tier));
    if (tiers.length === 0)
        return null;
    const stars = Math.min(SALVAGE_STARS_MAX, Math.max(0, Math.floor(Number(rule.stars) || 0)));
    const parts = SALVAGE_PARTS.filter((part) => rule.parts?.includes(part));
    const classes = RAID_CLASS_IDS.filter((cls) => rule.classes?.includes(cls));
    return { tiers, stars, parts: parts, classes: classes };
}
/** The rule a member's drops are salvaged by (null: none). */
export const autoSalvageOf = (member) => cleanRule(member?.autoSalvage);
/** The rule a member's drops are salvaged by, from the database (null: none). */
export async function loadAutoSalvage(guildId, userId) {
    return autoSalvageOf(await collections().members.findOne({ guildId, userId }, { projection: { autoSalvage: 1 } }));
}
/** Keeps `rule` as the one their drops are salvaged by (null, or one that takes no tier: none is any more). */
export async function setAutoSalvage(guildId, userId, rule) {
    const clean = cleanRule(rule);
    await ensureMember(guildId, userId);
    await collections().members.updateOne({ guildId, userId }, clean ? { $set: { autoSalvage: clean } } : { $unset: { autoSalvage: '' } });
}
/** Whether a drop of `item` (at 0★, as drops come) is salvaged by `rule`: only King's Raid's gear of the tiers it takes. */
export function salvagesDrop(rule, item) {
    const part = partOf(item);
    if (!rule || !item.kr || part === null)
        return false;
    return salvageMatches(rule, { tier: item.kr.tier, stars: 0, part, classes: item.kr.classes });
}
/**
 * What salvaging a drop of `item` gives: its komaDust, and a TechnoMagic piece's Upgrade Stones and Boss Crystals (King's Raid's:
 * tmSalvageStones of its class, tmSalvageCrystals of its set); `inc`, what they add to the member's (none when it gives nothing).
 */
export function salvageGives(item) {
    const dust = itemSalvage(item);
    const cls = tmStoneClass(item);
    const stones = cls ? tmSalvageStones() : 0;
    // (And its set's Boss Crystals, King's Raid's.)
    const set = cls ? item.kr?.set : undefined;
    const crystals = set ? tmSalvageCrystals() : 0;
    return { dust, stones, crystals, inc: { ...(dust > 0 && { powder: dust }), ...(cls && stones > 0 && { [`stones.${cls}`]: stones }), ...(set && crystals > 0 && { [`crystals.${set}`]: crystals }) } };
}
/** Salvages a drop of `item` rather than give it: what salvageGives says paid (its komaDust in the ledger, as a salvage). Returns what it gave. */
export async function salvageDrop(guildId, userId, item) {
    const { dust, stones, crystals, inc } = salvageGives(item);
    if (Object.keys(inc).length === 0)
        return { dust: 0, stones: 0, crystals: 0 };
    await ensureMember(guildId, userId);
    await collections().members.updateOne({ guildId, userId }, { $inc: inc });
    if (dust > 0)
        await recordLedger([{ guildId, userId, delta: 0, powderDelta: dust, reason: 'salvage', itemId: item.id }]);
    return { dust, stones, crystals };
}
//# sourceMappingURL=salvage.js.map