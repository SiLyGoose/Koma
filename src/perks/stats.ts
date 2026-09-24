import { clamp, type PerkDef } from './define.js';
import type { EffectTotals } from './registry.js';

/*
 * The numbers gear can change, and the one formula each is worked out with. A perk doesn't need
 * any code here: it lists the stats it changes under `modifies` in its own file (see define.ts),
 * and every function below picks it up.
 *
 * A stat is worked out as (base + every add) x every factor, then finished (rounded, clamped...).
 * Each perk's strength is already added up across everything equipped (see totalEffects), so two
 * items with the same perk stack by adding, and different perks stack by multiplying, whatever
 * order they are listed in. With nothing equipped every stat is just its base.
 *
 * `actor` is the gear of whoever is acting (the member claiming, pulling or robbing) and `target`
 * the gear of whoever it is done to (the member being robbed); a perk says whose gear it counts
 * from with `whose` (the actor's, unless it says 'target').
 */

export type StatId =
  /** Points from an hourly claim, from the rolled amount. */
  | 'claimAmount'
  /** How many times longer the rob and claim cooldowns are (1 is normal). */
  | 'cooldownScale'
  /** Chance a rob succeeds, from the base chance (clamped in robSuccessChance). */
  | 'robChance'
  /** Points taken on a successful rob, from the rolled amount. */
  | 'robStolen'
  /** The fine a caught robber pays, from the base fine. */
  | 'robFine'
  /** Cost of one gacha pull, from the base cost. */
  | 'pullCost'
  /** Chance (0 to 1) a claim or successful rob spins the wheel. */
  | 'wheelChance'
  /** Chance (0 to 1) a claim rolls the D20. */
  | 'd20Chance'
  /** Share (0 to 1) of the victim's next claim a successful robber takes. */
  | 'claimTaxRate'
  /** Share (0 to 1) of the victim's next successful rob a successful robber takes. */
  | 'robTaxRate';

/** How one perk changes one stat. `strength` is the perk's total strength (0.1 means 10%). */
export interface StatModifier {
  /** Whose gear the strength comes from: the one acting (default) or the one it is done to. */
  whose?: 'actor' | 'target';
  /** Added to the base. */
  add?: (strength: number) => number;
  /** Multiplies the result. */
  factor?: (strength: number) => number;
}

/** What each stat does after the modifiers: round it, keep it in range. */
const FINISH: Record<StatId, (value: number) => number> = {
  claimAmount: Math.round,
  cooldownScale: (value) => value,
  robChance: (value) => value,
  robStolen: (value) => Math.max(1, Math.round(value)),
  robFine: Math.round,
  pullCost: (value) => Math.max(1, Math.round(value)),
  wheelChance: (value) => clamp(value, 0, 1),
  d20Chance: (value) => clamp(value, 0, 1),
  claimTaxRate: (value) => clamp(value, 0, 1),
  robTaxRate: (value) => clamp(value, 0, 1),
};

/*
 * The perks, handed over by registry.ts once it has loaded. This file doesn't import the registry
 * itself: perk files import this one (STONKS! reads claimGapHours), and the registry imports every
 * perk file, so importing it here would make a loop that breaks whichever file happens to load first.
 */
let registered: Readonly<Record<string, PerkDef>> | null = null;

/** Called once, by registry.ts, with every perk in registry order. */
export function registerPerks(perks: Readonly<Record<string, PerkDef>>): void {
  registered = perks;
}

/** Works out a stat: `base` changed by every perk that modifies it, then finished. */
export function modify(stat: StatId, base: number, actor: Partial<EffectTotals>, target: Partial<EffectTotals> = {}): number {
  if (!registered) throw new Error('perks/registry.ts has to load before a stat is worked out (import perks from perks/index.js)');
  let added = base;
  let factor = 1;
  for (const [id, perk] of Object.entries(registered)) {
    const modifier = perk.modifies?.[stat];
    if (!modifier) continue;
    const strength = (modifier.whose === 'target' ? target : actor)[id as keyof EffectTotals] ?? 0;
    if (modifier.add) added += modifier.add(strength);
    if (modifier.factor) factor *= modifier.factor(strength);
  }
  return FINISH[stat](added * factor);
}

// ---------------------------------------------------------------------------
// The stats by name, for the code that uses them.

/** Points from an hourly claim, after gear. */
export const claimAmount = (rolled: number, gear: EffectTotals): number => modify('claimAmount', rolled, gear);

/** Cost of a gacha pull, after gear. Never below 1. */
export const pullCost = (base: number, gear: EffectTotals): number => modify('pullCost', base, gear);

/** How many times longer the wearer's rob cooldown is (1 with nothing that slows them down). */
export const robCooldownScale = (gear: Partial<EffectTotals>): number => modify('cooldownScale', 1, gear);

/**
 * How many clock hours the wearer waits between claims. The claim resets on the hour, so the
 * extra wait is counted in whole hours: 1 normally, 2 at +100% (every second hour). Never below 1.
 */
export const claimGapHours = (gear: Partial<EffectTotals>): number => Math.max(1, Math.round(robCooldownScale(gear)));

/**
 * Chance a rob succeeds: the base chance changed by the robber's and the victim's gear. Gear can't
 * push it below `minChance` or above `maxChance`; a base chance already outside those limits is
 * left alone unless gear moves it further.
 */
export function robSuccessChance(
  base: number,
  limits: { minChance: number; maxChance: number },
  robber: EffectTotals,
  victim: EffectTotals,
): number {
  const changed = modify('robChance', base, robber, victim);
  if (changed === base) return base;
  return clamp(changed, Math.min(base, limits.minChance), Math.max(base, limits.maxChance));
}

/** Points taken on a successful rob, after the robber's and the victim's gear. At least 1. */
export const robStolenAmount = (rolled: number, robber: EffectTotals, victim: EffectTotals): number =>
  modify('robStolen', rolled, robber, victim);

/** Fine a caught robber pays, after their gear. */
export const robFine = (base: number, robber: EffectTotals): number => modify('robFine', base, robber);

/** The chance (0 to 1) that a claim or successful rob by this gear spins the wheel. */
export const wheelChance = (gear: EffectTotals): number => modify('wheelChance', 0, gear);

/** The chance (0 to 1) that a claim by this gear rolls the D20. */
export const d20Chance = (gear: EffectTotals): number => modify('d20Chance', 0, gear);

/** The share (0 to 1) of the victim's next claim that a successful robber's gear taxes. */
export const claimTaxRate = (robber: EffectTotals): number => modify('claimTaxRate', 0, robber);

/** The share (0 to 1) of the victim's next successful rob that a successful robber's gear taxes. */
export const robTaxRate = (robber: EffectTotals): number => modify('robTaxRate', 0, robber);
