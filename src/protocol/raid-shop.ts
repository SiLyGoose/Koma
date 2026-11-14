import type { Slot, Stars } from './items.js';

/* The raid shop on the site: what the bot's GET /api/raid-shop (and its POSTs) say. */

/** One raid item on the shelf, as the site shows it. */
export interface RaidShopItem {
  /** The site draws it by this id (its public/gear/items). */
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** What a new copy does (R1). */
  effects: string[];
  /** What a copy costs in komaGems. */
  price: number;
  /** How many copies of it the member has. */
  owned: number;
}

/**
 * GET /api/raid-shop: this week's shelf, best tier first, and the member's komaGems; and their komaDust (what salvaging hero
 * gear pays), `powderPerGem` of which crafts a komaGem and `powderPerSelector` a Unique Weapon or Unique Treasure Ticket
 * (POST /api/raid-shop/craft, its `recipe`), and the tickets they hold (`selectors`), each used for a unique weapon or
 * treasure of any hero's (POST /api/raid-shop/use). Left out by a bot from before komaDust (or before the tickets).
 */
export interface RaidShopView {
  items: RaidShopItem[];
  gems: number;
  powder?: number;
  powderPerGem?: number;
  powderPerSelector?: number;
  selectors?: { uw: number; ut: number };
  /** When the shelf changes (ms): the start of the next raid week. */
  resetsAt: number;
  /**
   * Paying for a new shelf: how many refreshes a week a member gets (`max`, 0 when it's off), how many
   * of this week's they have `left`, and what the next costs in komaGems (null with none left).
   */
  refresh: { max: number; left: number; price: number | null };
}

/** What POST /api/raid-shop/craft makes: komaGems, or Unique Weapon ('uw') or Unique Treasure ('ut') Tickets. */
export type CraftRecipe = 'gem' | 'uw' | 'ut';

/** POST /api/raid-shop/use's answer: the shop after, and the name of the unique weapon or treasure the ticket gave. */
export type RaidShopUsed = RaidShopView & { given: string };
