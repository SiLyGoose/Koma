/*
 * Gear loadouts (commands/loadout.ts). Every member has `count` loadouts, numbered from 1. One is
 * active: it is the gear they are wearing, and equip/unequip change it. The others keep the gear
 * they had when the member switched away, so switching back puts it all on again. Copies saved in
 * any loadout can't be sold or used up by a refine.
 */
export const LOADOUTS = {
  /** How many loadouts every member has. At most 9, so a loadout is always one digit. */
  count: 3,
  /** The longest name a member can give a loadout. */
  maxNameLength: 24,
} as const;

/**
 * The switch buttons under the loadout list: one per loadout the member isn't using, with ids `switchPrefix` + the loadout number. They stop working after `idleMs` without a press.
 */
export const LOADOUT_BUTTONS = { switchPrefix: 'loadout_switch_', idleMs: 60_000 };
