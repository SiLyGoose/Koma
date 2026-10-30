/* What the bot says of the TechnoMagic Raid in Discord (commands/technomagic.ts). */

export const technomagicText = {
  title: '🐲 TechnoMagic Raid: Galgoria and Siegfried',
  /** What `k!technomagic` says, above the button to the site. */
  intro:
    'Galgoria, the three-headed chimera, waits in the swamp, and Siegfried, the corrupted King of Dawn, in his sanctuary. Bring your heroes (buy them in the site\'s shop, gear them on the Heroes page) and fight them together on the Koma site, ' +
    'as in King\'s Raid: the host brings up to 4 heroes, everyone else up to 3, 8 in all (alone, up to 7 against an easier boss). Heroes that fall stay down. ' +
    "Every win gives pieces of its boss's set (Galgoria's Perseverance, Siegfried's Hope; more at the higher stages), runes and points, and komaGems the first time you clear a stage: four pieces on a hero (of its Armor, Mantle, Accessories and Orb) give its set effect. There is no daily limit.",
  /** The line under it once someone has opened a room. */
  opened: (host: string) => `**${host}** has opened a room. Join in!`,
  footer: 'Log in with Discord on the site.',
  joinButton: 'Join the raid',
  /** Without the web site, the raid can't be played. */
  off: 'The TechnoMagic Raid is played in the browser, and the web site is not set up on this bot yet.',
};
