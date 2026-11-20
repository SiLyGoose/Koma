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
export {};
//# sourceMappingURL=divine.js.map