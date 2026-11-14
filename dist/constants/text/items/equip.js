export const equipText = {
    askWhich: (p) => `Which item? Use \`${p}equip <item name>\`. \`${p}inventory\` shows what you own.`,
    ambiguous: (names) => `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
    notOwned: (p, name) => `You don't own **${name}** yet. Pull for it with \`${p}gacha\`.`,
    /** TechnoMagic gear: only the TechnoMagic Raid's heroes wear it. */
    heroOnly: (name) => `**${name}** is TechnoMagic gear: only heroes can wear it. Put it on one on the site's Heroes page.`,
    noSuchItem: (p, query) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
    alreadyEquipped: (name, slot) => `You already have **${name}** equipped as your ${slot}.`,
    title: (name) => name,
    done: (user, slot) => `${user} equipped it as their ${slot}.`,
    doneReplacing: (user, slot, replaced) => `${user} equipped it as their ${slot}. (Replaced **${replaced}**.)`,
    effectsField: (level) => `Effects (★${level})`,
    noEffects: 'None',
    /** Extra field when the item is exclusive to other members. `owners` is mentions. */
    exclusiveField: 'Exclusive',
    /** `share` is how much of its effects the wearer gets, like "50%"; the effects above are already at that. */
    exclusive: (owners, share) => `Made for ${owners}, so it only works at ${share} for you.`,
    footer: (p) => `See everything you have on with ${p}gear`,
};
//# sourceMappingURL=equip.js.map