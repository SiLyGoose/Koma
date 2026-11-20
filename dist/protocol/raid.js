/*
 * What the raid's page (the Koma-UI repo's src/raid) and the bot say to each other over the raid's
 * WebSocket. Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * The raid is the server's raid going on, the very one on its Discord message (commands/raid.ts): a
 * player on the page is in the same lobby and fight as the ones pressing buttons in Discord.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    starts a raid: its lobby goes up in the server's channel, with
 *                          them as the host, at the difficulty `level` they picked before it (left out: 1;
 *                          past what the server has unlocked: the hardest it has)
 *                 join     joins the lobby; `leave` leaves it
 *                 begin    the host starts the fight (nothing else does: the lobby has no countdown)
 *                 disband  the host disbands the raid before the fight, to start again
 *                 difficulty  the host picks the raid's difficulty `level` (up to the lobby's `maxDifficulty`)
 *                 act      their action this turn (`skill`: a ward in place of a Support, for a class that can; `target`: who a heal or ward is for, left out to let the
 *                          bot choose)
 *   bot -> page   raid     the raid as it is now: whenever anything about it changes
 *                 answer   how a start, join, leave, begin, disband, difficulty or act went (`code` is 'ok' when it went)
 *                 error    and the bot closes the connection
 *
 * Text from the raid (the boss's next move, the log) is Discord markdown, as the raid message shows
 * it: **bold**, *italics*, <@id> mentions (named in `names`), and <:name:id> custom emojis.
 */
/** The raid bosses (the bot's constants/raid.ts: adding one there reshuffles which one each future week gets). */
export const RAID_BOSS_IDS = ['wyrm', 'reaper', 'plague'];
/** The raid classes (what each does in a fight is the bot's constants/raid.ts RAID_CLASSES). */
export const RAID_CLASS_IDS = ['knight', 'warrior', 'priest', 'mechanic', 'wizard', 'assassin', 'archer'];
//# sourceMappingURL=raid.js.map