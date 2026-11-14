import { SALVAGE_TIERS } from '../../../protocol/heroes.js';
/** Whether `rule` takes `piece` (whether it could be salvaged at all, locked, worn or socketed, is the caller's to say). */
export function salvageMatches(rule, piece) {
    if (piece.tier === null || !SALVAGE_TIERS.includes(piece.tier) || !rule.tiers.includes(piece.tier))
        return false;
    if (piece.stars > rule.stars)
        return false;
    if (rule.parts.length > 0 && !rule.parts.includes(piece.part))
        return false;
    if (rule.classes.length === 0)
        return true;
    return piece.classes.length > 0 && piece.classes.every((cls) => rule.classes.includes(cls));
}
//# sourceMappingURL=salvage.js.map