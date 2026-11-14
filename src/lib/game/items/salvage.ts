import { SALVAGE_TIERS, type HeroPart, type SalvageRule } from '../../../protocol/heroes.js';

/*
 * What a salvage rule (protocol/heroes.ts SalvageRule) takes: King's Raid's hero gear of a tier it picks (T6 to T9), at
 * its stars or fewer, of a part it picks, and only for the classes it picks (gear other classes wear too is kept). The
 * site's heroes/salvage-rule.ts says the same, for its Salvage by rule.
 */

/** What a salvage rule reads of a piece: King's Raid's tier (null: not King's Raid's gear), its stars, its part and the classes it works on (none: any). */
export interface SalvagePiece {
  tier: number | null;
  stars: number;
  part: HeroPart;
  classes: readonly string[];
}

/** Whether `rule` takes `piece` (whether it could be salvaged at all, locked, worn or socketed, is the caller's to say). */
export function salvageMatches(rule: SalvageRule, piece: SalvagePiece): boolean {
  if (piece.tier === null || !SALVAGE_TIERS.includes(piece.tier) || !rule.tiers.includes(piece.tier)) return false;
  if (piece.stars > rule.stars) return false;
  if (rule.parts.length > 0 && !rule.parts.includes(piece.part)) return false;
  if (rule.classes.length === 0) return true;
  return piece.classes.length > 0 && piece.classes.every((cls) => (rule.classes as readonly string[]).includes(cls));
}
