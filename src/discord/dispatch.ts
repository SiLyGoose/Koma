import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction, type Message } from 'discord.js';
import { TEXT } from '../constants/index.js';
import { parseCommand } from '../lib/parse.js';
import { isAllowedChannel } from '../services/channel.js';
import { interactionContext, messageContext } from './context.js';
import { commandMap } from '../commands/index.js';
import { reply } from './reply.js';
import { SLASH, hasSlash } from './slash.js';

/**
 * The one command that always works everywhere: `config` is how the admin sets or clears the
 * channel restriction (the `channel` setting, see commands/config.ts), so it can never lock
 * itself out (a channel deleted, or set wrong, would otherwise leave no way back in).
 */
const CHANNEL_EXEMPT = 'config';

/** Runs the prefix command in a message, if it is one. */
export async function handleMessage(message: Message, prefix: string): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;

  const parsed = parseCommand(message.content, prefix);
  if (!parsed) return;

  const command = commandMap.get(parsed.name);
  if (!command) return;

  try {
    // A server confined to one channel (services/channel.ts) ignores every command used
    // elsewhere, without any reply: the point is that other channels stay quiet, not that they
    // get told why. The check is inside this try so a database hiccup here is reported the same
    // way as one during the command itself, instead of crashing out unhandled.
    if (command.name !== CHANNEL_EXEMPT && !(await isAllowedChannel(message.guildId, message.channelId))) return;
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

  // Same restriction as handleMessage above, and the same silent ignore: Discord shows the asker
  // an "app didn't respond" failure on its own when nothing ever answers the interaction, which is
  // the closest a slash command can get to being ignored quietly. The check gets its own
  // try/catch (ctx doesn't exist yet to reply through) so a database hiccup here is reported the
  // same way as one during the command itself, instead of crashing out unhandled.
  let allowed: boolean;
  try {
    allowed = command.name === CHANNEL_EXEMPT || (await isAllowedChannel(interaction.guildId, interaction.channelId));
  } catch (err) {
    console.error(`Error checking the dedicated channel for /${command.name}:`, err);
    await interaction.reply({ content: TEXT.common.error, flags: MessageFlags.Ephemeral }).catch((replyErr) => {
      console.error('Could not send the error message:', replyErr);
    });
    return;
  }
  if (!allowed) return;

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
