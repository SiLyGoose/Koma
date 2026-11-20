import { TEXT } from '../constants/index.js';
import { fmt, formatMultiplier } from './format.js';
/** The lines for the member's weapon and armor (`gear`), then their unique treasure. None for what changed nothing. */
export function gearLines(gear, treasure) {
    const lines = [];
    if (gear > 0)
        lines.push([TEXT.receipt.gearAdded(fmt(gear)), gear]);
    if (gear < 0)
        lines.push([TEXT.receipt.gearCut(fmt(-gear)), gear]);
    if (treasure !== null && treasure.amount > 0)
        lines.push([TEXT.receipt.treasureAdded(treasure.name, fmt(treasure.amount)), treasure.amount]);
    if (treasure !== null && treasure.amount < 0)
        lines.push([TEXT.receipt.treasureCut(treasure.name, fmt(-treasure.amount)), treasure.amount]);
    return lines;
}
/** The wheel's line: its multiplier, and what it added or took (`bonus`). */
export function wheelLine(multiplier, bonus) {
    const shown = formatMultiplier(multiplier);
    const text = bonus > 0 ? TEXT.receipt.wheelAdded(shown, fmt(bonus)) : bonus < 0 ? TEXT.receipt.wheelCut(shown, fmt(-bonus)) : TEXT.receipt.wheelNothing(shown);
    return [text, bonus];
}
/** The sum of what the lines added, on top of `start`. */
export const addUp = (lines, start = 0) => lines.reduce((sum, [, amount]) => sum + amount, start);
//# sourceMappingURL=receipt.js.map