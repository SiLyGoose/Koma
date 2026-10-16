/* What the bot's items are, as the bot and the site's pages name them (the bot's types.ts and data/items/ say the rest). */

export type Stars = 1 | 2 | 3 | 4;

/** Every star tier, lowest first. */
export const STARS: readonly Stars[] = [1, 2, 3, 4];

/**
 * Where an item can be equipped. A member can wear one weapon, one armor, and one unique
 * treasure: a third slot every member has (its key is 'treasure' -- the slot itself isn't
 * unique, the items that go in it are), which stacks with weapon and armor but only holds one
 * item at a time. An item that is a unique treasure competes with every other one a member owns
 * for that one slot (see data/items/catalog.ts for the current list).
 */
export type Slot = 'weapon' | 'armor' | 'treasure';

export const SLOTS: readonly Slot[] = ['weapon', 'armor', 'treasure'];

/**
 * Which banner a gacha pull is made on: the standard one, the limited one (open between the settings'
 * gacha.limited.start and .end), whose top-tier items are mostly its featured ones (data/items/banner.ts),
 * or the Hero Item one (always open), whose top-tier items are the heroes' unique weapons
 * and unique treasures (ItemDef.uniqueWeapon, ItemDef.uniqueTreasure). Each keeps its own pity; the standard and limited ones their own guarantee too.
 */
export type BannerId = 'standard' | 'limited' | 'hero';

export const BANNERS: readonly BannerId[] = ['standard', 'limited', 'hero'];

/** The TechnoMagic Raids' gear sets (data/tm-sets.ts), one for each raid's boss. */
export type TmSetId = 'perseverance' | 'hope' | 'authority';
