import { RAID_EMOJI as E } from '../../raid.js';
export const gearText = {
    title: (name) => `${name}'s gear`,
    unknownItem: (id) => `${id} (no longer exists)`,
    emptySelf: (p) => `Nothing equipped. Use \`${p}equip <item name>\`.`,
    emptyOther: 'Nothing equipped.',
    /** A slot's heading: its name and its emoji, followed by a padlock when the copy in it is `locked`. */
    slotName: (label, emoji, locked = false) => `${label} ${emoji}${locked ? ' 🔒' : ''}`,
    /** The first line of a filled slot; the item's effects follow on their own lines. */
    /** `level` is the worn copy's refinement, shown as R1 to R5. */
    item: (name, level) => `**${name}** · ★${level}`,
    totalsField: 'Overall Effects',
    /** Shown above the effects when the item is equipped by someone it is not for. `owners` is mentions, `share` is how much of its effects this member gets, like "50%"; the lines under it are already at that. */
    exclusive: (owners, share) => `Made for ${owners}, so it only works at ${share} for this member.`,
    // `gear stats`: what a member fights a raid with. `gear` is the mark on a line their gear changed.
    // (Embed titles can't show custom emojis, so the title keeps a plain one.)
    statsTitle: (name) => `⚔️ ${name}'s raid stats`,
    /** `normal` is what it would be without gear (null when gear doesn't change it). */
    statsHp: (hp, normal, gear) => `❤️ **HP**: ${hp}${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
    /** `damage` and `crit` are already formatted (a number, or a range like "60–100"). */
    statsAttack: (damage, normal, gear) => `${E.attack} **Attack**: ${damage} damage${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
    statsMaxHpDamage: (share, gear) => `↳ plus ${share} of the boss's max HP per hit ${gear}`,
    /** `changed` is the gear mark when gear changes the chance or the damage, '' when it doesn't. */
    statsCrit: (critChance, crit, changed) => `${E.crit} **Crit chance**: ${critChance}, for ${crit} damage${changed ? ` ${changed}` : ''}`,
    statsHeal: (amount, revive, changed) => `${E.heal} **Heal**: ${amount} HP, or brings back a knocked-out ally with ${revive} HP${changed ? ` ${changed}` : ''}`,
    statsHealSplash: (share, amount, gear) => `↳ and mends a second ally for ${share} of it (${amount} HP) ${gear}`,
    statsGuard: (taken, normal, gear) => `${E.guard} **Guard**: you take ${taken} of a hit${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
    /** The cut the wearer's Guard gives the rest of the party (only the strongest guard's counts). */
    statsGuardCut: (cut, normal, gear) => `↳ and the party takes ${cut} less from attacks that hit several raiders${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
    statsRally: (multiplier, turns, normal, gear) => `✨ **Rally**: attacks do ${multiplier} damage for ${turns} turns${normal === null ? '' : ` (normally ${normal}) ${gear}`}`,
    statsHealCut: (share, gear) => `🩸 **Heal cut**: bosses heal ${share} less while you're standing ${gear}`,
    /** `extra` is how many more Blight stacks the Support clears off each ally (0 for none). */
    statsBlightPurge: (extra, gear) => `🦠 **Blight purge**: your Support clears Blight from a second ally too${extra > 0 ? `, and ${extra} more ${extra === 1 ? 'stack' : 'stacks'} off each` : ''} ${gear}`,
    statsGearMark: '🎒',
    statsNoGear: (p) => `No raid gear equipped, so these are the base numbers. Raid gear can be pulled with \`${p}gacha\`.`,
    statsFooter: '🎒 = changed by gear. Gear counts as it is when a raid starts; rallies raise Attack further.',
};
//# sourceMappingURL=gear.js.map