import type { Slot } from '../types.js';
import { RAID_EMOJI } from './raid.js';

/*
 * How numbers, stars and gear slots are written.
 */

/** Drawn once per star of an item: 3 stars is "★★★". */
export const STAR_SYMBOL: string = '★';

/** Language used for thousands separators: "en-US" gives 1,250. */
export const NUMBER_LOCALE = 'en-US';

/** Most decimals shown on a percentage: 12.345% shows as 12.35% at 2. */
export const PERCENT_DECIMALS = 2;

/** What each gear slot is called in words (the gear card's headings and the slash command's slot picker). */
export const SLOT_LABELS: Record<Slot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  treasure: 'Treasure',
};

/** The emoji that stands for each gear slot wherever an item is shown (the slash command's slot picker keeps the words, since its choices can't show custom emojis). */
export const SLOT_EMOJI: Record<Slot, string> = {
  weapon: RAID_EMOJI.attack,
  armor: RAID_EMOJI.guard,
  treasure: '<:komatreasure:1553209944713469965>',
};
