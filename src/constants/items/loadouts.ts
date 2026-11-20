/*
 * Gear loadouts (commands/loadout.ts). Every member starts with `free` loadouts, numbered from 1, and can
 * unlock more up to `count`, one at a time, for points (`unlockPrices`, burned). One is
 * active: it is the gear they are wearing, and equip/unequip change it. The others keep the gear
 * they had when the member switched away, so switching back puts it all on again. Copies saved in
 * any loadout can't be sold or used up by a refine.
 */
export const LOADOUTS = {
  /** The most loadouts a member can have: `free` and every one in `unlockPrices`. At most 9, so a loadout is always one digit. */
  count: 5,
  /** How many loadouts every member has to begin with. */
  free: 3,
  /** What unlocking each loadout after the free ones costs in points, in order: loadout 4, then loadout 5. */
  unlockPrices: [10_000, 20_000],
  /** The longest name a member can give a loadout. */
  maxNameLength: 24,
} as const;

/**
 * The switch buttons under the loadout list: one per loadout the member isn't using, with ids `switchPrefix` + the loadout number. They stop working after `idleMs` without a press.
 */
export const LOADOUT_BUTTONS = { switchPrefix: 'loadout_switch_', idleMs: 60_000 };
