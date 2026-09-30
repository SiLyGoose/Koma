type Verb = 'lock' | 'unlock';

export const lockText = {
  askWhich: (p: string, verb: Verb) =>
    verb === 'lock'
      ? `Which item? Use \`${p}lock <item name>\` to lock a copy of it: locked copies can't be sold or used up by a refine.`
      : `Which item? Use \`${p}unlock <item name>\` to unlock a copy of it, so it can be sold or used up by a refine again.`,
  /** Every copy they own is locked already (or, for unlock, none is). */
  nothingTo: (name: string, verb: Verb) => (verb === 'lock' ? `Every **${name}** you own is already locked.` : `None of your **${name}** is locked.`),
  /** One copy was locked (or unlocked); `level` is its refinement. */
  done: (name: string, level: number, verb: Verb) =>
    verb === 'lock'
      ? `🔒 Locked your **R${level} ${name}**. It can't be sold or used up by a refine.`
      : `🔓 Unlocked your **R${level} ${name}**. It can be sold or used up by a refine again.`,
  /** The picker, when their copies differ: one button per kind of copy. */
  pickTitle: (stars: string, name: string, slot: string) => `${stars}  ${name} ${slot}`,
  pick: (name: string, verb: Verb) => `Which **${name}** do you want to ${verb}? Each press ${verb}s one copy.`,
  /** A button: the copies' refinement, how many there are, and whether one is worn. Button labels can't show custom emoji. */
  button: (level: number, count: number, worn: boolean) => `R${level}${count > 1 ? ` ×${count}` : ''}${worn ? ' · equipped' : ''}`,
  /** The picker once every copy it offered is done. */
  allDone: (verb: Verb) => (verb === 'lock' ? 'Nothing left to lock.' : 'Nothing left to unlock.'),
  gone: 'That copy changed meanwhile (sold, refined or locked elsewhere). Pick again.',
  notYours: "That isn't your item.",
};
