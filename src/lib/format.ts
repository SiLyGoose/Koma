import { CURRENCY_EMOJI, FIELD_MAX_LENGTH, NUMBER_LOCALE, PERCENT_DECIMALS, STAR_SYMBOL, TEXT } from '../constants/index.js';

/** A whole amount with thousands separators: 1500 -> "1,500". A stored -0 shows as 0. */
export const fmt = (n: number): string => (Object.is(n, -0) ? 0 : n).toLocaleString(NUMBER_LOCALE);

/** An amount of points with the currency emoji after it: 1500 -> "1,500 <:zeiucoin:...>". For embed fields that show only an amount. */
export const money = (n: number): string => `${fmt(n)} ${CURRENCY_EMOJI}`;

/** The members' own gear's tier (its rarity, T1 to T4: what were its stars; a copy's stars are its level now, levelTag). */
export const tierLabel = (stars: number): string => `T${stars}`;

/** What TechnoMagic gear shows in place of a tier: it is a tier of its own, above T4. */
export const TM_TIER = '**TM**';

/** An item's tier as it is shown: T1 to T4, or TM for TechnoMagic gear. */
export const itemStars = (item: { stars: number; tmDrop?: true }): string => (item.tmDrop ? TM_TIER : tierLabel(item.stars));

/** The tiers items are listed in, best first: TechnoMagic gear, then T4 down to T1. */
export const ITEM_TIERS = ['tm', 4, 3, 2, 1] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];

/** Whether an item is of a tier (TechnoMagic gear is of its own). */
export const inTier = (item: { stars: number; tmDrop?: true }, tier: ItemTier): boolean => (tier === 'tm' ? item.tmDrop === true : !item.tmDrop && item.stars === tier);

/** A tier as it is shown. */
export const tierString = (tier: ItemTier): string => (tier === 'tm' ? TM_TIER : tierLabel(tier));

/** Joins lines with newlines, cutting off with "...and N more" so it fits an embed field. */
export function joinLimited(lines: string[], maxLength = FIELD_MAX_LENGTH): string {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : (lines[i] as string);
    if (next.length > maxLength) {
      return `${out}\n${TEXT.common.moreLines(lines.length - i)}`;
    }
    out = next;
  }
  return out;
}

/** A Discord mention of a user, like "<@1>". */
export const mention = (userId: string): string => `<@${userId}>`;

/** Discord mentions for a list of user ids, like "<@1>, <@2>". */
export const mentionList = (userIds: readonly string[]): string => userIds.map(mention).join(', ');

/** A change in points with its sign: 25 -> "+25", -90 -> "-90", 0 -> "0". */
export const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;

/** 1.5 -> "1.5x", 2 -> "2x", 0.1 -> "0.1x". */
export const formatMultiplier = (multiplier: number): string => `${Number(multiplier.toFixed(2))}x`;

/** 0.1 -> "10%", 0.125 -> "12.5%". */
export const formatPercent = (fraction: number): string => `${Number((fraction * 100).toFixed(PERCENT_DECIMALS))}%`;
