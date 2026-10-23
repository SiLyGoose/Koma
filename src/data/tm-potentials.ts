import type { TmPotentialId } from '../types.js';

/*
 * TechnoMagic gear's potentials, as King's Raid's TechnoMagic gear has them: as a copy drops, it rolls
 * TM_POTENTIAL_LINES of these at random, each a different one, each by an amount between its range's ends (the
 * settings' hero.potentials.<id>.min and .max; these are their defaults). A hero of the copy's class wearing it
 * has them in the raid: they are all the stats TechnoMagic gear has (it has no perks; lib/game/heroes.ts). Each raises the hero's stat of the
 * same name; an amount is a share, as a perk's strength is (0.05: 5% more, or 50 points of a chance), and a whole percent
 * (lib/game/technomagic.ts rolls it so).
 */

/** How many potentials a copy rolls. */
export const TM_POTENTIAL_LINES = 4;

/**
 * How many options a unique treasure's copy rolls as it is pulled: King's Raid's treasures have two, from the pool and ranges
 * below (each a different one). Its hero has them wherever it wears it, its main treasure slot or a sub treasure slot (there,
 * all it gives: King's Raid's). Refining it doesn't change them; enhancing does (UT_ENHANCE: the one picked rolled again,
 * anywhere in its range, for points).
 */
export const UT_OPTION_LINES = 2;

/**
 * Enhancing a unique treasure's option (POST /api/heroes/upgrade): the one picked, its amount rolled again anywhere in its
 * range (in whole percents, or half ones for a range whose ends aren't whole), for `price` points.
 */
export const UT_ENHANCE = { price: 1_152 } as const;

/** Every potential, in the order they're listed (King's Raid's), with its name: a copy's lines', the settings' and the databank's (the user's). */
export const TM_POTENTIALS: readonly { id: TmPotentialId; name: string }[] = [
  { id: 'atk', name: 'ATK' },
  { id: 'speed', name: 'ATK Spd' },
  { id: 'hp', name: 'Max HP' },
  { id: 'defense', name: 'DEF' },
  { id: 'defPhysical', name: 'P. DEF' },
  { id: 'defMagical', name: 'M. DEF' },
  { id: 'block', name: 'Block' },
  { id: 'blockPhysical', name: 'P. Block' },
  { id: 'blockMagical', name: 'M. Block' },
  { id: 'blockDef', name: 'Block DEF' },
  { id: 'blockDefPhysical', name: 'P. Block DEF' },
  { id: 'blockDefMagical', name: 'M. Block DEF' },
  { id: 'dodge', name: 'Dodge' },
  { id: 'tough', name: 'Tough' },
  { id: 'toughPhysical', name: 'P. Tough' },
  { id: 'toughMagical', name: 'M. Tough' },
  { id: 'accuracy', name: 'CC ACC' },
  { id: 'resist', name: 'CC Resist' },
  { id: 'crit', name: 'Crit Chance' },
  { id: 'critDamage', name: 'Crit DMG' },
  { id: 'manaAttack', name: 'Mana Recovery per Attack' },
  { id: 'manaRegen', name: 'Mana Recovery per Second' },
  { id: 'lifesteal', name: 'Lifesteal' },
  { id: 'critResist', name: 'Crit Resist' },
  { id: 'pen', name: 'Penetration' },
  { id: 'acc', name: 'ACC' },
  { id: 'dodgePhysical', name: 'P. Dodge' },
  { id: 'dodgeMagical', name: 'M. Dodge' },
  { id: 'critResistPhysical', name: 'P. Crit Resist' },
  { id: 'critResistMagical', name: 'M. Crit Resist' },
  { id: 'recovery', name: 'Recovery' },
  { id: 'manaDamage', name: 'Mana Recovery from DMG Taken' },
];

export const TM_POTENTIAL_IDS: readonly TmPotentialId[] = TM_POTENTIALS.map(({ id }) => id);
export const TM_POTENTIAL_NAME: ReadonlyMap<string, string> = new Map(TM_POTENTIALS.map(({ id, name }) => [id, name]));

/**
 * What each potential can roll, by default: the user's numbers. DEF and Block are against both kinds of damage, so
 * half of what P.DEF/M.DEF and P.Block/M.Block are. CC Resist, Crit Resist and Mana Recovery per attack weren't
 * given: set beside what they answer (Accuracy, Crit, and ATK Spd). Nor were Dodge, Block DEF, Tough and Mana
 * Recovery per Second: Dodge, Block DEF and Tough (both kinds) as Block, P./M. Block DEF and P./M. Tough as
 * P./M. Block, and Mana Recovery per Second as per attack.
 */
export const TM_POTENTIAL_RANGES: Readonly<Record<TmPotentialId, { min: number; max: number }>> = {
  atk: { min: 0.05, max: 0.12 },
  speed: { min: 0.05, max: 0.12 },
  hp: { min: 0.05, max: 0.12 },
  defense: { min: 0.05, max: 0.11 },
  defPhysical: { min: 0.11, max: 0.22 },
  defMagical: { min: 0.11, max: 0.22 },
  block: { min: 0.05, max: 0.11 },
  blockPhysical: { min: 0.11, max: 0.22 },
  blockMagical: { min: 0.11, max: 0.22 },
  blockDef: { min: 0.05, max: 0.11 },
  blockDefPhysical: { min: 0.11, max: 0.22 },
  blockDefMagical: { min: 0.11, max: 0.22 },
  dodge: { min: 0.05, max: 0.11 },
  tough: { min: 0.05, max: 0.11 },
  toughPhysical: { min: 0.11, max: 0.22 },
  toughMagical: { min: 0.11, max: 0.22 },
  accuracy: { min: 0.05, max: 0.11 },
  resist: { min: 0.05, max: 0.11 },
  crit: { min: 0.05, max: 0.12 },
  critDamage: { min: 0.1, max: 0.24 },
  manaAttack: { min: 0.05, max: 0.12 },
  manaRegen: { min: 0.05, max: 0.12 },
  lifesteal: { min: 0.05, max: 0.11 },
  critResist: { min: 0.05, max: 0.12 },
  pen: { min: 0.05, max: 0.11 },
  // King's Raid's treasure options the old potentials hadn't: the user's ranges.
  acc: { min: 0.05, max: 0.11 },
  dodgePhysical: { min: 0.11, max: 0.22 },
  dodgeMagical: { min: 0.11, max: 0.22 },
  critResistPhysical: { min: 0.11, max: 0.22 },
  critResistMagical: { min: 0.11, max: 0.22 },
  recovery: { min: 0.075, max: 0.15 },
  manaDamage: { min: 0.11, max: 0.22 },
};

/** The step a potential of a range rolls and enhances by (a share): a whole percent, or half of one for a range whose ends aren't whole. */
export const potentialStep = (range: { min: number; max: number }): number => {
  const whole = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
  return whole(range.min) && whole(range.max) ? 0.01 : 0.005;
};
