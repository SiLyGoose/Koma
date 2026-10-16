/**
 * The limited banner: a second banner beside the standard one, open between the settings'
 * gacha.limited.start and gacha.limited.end. Its 1 to 3-star items are the standard ones; a top-tier
 * item from it is one of `featured` (equally likely) gacha.limited.featuredChance of the time, and
 * one of the standard banner's the rest. After one that wasn't featured, the next is.
 *
 * For a new limited banner, change `name` and `featured` (item ids, each marked `limited: true` in
 * catalog.ts) and set the dates. Items that are no longer featured can't be pulled any more. Members
 * keep their limited pity and guarantee from one banner to the next.
 */
export const LIMITED_BANNER: { readonly name: string; readonly featured: readonly string[] } = {
  name: 'Help Wanted',
  featured: ['pot-of-greed', 'employee-of-the-month'],
};

/**
 * The Hero Item banner's top tier (its weight is the settings' gacha.heroStarWeights.4), as King's Raid's own summons had
 * it: its Treasure Summon gave a unique weapon 1% of the time and a unique treasure 1% (PLUG notice, March 2019), so each
 * is half of it (`weaponShare`), each item of a kind as likely. A unique weapon came refined now and then (the All-In-One
 * Special Summon, September 2019: 0★ 9%, 1★ 0.15%, 2★ 0.07%, 3★ 0.036%): `weaponLevels` weighs its copy's level, R1 (0★)
 * first. A unique treasure only came at 0★ (9%), so a new copy's R1 (`treasureLevels`).
 */
export const HERO_BANNER: { readonly weaponShare: number; readonly weaponLevels: readonly number[]; readonly treasureLevels: readonly number[] } = {
  weaponShare: 0.5,
  weaponLevels: [9, 0.15, 0.07, 0.036],
  treasureLevels: [1],
};
