import type { ObjectId } from 'mongodb';
import type { EffectId } from './perks/index.js';
import type { RaidStats } from './lib/events/raid.js';
import type { RaidBossId, RaidClassId } from './constants/raid.js';
import type { EssenceId } from './data/transcend.js';
import type { HeroSlot } from './protocol/heroes.js';
import type { Slot, Stars, TmSetId } from './protocol/items.js';

export { BANNERS, SLOTS, STARS, type BannerId, type Slot, type Stars, type TmSetId } from './protocol/items.js';
export { HERO_SLOTS, type HeroSlot } from './protocol/heroes.js';

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
  /**
   * Only drops from raid bosses: never pulled from the gacha, and a party that beats a raid boss has a
   * chance (raid.dropChance, more with every raider) that each of them finds one (lib/game/items/raid-drops.ts).
   * Missing means it's pulled as usual.
   */
  raidDrop?: true;
  /**
   * A limited item: never pulled from the standard banner, only from the limited banner while it is
   * featured there (data/items/banner.ts) and the banner is open. Missing means it's pulled as usual.
   */
  limited?: true;
  /**
   * TechnoMagic gear: never pulled, only dropped by the TechnoMagic Raid, and only heroes wear it (a member
   * can't: its perks are the heroes' stats, lib/game/heroes.ts). Missing means it's the members' own.
   */
  tmDrop?: true;
  /** TechnoMagic gear: the set it belongs to, the one of the raid that drops it (data/tm-sets.ts). */
  tmSet?: TmSetId;
  /**
   * A unique weapon: the id of the TechnoMagic Raid hero it is made for (data/heroes.ts). Only pulled from the
   * Hero Item banner, as its pity tier (4 stars); only that hero wears it (a member can't, nor another hero),
   * and besides its perks it has its own effect in the raid, as far as it is refined (Koma-UI's
   * src/technomagic/sim/unique.ts). Missing means it isn't one.
   */
  uniqueWeapon?: string;
  /**
   * A class item: its perks only work for raiders of this class (constants/raid.ts's RAID_CLASSES). The
   * databanks tag it and can list a class's items. Missing means it's for everyone.
   */
  class?: RaidClassId;
  /** Optional: a bonus a copy gets once refined to R5 (see ItemBonus). */
  bonus?: ItemBonus;
}

/**
 * A 4-star item's bonus, at REFINE.maxLevel: once a copy is at `level`, the item loses the perks in
 * `removes` (say a drawback it outgrows) and shows `text` as an extra effect. Below that it works as
 * if the bonus weren't there.
 */
export interface ItemBonus {
  /** The refinement level it needs (REFINE.maxLevel). */
  level: number;
  /**
   * The extra effect, for the gear card, like "Pinecraft: ores take no extra energy": the last line,
   * under the item's other effects (the perks in `removes` lose theirs). To show a number that
   * follows the settings, make it a function: `strength(effect)` is a perk's strength on this copy
   * (a fraction, 0.5 for 50%) and `percent(n)` formats one, like "25%".
   */
  text: string | ((strength: (effect: EffectId) => number, percent: (n: number) => string) => string);
  /** Perks of the item's it turns off. */
  removes: readonly EffectId[];
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
  /** Whether the copy in each slot is locked (`lock`), filled in by resolveGear, for the gear card. Left out counts as not. */
  locked?: Partial<Record<Slot, boolean>>;
}

/** One document per (server, user). */
/** Something whose cooldown can be paid to skip (services/skips.ts). */
export type SkipId = 'claim';

/** How many times a member skipped one thing on `day` (YYYY-MM-DD, Eastern), for its doubling price. */
export interface SkipUse {
  day: string;
  count: number;
}

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
  /** Skips paid for today, per thing skipped (services/skips.ts). Missing means none. */
  skips?: Partial<Record<SkipId, SkipUse>>;
  /** Their raid class, picked on the site's gear page (services/raid-class.ts). Missing or null means none. */
  raidClass?: RaidClassId | null;
  /** How many times they refreshed their raid shop shelf in raid week `week` (RaidWeek.key). Missing, or another week's, means none. */
  raidShop?: { week: string; refreshes: number };
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
  /** Hero essences (data/transcend.ts EssenceId), won by beating the weekly raid and spent transcending heroes. Missing means none. */
  essences?: Partial<Record<EssenceId, number>>;
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
   * Thoccy Keyboard: when this member's recent successful robs were, for its streak (only the ones
   * in the last ROB_STREAK_WINDOW_MS are kept). Emptied by a failed rob.
   */
  robStreakAt?: Date[] | null;
  /**
   * Thoccy Keyboard: set when this member failed a rob wearing it. The next successful rob against
   * them takes this share more; cleared by that rob, or by a successful rob of their own.
   */
  vulnerableRate?: number | null;
  /**
   * Pulls since this member's last item of the pity tier (constants/items/gacha.ts PITY_STARS), counting the
   * latest one. Missing means 0.
   */
  pity?: number;
  /**
   * Set when this member's last pity-tier item (unique treasure) was someone else's: their next
   * one is guaranteed to be one of their own. Cleared when they get their own. Missing means false.
   */
  guaranteed?: boolean;
  /**
   * The same two for the limited banner, which counts its own pity (kept from one limited banner to
   * the next): pulls there since their last pity-tier item, and whether their next one is guaranteed
   * to be a featured item (their last one there wasn't). Missing means 0 and false.
   */
  limitedPity?: number;
  limitedGuaranteed?: boolean;
  /**
   * Pulls on the Hero Item banner since their last pity-tier item there (a unique weapon). That banner has
   * no guarantee: every one of its pity-tier items is a unique weapon, each as likely. Missing means 0.
   */
  heroPity?: number;
  /**
   * The item they picked for each banner's guarantee to give (the site's banner page): one of their own
   * treasures on the standard banner, a featured item on the limited one. Missing, or an item the
   * guarantee can't give any more (a limited banner since replaced), means any of them.
   */
  guaranteedPick?: string;
  limitedPick?: string;
  /**
   * What this member is wearing: the gear of their active loadout. Missing on members who have
   * never equipped anything.
   */
  equipment?: EquipmentDoc;
  /**
   * This member's loadouts, keyed by number ('1' to LOADOUTS.count). A missing entry is an empty
   * loadout with its default name. See LoadoutDoc and constants/items/loadouts.ts.
   */
  loadouts?: Record<string, LoadoutDoc>;
  /** Which loadout is active (1 to LOADOUTS.count); its gear is `equipment`. Missing means 1. */
  activeLoadout?: number | null;
  /** The outfits this member bought (data/outfits.ts ids; never the default, which everyone has). Missing means none. */
  outfits?: string[];
  /** The outfit they wear: one of theirs. Missing or null means the default (services/outfits.ts). */
  outfit?: string | null;
  /**
   * The TechnoMagic Raid's heroes this member bought in the site's shop (data/heroes.ts ids), each with
   * the gear it wears (services/heroes.ts). Missing means none.
   */
  heroes?: Record<string, HeroDoc>;
  createdAt: Date;
}

/** One of a member's heroes (MemberDoc.heroes). */
export interface HeroDoc {
  boughtAt: Date;
  /**
   * The copy (ItemCopyDoc._id) in each of its slots: missing or null is empty. A copy is on one hero
   * at most (it can be on the member as well), and in one of its slots.
   */
  equipment?: Partial<Record<HeroSlot, string | null>>;
  /** How far it is transcended (0 to TRANSCEND_MAX, data/transcend.ts), on the site's heroes page. Missing means 0. */
  transcend?: number;
  /** The transcendence perks picked for it (data/transcend.ts ids), on the site's heroes page. Missing means none. */
  perks?: string[];
}

/** A hero in a TechnoMagic Raid run: which, in which of its skins (the site's), and what its gear gave it as the run began. */
export interface TmRunHero {
  id: string;
  skin: number;
  gear: Record<string, number>;
  /** The TechnoMagic set whose effect it had (three of its pieces worn: data/tm-sets.ts TM_SET_PIECES), or null. */
  set?: TmSetId | null;
  /** Its own unique weapon's tier (its refinement, 1 to 5), or null: none worn. */
  uw?: number | null;
  /** The additional skills of the TechnoMagic gear it wore (ItemCopyDoc.tmSkill), one for each piece. */
  skills?: string[];
  /** The transcendence perks it had (data/transcend.ts ids). */
  perks?: string[];
}

/**
 * One player's part in a TechnoMagic Raid run (services/technomagic.ts): a room's fight, begun by the bot with
 * a seed and each player's heroes in the gear they wore then. The bot runs the fight itself (the site's sim),
 * and keeps here how it went and what it gave.
 */
export interface TmRunDoc {
  /** The run's id and the player's: `<run>:<userId>`. */
  _id: string;
  /** The run (one for everyone in the room). */
  run: string;
  guildId: string;
  userId: string;
  boss: string;
  seed: number;
  stage: number;
  /** Their heroes in it. */
  heroes: TmRunHero[];
  /** The sim's version it was fought with (a hash of it; a number, for a run from before). */
  version: string | number;
  startedAt: Date;
  /** The day it was begun (YYYY-MM-DD, the raid's time zone), and whether a win gives gear (one of that day's runs that do). */
  day: string;
  rewardable: boolean;
  /** When it was over, how (after so many steps), and the item ids found. */
  claimedAt?: Date;
  result?: 'won' | 'lost';
  ticks?: number;
  drops?: string[];
}

/** One of a member's gear loadouts, stored on their member document (see MemberDoc.loadouts). */
export interface LoadoutDoc {
  /** The name the member gave it. Missing or null means the default, "Loadout <number>". */
  name?: string | null;
  /**
   * The gear it holds, kept only while it isn't active: the active loadout's gear is
   * MemberDoc.equipment, and this is cleared when the loadout is switched to.
   */
  equipment?: EquipmentDoc | null;
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
   * Refinement level, 1 to REFINE.maxLevel (see constants/items/refine.ts): how much of the item's
   * strength this copy gives. New copies start at 1; copies from before refining existed are 0,
   * which counts as 1 (lib/game/items/refine.ts refineLevel).
   */
  level: number;
  /** Locked by the member (`lock`, or the site): never sold and never used up by a refine. Missing means not. */
  locked?: boolean;
  /**
   * TechnoMagic gear: the additional skill this copy came with (the sim's TM_SKILLS id, lib/game/technomagic.ts),
   * rolled as it dropped; a hero wearing it has it in the raid. Missing on any other copy.
   */
  tmSkill?: string;
  /**
   * TechnoMagic gear: the potentials this copy came with (TM_POTENTIAL_LINES of them, each a different stat:
   * lib/game/technomagic.ts), rolled as it dropped; a hero of its class wearing it has them in the raid. Missing
   * on any other copy.
   */
  tmPotentials?: TmPotential[];
  obtainedAt: Date;
}

/** A stat a TechnoMagic copy's potential raises (each one of a hero's stats in the raid: lib/game/heroes.ts HeroStat). */
export type TmPotentialId =
  | 'atk'
  | 'speed'
  | 'hp'
  | 'defense'
  | 'defPhysical'
  | 'defMagical'
  | 'block'
  | 'blockPhysical'
  | 'blockMagical'
  | 'blockDef'
  | 'blockDefPhysical'
  | 'blockDefMagical'
  | 'dodge'
  | 'tough'
  | 'toughPhysical'
  | 'toughMagical'
  | 'accuracy'
  | 'resist'
  | 'crit'
  | 'critDamage'
  | 'manaAttack'
  | 'manaRegen'
  | 'lifesteal'
  | 'critResist'
  | 'pen';

/** One of a TechnoMagic copy's potentials: the stat it raises, and by how much (a share, as a perk's strength is: 0.05 is 5% more, or 50 points). */
export interface TmPotential {
  stat: TmPotentialId;
  value: number;
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
  // Baccarat (web/games/baccarat/server.ts): every chip on the table, and what the winning ones paid back.
  | 'baccarat_bet'
  | 'baccarat_payout'
  // Roulette (web/games/roulette/server.ts): the same.
  | 'roulette_bet'
  | 'roulette_payout'
  // Poker (web/games/poker/table.ts): the chips taken to a table when sitting down, and what was
  // left when standing up (the chips won and lost to the other players are the difference).
  | 'poker_buyin'
  | 'poker_cashout'
  // The mine (commands/mines.ts): the bet, and what a cash out paid.
  | 'mines_bet'
  | 'mines_payout'
  // Pinecraft (commands/pinecraft.ts): an ore dug (points, no bet).
  | 'pinecraft_ore'
  // Minesweeper (web/games/minesweeper/room.ts): a player's share of a board cleared (points, no bet).
  | 'minesweeper_win'
  | 'event_crate'
  | 'rob_won'
  | 'rob_lost'
  // What the wheel (Wheelchair) added to or took from a robber's take. The victim never pays it.
  | 'rob_wheel'
  | 'rob_fine_paid'
  | 'rob_fine_received'
  | 'rob_tax_paid'
  | 'rob_tax_received'
  // A successful rob that slipped (Piplup): the take plus a penalty goes back to the victim.
  | 'rob_slip_paid'
  | 'rob_slip_received'
  // A critical fail on the D20 (1): what the claim would have paid, times a d3, paid into the vault.
  | 'd20_penalty'
  // The old vault breaker's reasons: no longer written, kept so older ledger entries still type-check.
  | 'vault_loot'
  | 'vault_fine'
  | 'heist_loot'
  | 'heist_fine'
  | 'split_steal'
  | 'code_guess'
  | 'code_refund'
  | 'code_prize'
  // Points paid to skip a cooldown (commands/skip.ts), one reason per thing skipped.
  | 'skip_claim'
  // The week's extra raid and its refund, back when a week had one raid: no longer written, kept for older entries.
  | 'skip_raid'
  | 'skip_refund'
  // Points a member gave to the vault of their own accord (commands/donate.ts).
  | 'vault_donation'
  // A gacha pull paid for with a komaToken instead of points (0 points, tokenDelta -1).
  | 'gacha_token'
  // An extra item a pull gave for nothing (Pot of Greed): 0 points; itemId is the item.
  | 'gacha_bonus'
  // The weekly raid (commands/raid.ts): a boost paid for, points the boss stole, the points and the
  // komaTokens (0 points, tokenDelta) for beating it, and points given back when a raid never
  // finished (the bot stopped during it).
  | 'raid_boost'
  | 'raid_stolen'
  | 'raid_reward'
  | 'raid_tokens'
  | 'raid_gems'
  // Hero essences for beating it (0 points; essenceDelta).
  | 'raid_essences'
  // komaGems spent forging a copy into a masterwork (0 points, gemDelta; itemId is the item). Masterworks
  // are gone; only old entries have it.
  | 'forge'
  | 'raid_refund'
  // A duplicate copy used up to refine another (0 points; itemId is the item).
  | 'refine'
  // Points paid for an outfit in the site's shop (services/outfits.ts; itemId is the outfit).
  | 'outfit'
  // Points paid for a TechnoMagic hero in the site's shop (services/heroes.ts; itemId is the hero).
  | 'hero'
  // komaGems spent on a raid item in the site's raid shop (0 points, gemDelta; itemId is the item).
  | 'raid_shop'
  // komaGems spent refreshing their shelf in the raid shop (0 points, gemDelta).
  | 'raid_shop_refresh'
  // komaGems and hero essences spent transcending a hero (0 points, gemDelta, essenceDelta; itemId is the hero).
  | 'transcend'
  // A one-off fix made by hand (scripts/), like swapping an item given to the wrong member.
  | 'admin_correction';

/**
 * A bet on a blackjack table that has not been settled yet. The points were taken from the member
 * when they sat down, so this document is what says "this many points are on the table": whoever
 * deletes it is the one that pays them back out (as a payout when the round ends, or as a refund
 * if it never finishes), so a bet is paid out exactly once. `leaseUntil` is pushed forward while
 * the table is being played; a bet whose lease has run out belongs to a table that died (the bot
 * restarted) and is refunded by the sweeper (see services/casino/blackjack.ts).
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

/**
 * A player's chips at a poker table (web/games/poker/table.ts). The buy-in was taken from their
 * balance when they sat down, so this document is what says "these chips are at the table":
 * whoever deletes it pays them out (standing up, or the sweeper when the table died), so they are
 * paid exactly once. `chips` is saved after every hand (never in the middle of one, so a hand cut
 * short by a restart simply never happened), and `leaseUntil` pushed forward while the table plays.
 */
export interface PokerSeatDoc {
  _id: string;
  guildId: string;
  userId: string;
  /** The table it is at (its key in this process: see PokerTable). */
  tableKey: string;
  chips: number;
  /** What they sat down with, all told (top-ups included): the ledger's buy-in. */
  boughtIn: number;
  leaseUntil: Date;
  createdAt: Date;
}

/**
 * A run in the mine that has not been settled yet. The bet was taken when the run started, so this
 * document is what says "these points are down the mine": whoever deletes it is the one that pays
 * out (a cash out, or nothing when dynamite went off), so a run is paid exactly once. `multiplier`
 * is saved after every ore, and `leaseUntil` pushed forward while the run is played; a run whose
 * lease has run out was cut short (the bot restarted) and the sweeper cashes it out at its
 * multiplier (see services/casino/mines.ts).
 */
export interface MineRunDoc {
  _id: string;
  guildId: string;
  userId: string;
  bet: number;
  multiplier: number;
  leaseUntil: Date;
  createdAt: Date;
}

/**
 * A member's Pinecraft world (see lib/game/pinecraft.ts): everything in it follows from `seed`, so
 * all that is kept is which blocks have been dug, where the miner is, and their energy (as of
 * `energyAt`; more has come back since). `_id` is "guildId:userId".
 */
export interface PinecraftWorldDoc {
  _id: string;
  guildId: string;
  userId: string;
  seed: number;
  /** Which layout of the world it was made with (PINECRAFT_WORLD.version); missing is the first. */
  version?: number;
  /** The week it was made for (pinecraftWeek's key); in a later week it starts over. */
  week?: string;
  /** The blocks dug, by index (row * size + column). */
  mined: number[];
  x: number;
  y: number;
  energy: number;
  energyAt: Date;
  /** Blocks dug since the last blast (with a Dynamite Stick); missing is 0. */
  sinceBlast?: number;
  /** Points its ores have paid, all told. */
  earned: number;
  /** Blocks dug, all told (every week's; `mined` is only this week's). Missing: counted from `mined` when next loaded. */
  dugTotal?: number;
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
  /** Hero essences given (+) or spent (-), by kind (data/transcend.ts EssenceId). */
  essenceDelta?: Partial<Record<EssenceId, number>>;
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
  /**
   * The channel the newsletter (src/newsletter) goes to: the weekly digest and patch notes. Missing
   * or null means the server gets no newsletter.
   */
  newsletterChannelId?: string | null;
  /**
   * The raid week (lib/events/raid-week.ts key) whose digest was last sent here, or the week the
   * channel was chosen in (so the first digest waits for the next reset). Missing or null: not yet.
   */
  newsletterWeek?: string | null;
  /**
   * The message members react to for their notification roles (`newsletter roles`,
   * src/newsletter/roles.ts). Missing or null: none has been posted here.
   */
  roleMessageId?: string | null;
  /**
   * The hardest raid difficulty the server has beaten (services/raid.ts): it can pick up to one level
   * past it. Missing: none since difficulties came (a server that had beaten a raid before counts as 1).
   */
  raidDifficulty?: number;
  /**
   * The roles this server pings: for events (`config set notifyRole`) and for raids (`config set
   * raidRole`), see services/roles.ts. Missing means the built-in one (NOTIFY_ROLES); null means none.
   */
  notifyRoleId?: string | null;
  raidRoleId?: string | null;
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
   * How far the vault's hourly growth (events.vault.hourlyGrowth, see growVaults in
   * services/vault.ts) has been paid up to. Missing means it hasn't started counting yet.
   */
  vaultGrownAt?: Date | null;
  /**
   * Running totals of what has gone into the vault since it was last claimed (a vault game paying
   * out, see claimVault in services/vault.ts), by where it came from, for the vault command to show:
   * losses and fines (everything through `addVaultLoss`), and the hourly growth. A claim sets them
   * back to 0. Donations are counted from the ledger instead ('vault_donation', since
   * vaultClaimedAt). Missing means 0.
   */
  vaultLosses?: number;
  vaultGrown?: number;
  /** When a vault game last paid out of the vault. Missing means it never has. */
  vaultClaimedAt?: Date;
  /** What was left in the vault right after that payout, carried into the current one. Missing means 0. */
  vaultCarriedOver?: number;
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
 * One document per raid: `_id` is "<server id>:<week key>:<start time>" (services/raid.ts newRaidId;
 * raids from when there was one a week are "<server id>:<week key>", and their extra raid's has
 * ":extra" after it). While the raid is being played (`preparing` or `fighting`) it also records every point that moved because of it, so
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
  /** What `startedBy` paid for the week's extra raid, back when a week had one raid and `skip raid` bought another. */
  skipPaid?: number;
  /** Filled in when it ends: damage dealt by user id, and whose hit beat the boss. */
  damage?: Record<string, number>;
  /** Filled in when it ends: everything each player did, by user id (for `raid stats`). Raids from before it was saved only have `damage`. */
  stats?: Record<string, RaidStats>;
  lastHit?: string | null;
  rounds?: number;
  /** Each raider's gear as the fight started, by user id (web/models/gear.ts's wornGear), for the site's end screen. Raids from before it was saved don't have it. */
  gear?: Record<string, unknown>;
  /** Its difficulty level, set as the fight starts. Raids from before there were levels don't have it: they were level 1. */
  difficulty?: number;
  /** Won with the admin's test tools (`raid test kill`): it paid nothing and unlocks nothing. */
  tested?: true;
  /** The raid items each raider found for winning it, as item ids by user id (missing when none dropped). */
  drops?: Record<string, string[]>;
  /** Names that win's items for the site (its loot screen shows once per key), set with `drops`. */
  lootKey?: string;
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

/**
 * A member's minesweeper record in a server (web/games/minesweeper/room.ts): the mines they have
 * opened, the boards they helped clear, and the times a wrong flag of theirs sent someone else's
 * chord into a mine. `_id` is "guildId:userId".
 */
export interface MinesweeperStatsDoc {
  _id: string;
  guildId: string;
  userId: string;
  bombs?: number;
  wins?: number;
  trolls?: number;
}

/**
 * A minesweeper board cleared fast enough for its level's leaderboard in a server (see
 * services/minesweeper.ts): how long it took, when, and everyone who opened a tile of it.
 */
export interface MinesweeperClearDoc {
  guildId: string;
  level: 'easy' | 'medium' | 'hard';
  ms: number;
  at: Date;
  players: { id: string; name: string; tiles: number }[];
}
