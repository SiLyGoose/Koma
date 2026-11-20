/* The heroes' outfits on the site: what the bot's GET /api/hero-outfits (and its POSTs) say. */

/** One hero's outfit (King's Raid's costume of it), as the site shows it. */
export interface HeroOutfitView {
  /** Its skin's name (Koma-UI's src/technomagic/assets/heroes/<hero>.ts): the site draws it and names it by that. */
  id: string;
  /** Whose it is (a hero's id). */
  hero: string;
  /** What it costs in points. */
  price: number;
  owned: boolean;
}

/** GET /api/hero-outfits: every hero's outfits, in the heroes' order (each hero's in its skins'), which heroes are the member's, and their points. */
export interface HeroOutfitsView {
  outfits: HeroOutfitView[];
  /** The heroes they own (only those can buy or wear an outfit). */
  heroes: string[];
  /** The outfit each of their heroes wears, by hero (one not in it is in its own look). */
  worn: Record<string, string>;
  balance: number;
}
