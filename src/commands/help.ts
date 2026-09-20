import { createEmbed } from '../lib/embed.js';
import { CONFIG } from '../config.js';
import { TEXT } from '../constants.js';
import { fmt } from '../lib/format.js';
import { reply } from './reply.js';
import type { Command } from './types.js';
import { getPrefix } from '../services/settings.js';

/** Takes a getter so the help command can list itself without a circular import. */
export function createHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: 'help',
    aliases: ['commands'],
    description: 'Show this list.',

    async execute({ message }) {
      const p = getPrefix();
      const lines = getCommands().map((command) => {
        const aliases = command.aliases?.length
          ? TEXT.help.aliases(command.aliases.map((alias) => TEXT.help.alias(p, alias)).join(', '))
          : '';
        return TEXT.help.entry(`${p}${command.usage ?? command.name}`, aliases, command.description);
      });

      const embed = createEmbed()
        .setTitle(TEXT.help.title)
        .setDescription(lines.join('\n\n'))
        .setFooter({
          text: TEXT.help.footer(fmt(CONFIG.claim.min), fmt(CONFIG.claim.max), fmt(CONFIG.gacha.cost)),
        });
      await reply(message, { embeds: [embed] });
    },
  };
}
