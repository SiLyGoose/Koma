export const giveText = {
  adminOnly: 'Only the bot admin can use this command.',
  usage: (p: string, max: string) =>
    `Use \`${p}give <item id> [amount]\` to give yourself an item (amount 1 to ${max}). This is for testing.`,
  badAmount: (max: string) => `The amount must be a whole number from 1 to ${max}.`,
  /** `ids` is a comma-separated list of every item id in the catalog. */
  unknownItem: (id: string, ids: string) => `There is no item with the id "${id}". The ids are: ${ids}`,
  /** `stars` is the star string; `given` is how many copies were added, `total` how many they own now. */
  done: (stars: string, name: string, id: string, given: string, total: string) =>
    `Gave you ${stars} **${name}** (\`${id}\`) ×${given}. You now own ${total}.`,
};
