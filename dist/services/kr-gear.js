import { REFINE } from '../constants/index.js';
import { TM_CRYSTALS, TM_REPORTS } from '../constants/technomagic.js';
import { isTmPiece } from '../data/kr-gear.js';
import { starsOf } from '../lib/game/items/refine-share.js';
import { gearChanged } from './items/gear-events.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { rerollPrice, restorePrice, runeKeepPrice, valueRerollPrice } from '../config.js';
import { KR_RUNES_BY_ID, rerollKrOption, runeFits, UNIQUE_REROLL_GEMS, upgradable, upgradeKrOption, upgradePrice } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { partOf, socketsOf } from '../lib/game/heroes.js';
import { enhanceUtOptions, rerollUtOption, rollTmSkill } from '../lib/game/technomagic.js';
import { recordLedger } from './economy/shared.js';
import { blasphemyIdOf, isBlasphemyRef } from '../lib/game/divine.js';
import { socketBlasphemy, unsocketBlasphemy } from './divine.js';
/** A copy's sockets, as many as it has, each its rune or null. */
const socketsOfCopy = (copy, count) => Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);
/**
 * Puts one of the member's runes (`runeId`) in a socket of one of their copies (its `socket`th, from 0): the rune that was
 * in it (if any) given back for the config's hero.runeKeepPrice points (too few: 'too_poor'). Not a socket it has ('no_socket'), a rune not
 * of its part ('wrong_part'), none of it ('no_rune').
 */
export async function socketRune(guildId, userId, copyId, socket, runeId) {
    // (A Rune of Blasphemy of theirs: services/divine.ts's.)
    if (isBlasphemyRef(runeId))
        return blasphemyAnswer(await socketBlasphemy(guildId, userId, copyId, socket, blasphemyIdOf(runeId)));
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return { ok: false, reason: 'not_found' };
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return { ok: false, reason: 'no_socket' };
    const rune = KR_RUNES_BY_ID.get(runeId);
    const part = partOf(item);
    if (!rune || !part || !runeFits(rune, part))
        return { ok: false, reason: 'wrong_part' };
    // (A Rune of Blasphemy in the way: kept in its storage first, for its own price.)
    if (isBlasphemyRef(copy.runes?.[socket])) {
        const kept = await unsocketBlasphemy(guildId, userId, copyId, socket);
        if (!kept.ok)
            return blasphemyAnswer(kept);
        return socketRune(guildId, userId, copyId, socket, runeId);
    }
    const before = socketsOfCopy(copy, count);
    const old = before[socket] ?? null;
    const fee = old ? runeKeepPrice() : 0;
    if (!(await pay(guildId, userId, fee)))
        return { ok: false, reason: 'too_poor' };
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
 * Takes the rune out of a socket of one of their copies (its `socket`th), back to the member's runes, for the config's hero.runeKeepPrice
 * points (too few: 'too_poor'; King's Raid's Rune Preserve). An empty one: 'no_rune'.
 */
export async function unsocketRune(guildId, userId, copyId, socket) {
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return { ok: false, reason: 'not_found' };
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return { ok: false, reason: 'no_socket' };
    const before = socketsOfCopy(copy, count);
    const old = before[socket];
    if (!old)
        return { ok: false, reason: 'no_rune' };
    // (A Rune of Blasphemy: into its storage, for its own keep price.)
    if (isBlasphemyRef(old))
        return blasphemyAnswer(await unsocketBlasphemy(guildId, userId, copyId, socket));
    const fee = runeKeepPrice();
    if (!(await pay(guildId, userId, fee)))
        return { ok: false, reason: 'too_poor' };
    const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
    if (out.modifiedCount === 0) {
        await refund(guildId, userId, fee);
        return { ok: false, reason: 'busy' };
    }
    await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
    await recordLedger([{ guildId, userId, delta: -fee, reason: 'rune_keep', itemId: item.id }]);
    return { ok: true };
}
/** services/divine.ts's answer as a rune's (its reasons a rune's but storage being full: 'busy'; one in two sockets: 'no_rune'). */
function blasphemyAnswer(result) {
    if (result.ok)
        return { ok: true };
    const known = ['not_found', 'no_socket', 'wrong_part', 'no_rune', 'too_poor', 'busy'];
    return { ok: false, reason: known.includes(result.reason) ? result.reason : result.reason === 'socketed' ? 'no_rune' : 'busy' };
}
/** Takes `cost` points from the member (false: they haven't so many). */
async function pay(guildId, userId, cost) {
    if (cost <= 0)
        return true;
    const paid = await collections().members.updateOne({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } });
    return paid.modifiedCount > 0;
}
/** Gives `cost` points back (what was changed meanwhile wasn't changed after all). */
const refund = async (guildId, userId, cost) => {
    if (cost > 0)
        await collections().members.updateOne({ guildId, userId }, { $inc: { points: cost } });
};
/** Takes `gems` komaGems from the member (false: they haven't so many). */
async function payGems(guildId, userId, gems) {
    if (gems <= 0)
        return true;
    const paid = await collections().members.updateOne({ guildId, userId, gems: { $gte: gems } }, { $inc: { gems: -gems } });
    return paid.modifiedCount > 0;
}
/** Gives `gems` komaGems back. */
const refundGems = async (guildId, userId, gems) => {
    if (gems > 0)
        await collections().members.updateOne({ guildId, userId }, { $inc: { gems } });
};
/**
 * Whether a copy of `item` can be restored into a Reclaimed one (King's Raid's Technomagic Restoration: EquipUpgradeTierTable's
 * rows are every TechnoMagic piece's but its artifacts'): a TechnoMagic piece at its top star, not Reclaimed already.
 */
export const tmRestorable = (item, copy) => isTmPiece(item) && item.kr?.part !== 'artifact' && copy.reclaimed !== true && starsOf(item, copy.level) >= REFINE.maxLevel;
/**
 * Restores one of the member's 5★ TechnoMagic pieces into a 0★ Reclaimed one (King's Raid's Technomagic Restoration, at Valance's
 * Workshop): TM_REPORTS.restore Technomagic Experiment Reports and the config's hero.restorePrice zeiucoins, both taken at once (or
 * neither), then the copy itself made Reclaimed and 0★, its options, additional skill, runes, lock and wearer kept (King's Raid's:
 * "a +0 Reclaimed Technomagic Gear with the same Additional Options and Additional Skill"). Changed meanwhile: both given back.
 */
export async function restoreTmPiece(guildId, userId, copyId) {
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return { ok: false, reason: 'not_found' };
    if (!tmRestorable(item, copy))
        return { ok: false, reason: 'not_restorable' };
    const reports = TM_REPORTS.restore;
    const points = restorePrice();
    const paid = await members.findOneAndUpdate({ guildId, userId, points: { $gte: points }, reports: { $gte: reports } }, { $inc: { points: -points, reports: -reports } });
    if (!paid) {
        const member = await members.findOne({ guildId, userId }, { projection: { reports: 1 } });
        return { ok: false, reason: (member?.reports ?? 0) < reports ? 'no_reports' : 'too_poor' };
    }
    const done = await items.updateOne({ guildId, userId, _id: copyId, level: copy.level, reclaimed: { $ne: true } }, { $set: { level: 0, reclaimed: true } });
    if (done.modifiedCount === 0) {
        await members.updateOne({ guildId, userId }, { $inc: { points, reports } }).catch((err) => console.error(`Could not give back ${points} and ${reports} reports after a failed restoration:`, err));
        return { ok: false, reason: 'busy' };
    }
    await recordLedger([{ guildId, userId, delta: -points, reason: 'tm_restore', itemId: item.id }]);
    gearChanged(guildId, userId);
    return { ok: true };
}
/**
 * Rerolls one of a copy's options (its `index`th, from 0), for the config's hero.rerollPrice points, the same every time
 * (a TechnoMagic piece's: TM_CRYSTALS.reroll of its set's Boss Crystals, King's Raid's; too few: 'no_crystals'); or (`index` 'unique') its unique option (TechnoMagic gear's additional skill), for UNIQUE_REROLL_GEMS komaGems
 * and TM_CRYSTALS.skillReroll of its set's Boss Crystals (too few: 'no_gems', 'no_crystals'): the skill rolled waits beside the one it has (tmSkillPending) for the member to pick one (keepTmSkill),
 * and till then it isn't rerolled again ('pending'). An option rolled waits the same (optionPending, keepOption: King's Raid's
 * Reforge keeps the old one or the new), and till then none of its options is rerolled or enhanced. A unique treasure's option
 * (one of its tmPotentials): another potential, for the same points, waiting the same (potentialPending).
 */
export async function rerollOption(guildId, userId, copyId, index, rng) {
    const { items } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    // A unique treasure's option: another potential, for the reroll's points, waiting beside the one it has (potentialPending).
    if (copy && item?.uniqueTreasure) {
        if (index === 'unique')
            return { ok: false, reason: 'no_option' };
        const options = copy.tmPotentials ?? [];
        if (copy.potentialPending !== undefined)
            return { ok: false, reason: 'pending' };
        const rolled = rerollUtOption(options, index, rng);
        if (!rolled)
            return { ok: false, reason: 'no_option' };
        const cost = rerollPrice();
        if (!(await pay(guildId, userId, cost)))
            return { ok: false, reason: 'too_poor' };
        const done = await items.updateOne({ guildId, userId, _id: copyId, tmPotentials: options, potentialPending: { $exists: false } }, { $set: { potentialPending: { index, option: rolled } } });
        if (done.modifiedCount === 0) {
            await refund(guildId, userId, cost);
            return { ok: false, reason: 'busy' };
        }
        await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_reroll', itemId: item.id }]);
        return { ok: true };
    }
    const kr = item?.kr;
    if (!copy || !item || !kr)
        return { ok: false, reason: 'not_found' };
    if (index === 'unique') {
        if (!kr.unique)
            return { ok: false, reason: 'no_option' };
        if (copy.tmSkillPending !== undefined)
            return { ok: false, reason: 'pending' };
        const gems = UNIQUE_REROLL_GEMS;
        // (And its set's Boss Crystals, given back if the komaGems or the reroll fail.)
        const field = kr.set ? `crystals.${kr.set}` : undefined;
        const crystals = field ? TM_CRYSTALS.skillReroll : 0;
        const refundCrystals = async () => {
            if (field)
                await collections().members.updateOne({ guildId, userId }, { $inc: { [field]: crystals } });
        };
        if (field && (await collections().members.updateOne({ guildId, userId, [field]: { $gte: crystals } }, { $inc: { [field]: -crystals } })).modifiedCount === 0) {
            return { ok: false, reason: 'no_crystals' };
        }
        if (!(await payGems(guildId, userId, gems))) {
            await refundCrystals();
            return { ok: false, reason: 'no_gems' };
        }
        const done = await items.updateOne({ guildId, userId, _id: copyId, tmSkill: copy.tmSkill ?? { $exists: false }, tmSkillRerolls: copy.tmSkillRerolls ?? { $exists: false }, tmSkillPending: { $exists: false } }, { $set: { tmSkillPending: rollTmSkill(rng), tmSkillRerolls: (copy.tmSkillRerolls ?? 0) + 1 } });
        if (done.modifiedCount === 0) {
            await refundGems(guildId, userId, gems);
            await refundCrystals();
            return { ok: false, reason: 'busy' };
        }
        await recordLedger([{ guildId, userId, delta: 0, gemDelta: -gems, reason: 'kr_reroll', itemId: item.id }]);
        return { ok: true };
    }
    const options = copy.options ?? [];
    const old = options[index];
    if (!Number.isInteger(index) || !old)
        return { ok: false, reason: 'no_option' };
    if (copy.optionPending !== undefined)
        return { ok: false, reason: 'pending' };
    const rolled = rerollKrOption(kr, options, index, rng)?.[index];
    if (!rolled)
        return { ok: false, reason: 'no_option' };
    // (The option rolled waits beside the one it has: the copy keeps its options till the member picks.)
    const unchanged = { guildId, userId, _id: copyId, options, optionPending: { $exists: false } };
    const pending = { $set: { optionPending: { index, option: rolled } } };
    // (A TechnoMagic piece's: its set's Boss Crystals, King's Raid's, not points.)
    const set = isTmPiece(item) ? kr.set : undefined;
    if (set) {
        const crystals = TM_CRYSTALS.reroll;
        const field = `crystals.${set}`;
        const paid = await collections().members.updateOne({ guildId, userId, [field]: { $gte: crystals } }, { $inc: { [field]: -crystals } });
        if (paid.modifiedCount === 0)
            return { ok: false, reason: 'no_crystals' };
        const done = await items.updateOne(unchanged, pending);
        if (done.modifiedCount === 0) {
            await collections().members.updateOne({ guildId, userId }, { $inc: { [field]: crystals } });
            return { ok: false, reason: 'busy' };
        }
        return { ok: true };
    }
    const cost = rerollPrice();
    if (!(await pay(guildId, userId, cost)))
        return { ok: false, reason: 'too_poor' };
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
export async function keepTmSkill(guildId, userId, copyId, keep) {
    const { items } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    if (!copy)
        return { ok: false, reason: 'not_found' };
    const rolled = copy.tmSkillPending;
    if (rolled === undefined)
        return { ok: false, reason: 'no_option' };
    const done = await items.updateOne({ guildId, userId, _id: copyId, tmSkillPending: rolled }, keep === 'new' ? { $set: { tmSkill: rolled }, $unset: { tmSkillPending: '' } } : { $unset: { tmSkillPending: '' } });
    return done.modifiedCount === 0 ? { ok: false, reason: 'busy' } : { ok: true };
}
/**
 * Settles a copy's rerolled option (optionPending): `keep` 'new' puts the one rolled in its place, 'old' keeps the one it had;
 * the one rolled is gone either way (already paid for), but the old one counts the reroll too (its price climbs as if taken).
 * None rolled (or not its `index`th): 'no_option'.
 */
export async function keepOption(guildId, userId, copyId, keep, index) {
    const { items } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    if (!copy)
        return { ok: false, reason: 'not_found' };
    // (A unique treasure's: its potentials'.)
    if (copy.potentialPending !== undefined || ITEMS_BY_ID.get(copy.itemId)?.uniqueTreasure) {
        const waiting = copy.potentialPending;
        const potentials = copy.tmPotentials ?? [];
        if (!waiting || !potentials[waiting.index] || waiting.index !== index)
            return { ok: false, reason: 'no_option' };
        const done = await items.updateOne({ guildId, userId, _id: copyId, tmPotentials: potentials, potentialPending: waiting }, keep === 'new' ? { $set: { tmPotentials: potentials.map((one, i) => (i === waiting.index ? waiting.option : one)) }, $unset: { potentialPending: '' } } : { $unset: { potentialPending: '' } });
        if (done.modifiedCount === 0)
            return { ok: false, reason: 'busy' };
        gearChanged(guildId, userId);
        return { ok: true };
    }
    const rolled = copy.optionPending;
    const options = copy.options ?? [];
    const old = rolled ? options[rolled.index] : undefined;
    if (!rolled || !old || rolled.index !== index)
        return { ok: false, reason: 'no_option' };
    const kept = keep === 'new' ? rolled.option : { ...old, rerolls: rolled.option.rerolls ?? old.rerolls };
    const done = await items.updateOne({ guildId, userId, _id: copyId, options, optionPending: rolled }, { $set: { options: options.map((one, i) => (i === rolled.index ? kept : one)) }, $unset: { optionPending: '' } });
    return done.modifiedCount === 0 ? { ok: false, reason: 'busy' } : { ok: true };
}
/**
 * Enhances one of a copy's options (its `index`th, from 0): its amount rolled again, its stat kept (it may go down), for points
 * by its tier; a unique treasure's, the config's hero.valueRerollUtPrice (refining it doesn't). Not an option it has: 'no_option'.
 */
export async function upgradeOption(guildId, userId, copyId, index, rng) {
    const { items } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (copy && item?.uniqueTreasure) {
        // (A rerolled option not yet kept: the member picks first.)
        if (copy.potentialPending !== undefined)
            return { ok: false, reason: 'pending' };
        const options = copy.tmPotentials ?? [];
        const after = enhanceUtOptions(options, index, rng);
        if (!after)
            return { ok: false, reason: 'no_option' };
        const cost = valueRerollPrice('unique');
        if (!(await pay(guildId, userId, cost)))
            return { ok: false, reason: 'too_poor' };
        const done = await items.updateOne({ guildId, userId, _id: copyId, tmPotentials: options, potentialPending: { $exists: false } }, { $set: { tmPotentials: after } });
        if (done.modifiedCount === 0) {
            await refund(guildId, userId, cost);
            return { ok: false, reason: 'busy' };
        }
        await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_upgrade', itemId: item.id }]);
        return { ok: true };
    }
    const kr = item?.kr;
    if (!copy || !item || !kr)
        return { ok: false, reason: 'not_found' };
    if (!upgradable(kr))
        return { ok: false, reason: 'no_option' };
    // (A rerolled option not yet kept: the member picks first.)
    if (copy.optionPending !== undefined)
        return { ok: false, reason: 'pending' };
    const options = copy.options ?? [];
    const after = upgradeKrOption(kr, options, index, rng);
    if (!after)
        return { ok: false, reason: 'no_option' };
    const cost = upgradePrice(kr);
    if (!(await pay(guildId, userId, cost)))
        return { ok: false, reason: 'too_poor' };
    const done = await items.updateOne({ guildId, userId, _id: copyId, options, optionPending: { $exists: false } }, { $set: { options: after } });
    if (done.modifiedCount === 0) {
        await refund(guildId, userId, cost);
        return { ok: false, reason: 'busy' };
    }
    await recordLedger([{ guildId, userId, delta: -cost, reason: 'kr_upgrade', itemId: item.id }]);
    return { ok: true };
}
//# sourceMappingURL=kr-gear.js.map