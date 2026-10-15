/*
 * The TechnoMagic Raid's heroes' transcendence perks, as King's Raid has them: picked on the site's heroes page
 * (its Transcend tab, Koma-UI's src/heroes/transcend.ts has what each says and its picture), each costing
 * transcendence points (TP), TRANSCEND_POINTS of them for each hero. Every hero has the same perks by id:
 *
 *   Transcend 1: five everyone has (ATK Up, HP Up, DEF Up, Crit Resist Up, Monster Hunting), 10 TP each.
 *   Transcend 2: five of its class's (class-1 to class-5: which they are is its class's), 15 TP each.
 *   Transcend 3: a Light and a Dark one for each of its four skills (s1-light to s4-dark), 15 TP each.
 *   Transcend 5: a Light and a Dark one of its own (t5-light, t5-dark), 15 TP each.
 *
 * Any of them can be picked with any other, while their TP all told is no more than TRANSCEND_POINTS.
 */

/** The TP each hero has to spend. */
export const TRANSCEND_POINTS = 80;

export type TranscendTier = 1 | 2 | 3 | 5;

export interface TranscendPerk {
  id: string;
  tier: TranscendTier;
  /** What it costs in TP. */
  cost: number;
}

const tier = (n: TranscendTier, cost: number, ids: readonly string[]): TranscendPerk[] => ids.map((id) => ({ id, tier: n, cost }));

/** In the order the heroes page shows them. */
export const TRANSCEND_PERKS: readonly TranscendPerk[] = [
  ...tier(1, 10, ['atk-up', 'hp-up', 'def-up', 'crit-resist-up', 'monster-hunting']),
  ...tier(2, 15, ['class-1', 'class-2', 'class-3', 'class-4', 'class-5']),
  ...tier(3, 15, ['s1-light', 's1-dark', 's2-light', 's2-dark', 's3-light', 's3-dark', 's4-light', 's4-dark']),
  ...tier(5, 15, ['t5-light', 't5-dark']),
];

export const TRANSCEND_PERKS_BY_ID: ReadonlyMap<string, TranscendPerk> = new Map(TRANSCEND_PERKS.map((perk) => [perk.id, perk]));

/** The TP a set of perks costs all told (an id that isn't a perk costing nothing). */
export const transcendCost = (ids: readonly string[]): number => ids.reduce((sum, id) => sum + (TRANSCEND_PERKS_BY_ID.get(id)?.cost ?? 0), 0);

/** A hero's perks as they are kept: each known one once, in TRANSCEND_PERKS' order. Null when they cost more TP than a hero has. */
export function transcendPicks(ids: readonly string[]): string[] | null {
  const picked = TRANSCEND_PERKS.filter((perk) => ids.includes(perk.id)).map((perk) => perk.id);
  return transcendCost(picked) <= TRANSCEND_POINTS ? picked : null;
}

/** The perks a hero has from what was kept (TRANSCEND_PERKS' order), leaving out any no longer known and, past the TP, the last ones. */
export function keptPerks(ids: readonly string[] | undefined): string[] {
  const out: string[] = [];
  let spent = 0;
  for (const perk of TRANSCEND_PERKS) {
    if (!ids?.includes(perk.id) || spent + perk.cost > TRANSCEND_POINTS) continue;
    out.push(perk.id);
    spent += perk.cost;
  }
  return out;
}
