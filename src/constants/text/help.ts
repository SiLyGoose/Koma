export const helpText = {
  title: 'Commands',
  /** One line of the list: just the command's name, like "rob". */
  entry: (name: string) => `\`${name}\``,
  /** `more` is how to ask about one command, like "k!help <command>". */
  footer: (page: number, pages: number, more: string) => `Page ${page}/${pages} · ${more} for how one works`,
  previousButton: 'Previous',
  nextButton: 'Next',
  notYours: 'Run the help command yourself to flip through it.',

  /** One command's card. `name` already has the prefix; `group` is its help group, like "🎰 Casino". */
  commandTitle: (name: string, group: string) => `${name} · ${group}`,
  usageField: 'Usage',
  detailsField: 'Details',
  aliasesField: 'Aliases',
  alias: (p: string, alias: string) => `\`${p}${alias}\``,
  /** `list` is how to see every command, like "k!help". */
  detailFooter: (list: string) => `${list} for every command`,
  /** `name` is what they asked about; `list` like "k!help". */
  unknown: (name: string, list: string) => `There's no command called \`${name}\`. Try \`${list}\` for the list.`,
};
