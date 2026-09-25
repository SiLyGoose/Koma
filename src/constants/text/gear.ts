export const gearText = {
  title: (name: string) => `${name}'s gear`,
  unknownItem: (id: string) => `${id} (no longer exists)`,
  emptySelf: (p: string) => `Nothing equipped. Use \`${p}equip <item name>\`.`,
  emptyOther: 'Nothing equipped.',
  /** The first line of a filled slot; the item's effects follow on their own lines. */
  item: (name: string, stars: string) => `**${name}** ${stars}`,
  totalsField: 'Overall Effects',
  /** Shown above the effects when the item is equipped by someone it is not for. `owners` is mentions, `share` is how much of its effects this member gets, like "50%"; the lines under it are already at that. */
  exclusive: (owners: string, share: string) => `Made for ${owners}, so it only works at ${share} for this member.`,

  // `gear stats`: what a member fights a raid with. `gear` is the mark on a line their gear changed.
  statsTitle: (name: string) => `⚔️ ${name}'s raid stats`,
  statsHp: (hp: number) => `❤️ **HP**: ${hp}`,
  /** `damage` and `crit` are already formatted (a number, or a range like "60–100"). */
  statsAttack: (damage: string, critChance: string, crit: string) => `⚔️ **Attack**: ${damage} damage (${critChance} chance of a ${crit} critical hit)`,
  statsHeal: (amount: number, revive: number) => `💚 **Heal**: ${amount} HP, or brings back a knocked-out ally with ${revive} HP`,
  statsHealSplash: (share: string, amount: number, gear: string) => `↳ and mends a second ally for ${share} of it (${amount} HP) ${gear}`,
  statsGuard: (taken: string, normal: string | null, gear: string) =>
    `🛡️ **Guard**: you take ${taken} of a hit${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsRally: (multiplier: string, turns: number, normal: string | null, gear: string) =>
    `✨ **Rally**: attacks do ${multiplier} damage for ${turns} turns${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsGearMark: '🎒',
  statsNoGear: (p: string) => `No raid gear equipped, so these are the base numbers. Raid gear can be pulled with \`${p}gacha\`.`,
  statsFooter: '🎒 = changed by gear. Gear counts as it is when a raid starts; boosts and rallies raise Attack and Heal further.',
};
