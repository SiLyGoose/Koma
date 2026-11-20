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
 * Special Summon, September 2019: 0★ 9%, 1★ 0.15%, 2★ 0.07%, 3★ 0.036%): `weaponLevels` weighs its copy's stars, 0★ first.
 * A unique treasure only came at 0★ (9%), a new copy's (`treasureLevels`).
 */
export const HERO_BANNER: {
  readonly weaponShare: number;
  readonly weaponLevels: readonly number[];
  readonly treasureLevels: readonly number[];
  readonly artifactShare: number;
  readonly highTier: number;
  readonly lowTier: number;
  readonly lowPieceShare: number;
  readonly runeBoxes: readonly (readonly [string, number])[];
} = {
  weaponShare: 0.5,
  weaponLevels: [9, 0.15, 0.07, 0.036],
  treasureLevels: [1],
  artifactShare: 0.8,
  highTier: 8,
  lowTier: 7,
  lowPieceShare: 0.5,
  runeBoxes: [
    ['rune-box-rare', 60],
    ['rune-box-heroic', 30],
    ['rune-box-legendary', 10],
  ],
};

/*
 * Below its top tier, the Hero Item banner gives King's Raid's All-In-One Special Summon's kinds of things (never the members'
 * own gear, nor TechnoMagic gear): its 3★ tier an artifact `artifactShare` of the time, else a Unique Weapon or Unique Treasure
 * Ticket (`weaponShare` a weapon's: a selector, to the mailbox); its 2★ tier a dragon set's piece of tier `highTier`; its 1★ a
 * dragon set's piece of tier `lowTier` `lowPieceShare` of the time, else a Mysterious Rune (`runeBoxes`' by their weights).
 */
