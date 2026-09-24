import type { Slot } from '../types.js';

/*
 * How numbers, stars and gear slots are written.
 */

/** Drawn once per star of an item: 3 stars is "★★★". */
export const STAR_SYMBOL: string = '★';

/** Language used for thousands separators: "en-US" gives 1,250. */
export const NUMBER_LOCALE = 'en-US';

/** Most decimals shown on a percentage: 12.345% shows as 12.35% at 2. */
export const PERCENT_DECIMALS = 2;

/** What each gear slot is called on the gear card. */
export const SLOT_LABELS: Record<Slot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  treasure: 'Treasure',
};
