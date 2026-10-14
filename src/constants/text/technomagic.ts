/* What the bot says of the TechnoMagic Raid in Discord (commands/technomagic.ts). */

export const technomagicText = {
  title: '🐲 TechnoMagic Raid: Galgoria',
  /** What `k!technomagic` says, above the button to the site. */
  intro:
    'Galgoria, the three-headed chimera, waits in the swamp. Bring your heroes (buy them in the site\'s shop, gear them on the Heroes page) and fight it together on the Koma site, ' +
    'as in King\'s Raid: the host brings up to 4 heroes, everyone else up to 2, 9 in all (alone, up to 8 against an easier boss). Heroes that fall stay down. ' +
    "Each of your first runs of the day gives a piece of Galgoria's Perseverance set for a win: four pieces on a hero (both weapons, both armors) give its set effect.",
  /** The line under it once someone has opened a room. */
  opened: (host: string) => `**${host}** has opened a room. Join in!`,
  footer: 'Log in with Discord on the site.',
  joinButton: 'Join the raid',
  /** Without the web site, the raid can't be played. */
  off: 'The TechnoMagic Raid is played in the browser, and the web site is not set up on this bot yet.',
};
