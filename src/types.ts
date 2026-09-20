import type { EffectId } from './data/effects.js';

export type Stars = 1 | 2 | 3 | 4;

/** Every star tier, lowest first. */
export const STARS: readonly Stars[] = [1, 2, 3, 4];

/** Where an item can be equipped. A member can wear one item per slot. */
export type Slot = 'weapon' | 'armor';

export const SLOTS: readonly Slot[] = ['weapon', 'armor'];

export interface ItemDef {
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /**
   * The effects this item gives while equipped. How strong each one is depends on the item's
   * star tier and is set in the settings (equipment.<effect>.<stars>), not on the item.
   */
  effects: readonly EffectId[];
}

/** Ids of the items a member currently has equipped (null or missing means empty). */
export interface EquipmentDoc {
  weapon?: string | null;
  armor?: string | null;
}

/** One document per (server, user). */
export interface MemberDoc {
  guildId: string;
  userId: string;
  points: number;
  /** Whole hours since the Unix epoch (UTC) of the last claim. -1 means never. */
  lastClaimHour: number;
  lastRobAt: Date | null;
  /**
   * When this member was last robbed successfully. They can't be robbed again until
   * rob.victimProtectionMinutes after this. Missing or null means never.
   */
  lastRobbedAt?: Date | null;
  totalPulls: number;
  /** Missing on members who have never equipped anything. */
  equipment?: EquipmentDoc;
  createdAt: Date;
}

/** One document per (server, user, item). */
export interface InventoryDoc {
  guildId: string;
  userId: string;
  itemId: string;
  count: number;
  firstObtainedAt: Date;
}

export type LedgerReason =
  | 'claim'
  | 'gacha'
  | 'rob_won'
  | 'rob_lost'
  | 'rob_fine_paid'
  | 'rob_fine_received';

/** Append-only record of every points change, for auditing. */
export interface LedgerDoc {
  guildId: string;
  userId: string;
  delta: number;
  reason: LedgerReason;
  otherUserId?: string;
  itemId?: string;
  createdAt: Date;
}

/**
 * Bot-wide settings: one document with _id "global". The other fields mirror the `Settings`
 * shape in config.ts (prefix, embedColor, claim.min, gacha.cost, ...) and can be changed with
 * the admin-only config command or directly in MongoDB.
 */
export interface SettingsDoc {
  _id: string;
  [key: string]: unknown;
}
