import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction, type Message } from 'discord.js';
import { TEXT } from '../constants.js';
import { parseCommand } from '../lib/parse.js';
import { interactionContext, messageContext } from './context.js';
import { commandMap } from './index.js';
import { reply } from './reply.js';
import { SLASH, hasSlash } from './slash.js';

/** Runs the prefix command in a message, if it is one. */
export async function handleMessage(message: Message, prefix: string): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;

  const parsed = parseCommand(message.content, prefix);
  if (!parsed) return;

  const command = commandMap.get(parsed.name);
  if (!command) return;

  try {
    await command.execute(messageContext(message, parsed.args, prefix));
  } catch (err) {
    console.error(`Error running ${prefix}${parsed.name}:`, err);
    try {
      await reply(message, TEXT.common.error);
    } catch (replyErr) {
      console.error('Could not send the error message:', replyErr);
    }
  }
}

/** Runs a slash command. */
export async function handleSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commandMap.get(interaction.commandName);
  const spec = hasSlash(interaction.commandName) ? SLASH[interaction.commandName] : undefined;
  if (!command || !spec || command.name !== interaction.commandName) {
    await interaction.reply({ content: TEXT.common.unknownSlash, flags: MessageFlags.Ephemeral }).catch((err) => {
      console.error('Could not answer an unknown slash command:', err);
    });
    return;
  }
  if (!interaction.inGuild()) {
    await interaction.reply({ content: TEXT.common.serverOnly, flags: MessageFlags.Ephemeral }).catch((err) => {
      console.error('Could not answer a slash command outside a server:', err);
    });
    return;
  }

  const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId));
  const { ctx, dispose } = interactionContext(interaction, guild, []);
  try {
    ctx.args = spec.toArgs(interaction);
    await command.execute(ctx);
  } catch (err) {
    console.error(`Error running /${command.name}:`, err);
    try {
      await ctx.reply(TEXT.common.error);
    } catch (replyErr) {
      console.error('Could not send the error message:', replyErr);
    }
  } finally {
    dispose();
  }
}

/** Fills in the suggestion list of a slash command option that is being typed. */
export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  let choices: { name: string; value: string }[] = [];
  try {
    choices = (await (hasSlash(interaction.commandName) ? SLASH[interaction.commandName]?.autocomplete?.(interaction) : undefined)) ?? [];
  } catch (err) {
    console.error(`Error listing suggestions for /${interaction.commandName}:`, err);
  }
  await interaction.respond(choices).catch(() => {
    // The member kept typing, or Discord took too long: nothing to do.
  });
}
