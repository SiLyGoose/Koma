import { BUBBLE_BEAM_ROBBER_SHARE, CURRENCY_EMOJI } from '../constants/index.js';
import { clamp, definePerk } from './define.js';
import type { EffectTotals } from './registry.js';

/*
 * Bubble Beam, Piplup's perks: on a successful rob where either side wears it (the robber or the
 * victim), the robber may slip. A slip hands everything taken back to the victim, and the robber
 * pays the victim a penalty on top, as a share of what was taken. An item that should slip lists
 * both perks. The slip itself happens in services/economy/rob.ts.
 */

/**
 * The chance a successful rob slips. Both sides' gear counts, each rolled on its own: a Piplup on
 * either side is enough, and one on both sides makes it more likely (1 - (1 - a)(1 - b)). The
 * robber's own Piplup only counts at BUBBLE_BEAM_ROBBER_SHARE (half), so its holder slips half as
 * often when they are the one robbing.
 */
export function slipChance(robber: EffectTotals, victim: EffectTotals): number {
  const a = clamp(robber.bubbleBeam, 0, 1) * BUBBLE_BEAM_ROBBER_SHARE;
  const b = clamp(victim.bubbleBeam, 0, 1);
  return 1 - (1 - a) * (1 - b);
}

/**
 * The penalty the robber pays the victim on a slip, as whole points: the larger of the two sides'
 * bubbleBeamPenalty times what was taken. 0 when nothing was taken or nobody has the perk.
 */
export function slipPenaltyAmount(stolen: number, robber: EffectTotals, victim: EffectTotals): number {
  const rate = Math.max(0, robber.bubbleBeamPenalty, victim.bubbleBeamPenalty);
  return stolen > 0 ? Math.round(stolen * rate) : 0;
}

export const bubbleBeam = definePerk({
  description:
    "Bubble Beam (Piplup), chance: chance that a successful rob against the wearer slips (half that when the wearer is the robber). A slip gives everything taken back to the victim, plus bubbleBeamPenalty.",
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `Piplup used *Bubble Beam*: ${value} chance a successful rob against you slips (half that when you rob), and the ${CURRENCY_EMOJI} goes back to the victim`,
});

export const bubbleBeamPenalty = definePerk({
  description: `Bubble Beam (Piplup), penalty: what a robber who slips pays the victim on top of returning the ${CURRENCY_EMOJI}, as a percent of the amount taken.`,
  defaults: { 1: 0.025, 2: 0.1, 3: 0.175, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `Piplup used *Bubble Beam*: a robber who slips also pays +${value} of what they took`,
});
