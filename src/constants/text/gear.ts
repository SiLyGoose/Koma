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
};
