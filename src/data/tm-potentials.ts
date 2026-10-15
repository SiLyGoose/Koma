import type { TmPotentialId } from '../types.js';

/*
 * TechnoMagic gear's potentials, as King's Raid's TechnoMagic gear has them: as a copy drops, it rolls
 * TM_POTENTIAL_LINES of these at random, each a different one, each by an amount between its range's ends (the
 * settings' hero.potentials.<id>.min and .max; these are their defaults). A hero of the copy's class wearing it
 * has them in the raid: they are all the stats TechnoMagic gear has (it has no perks; lib/game/heroes.ts). Each raises the hero's stat of the
 * same name; an amount is a share, as a perk's strength is (0.05: 5% more, or 50 points of a chance).
 */

/** How many potentials a copy rolls. */
export const TM_POTENTIAL_LINES = 4;

/** Every potential, in the order they're listed (King's Raid's), with its name in the settings. */
export const TM_POTENTIALS: readonly { id: TmPotentialId; name: string }[] = [
  { id: 'atk', name: 'ATK' },
  { id: 'speed', name: 'ATK Spd' },
  { id: 'hp', name: 'Max HP' },
  { id: 'defense', name: 'DEF' },
  { id: 'defPhysical', name: 'P.DEF' },
  { id: 'defMagical', name: 'M.DEF' },
  { id: 'block', name: 'Block' },
  { id: 'blockPhysical', name: 'P.Block' },
  { id: 'blockMagical', name: 'M.Block' },
  { id: 'accuracy', name: 'Accuracy' },
  { id: 'resist', name: 'CC Resist' },
  { id: 'crit', name: 'Crit' },
  { id: 'critDamage', name: 'Crit DMG' },
  { id: 'manaAttack', name: 'Mana Recovery per attack' },
  { id: 'lifesteal', name: 'Lifesteal' },
  { id: 'critResist', name: 'Crit Resist' },
  { id: 'pen', name: 'Penetration' },
];

export const TM_POTENTIAL_IDS: readonly TmPotentialId[] = TM_POTENTIALS.map(({ id }) => id);

/**
 * What each potential can roll, by default: the user's numbers. DEF and Block are against both kinds of damage, so
 * half of what P.DEF/M.DEF and P.Block/M.Block are. CC Resist, Crit Resist and Mana Recovery per attack weren't
 * given: set beside what they answer (Accuracy, Crit, and ATK Spd).
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
  accuracy: { min: 0.05, max: 0.11 },
  resist: { min: 0.05, max: 0.11 },
  crit: { min: 0.05, max: 0.12 },
  critDamage: { min: 0.1, max: 0.24 },
  manaAttack: { min: 0.05, max: 0.12 },
  lifesteal: { min: 0.05, max: 0.11 },
  critResist: { min: 0.05, max: 0.12 },
  pen: { min: 0.05, max: 0.11 },
};
