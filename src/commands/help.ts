import { createEmbed } from '../lib/embed.js';
import { isAdmin } from '../config.js';
import { COMMAND_CATEGORIES, HELP_BUTTONS, HELP_PAGE_SIZE, TEXT, type CommandCategory } from '../constants/index.js';
import { paginate } from '../discord/paginate.js';
import { hasSlash } from '../discord/slash.js';
import type { Command, CommandContext } from '../discord/types.js';

/*
 * `k!help`: every command the member can use, by group (COMMAND_CATEGORIES, in that order), each
 * alphabetically: up to HELP_PAGE_SIZE commands a page, with Previous/Next to flip through. `k!help <command>` (a name or an alias) shows one command: what it
 * does, how to type it (and use it as a slash command), and its other names.
 */

/** The commands in alphabetical order by name (a new list; the one passed in is left as it is). */
export function sortCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** One group of the help list. */
export interface CommandGroup {
  category: CommandCategory;
  commands: Command[];
}

/** `commands` by group, in COMMAND_CATEGORIES' order, each alphabetical. Groups with none are left out. */
export function groupCommands(commands: readonly Command[]): CommandGroup[] {
  return (Object.keys(COMMAND_CATEGORIES) as CommandCategory[])
    .map((category) => ({ category, commands: sortCommands(commands.filter((c) => c.category === category)) }))
    .filter((group) => group.commands.length > 0);
}

/**
 * `groups` in pages of at most `size` commands. A group is kept whole on one page (it goes on the
 * next page when it doesn't fit), unless it alone has more than `size`: then it is split.
 */
export function pageGroups(groups: readonly CommandGroup[], size = HELP_PAGE_SIZE): CommandGroup[][] {
  const pages: CommandGroup[][] = [];
  let page: CommandGroup[] = [];
  let count = 0;
  for (const group of groups) {
    for (let i = 0; i < group.commands.length; i += size) {
      const part = { category: group.category, commands: group.commands.slice(i, i + size) };
      if (count > 0 && count + part.commands.length > size) {
        pages.push(page);
        page = [];
        count = 0;
      }
      page.push(part);
      count += part.commands.length;
    }
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** The command called `name` (or with `name` as an alias), ignoring case and a typed prefix like "/" or "k!". */
export function findCommand(commands: readonly Command[], name: string, prefix = ''): Command | undefined {
  let wanted = name.trim().toLowerCase();
  for (const p of [prefix.toLowerCase(), '/']) if (p && wanted.startsWith(p)) wanted = wanted.slice(p.length);
  return commands.find((c) => c.name.toLowerCase() === wanted || c.aliases?.some((alias) => alias.toLowerCase() === wanted));
}

/** The commands `ctx`'s member can see: admin-only ones for the admin, and (for /help) only those that are slash commands. */
function visible(ctx: CommandContext, commands: readonly Command[]): Command[] {
  const slash = ctx.source === 'slash';
  return sortCommands(commands)
    .filter((command) => !command.adminOnly || isAdmin(ctx.user.id))
    .filter((command) => !slash || hasSlash(command.name));
}

/** How `command` is used, with the prefix (or the slash): slash commands' options read differently from typed arguments. */
const usageOf = (command: Command, p: string, slash: boolean): string => `${p}${slash ? (command.slashUsage ?? command.name) : (command.usage ?? command.name)}`;

/** One command, in full. */
async function showCommand(ctx: CommandContext, command: Command): Promise<void> {
  const p = ctx.prefix;
  const slash = ctx.source === 'slash';
  const embed = createEmbed().setTitle(TEXT.help.commandTitle(`${p}${command.name}`, COMMAND_CATEGORIES[command.category])).setDescription(command.description);
  // Typed (asked by typing), and as a slash command when it is one.
  const usages = [...(slash ? [] : [usageOf(command, p, false)]), ...(hasSlash(command.name) ? [usageOf(command, '/', true)] : [])];
  embed.addFields({ name: TEXT.help.usageField, value: usages.map((u) => `\`${u}\``).join('\n') });
  if (command.details) embed.addFields({ name: TEXT.help.detailsField, value: command.details });
  // Slash commands have no aliases.
  if (!slash && command.aliases?.length) embed.addFields({ name: TEXT.help.aliasesField, value: command.aliases.map((alias) => TEXT.help.alias(p, alias)).join(', ') });
  embed.setFooter({ text: TEXT.help.detailFooter(`${p}help`) });
  await ctx.reply({ embeds: [embed], ephemeral: true });
}

/** Takes a getter so the help command can list itself without a circular import. */
export function createHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: 'help',
    category: 'bot',
    aliases: ['commands'],
    description: 'List every command, or show how one works.',
    usage: 'help [command]',
    slashUsage: 'help [command]',

    async execute(ctx) {
      const p = ctx.prefix;
      const commands = visible(ctx, getCommands());

      const asked = ctx.args.join(' ').trim();
      if (asked) {
        const command = findCommand(commands, asked, p);
        if (!command) {
          await ctx.reply(TEXT.help.unknown(asked, `${p}help`));
          return;
        }
        await showCommand(ctx, command);
        return;
      }

      const pages = pageGroups(groupCommands(commands));
      await paginate(
        ctx,
        pages.length,
        (index) => ({
          embeds: [
            createEmbed()
              .setTitle(TEXT.help.title)
              .addFields(
                (pages[index] ?? []).map((group) => ({
                  name: COMMAND_CATEGORIES[group.category],
                  value: group.commands.map((command) => TEXT.help.entry(command.name)).join('\n'),
                  inline: true,
                })),
              )
              .setFooter({ text: TEXT.help.footer(index + 1, Math.max(pages.length, 1), `${p}help <command>`) }),
          ],
          // A slash command's help is shown only to the person who asked.
          ephemeral: true,
        }),
        ctx.user.id,
        { previous: TEXT.help.previousButton, next: TEXT.help.nextButton, notYours: TEXT.help.notYours },
        HELP_BUTTONS.idleMs,
      );
    },
  };
}
