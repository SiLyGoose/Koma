import type { Filter } from 'mongodb';
import { ITEMS_BY_ID, heroBannerItem } from '../../../data/items.js';
import type { BannerId, ItemDef, LedgerDoc, LedgerReason } from '../../../types.js';

/*
 * A member's pull history (the banner page's History: GET /api/gacha/history): their pulls in the ledger, a banner's at a
 * time. Each pull's entry says its banner (`banner`) since that was written down; one from before says none, and is put
 * on the banner its item comes from: the Hero Item banner's own (King's Raid's gear and tickets, the heroes' unique weapons
 * and treasures), a limited banner's featured items, and the standard banner for the rest (a limited banner's other
 * items are the standard one's, so such a pull from before counts there).
 */

/** The ledger's entries for a pull: paid in points, with a komaToken, or given on top for nothing (Pot of Greed). */
export const PULL_REASONS = ['gacha', 'gacha_token', 'gacha_bonus'] as const satisfies readonly LedgerReason[];

/** How many pulls a page of the history shows. */
export const HISTORY_PAGE = 6;

/** The banner a pull of `item` came from, when its entry doesn't say (an item no longer in the game: the standard one). */
export function pulledFrom(item: ItemDef | undefined): BannerId {
  if (!item) return 'standard';
  if (item.kr !== undefined || item.grant !== undefined || heroBannerItem(item)) return 'hero';
  return item.limited ? 'limited' : 'standard';
}

/** The ids of the items each banner's pulls from before were of (the standard one: all the others). */
let ownIds: Record<'hero' | 'limited', string[]> | null = null;
const idsOf = (banner: 'hero' | 'limited'): string[] => {
  ownIds ??= {
    hero: [...ITEMS_BY_ID.values()].filter((item) => pulledFrom(item) === 'hero').map((item) => item.id),
    limited: [...ITEMS_BY_ID.values()].filter((item) => pulledFrom(item) === 'limited').map((item) => item.id),
  };
  return ownIds[banner];
};

/** What finds a member's pulls on `banner` in the ledger: those whose entry says it, and those from before it was said, by their item. */
export function historyFilter(guildId: string, userId: string, banner: BannerId): Filter<LedgerDoc> {
  const before = banner === 'standard' ? { $nin: [...idsOf('hero'), ...idsOf('limited')] } : { $in: idsOf(banner) };
  return {
    guildId,
    userId,
    reason: { $in: [...PULL_REASONS] },
    $or: [{ banner }, { banner: { $exists: false }, itemId: before }],
  };
}
