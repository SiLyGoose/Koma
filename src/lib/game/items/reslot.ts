import type { EquipmentDoc, Slot } from '../../../types.js';

/*
 * The pure half of syncGearSlots (services/migrate.ts): what to do with a set of worn gear when an
 * item's catalog slot has changed between weapon and armor since it was put on.
 */

/** The worn weapon and armor after reslotting, and how many copies moved or came off. */
export interface Reslotted {
  weapon: string | null;
  armor: string | null;
  moved: number;
  cleared: number;
}

/**
 * Puts a worn weapon and armor where their items now belong. `slotOf` is the catalog slot of the
 * item a worn copy is (undefined when the copy is gone or the item is unknown: it is left alone).
 * A copy in the other field moves into its own when that one is free, or swaps with a copy that is
 * moving the other way; when its own field is taken it comes off, since it gave nothing where it was.
 * Returns null when nothing needs to change. Treasure items are syncTreasureSlot's, not this one's.
 */
export function reslotGear(equipment: EquipmentDoc | null | undefined, slotOf: (copyId: string) => Slot | undefined): Reslotted | null {
  const weapon = equipment?.weapon ?? null;
  const armor = equipment?.armor ?? null;
  const weaponIsArmor = weapon !== null && slotOf(weapon) === 'armor';
  const armorIsWeapon = armor !== null && slotOf(armor) === 'weapon';
  if (!weaponIsArmor && !armorIsWeapon) return null;
  if (weaponIsArmor && armorIsWeapon) return { weapon: armor, armor: weapon, moved: 2, cleared: 0 };
  if (weaponIsArmor) return armor === null ? { weapon: null, armor: weapon, moved: 1, cleared: 0 } : { weapon: null, armor, moved: 0, cleared: 1 };
  return weapon === null ? { weapon: armor, armor: null, moved: 1, cleared: 0 } : { weapon, armor: null, moved: 0, cleared: 1 };
}
