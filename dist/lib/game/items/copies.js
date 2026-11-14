import { randomBytes } from 'node:crypto';
import { ITEMS_BY_ID } from '../../../data/items.js';
import { refineLevel, starsOf } from './refine-share.js';
/**
 * What a member owns is stored as one document per copy of an item (see ItemCopyDoc), so two
 * copies of the same item can differ (an upgrade level, later maybe more) and one copy can be
 * traded on its own. These helpers are the pure parts of working with copies.
 */
/** A fresh, effectively unique id for a copy (24 hex characters). */
export function newCopyId() {
    return randomBytes(12).toString('hex');
}
/** Groups copies by item, in the order each item was first obtained. */
export function groupCopies(copies) {
    const sorted = [...copies].sort((a, b) => a.obtainedAt.getTime() - b.obtainedAt.getTime());
    const entries = new Map();
    for (const copy of sorted) {
        const entry = entries.get(copy.itemId);
        if (entry) {
            entry.count += 1;
            entry.bestLevel = Math.max(entry.bestLevel, copy.level);
        }
        else {
            entries.set(copy.itemId, { itemId: copy.itemId, count: 1, bestLevel: copy.level });
        }
    }
    return [...entries.values()];
}
/**
 * Stacks copies into inventory lines, with `worn` the ids of the copies worn: each item's worn copy
 * first, then highest level first, then locked before unlocked.
 */
export function stackCopies(copies, worn) {
    const stacks = new Map();
    for (const copy of copies) {
        const item = ITEMS_BY_ID.get(copy.itemId);
        const level = item ? starsOf(item, copy.level) : refineLevel(copy.level);
        const locked = copy.locked === true;
        const isWorn = worn.has(copy._id);
        const key = isWorn ? `worn:${copy._id}` : `${copy.itemId}:${level}:${locked}`;
        const stack = stacks.get(key);
        if (stack)
            stack.count += 1;
        else
            stacks.set(key, { itemId: copy.itemId, level, locked, worn: isWorn, count: 1 });
    }
    return [...stacks.values()].sort((a, b) => Number(b.worn) - Number(a.worn) || b.level - a.level || Number(b.locked) - Number(a.locked));
}
/**
 * The copy to use when someone equips an item by name: the highest level, then the one obtained
 * first, then the lowest id so the choice is always the same.
 */
export function bestCopy(copies) {
    let best;
    for (const copy of copies) {
        if (!best) {
            best = copy;
            continue;
        }
        if (copy.level !== best.level) {
            if (copy.level > best.level)
                best = copy;
        }
        else if (copy.obtainedAt.getTime() !== best.obtainedAt.getTime()) {
            if (copy.obtainedAt.getTime() < best.obtainedAt.getTime())
                best = copy;
        }
        else if (copy._id < best._id) {
            best = copy;
        }
    }
    return best;
}
//# sourceMappingURL=copies.js.map