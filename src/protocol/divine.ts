/*
 * King's Raid's Divine Punishment Raid on the site (the bot's /api/divine; its fights are the TechnoMagic Raid's rooms, on the
 * /divine socket: protocol/technomagic.ts). Two groups, Apocalypsion and Solenis, each with boss dungeons (side bosses, then its
 * final boss, at an Infinite level unlocked for 7 days) and a Karma dungeon (one run an unlock). Unlocks cost zeiucoins at King's
 * Raid's Stamina numbers; the shop sells Runes of Void; the fragments craft their artifacts; Unique Gear Tickets give a 0★ unique
 * weapon or treasure; Runes of Blasphemy are crafted, broken, kept, socketed and taken out here. The site keeps a copy (its `yarn sync`).
 *
 *   GET  /api/divine?guild=…                                   DivineView
 *   GET  /api/divine/rewards?guild=…&group=…&level=…           its Reward List at a level (1 to five past its best; none said: the opening's,
 *                                                              else the one after its best): DivineRewardsView
 *   POST /api/divine/open {guild, group, type, level?}         unlocks the group's boss dungeons at `level` (1 to the one after its best)
 *                                                              or a Karma run: DivineView
 *   POST /api/divine/reset {guild, group}                      closes its boss opening (KR's ResetPunishmentRaid; nothing paid back): DivineView
 *   POST /api/divine/void {guild, socket, count?}              buys Runes of Void: DivineView
 *   POST /api/divine/artifact {guild, fragment}                crafts the fragment's artifact (a 0★ copy): DivineView & { crafted: string } (the copy's id)
 *   POST /api/divine/ticket {guild, of, hero, skill?}          uses a Unique Gear Ticket: a 0★ copy of that hero's unique weapon (`of` 'uw') or its
 *                                                              `skill`th unique treasure ('ut'): DivineView & { given: string } (its name)
 *   POST /api/divine/blasphemy/craft {guild, rune, ingredients}   crafts a Rune of Blasphemy (`rune`: KR_BLASPHEMY's id) from `ingredients` (Legendary or
 *                                                              Velkazar rune ids → counts, BLASPHEMY_INGREDIENTS in all), its Legendary rune, Rune
 *                                                              Fragments, Blood and a Rune of Void: DivineView & { crafted: BlasphemyView }
 *   POST /api/divine/blasphemy/break {guild, id} or {guild, copy, socket}   breaks one (stored, or where it is socketed) for Rune Fragments:
 *                                                              DivineView & { gained: number } (Rune Fragments)
 *   POST /api/divine/blasphemy/extend {guild}                  more storage: DivineView
 *   POST /api/divine/blasphemy/socket {guild, copy, socket, id}   puts a stored one in a copy's socket (the one in it, if any, kept: a rune
 *                                                              to their runes, a Rune of Blasphemy to storage, for its keep price): DivineView
 *   POST /api/divine/blasphemy/unsocket {guild, copy, socket}  takes one out of a socket into storage, for keepPrice: DivineView
 */

export type DivineGroupId = 'apocalypsion' | 'solenis';
export type DpFragment = 'doomstone' | 'tear' | 'fuel' | 'engraving';
export type ShardTier = '1' | '2' | '3' | '4' | '5';
export type VoidSocket = 'doh' | 'laz' | 'geb' | 'oth' | 'ans';

/** A group's 7-day window and the opening in it (King's Raid's OpenPunishmentRaidInfo); times as ISO strings. */
export interface DivineOpeningView {
  /** Its boss dungeons open now (unlocked, the final boss not beaten since, the window not over). */
  open: boolean;
  /** The Infinite level unlocked (the fights' stage). */
  level: number;
  since: string;
  expires: string;
  /** The final boss's clears in the window: each makes the next unlock dearer. */
  clears: number;
  /** The side bosses cleared in this opening (each once an opening; at most 2 of Apocalypsion's dragons). */
  cleared: string[];
}

/** A dungeon of a group, and why it can't be entered now (null: it can). */
export interface DivineDungeonView {
  id: string;
  name: string;
  kind: 'side' | 'final' | 'karma';
  /** Its time limit, seconds. */
  time: number;
  refusal: 'not_open' | 'cleared' | 'not_allowed' | null;
}

export interface DivineGroupView {
  id: DivineGroupId;
  name: string;
  /** Its window (null: none running: the next unlock starts one, at 0 clears). */
  window: DivineOpeningView | null;
  /** What unlocking its boss dungeons costs now (zeiucoins), and the highest level it can be unlocked at (the one after its best). */
  price: number;
  highest: number;
  /** The highest Infinite level it has cleared (its final boss beaten at). */
  best: number;
  /** Its Karma dungeon: a run unlocked and not run yet, and an unlock's price. */
  karma: { open: boolean; price: number };
  dungeons: DivineDungeonView[];
  /** Blood of Apostle of the group. */
  blood: number;
  /** Shards of the group by tier (Empty Tier 1 is free and unlimited: always 0 here). */
  empty: Record<ShardTier, number>;
  full: Record<ShardTier, number>;
}

/** A Rune of Blasphemy of the member's: its id, which, its socket kind, its rolls, and where it is (null: in storage). */
export interface BlasphemyView {
  id: string;
  rune: string;
  name: string;
  group: DivineGroupId;
  socket: VoidSocket;
  color: string;
  icon: string;
  main: { stat: string; value: number; line: string };
  /** Its three lines (Warrior/Knight, Archer/Assassin/Mechanic, Wizard/Priest) with their rolls, in words. */
  lines: { skill: string; value: number; text: string }[];
  socketed: { copy: string; socket: number } | null;
  at: string;
}

export interface DivineView {
  balance: number;
  /** The highest Infinite level there is. */
  levels: number;
  groups: DivineGroupView[];
  fragments: Record<DpFragment, number>;
  voidRunes: Record<VoidSocket, number>;
  uniqueTickets: number;
  runeFragments: number;
  /** Their Legendary and Velkazar runes, by id (what a Rune of Blasphemy's gauge takes). */
  ingredientRunes: Record<string, number>;
  shop: { voidPrice: number };
  /** The artifacts the fragments craft: which fragment, the item, and what one takes. */
  artifacts: { fragment: DpFragment; itemId: string; name: string; fragments: number; points: number }[];
  blasphemy: {
    owned: BlasphemyView[];
    /** Storage: how many it holds, how many are in it (not socketed), the most it can be extended to, and the next extension (null: at the most). */
    slots: number;
    stored: number;
    most: number;
    extend: { slots: number; price: number } | null;
    keepPrice: number;
    breakFragments: number;
    /** The next craft's price (by how many they own), beside a Legendary rune of its main stat and a Rune of Void of its socket. */
    craft: { fragments: number; blood: number; ingredients: number };
    recipes: { id: string; name: string; group: DivineGroupId; socket: VoidSocket; legend: string }[];
  };
}

/**
 * One thing a reward gives, as a win pays it: what (`key`: 'blood.<group>' Blood of Apostle, a fragment 'doomstone', 'tear', 'fuel'
 * or 'engraving', 'legendary' Mysterious Rune: Legendary, 'ticket' Unique Gear Ticket, 'empty.<tier>' Empty Shards) and how many.
 */
export interface DivineRewardItem {
  key: string;
  count: number;
  /** A chance in thousandths that one is given (King's Raid's IsRatio: the Unique Gear Ticket's), not a count (`count` is then 1). */
  ratio?: number;
}

/** A dungeon's reward at a level on the Reward List: its id, its name, and what its win pays. */
export interface DivineRewardDungeon {
  id: string;
  name: string;
  items: DivineRewardItem[];
}

/**
 * King's Raid's Reward List (PunishmentRaidRewardInfoPopup) of a group at an Infinite level: what each of its boss dungeons pays,
 * read from the rows a win pays, so the two never differ. A side boss's card is its Sub row, which its win pays; the final boss's
 * reward for each set of side bosses cleared before it is its Active row. Apocalypsion's reward with a dragon cleared is her reward
 * with none less that dragon's Sub row ("Whenever you clear each Dragon dungeon, Apocalypsion's dynamic rewards are reduced"); Solenis'
 * grows with each mid-boss cleared.
 */
export interface DivineRewardsView {
  group: DivineGroupId;
  level: number;
  /** The highest level the list shows: five past the group's best (King's Raid's ClearLevel + 5), at most the levels its rewards are tabled for. */
  most: number;
  /** The final boss: its Clear Reward (its win with no side boss cleared before it) as `items`. */
  final: DivineRewardDungeon & {
    /** Its win by the side bosses cleared before it in the opening, each set its table has (none; one; for Apocalypsion, two dragons). */
    byCleared: { cleared: string[]; items: DivineRewardItem[] }[];
  };
  /** The side bosses (Apocalypsion's dragons, Solenis' mid-bosses), in their order: each one's Sub reward at the level. */
  sides: DivineRewardDungeon[];
}

/** Why something asked of /api/divine wasn't done (nothing was spent). */
export type DivineError =
  | 'not_found'
  | 'not_open'
  | 'already_open'
  | 'bad_level'
  | 'too_poor'
  | 'no_fragments'
  | 'no_blood'
  | 'no_void'
  | 'no_rune'
  | 'bad_material'
  | 'storage_full'
  | 'storage_maxed'
  | 'socketed'
  | 'no_socket'
  | 'wrong_part'
  | 'no_tickets'
  | 'bad_pick'
  | 'busy';

export type DivineArtifactCrafted = DivineView & { crafted: string };
export type DivineTicketUsed = DivineView & { given: string };
export type BlasphemyCrafted = DivineView & { crafted: BlasphemyView };
/** What breaking one gave: `gained` Rune Fragments. */
export type BlasphemyBroken = DivineView & { gained: number };
