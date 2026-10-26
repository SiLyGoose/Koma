import type { HeroesView } from './heroes.js';

/*
 * King's Raid's runes beyond their sockets, on the site (the bot's /api/runes): sold for zeiucoins or disassembled into Rune
 * Fragments (King's Raid's RuneItemBreakTable and ItemTable SellGold, both halved: the user's), Mysterious Runes crafted from
 * the fragments (King's Raid's CraftItemTable, its Rune Scrolls, gold and Ancient Runebook left out), and taking a rune out
 * of a socket: kept for RUNE_KEEP_PRICE zeiucoins (King's Raid's Rune Preserve, 100 rubies), else disassembled where it is.
 */

/** What selling a rune of each grade (1 Common to 6 Legendary; an Ancient one and a Velkazar one are 5) pays, in zeiucoins. */
export const RUNE_SELL_POINTS: Readonly<Record<number, number>> = { 1: 200, 2: 350, 3: 650, 4: 1_150, 5: 1_950, 6: 3_300 };

/** The Rune Fragments disassembling a rune of each grade gives. */
export const RUNE_FRAGMENTS: Readonly<Record<number, number>> = { 1: 8, 2: 20, 3: 50, 4: 125, 5: 312, 6: 500 };

/** What taking a rune out of a socket and keeping it costs, in zeiucoins (one put in over another: the other's). */
export const RUNE_KEEP_PRICE = 100;

/** A Mysterious Rune crafted from Rune Fragments (King's Raid's PACKAGE_RUNE_*): a rune of its grade, any as likely. */
export type RuneBoxId = 'uncommon' | 'rare' | 'heroic' | 'ancient';

export interface RuneBox {
  id: RuneBoxId;
  name: string;
  /** The grade of the rune it gives (an Ancient one: an Ancient rune, of grade 5). */
  grade: number;
  /** Its picture, public/kr/items/<icon>.webp (the Ancient one: King's Raid's has none, so the Legendary one's). */
  icon: string;
}

/** The Mysterious Runes (what one takes in Rune Fragments is the bot's setting: HeroesView.craft's `runes`). */
export const RUNE_BOXES: readonly RuneBox[] = [
  { id: 'uncommon', name: 'Mysterious Rune: Uncommon', grade: 2, icon: 'PACKAGE_RUNE_2' },
  { id: 'rare', name: 'Mysterious Rune: Rare', grade: 3, icon: 'PACKAGE_RUNE_3' },
  { id: 'heroic', name: 'Mysterious Rune: Heroic', grade: 4, icon: 'PACKAGE_RUNE_4' },
  { id: 'ancient', name: 'Mysterious Rune: Ancient', grade: 5, icon: 'PACKAGE_RUNE_5' },
];

/** The most runes one sale takes, and the most Mysterious Runes one craft makes. */
export const RUNES_AT_ONCE = 1_000;

/** POST /api/runes/sell: how many of each rune (its id) to sell, or (`disassemble`) to break into Rune Fragments. */
export interface RuneSaleRequest {
  runes: Record<string, number>;
  disassemble?: boolean;
}

/** What a sale came to: how many runes went, and the zeiucoins (a sale) or Rune Fragments (a disassembly) they gave. */
export interface RuneSale {
  runes: number;
  points: number;
  fragments: number;
}

/** POST /api/runes/sell: their heroes after (their runes, and `runeFragments`), and what it came to. */
export type RunesSold = HeroesView & { runeSale: RuneSale };

/** POST /api/runes/craft: their heroes after, and the runes the Mysterious Runes crafted gave (their ids, one each). */
export type RunesCrafted = HeroesView & { crafted: string[] };

/** POST /api/runes/break: a rune in one of their copies' sockets disassembled where it is; their heroes after, and its fragments. */
export type RuneBroken = HeroesView & { fragments: number };

/** Why runes weren't sold, crafted or broken (nothing was spent): none of those runes, too few Rune Fragments, or an empty socket. */
export type RuneError = 'nothing_to_sell' | 'no_fragments' | 'no_rune' | 'no_socket' | 'not_found' | 'busy';
