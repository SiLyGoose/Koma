import { RAID_EMOJI as E } from '../../raid.js';
import { boldGems } from '../currency.js';

export const gearText = {
  title: (name: string) => `${name}'s gear`,
  unknownItem: (id: string) => `${id} (no longer exists)`,
  emptySelf: (p: string) => `Nothing equipped. Use \`${p}equip <item name>\`.`,
  emptyOther: 'Nothing equipped.',
  /** A slot's heading: its name and its emoji, followed by a padlock when the copy in it is `locked`. */
  slotName: (label: string, emoji: string, locked = false) => `${label} ${emoji}${locked ? ' 🔒' : ''}`,
  /** The first line of a filled slot; the item's effects follow on their own lines. */
  /** `level` is the worn copy's refinement, shown as R1 to R5. */
  item: (name: string, stars: string, level: number, masterwork = false) => `**${name}** ${stars} · R${level}${masterwork ? ' · ✨ Masterwork' : ''}`,
  totalsField: 'Overall Effects',
  /** Shown above the effects when the item is equipped by someone it is not for. `owners` is mentions, `share` is how much of its effects this member gets, like "50%"; the lines under it are already at that. */
  exclusive: (owners: string, share: string) => `Made for ${owners}, so it only works at ${share} for this member.`,
  /** The same on an R5 copy that isn't a masterwork yet, with what forging one costs (`forge`); not shown below R5. */
  bonusDormant: (text: string, gems: number) => `🔒 Masterwork (\`forge\` for ${boldGems(gems)}): ${text}`,

  // `gear stats`: what a member fights a raid with. `gear` is the mark on a line their gear changed.
  // (Embed titles can't show custom emojis, so the title keeps a plain one.)
  statsTitle: (name: string) => `⚔️ ${name}'s raid stats`,
  /** `normal` is what it would be without gear (null when gear doesn't change it). */
  statsHp: (hp: number, normal: number | null, gear: string) => `❤️ **HP**: ${hp}${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  /** `damage` and `crit` are already formatted (a number, or a range like "60–100"). */
  statsAttack: (damage: string, normal: string | null, gear: string) =>
    `${E.attack} **Attack**: ${damage} damage${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsMaxHpDamage: (share: string, gear: string) => `↳ plus ${share} of the boss's max HP per hit ${gear}`,
  /** `changed` is the gear mark when gear changes the chance or the damage, '' when it doesn't. */
  statsCrit: (critChance: string, crit: string, changed: string) => `${E.crit} **Crit chance**: ${critChance}, for ${crit} damage${changed ? ` ${changed}` : ''}`,
  statsHeal: (amount: number, revive: number, changed: string) =>
    `${E.heal} **Heal**: ${amount} HP, or brings back a knocked-out ally with ${revive} HP${changed ? ` ${changed}` : ''}`,
  statsHealSplash: (share: string, amount: number, gear: string) => `↳ and mends a second ally for ${share} of it (${amount} HP) ${gear}`,
  statsGuard: (taken: string, normal: string | null, gear: string) =>
    `${E.guard} **Guard**: you take ${taken} of a hit${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsRally: (multiplier: string, turns: number, normal: string | null, gear: string) =>
    `✨ **Rally**: attacks do ${multiplier} damage for ${turns} turns${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
  statsHealCut: (share: string, gear: string) => `🩸 **Heal cut**: bosses heal ${share} less while you're standing ${gear}`,
  statsGearMark: '🎒',
  statsNoGear: (p: string) => `No raid gear equipped, so these are the base numbers. Raid gear can be pulled with \`${p}gacha\`.`,
  statsFooter: '🎒 = changed by gear. Gear counts as it is when a raid starts; rallies raise Attack further.',
};
