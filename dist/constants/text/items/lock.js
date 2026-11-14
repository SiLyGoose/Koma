import { levelTag } from './refine.js';
export const lockText = {
    askWhich: (p, verb) => verb === 'lock'
        ? `Which item? Use \`${p}lock <item name>\` to lock a copy of it: locked copies can't be sold or used up by a refine.`
        : `Which item? Use \`${p}unlock <item name>\` to unlock a copy of it, so it can be sold or used up by a refine again.`,
    /** Every copy they own is locked already (or, for unlock, none is). */
    nothingTo: (name, verb) => (verb === 'lock' ? `Every **${name}** you own is already locked.` : `None of your **${name}** is locked.`),
    /** One copy was locked (or unlocked); `level` is its refinement (a hero's gear, `hero`: its stars). */
    done: (name, level, verb, hero = false) => verb === 'lock'
        ? `🔒 Locked your **${levelTag(level, hero)} ${name}**. It can't be sold or used up by ${hero ? 'an awakening' : 'a refine'}.`
        : `🔓 Unlocked your **${levelTag(level, hero)} ${name}**. It can be sold or used up by ${hero ? 'an awakening' : 'a refine'} again.`,
    /** The picker, when their copies differ: one button per kind of copy. */
    pickTitle: (name, slot) => `${name} ${slot}`,
    pick: (name, verb) => `Which **${name}** do you want to ${verb}? Each press ${verb}s one copy.`,
    /** A button: the copies' refinement, how many there are, and whether one is worn. Button labels can't show custom emoji. */
    button: (level, count, worn, hero = false) => `${levelTag(level, hero)}${count > 1 ? ` ×${count}` : ''}${worn ? ' · equipped' : ''}`,
    /** The picker once every copy it offered is done. */
    allDone: (verb) => (verb === 'lock' ? 'Nothing left to lock.' : 'Nothing left to unlock.'),
    gone: 'That copy changed meanwhile (sold, refined or locked elsewhere). Pick again.',
    notYours: "That isn't your item.",
};
//# sourceMappingURL=lock.js.map