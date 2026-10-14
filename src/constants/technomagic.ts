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
 * as the slots). As many `players` as can each bring a hero.
 */
export const TM_ROOM = {
  slots: 9,
  soloSlots: 8,
  hostHeroes: 4,
  guestHeroes: 2,
  players: 4,
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

/** Playing it from its web page (the Koma-UI repo): `path` is where its web socket listens. */
export const TM_WEB = {
  path: '/technomagic',
  helloMs: 10_000,
  messagesPerSecond: 40,
} as const;
