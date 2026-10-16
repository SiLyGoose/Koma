import type { RaidBossId, RaidClassId } from '../constants/raid.js';
import { ESSENCE_NAME, ESSENCES, TRANSCEND_MAX, TRANSCEND_PERKS, TRANSCEND_POINTS, TRANSCEND_TP, type EssenceId, type TranscendPerk, type TranscendTier } from '../protocol/heroes.js';

export { ESSENCE_NAME, ESSENCES, TRANSCEND_MAX, TRANSCEND_PERKS, TRANSCEND_POINTS, TRANSCEND_TP, type EssenceId, type TranscendPerk, type TranscendTier };

/*
 * The TechnoMagic Raid's heroes' transcendence, as King's Raid has it, on the site's heroes page.
 *
 * A hero starts at Transcend 0 (no TP, no perks) and goes up to TRANSCEND_MAX (its Stats tab), each level paying hero essences
 * (the three kinds its class uses: CLASS_ESSENCES; beating the weekly raid gives three kinds, its boss's: RAID_BOSS_ESSENCES)
 * and komaGems (TRANSCEND_COSTS).
 * Each level gives it more transcendence points (TP, TRANSCEND_TP) to pick perks with (its Transcend tab, Koma-UI's
 * src/heroes/transcend.ts has what each says and its picture), and opens their tier of them. Every hero has the same
 * perks by id:
 *
 *   Transcend 1: five everyone has (ATK Up, HP Up, DEF Up, Crit Resist Up, Monster Hunting), 10 TP each.
 *   Transcend 2: five of its class's (class-1 to class-5: which they are is its class's), 15 TP each.
 *   Transcend 3: a Light and a Dark one for each of its four skills (s1-light to s4-dark), 15 TP each.
 *   Transcend 5: a Light and a Dark one of its own (t5-light, t5-dark), 15 TP each.
 *
 * Any perk of a tier it has reached can be picked with any other, while their TP all told is no more than it has.
 */

/** A hero's level as kept (missing: 0), within 0 and TRANSCEND_MAX. */
export const transcendLevel = (level: number | undefined): number => Math.min(TRANSCEND_MAX, Math.max(0, Math.floor(level ?? 0)));

/** The TP a hero has at `level`. */
export const transcendPoints = (level: number | undefined): number => TRANSCEND_TP[transcendLevel(level)] as number;

/** The three essences each class's heroes transcend with, as King's Raid has them. */
export const CLASS_ESSENCES: Readonly<Record<RaidClassId, readonly [EssenceId, EssenceId, EssenceId]>> = {
  knight: ['justice', 'strategy', 'patience'],
  warrior: ['justice', 'force', 'fortune'],
  priest: ['justice', 'patience', 'harmony'],
  wizard: ['force', 'wisdom', 'harmony'],
  assassin: ['wisdom', 'patience', 'fortune'],
  mechanic: ['wisdom', 'strategy', 'fortune'],
  archer: ['force', 'strategy', 'harmony'],
};

/** The three essences beating each raid boss gives: every kind from one boss or another, two of them from two. */
export const RAID_BOSS_ESSENCES: Readonly<Record<RaidBossId, readonly [EssenceId, EssenceId, EssenceId]>> = {
  wyrm: ['justice', 'force', 'strategy'],
  reaper: ['wisdom', 'patience', 'fortune'],
  plague: ['harmony', 'patience', 'strategy'],
};

/** What beating `boss` gives each raider: `amount` of each of its essences (none at 0). */
export const bossEssences = (boss: RaidBossId, amount: number): Partial<Record<EssenceId, number>> =>
  amount > 0 ? Object.fromEntries(RAID_BOSS_ESSENCES[boss].map((id) => [id, amount])) : {};

/** What going up to each level costs (Transcend 1 first): so many of each of its class's essences, and komaGems. */
export const TRANSCEND_COSTS: readonly { essences: number; gems: number }[] = [
  { essences: 20, gems: 1 },
  { essences: 30, gems: 2 },
  { essences: 40, gems: 3 },
  { essences: 50, gems: 4 },
  { essences: 60, gems: 5 },
];

/** What a hero of `heroClass` at `level` pays to go up one: each essence and how many, and the komaGems; null at TRANSCEND_MAX. */
export function transcendCost(heroClass: RaidClassId, level: number | undefined): { essences: Record<EssenceId, number>; gems: number } | null {
  const at = transcendLevel(level);
  const cost = TRANSCEND_COSTS[at];
  if (at >= TRANSCEND_MAX || !cost) return null;
  return { essences: Object.fromEntries(CLASS_ESSENCES[heroClass].map((id) => [id, cost.essences])) as Record<EssenceId, number>, gems: cost.gems };
}

export const TRANSCEND_PERKS_BY_ID: ReadonlyMap<string, TranscendPerk> = new Map(TRANSCEND_PERKS.map((perk) => [perk.id, perk]));

/** The TP a set of perks costs all told (an id that isn't a perk costing nothing). */
export const perksCost = (ids: readonly string[]): number => ids.reduce((sum, id) => sum + (TRANSCEND_PERKS_BY_ID.get(id)?.cost ?? 0), 0);

/**
 * A hero at `level`'s perks as they are kept: each known one once, in TRANSCEND_PERKS' order. Or why they can't all
 * be had: 'perk_locked', one of a tier past its level; 'too_many_points', more TP than it has.
 */
export function transcendPicks(ids: readonly string[], level: number | undefined): string[] | 'perk_locked' | 'too_many_points' {
  const picked = TRANSCEND_PERKS.filter((perk) => ids.includes(perk.id));
  if (picked.some((perk) => perk.tier > transcendLevel(level))) return 'perk_locked';
  const out = picked.map((perk) => perk.id);
  return perksCost(out) <= transcendPoints(level) ? out : 'too_many_points';
}

/** The perks a hero at `level` has from what was kept (TRANSCEND_PERKS' order), leaving out any no longer known or of a tier past its level, and, past its TP, the last ones. */
export function keptPerks(ids: readonly string[] | undefined, level: number | undefined): string[] {
  const out: string[] = [];
  const points = transcendPoints(level);
  let spent = 0;
  for (const perk of TRANSCEND_PERKS) {
    if (!ids?.includes(perk.id) || perk.tier > transcendLevel(level) || spent + perk.cost > points) continue;
    out.push(perk.id);
    spent += perk.cost;
  }
  return out;
}
