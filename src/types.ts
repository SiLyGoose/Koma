import type { ObjectId } from 'mongodb';
import type { EffectId } from './perks/index.js';
import type { RaidStats } from './lib/events/raid.js';
import type { RaidBossId } from './constants/raid.js';

export type Stars = 1 | 2 | 3 | 4;

/** Every star tier, lowest first. */
export const STARS: readonly Stars[] = [1, 2, 3, 4];

/**
 * Where an item can be equipped. A member can wear one weapon, one armor, and one unique
 * treasure: a third slot every member has (its key is 'treasure' -- the slot itself isn't
 * unique, the items that go in it are), which stacks with weapon and armor but only holds one
 * item at a time. An item that is a unique treasure competes with every other one a member owns
 * for that one slot (see data/items/catalog.ts for the current list).
 */
export type Slot = 'weapon' | 'armor' | 'treasure';

export const SLOTS: readonly Slot[] = ['weapon', 'armor', 'treasure'];

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
  /** The unique treasure slot (see Slot above). */
  treasure?: string | null;
}

/**
 * The same loadout as item ids (ItemDef.id), which is what the effect math works with. Made
 * from an EquipmentDoc by resolveGear, counting only copies the member still owns.
 */
export interface GearIds {
  weapon?: string | null;
  armor?: string | null;
  treasure?: string | null;
  /**
   * The refinement level (1 to REFINE.maxLevel) of the copy in each slot, filled in by
   * resolveGear. A slot left out here counts as fully refined (the item at its listed strength).
   */
  levels?: Partial<Record<Slot, number>>;
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
  /** komaTokens: free gacha pulls, one each, spent before points. Missing means 0. */
  tokens?: number;
  /** komaGems, won by beating the weekly raid. Missing means 0. */
  gems?: number;
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
   * Pulls since this member's last item of the pity tier (constants/gacha.ts PITY_STARS), counting the
   * latest one. Missing means 0.
   */
  pity?: number;
  /**
   * Set when this member's last pity-tier item (unique treasure) was someone else's: their next
   * one is guaranteed to be one of their own. Cleared when they get their own. Missing means false.
   */
  guaranteed?: boolean;
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
  /**
   * Refinement level, 1 to REFINE.maxLevel (see constants/refine.ts): how much of the item's
   * strength this copy gives. New copies start at 1; copies from before refining existed are 0,
   * which counts as 1 (lib/game/refine.ts refineLevel).
   */
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
  | 'blackjack_bet'
  | 'blackjack_double'
  | 'blackjack_payout'
  | 'blackjack_refund'
  | 'event_crate'
  | 'rob_won'
  | 'rob_lost'
  | 'rob_fine_paid'
  | 'rob_fine_received'
  | 'rob_tax_paid'
  | 'rob_tax_received'
  // A successful rob that slipped (Piplup): the take plus a penalty goes back to the victim.
  | 'rob_slip_paid'
  | 'rob_slip_received'
  // The old vault breaker's reasons: no longer written, kept so older ledger entries still type-check.
  | 'vault_loot'
  | 'vault_fine'
  | 'heist_loot'
  | 'heist_fine'
  | 'split_steal'
  | 'code_guess'
  | 'code_refund'
  | 'code_prize'
  // A gacha pull paid for with a komaToken instead of points (0 points, tokenDelta -1).
  | 'gacha_token'
  // The weekly raid (commands/raid.ts): a boost paid for, points the boss stole, the points and the
  // komaTokens (0 points, tokenDelta) for beating it, and points given back when a raid never
  // finished (the bot stopped during it).
  | 'raid_boost'
  | 'raid_stolen'
  | 'raid_reward'
  | 'raid_tokens'
  | 'raid_gems'
  | 'raid_refund'
  // A duplicate copy used up to refine another (0 points; itemId is the item).
  | 'refine'
  // A one-off fix made by hand (scripts/), like swapping an item given to the wrong member.
  | 'admin_correction';

/**
 * A bet on a blackjack table that has not been settled yet. The points were taken from the member
 * when they sat down, so this document is what says "this many points are on the table": whoever
 * deletes it is the one that pays them back out (as a payout when the round ends, or as a refund
 * if it never finishes), so a bet is paid out exactly once. `leaseUntil` is pushed forward while
 * the table is being played; a bet whose lease has run out belongs to a table that died (the bot
 * restarted) and is refunded by the sweeper (see services/blackjack.ts).
 */
export interface BlackjackBetDoc {
  _id: string;
  guildId: string;
  userId: string;
  /** Which table it is on. */
  gameId: string;
  /** Points on the table: the bet, and again after a double. */
  bet: number;
  leaseUntil: Date;
  createdAt: Date;
}

/** Append-only record of every points change, for auditing. */
export interface LedgerDoc {
  guildId: string;
  userId: string;
  delta: number;
  /** Change in komaTokens, when the entry moved any. */
  tokenDelta?: number;
  /** Change in komaGems, when the entry moved any. */
  gemDelta?: number;
  reason: LedgerReason;
  otherUserId?: string;
  itemId?: string;
  createdAt: Date;
}

/**
 * One document per server: the one channel it confines the bot to (services/channel.ts), and its
 * state for the random events (src/events). `_id` is the server's id. Settings that are the same
 * everywhere (how often, how big) are in SettingsDoc instead; this holds what differs between servers.
 */
export interface GuildDoc {
  _id: string;
  /**
   * The one channel commands (message or slash) are confined to in this server, and where random
   * events spawn. Missing or null means there's no restriction, and events are off. Used to be
   * called `eventChannelId`, from when it only chose where events happened; renamed once commands
   * became confined to it too (see services/migrate.ts's field-rename step).
   */
  channelId?: string | null;
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
  /**
   * Points lost to gambling (a losing plinko drop, a lost blackjack hand, a caught rob's fine)
   * that have not yet been paid out by a vault game (Greedy Heist, Split or Steal), or 0 if there is
   * none. `events.vault.multiplier` times this is what a vault game puts up. Fed by `addVaultLoss` (services/vault.ts) from
   * every game that loses points; a game added later feeds it the same way, one function call.
   * Missing means 0 (no losses recorded yet).
   */
  vaultPool?: number;
  /**
   * Left over from the removed vault breaker event, which saved its open attempt here. Nothing
   * writes it any more; services/migrate.ts clears it on start.
   */
  openVault?: unknown;
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
 * One document per server per raid week (see lib/events/raid-week.ts): `_id` is
 * "<server id>:<week key>", so a second raid in the same week can't be started. While the raid is
 * being played (`preparing` or `fighting`) it also records every point that moved because of it, so
 * a raid the bot never finished (it stopped part way) can give them back; see services/raid.ts.
 */
export interface RaidDoc {
  _id: string;
  guildId: string;
  weekKey: string;
  /** Which boss was fought. Raids saved before there was more than one boss don't have it: they were the dragon. */
  boss?: RaidBossId;
  startedBy: string;
  status: 'preparing' | 'fighting' | 'won' | 'wiped' | 'fled';
  channelId: string | null;
  messageId: string | null;
  /** Who is in the fight. */
  players: string[];
  /** Points each player spent on boosts, by user id. */
  spent: Record<string, number>;
  /** Points the boss stole from each player, by user id. */
  stolen: Record<string, number>;
  /** Filled in when it ends: damage dealt by user id, and whose hit beat the boss. */
  damage?: Record<string, number>;
  /** Filled in when it ends: everything each player did, by user id (for `raid stats`). Raids from before it was saved only have `damage`. */
  stats?: Record<string, RaidStats>;
  lastHit?: string | null;
  rounds?: number;
  createdAt: Date;
  endedAt?: Date | null;
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
