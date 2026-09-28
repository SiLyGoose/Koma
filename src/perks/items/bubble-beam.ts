import { BUBBLE_BEAM_ROBBER_SHARE, CURRENCY_EMOJI } from '../../constants/index.js';
import { formatPercent } from '../../lib/format.js';
import { clamp, definePerk } from '../define.js';
import type { EffectTotals } from '../registry.js';

/*
 * Bubble Beam, Piplup's perks: on a successful rob where either side wears it (the robber or the
 * victim), the robber may slip. A slip hands everything taken back to the victim, and the robber
 * pays the victim a penalty on top, as a share of what was taken. An item that should slip lists
 * both perks. The slip itself happens in services/economy/rob.ts.
 *
 * A masterwork Piplup (its R5 bonus, forged with komaGems) swaps bubbleBeamPenalty for the bigger
 * bubbleBeamMasterPenalty and adds slipGuard, so its holder's own robs no longer slip.
 */

/**
 * The chance a successful rob slips. Both sides' gear counts, each rolled on its own: a Piplup on
 * either side is enough, and one on both sides makes it more likely (1 - (1 - a)(1 - b)). The
 * robber's own Piplup only counts at BUBBLE_BEAM_ROBBER_SHARE (half), so its holder slips half as
 * often when they are the one robbing. A robber with slipGuard (a masterwork Piplup) slips that
 * much less: at 100%, never, whoever's Piplup it is.
 */
export function slipChance(robber: EffectTotals, victim: EffectTotals): number {
  const a = clamp(robber.bubbleBeam, 0, 1) * BUBBLE_BEAM_ROBBER_SHARE;
  const b = clamp(victim.bubbleBeam, 0, 1);
  return (1 - (1 - a) * (1 - b)) * (1 - clamp(robber.slipGuard, 0, 1));
}

/**
 * The penalty the robber pays the victim on a slip, as whole points: the largest penalty rate on
 * either side (bubbleBeamPenalty, or a masterwork's bubbleBeamMasterPenalty) times what was taken.
 * 0 when nothing was taken or nobody has the perk.
 */
export function slipPenaltyAmount(stolen: number, robber: EffectTotals, victim: EffectTotals): number {
  const rate = Math.max(0, robber.bubbleBeamPenalty, victim.bubbleBeamPenalty, robber.bubbleBeamMasterPenalty, victim.bubbleBeamMasterPenalty);
  return stolen > 0 ? Math.round(stolen * rate) : 0;
}

export const bubbleBeam = definePerk({
  description:
    "Bubble Beam (Piplup), chance: chance that a successful rob against the wearer slips (half that when the wearer is the robber). A slip gives everything taken back to the victim, plus bubbleBeamPenalty.",
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `Piplup used *Bubble Beam*: ${value} chance a successful rob against you slips (half that when you rob), and the ${CURRENCY_EMOJI} goes back to the victim`,
  // With slipGuard alongside (a masterwork Piplup), the part about slipping when you rob shrinks, or
  // goes when you never do.
  line: (strength, _settings, strengthOf) => {
    const robbing = BUBBLE_BEAM_ROBBER_SHARE * (1 - clamp(strengthOf('slipGuard'), 0, 1));
    const when =
      robbing <= 0 ? '' : robbing === 0.5 ? ' (half that when you rob)' : ` (${formatPercent(robbing)} of that when you rob)`;
    return `Piplup used *Bubble Beam*: ${formatPercent(strength)} chance a successful rob against you slips${when}, and the ${CURRENCY_EMOJI} goes back to the victim`;
  },
});

export const bubbleBeamPenalty = definePerk({
  description: `Bubble Beam (Piplup), penalty: what a robber who slips pays the victim on top of returning the ${CURRENCY_EMOJI}, as a percent of the amount taken.`,
  defaults: { 1: 0.025, 2: 0.1, 3: 0.175, 4: 0.25 },
  min: 0,
  max: 10,
  text: (value) => `Piplup used *Bubble Beam*: a robber who slips also pays +${value} of what they took`,
});

export const bubbleBeamMasterPenalty = definePerk({
  description: `Bubble Beam (masterwork Piplup), penalty: replaces bubbleBeamPenalty once Piplup is a masterwork. What a robber who slips pays the victim on top of returning the ${CURRENCY_EMOJI}, as a percent of the amount taken.`,
  defaults: { 1: 0.05, 2: 0.2, 3: 0.35, 4: 0.5 },
  min: 0,
  max: 10,
  text: (value) => `Piplup used *Bubble Beam*: a robber who slips also pays +${value} of what they took`,
});

export const slipGuard = definePerk({
  description: 'Bubble Beam (masterwork Piplup), guard: how much less likely the wearer is to slip when they rob (100% means never, whoever wears the Piplup).',
  defaults: { 1: 1, 2: 1, 3: 1, 4: 1 },
  min: 0,
  max: 1,
  text: (value) => `Your own successful robs are ${value} less likely to slip`,
  // Next to Bubble Beam, its line says it (by leaving out slipping when you rob): no line of its own.
  line: (strength, _settings, strengthOf) =>
    strengthOf('bubbleBeam') > 0 ? '' : strength >= 1 ? 'Your own successful robs never slip' : `Your own successful robs are ${formatPercent(strength)} less likely to slip`,
});
