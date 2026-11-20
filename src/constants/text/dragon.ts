/* What the bot says of the Dragon Raid in Discord (commands/dragon.ts). */

export const dragonText = {
  title: '🐉 Dragon Raid',
  /** What `k!dragon` says, above a button to each dragon's room on the site. */
  intro:
    "King's Raid's dragons wait in their lairs: Temeraire of fire, Scalaxia of ice, Zyrrkinoth of venom and Armarta, the Black Dragon. Bring your heroes and fight one together on the Koma site, " +
    'as in the TechnoMagic Raid: the host brings up to 4 heroes, everyone else up to 3, 9 in all (alone, up to 8 against an easier dragon). Break a dragon\'s CC Gauge with your heroes\' stuns to knock it down before its breath. ' +
    'Every win gives pieces of the dragon\'s own gear set (four on a hero give its set effect), runes, points and two kinds of hero essences (the dragon\'s), more at the higher stages, and komaGems the first time you beat a stage. There is no daily limit.',
  /** The embed once someone has opened a room against `dragon`. */
  opened: (host: string, dragon: string) => `**${host}** has opened a room against **${dragon}**. Join in!`,
  openedTitle: (dragon: string) => `🐉 Dragon Raid: ${dragon}`,
  footer: 'Log in with Discord on the site.',
  /** The button to a dragon's room. */
  joinButton: (dragon: string) => dragon,
  joinOne: 'Join the raid',
  /** Without the web site, the raid can't be played. */
  off: 'The Dragon Raid is played in the browser, and the web site is not set up on this bot yet.',
};
