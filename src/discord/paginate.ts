import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import type { CommandContext, ReplyOptions } from './types.js';

export const PREV_ID = 'databank_prev';
export const NEXT_ID = 'databank_next';

export interface PaginateLabels {
  previous: string;
  next: string;
  /** Told to anyone who presses a button on a book that isn't theirs. */
  notYours: string;
}

/**
 * Sends `render(startIndex)` and, when there is more than one page, a Previous/Next row under it
 * so the member who asked can flip through the rest like a book: each press edits the same
 * message in place rather than sending a new one. `startIndex` (default the first page) lets a
 * caller jump straight into the middle of the book -- e.g. `config plinko` opening right on the
 * Plinko settings page -- while Previous/Next still reach every other page from there. Only
 * `userId` can flip pages; anyone else pressing a button is told it isn't theirs and nothing
 * changes. The buttons come off after `idleMs` of nobody using them. A single page (or none) is
 * just sent as-is, with no buttons at all.
 */
export async function paginate(
  ctx: CommandContext,
  pageCount: number,
  render: (index: number) => Pick<ReplyOptions, 'content' | 'embeds' | 'files' | 'allowedMentions'>,
  userId: string,
  labels: PaginateLabels,
  idleMs: number,
  startIndex = 0,
): Promise<void> {
  if (pageCount <= 1) {
    await ctx.reply(render(0));
    return;
  }
  const start = Math.min(Math.max(startIndex, 0), pageCount - 1);

  const buttons = (index: number) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(PREV_ID).setLabel(labels.previous).setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId(NEXT_ID).setLabel(labels.next).setStyle(ButtonStyle.Secondary).setDisabled(index === pageCount - 1),
    );

  let index = start;
  const sent = await ctx.reply({ ...render(start), components: [buttons(start)] });
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: idleMs });

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== userId) {
        await interaction.reply({ content: labels.notYours, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      index = interaction.customId === NEXT_ID ? Math.min(index + 1, pageCount - 1) : Math.max(index - 1, 0);
      await interaction.editReply({ ...render(index), components: [buttons(index)] }).catch(() => {});
    })();
  });

  collector.on('end', () => {
    void message.edit({ components: [] }).catch(() => {});
  });
}
