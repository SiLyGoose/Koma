export const helpText = {
    title: 'Commands',
    /** One line of the list: just the command's name, like "rob". */
    entry: (name) => `\`${name}\``,
    /** `more` is how to ask about one command, like "k!help <command>". */
    footer: (page, pages, more) => `Page ${page}/${pages} · ${more} for how one works`,
    previousButton: 'Previous',
    nextButton: 'Next',
    notYours: 'Run the help command yourself to flip through it.',
    /** One command's card. `name` already has the prefix; `group` is its help group, like "🎰 Casino". */
    commandTitle: (name, group) => `${name} · ${group}`,
    usageField: 'Usage',
    detailsField: 'Details',
    aliasesField: 'Aliases',
    alias: (p, alias) => `\`${p}${alias}\``,
    /** `list` is how to see every command, like "k!help". */
    detailFooter: (list) => `${list} for every command`,
    /** `name` is what they asked about; `list` like "k!help". */
    unknown: (name, list) => `There's no command called \`${name}\`. Try \`${list}\` for the list.`,
};
//# sourceMappingURL=help.js.map