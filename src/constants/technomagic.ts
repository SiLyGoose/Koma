/*
 * The TechnoMagic Raid, played together on the games' site (web/games/technomagic/ for the rooms, Koma-UI's
 * src/technomagic/ for the fight, lib/game/technomagic.ts for its rewards). A server has one room: whoever
 * opens it joins, picks heroes into its lineup, and the host starts the fight, which everyone in the room
 * plays at once (each their own heroes). What a win gives, and how many runs a day give it, are settings
 * (`hero.*`).
 */

/**
 * A room's lineup: `slots` heroes all told (`soloSlots` with one player in it, who then fights an easier
 * boss), the host bringing up to `hostHeroes` of them and everyone else up to `guestHeroes` (alone, as many
 * as the slots: `mainTeam` of them in the Main Team, whose skills are theirs to use, and the rest in the Sub Team,
 * on Auto for the whole fight). As many `players` as can each bring a hero. One whose page goes away (a reload,
 * a phone switching apps) keeps their place and picks for `awayMs`, to come back to.
 */
export const TM_ROOM = {
  slots: 8,
  soloSlots: 7,
  mainTeam: 4,
  hostHeroes: 4,
  guestHeroes: 3,
  players: 4,
  awayMs: 60_000,
} as const;

/**
 * The fight's clock on the bot: it steps the fight every `turnMs` (as many steps as are due) and tells the
 * pages what everyone pressed and up to which step they may go. A room's lineup goes up in the server's
 * channel when it is opened, at most once every `announceMs`.
 */
export const TM_FIGHT = {
  turnMs: 100,
  announceMs: 10 * 60_000,
} as const;

/**
 * How many TechnoMagic items a win gives each player whose run gives gear, by the stage it was fought at (1 to 8:
 * the first number is stage 1's). Each is one of the boss's set's pieces, rolled apart.
 */
export const TM_DROP_COUNTS: readonly number[] = [3, 3, 3, 4, 4, 4, 5, 5];

/** How many items a win at `stage` gives (past the last stage, as many as the last). */
export const tmDropCount = (stage: number): number => TM_DROP_COUNTS[Math.min(TM_DROP_COUNTS.length, Math.max(1, Math.floor(stage))) - 1] as number;

/** Playing it from its web page (the Koma-UI repo): `path` is where its web socket listens. */
export const TM_WEB = {
  path: '/technomagic',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;

/**
 * The Dragon Raid (King's Raid's dragons: Koma-UI's src/technomagic/sim/bosses/), played in rooms as the TechnoMagic Raid is
 * (TM_ROOM, TM_FIGHT), one room a dragon in each server, on a page of its own: `path` is where its web socket listens.
 */
export const DRAGON_WEB = {
  path: '/dragon',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;

/**
 * The hero gear a Dragon Raid win gives each player whose run pays, by the stage it was fought at (1 to 10: the first is stage
 * 1's): so many raid items (ItemDef.raidDrop, never TechnoMagic gear) of each star tier, each picked at random from its tier.
 */
export const DRAGON_DROPS: readonly Readonly<Partial<Record<3 | 4, number>>>[] = [{ 3: 1 }, { 3: 1 }, { 3: 2 }, { 3: 2 }, { 4: 1, 3: 2 }, { 4: 1, 3: 2 }, { 4: 1, 3: 3 }, { 4: 2, 3: 3 }, { 4: 2, 3: 4 }, { 4: 3, 3: 4 }];

/** What a Dragon Raid win at `stage` drops (past the last stage, as much as the last). */
export const dragonDrops = (stage: number): Readonly<Partial<Record<3 | 4, number>>> =>
  DRAGON_DROPS[Math.min(DRAGON_DROPS.length, Math.max(1, Math.floor(stage))) - 1] as Readonly<Partial<Record<3 | 4, number>>>;
