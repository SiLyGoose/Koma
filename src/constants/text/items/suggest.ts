/** The "Did you mean...?" question when an item name matched nothing but is close to one (discord/item-pick.ts). */
export const suggestText = {
  title: 'Did you mean...?',
  /** One guess. `stars` is the star string. */
  one: (query: string, stars: string, name: string) => `There is no item called "${query}". Did you mean **${name}** ${stars}?`,
  /** Several guesses, as lines already formatted with `line`. */
  many: (query: string, lines: string) => `There is no item called "${query}". Did you mean one of these?\n\n${lines}`,
  line: (stars: string, name: string) => `${stars}  ${name}`,
  footer: (seconds: number) => `Answer within ${seconds} seconds.`,
  yesButton: 'Yes',
  noButton: 'No',
  noneButton: 'None of these',
  notYours: "That question isn't yours to answer.",
};
