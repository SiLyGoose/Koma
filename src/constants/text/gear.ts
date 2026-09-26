import { RAID_EMOJI as E } from '../raid.js';

export const gearText = {
  title: (name: string) => `${name}'s gear`,
  unknownItem: (id: string) => `${id} (no longer exists)`,
  emptySelf: (p: string) => `Nothing equipped. Use \`${p}equip <item name>\`.`,
  emptyOther: 'Nothing equipped.',
  /** A slot's heading: its name and its emoji. */
  slotName: (label: string, emoji: string) => `${label} ${emoji}`,
  /** The first line of a filled slot; the item's effects follow on their own lines. */
  /** `level` is the worn copy's refinement, shown as R1 to R5. */
  item: (name: string, stars: string, level: number) => `**${name}** ${stars} · R${level}`,
  totalsField: 'Overall Effects',
  /** Shown above the effects when the item is equipped by someone it is not for. `owners` is mentions, `share` is how much of its effects this member gets, like "50%"; the lines under it are already at that. */
  exclusive: (owners: string, share: string) => `Made for ${owners}, so it only works at ${share} for this member.`,

  // `gear stats`: what a member fights a raid with. `gear` is the mark on a line their gear changed.
  // (Embed titles can't show custom emojis, so the title keeps a plain one.)
  statsTitle: (name: string) => `⚔️ ${name}'s raid stats`,
  statsHp: (hp: number) => `❤️ **HP**: ${hp}`,
  /** `damage` and `crit` are already formatted (a number, or a range like "60–100"). */
  statsAttack: (damage: string) => `${E.attack} **Attack**: ${damage} damage`,
  statsMaxHpDamage: (share: string, gear: string) => `↳ plus ${share} of the boss's max HP per hit ${gear}`,
  statsCrit: (critChance: string, crit: string) => `${E.crit} **Crit chance**: ${critChance}, for ${crit} damage`,
  statsHeal: (amount: number, revive: number) => `${E.heal} **Heal**: ${amount} HP, or brings back a knocked-out ally with ${revive} HP`,
  statsHealSplash: (share: string, amount: number, gear: string) => `↳ and mends a second ally for ${share} of it (${amount} HP) ${gear}`,
  statsGuard: (taken: string, normal: string | null, gear: string) =>
    `${E.guard} **Guard**: you take ${taken} of a hit${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsRally: (multiplier: string, turns: number, normal: string | null, gear: string) =>
    `✨ **Rally**: attacks do ${multiplier} damage for ${turns} turns${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsHealCut: (share: string, gear: string) => `🩸 **Heal cut**: bosses heal ${share} less while you're standing ${gear}`,
  statsGearMark: '🎒',
  statsNoGear: (p: string) => `No raid gear equipped, so these are the base numbers. Raid gear can be pulled with \`${p}gacha\`.`,
  statsFooter: '🎒 = changed by gear. Gear counts as it is when a raid starts; boosts and rallies raise Attack and Heal further.',
};
