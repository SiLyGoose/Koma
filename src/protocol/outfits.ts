/* The outfits on the site: what the bot's GET /api/outfits (and its POSTs) say. */

/** One outfit, as the site shows it. */
export interface OutfitView {
  /** The site draws it by this id (its src/shared/characters.ts). */
  id: string;
  name: string;
  /** What it costs in points (0 for the default, which everyone has). */
  price: number;
  owned: boolean;
}

/** GET /api/outfits: the outfits, in the shop's order, and the member's points. */
export interface OutfitsView {
  outfits: OutfitView[];
  /** The id of the one they wear. */
  worn: string;
  balance: number;
}
