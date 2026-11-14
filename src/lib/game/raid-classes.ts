import { RAID_CLASSES, RAID_COMBAT, RAID_NO_CLASS, TEXT, type RaidClassId, type RaidClassRules } from '../../constants/index.js';
import { formatMultiplier, formatPercent } from '../format.js';

/*
 * What a raid class does, in words, for the databanks: a line for each of its rules
 * (constants/raid.ts's RAID_CLASSES) that isn't a raider without a class's, with today's numbers.
 */

const t = TEXT.raid.classTraits;
const plain = RAID_NO_CLASS;

/**
 * Each rule's line, in the order they're shown (null when the class has it as everyone does). Every
 * rule has an entry, so a new one can't be added without saying what it does.
 */
const LINES: { [Rule in keyof RaidClassRules]: (rules: RaidClassRules) => string | null } = {
  attack: (r) => (r.attack === plain.attack ? null : t.attack(formatMultiplier(r.attack))),
  rampStep: (r) => (r.rampStep > 0 ? t.ramp(formatPercent(r.rampStep), formatPercent(r.rampMax)) : null),
  // Said with rampStep.
  rampMax: () => null,
  hex: (r) => (r.hex > 0 ? t.hex(formatPercent(r.hex)) : null),
  crit: (r) => (r.crit > 0 ? t.crit(formatPercent(r.crit)) : null),
  hp: (r) => (r.hp === plain.hp ? null : t.hp(formatMultiplier(r.hp))),
  retaliate: (r) => (r.retaliate > 0 ? t.retaliate(formatPercent(r.retaliate)) : null),
  healed: (r) => (r.healed === plain.healed ? null : t.healed(formatMultiplier(r.healed))),
  taken: (r) => (r.taken === plain.taken ? null : t.taken(formatMultiplier(r.taken))),
  partyCut: (r) => (r.partyCut > 0 ? t.partyCut(formatPercent(r.partyCut), formatPercent(RAID_COMBAT.guard.aoeCutMax)) : null),
  covers: (r) => (r.covers ? t.covers() : null),
  heal: (r) => (r.heal === plain.heal ? null : t.heal(formatMultiplier(r.heal))),
  healCrit: (r) => (r.healCrit ? t.healCrit() : null),
  rallyTurns: (r) => (r.rallyTurns > 0 ? t.rallyTurns(r.rallyTurns, RAID_COMBAT.support.rallyTurns + r.rallyTurns) : null),
  interrupts: (r) => (r.interrupts === plain.interrupts ? null : t.interrupts(r.interrupts)),
  ward: (r) => (r.ward ? t.ward() : null),
  massDispel: (r) => (r.massDispel ? t.massDispel() : null),
};

/** A class's lines (Discord markdown), what it does to their attacks first. */
export function classTraits(id: RaidClassId): string[] {
  const rules = RAID_CLASSES[id];
  return (Object.keys(LINES) as (keyof RaidClassRules)[]).map((rule) => LINES[rule](rules)).filter((line): line is string => line !== null);
}
