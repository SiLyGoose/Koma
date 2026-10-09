import { CONFIG } from '../../config.js';
import { RAID_COMBAT } from '../../constants/index.js';
import { attackMultiplierOf, critChanceOf, critMultiplierOf, guardCutOf, guardTakenShare, healMultiplierOf, playerMaxHp, rallyMultiplierOf, raidGearFrom } from '../../lib/events/raid.js';
import { formatMultiplier, formatPercent } from '../../lib/format.js';
import {
  blightPurgeExtra,
  claimAmount,
  claimGapHours,
  claimTaxRate,
  d20Chance,
  emptyTotals,
  pullCost,
  robCooldownScale,
  robFine,
  robStolenAmount,
  robSuccessChance,
  robTaxRate,
  wealthTaxRate,
  wheelChance,
  type EffectTotals,
} from '../../perks/index.js';

/*
 * The gear page's Common tab: every number a member's gear can change, worked out with what they
 * wear, beside what it is with nothing on. The same formulas as the claims, robs, pulls and raids
 * themselves (perks/stats.ts, lib/events/raid.ts), so the page never works anything out.
 */

/** One number: what it is with their gear, and what it would be without (null when gear doesn't change it). */
export interface StatRow {
  label: string;
  value: string;
  base: string | null;
}

export interface StatSection {
  title: string;
  rows: StatRow[];
}

const range = (min: number, max: number): string => (min === max ? min.toLocaleString('en-US') : `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')}`);
const hours = (n: number): string => `${n} hour${n === 1 ? '' : 's'}`;
const minutes = (n: number): string => `${Math.round(n)} min`;

/** `show` worked out with `gear`, and without any. */
/** A Support's Blight clearing with `blightPurge` gear, like "2 stacks off 2 allies". */
function blightPurgeRow(blightPurge: number): string {
  const stacks = RAID_COMBAT.blight.supportCleanse + blightPurgeExtra(blightPurge);
  return `${stacks} ${stacks === 1 ? 'stack' : 'stacks'} off ${blightPurge > 0 ? '2 allies' : '1 ally'}`;
}

function row(label: string, gear: EffectTotals, show: (gear: EffectTotals) => string): StatRow {
  const value = show(gear);
  const base = show(emptyTotals());
  return { label, value, base: value === base ? null : base };
}

/** The Common tab's sections, raid last, for a member whose equipped gear adds up to `gear`. */
export function gearStats(gear: EffectTotals): StatSection[] {
  const none = emptyTotals();
  const { claim, gacha, rob, raid } = CONFIG;
  const { attack, heal, support } = RAID_COMBAT;
  const fight = (g: EffectTotals) => ({ gear: raidGearFrom(g) });

  return [
    {
      title: 'Economy',
      rows: [
        row('Claim', gear, (g) => range(claimAmount(claim.min, g), claimAmount(claim.max, g))),
        row('Claim every', gear, (g) => hours(claimGapHours(g))),
        row('Gacha pull', gear, (g) => pullCost(gacha.cost, g).toLocaleString('en-US')),
        row('Wheel chance', gear, (g) => formatPercent(wheelChance(g))),
        row('D20 chance', gear, (g) => formatPercent(d20Chance(g))),
      ],
    },
    {
      title: 'Robbing',
      rows: [
        row('Success chance', gear, (g) => formatPercent(robSuccessChance(rob.successChance, rob, g, none))),
        row('Stolen', gear, (g) => range(robStolenAmount(rob.minStolen, g, none), robStolenAmount(rob.maxStolen, g, none))),
        row('Fine if caught', gear, (g) => robFine(rob.failFine, g).toLocaleString('en-US')),
        row('Cooldown', gear, (g) => minutes(rob.cooldownMinutes * robCooldownScale(g))),
        row('Claim tax', gear, (g) => formatPercent(claimTaxRate(g))),
        row('Rob tax', gear, (g) => formatPercent(robTaxRate(g))),
        row('Wealth tax', gear, (g) => formatPercent(wealthTaxRate(rob.wealthTaxRate, g))),
      ],
    },
    {
      title: 'Defense',
      rows: [
        row('Chance to rob you', gear, (g) => formatPercent(robSuccessChance(rob.successChance, rob, none, g))),
        row('Stolen from you', gear, (g) => range(robStolenAmount(rob.minStolen, none, g), robStolenAmount(rob.maxStolen, none, g))),
      ],
    },
    {
      title: 'Raid',
      rows: [
        row('HP', gear, (g) => String(playerMaxHp(raid.playerHp, fight(g)))),
        row('Attack', gear, (g) => range(Math.round(attack.min * attackMultiplierOf(fight(g))), Math.round(attack.max * attackMultiplierOf(fight(g))))),
        row('Max HP damage', gear, (g) => formatPercent(raidGearFrom(g).maxHpDamage)),
        row('Critical Chance', gear, (g) => formatPercent(critChanceOf(fight(g)))),
        // A crit's damage as a share of a normal hit's: 2x is 200%.
        row('Critical Damage', gear, (g) => formatPercent(critMultiplierOf(fight(g)))),
        row('Heal', gear, (g) => `${Math.round(heal.amount * healMultiplierOf(fight(g)))} HP`),
        row('Heal splash', gear, (g) => formatPercent(raidGearFrom(g).healSplash)),
        row('Guard: hit taken', gear, (g) => formatPercent(guardTakenShare(fight(g)))),
        // What the rest of the party takes less of, from moves that hit several raiders (the strongest guard's counts).
        row('Guard: party cut', gear, (g) => formatPercent(guardCutOf(fight(g)))),
        row('Rally', gear, (g) => `${formatMultiplier(rallyMultiplierOf(fight(g)))} for ${support.rallyTurns} turns`),
        row('Boss heal cut', gear, (g) => formatPercent(raidGearFrom(g).healCut)),
        // The Plague Matriarch's Blight a Support clears: stacks off each ally, and how many allies (2 with blightPurge).
        row('Blight purge', gear, (g) => blightPurgeRow(raidGearFrom(g).blightPurge)),
      ],
    },
  ];
}

