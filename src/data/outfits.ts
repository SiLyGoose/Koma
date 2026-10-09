/*
 * The outfits a member can wear: the character they're drawn as on the site (the gear page, Pinecraft).
 * The site has their pictures, by these ids (Koma-UI's src/shared/characters.ts). Everyone has
 * DEFAULT_OUTFIT; the others are bought in the site's shop (services/outfits.ts), for outfit.price
 * points each.
 */

export interface OutfitDef {
  id: string;
  name: string;
}

/** Everyone's outfit until they buy and wear another. */
export const DEFAULT_OUTFIT = 'tsuri';

/** In the order the shop shows them, the default first. */
export const OUTFITS: readonly OutfitDef[] = [
  { id: DEFAULT_OUTFIT, name: 'Tsuri' },
  { id: 'yae-pixo', name: 'Yae Pixo' },
  { id: 'speve', name: 'Speve' },
];

export const OUTFITS_BY_ID: ReadonlyMap<string, OutfitDef> = new Map(OUTFITS.map((outfit) => [outfit.id, outfit]));
