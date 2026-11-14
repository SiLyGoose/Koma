import { clamp } from './define.js';
/** What each stat does after the modifiers: round it, keep it in range. */
const FINISH = {
    claimAmount: Math.round,
    cooldownScale: (value) => value,
    robChance: (value) => value,
    robStolen: (value) => Math.max(1, Math.round(value)),
    robFine: Math.round,
    pullCost: (value) => Math.max(1, Math.round(value)),
    jobPay: Math.round,
    wheelChance: (value) => clamp(value, 0, 1),
    d20Chance: (value) => clamp(value, 0, 1),
    claimTaxRate: (value) => clamp(value, 0, 1),
    robTaxRate: (value) => clamp(value, 0, 1),
    wealthTaxRate: (value) => clamp(value, 0, 1),
};
/*
 * The perks, handed over by registry.ts once it has loaded. This file doesn't import the registry
 * itself: perk files import this one (STONKS! reads claimGapHours), and the registry imports every
 * perk file, so importing it here would make a loop that breaks whichever file happens to load first.
 */
let registered = null;
/** Called once, by registry.ts, with every perk in registry order. */
export function registerPerks(perks) {
    registered = perks;
}
/** Works out a stat: `base` changed by every perk that modifies it, then finished. */
export function modify(stat, base, actor, target = {}) {
    if (!registered)
        throw new Error('perks/registry.ts has to load before a stat is worked out (import perks from perks/index.js)');
    let added = base;
    let factor = 1;
    for (const [id, perk] of Object.entries(registered)) {
        const modifier = perk.modifies?.[stat];
        if (!modifier)
            continue;
        const strength = (modifier.whose === 'target' ? target : actor)[id] ?? 0;
        if (modifier.add)
            added += modifier.add(strength);
        if (modifier.factor)
            factor *= modifier.factor(strength);
    }
    return FINISH[stat](added * factor);
}
// ---------------------------------------------------------------------------
// The stats by name, for the code that uses them.
/** Points from an hourly claim, after gear. */
export const claimAmount = (rolled, gear) => modify('claimAmount', rolled, gear);
/** Cost of a gacha pull, after gear. Never below 1. */
export const pullCost = (base, gear) => modify('pullCost', base, gear);
/** Points a job pays, after gear. */
export const jobEarnings = (base, gear) => modify('jobPay', base, gear);
/** How many times longer the wearer's rob cooldown is (1 with nothing that slows them down). */
export const robCooldownScale = (gear) => modify('cooldownScale', 1, gear);
/**
 * How many clock hours the wearer waits between claims. The claim resets on the hour, so the
 * extra wait is counted in whole hours: 1 normally, 2 at +100% (every second hour). Never below 1.
 */
export const claimGapHours = (gear) => Math.max(1, Math.round(robCooldownScale(gear)));
/**
 * Chance a rob succeeds: the base chance changed by the robber's and the victim's gear. Gear can't
 * push it below `minChance` or above `maxChance`; a base chance already outside those limits is
 * left alone unless gear moves it further.
 */
export function robSuccessChance(base, limits, robber, victim) {
    const changed = modify('robChance', base, robber, victim);
    if (changed === base)
        return base;
    return clamp(changed, Math.min(base, limits.minChance), Math.max(base, limits.maxChance));
}
/** Points taken on a successful rob, after the robber's and the victim's gear. At least 1. */
export const robStolenAmount = (rolled, robber, victim) => modify('robStolen', rolled, robber, victim);
/** Fine a caught robber pays, after their gear. */
export const robFine = (base, robber) => modify('robFine', base, robber);
/** The chance (0 to 1) that a claim or successful rob by this gear spins the wheel. */
export const wheelChance = (gear) => modify('wheelChance', 0, gear);
/** The chance (0 to 1) that a claim or rob by this gear rolls the D20. */
export const d20Chance = (gear) => modify('d20Chance', 0, gear);
/** The share (0 to 1) of the victim's next claim that a successful robber's gear taxes. */
export const claimTaxRate = (robber) => modify('claimTaxRate', 0, robber);
/** The share (0 to 1) of the victim's next successful rob that a successful robber's gear taxes. */
export const robTaxRate = (robber) => modify('robTaxRate', 0, robber);
/** The share (0 to 1) of a rich victim's points over the wealth tax line a successful rob by this gear also takes, from the base (rob.wealthTaxRate). */
export const wealthTaxRate = (base, robber) => modify('wealthTaxRate', base, robber);
//# sourceMappingURL=stats.js.map