import { clamp, definePerk } from './define.js';
import type { EffectTotals } from './index.js';

/** Wither (Coughing Baby): after a successful rob, the victim's next claim is taxed and paid to the wearer. */
export const claimTax = definePerk({
  description:
    "Percent of the victim's next hourly claim that is taken and paid to the wearer, after the wearer robs them successfully.",
  defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
  min: 0,
  max: 1,
  text: (value) => `Wither: members you rob lose ${value} of their next claim to you`,
});

/** The share (0 to 1) of the victim's next claim that a successful robber's gear taxes. */
export function claimTaxRate(robber: EffectTotals): number {
  return clamp(robber.claimTax, 0, 1);
}

/** Points taken from a claim of `amount` by a tax of `rate`. Never more than the claim. */
export function claimTaxAmount(amount: number, rate: number): number {
  return Math.min(amount, Math.max(0, Math.round(amount * rate)));
}
