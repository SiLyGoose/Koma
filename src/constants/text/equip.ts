export const equipText = {
  askWhich: (p: string) => `Which item? Use \`${p}equip <item name>\`. \`${p}inventory\` shows what you own.`,
  ambiguous: (names: string[]) =>
    `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
  notOwned: (p: string, name: string) => `You don't own **${name}** yet. Pull for it with \`${p}gacha\`.`,
  noSuchItem: (p: string, query: string) =>
    `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
  alreadyEquipped: (name: string, slot: string) => `You already have **${name}** equipped as your ${slot}.`,
  title: (stars: string, name: string) => `${stars}  ${name}`,
  done: (user: string, slot: string) => `${user} equipped it as their ${slot}.`,
  doneReplacing: (user: string, slot: string, replaced: string) =>
    `${user} equipped it as their ${slot}. (Replaced **${replaced}**.)`,
  effectsField: (level: number) => `Effects (R${level})`,
  noEffects: 'None',
  /** Extra field when the item is exclusive to other members. `owners` is mentions. */
  exclusiveField: 'Exclusive',
  /** `share` is how much of its effects the wearer gets, like "50%"; the effects above are already at that. */
  exclusive: (owners: string, share: string) => `Made for ${owners}, so it only works at ${share} for you.`,
  footer: (p: string) => `See everything you have on with ${p}gear`,
};
