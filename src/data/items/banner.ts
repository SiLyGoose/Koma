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
