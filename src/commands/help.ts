import { createEmbed } from '../lib/embed.js';
import { CONFIG, isAdmin } from '../config.js';
import { TEXT } from '../constants.js';
import { fmt } from '../lib/format.js';
import { hasSlash } from '../discord/slash.js';
import type { Command } from '../discord/types.js';

/** The commands in alphabetical order by name (a new list; the one passed in is left as it is). */
export function sortCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

/** Takes a getter so the help command can list itself without a circular import. */
export function createHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: 'help',
    aliases: ['commands'],
    description: 'Show this list.',

    async execute(ctx) {
      const p = ctx.prefix;
      const slash = ctx.source === 'slash';
      const lines = sortCommands(getCommands())
        .filter((command) => !command.adminOnly || isAdmin(ctx.user.id))
        // A command that can't be used as a slash command isn't listed in the slash help.
        .filter((command) => !slash || hasSlash(command.name))
        .map((command) => {
          // Slash commands have no aliases, and their options read differently from typed arguments.
          const aliases =
            !slash && command.aliases?.length
              ? TEXT.help.aliases(command.aliases.map((alias) => TEXT.help.alias(p, alias)).join(', '))
              : '';
          const usage = slash ? (command.slashUsage ?? command.name) : (command.usage ?? command.name);
          return TEXT.help.entry(`${p}${usage}`, aliases, command.description);
        });

      const embed = createEmbed()
        .setTitle(TEXT.help.title)
        .setDescription(lines.join('\n\n'))
        .setFooter({
          text: TEXT.help.footer(fmt(CONFIG.claim.min), fmt(CONFIG.claim.max), fmt(CONFIG.gacha.cost)),
        });
      // The list is long, so a slash command shows it only to the person who asked.
      await ctx.reply({ embeds: [embed], ephemeral: true });
    },
  };
}
