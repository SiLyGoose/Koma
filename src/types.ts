import type { ObjectId } from 'mongodb';
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
  /**
   * Discord user ids that can use this item's effects. Anyone can pull, own and equip it, but for
   * everyone else it does nothing (the admin, ADMIN_USER_ID, can use every item, for testing).
   * Missing means everyone can use it. When present it must list at least one id.
   */
  usableBy?: readonly string[];
}

/**
 * What a member has equipped, as stored on their member document: the id of the specific copy
 * (ItemCopyDoc._id) in each slot. Null or missing means empty.
 */
export interface EquipmentDoc {
  weapon?: string | null;
  armor?: string | null;
}

/**
 * The same loadout as item ids (ItemDef.id), which is what the effect math works with. Made
 * from an EquipmentDoc by resolveGear, counting only copies the member still owns.
 */
export interface GearIds {
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
   * How many times longer than usual the cooldown that started at lastRobAt is (2 = doubled, from
   * the slothCooldown gear effect), fixed when that rob was made. Missing or null means 1.
   */
  robCooldownScale?: number | null;
  /**
   * How many clock hours must pass after lastClaimHour before the next normal claim (2 = every
   * second hour, from the slothCooldown gear effect), fixed when that claim was made. Missing or
   * null means 1.
   */
  claimGapHours?: number | null;
  /**
   * When this member was last robbed successfully. They can't be robbed again until
   * rob.victimProtectionMinutes after this. Missing or null means never.
   */
  lastRobbedAt?: Date | null;
  /**
   * A short lock held while someone is robbing this member, so two robs on the same victim run one
   * after the other instead of at the same time. `robLockBy` is the holder's token and
   * `robLockUntil` when the lock lapses on its own (in case the bot stops before releasing it).
   * Both are missing or null when nobody is robbing them.
   */
  robLockUntil?: Date | null;
  robLockBy?: string | null;
  totalPulls: number;
  /**
   * A tax waiting for this member's next hourly claim (see the claimTax gear effect): the share
   * of that claim, and who it is paid to. Both are missing or null when there is none. They are
   * cleared by the claim they apply to.
   */
  claimTaxRate?: number | null;
  claimTaxBy?: string | null;
  /**
   * The same for this member's next successful rob (see the robTax gear effect): the share of what
   * they steal, and who it is paid to. Cleared by the rob it applies to.
   */
  robTaxRate?: number | null;
  robTaxBy?: string | null;
  /**
   * Pulls since this member's last item of the pity tier (constants.ts PITY_STARS), counting the
   * latest one. Missing means 0.
   */
  pity?: number;
  /**
   * The clock hour (see lastClaimHour) in which this member has one more claim to make, earned by a
   * critical success on the D20. It only counts while it equals the current hour, and the claim that
   * uses it clears it. Missing or null means none.
   */
  bonusClaimHour?: number | null;
  /** Missing on members who have never equipped anything. */
  equipment?: EquipmentDoc;
  createdAt: Date;
}

/**
 * One document per copy of an item a member owns, per server. Two copies of the same item are
 * separate documents, so each can have its own level and can be traded on its own.
 */
export interface ItemCopyDoc {
  /** Unique id of this copy. Equipment points at it. */
  _id: string;
  guildId: string;
  userId: string;
  /** The catalog item (ItemDef.id) this is a copy of. */
  itemId: string;
  /** Refinement level. 0 for a new copy. Reserved for upgrades: it has no effect yet. */
  level: number;
  obtainedAt: Date;
}

/**
 * The old inventory: one document per (server, user, item) with a count. Nothing writes to it
 * any more; it is only read once, by the migration to ItemCopyDoc (services/migrate.ts).
 */
export interface LegacyInventoryDoc {
  _id: ObjectId;
  guildId: string;
  userId: string;
  itemId: string;
  count: number;
  firstObtainedAt: Date;
  /** Set by the migration once this stack has been turned into copies. */
  migratedAt?: Date | null;
}

/** Small bookkeeping records, like "the inventory migration has finished". */
export interface MetaDoc {
  _id: string;
  [key: string]: unknown;
}

export type LedgerReason =
  | 'claim'
  | 'claim_tax_paid'
  | 'claim_tax_received'
  | 'gacha'
  | 'sell'
  | 'plinko_bet'
  | 'plinko_payout'
  | 'event_crate'
  | 'rob_won'
  | 'rob_lost'
  | 'rob_fine_paid'
  | 'rob_fine_received'
  | 'rob_tax_paid'
  | 'rob_tax_received';

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
 * One document per server for the random events (src/events). `_id` is the server's id. Settings
 * that are the same everywhere (how often, how big) are in SettingsDoc instead; this holds what
 * differs between servers.
 */
export interface GuildDoc {
  _id: string;
  /** The channel events happen in. Missing or null means events are off in this server. */
  eventChannelId?: string | null;
  /** When the next event is due. Missing or null means one has not been scheduled yet. */
  nextEventAt?: Date | null;
  /** When the last event started. */
  lastEventAt?: Date | null;
  /**
   * The point crate that is open in this server right now, saved so that a restart of the bot
   * does not lose it (it is picked up again, or paid out, when the bot starts). Removed when the
   * crate is settled: whoever removes it is the one that pays.
   */
  openCrate?: OpenCrateDoc | null;
}

/** A point crate that has been posted and not settled yet. */
export interface OpenCrateDoc {
  channelId: string;
  /** The crate message, which has the Grab button. */
  messageId: string;
  /** The points inside. */
  pile: number;
  /** When the crate opens (the grabbing stops). */
  endsAt: Date;
  /** Who has grabbed it so far (user ids), each once. */
  grabbers: string[];
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
