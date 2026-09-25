import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import type { CommandContext, ReplyOptions } from './types.js';
import { replyPrivately } from './reply.js';

export const PREV_ID = 'databank_prev';
export const NEXT_ID = 'databank_next';
export const TOGGLE_ID = 'databank_toggle';

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
 *
 * `toggle`, when given, adds one more button that flips `render`'s second argument on and off (it
 * starts off), labelled by `toggle(on)`, so the label can say what pressing it will show. It stays
 * on the page you are on, and it is there even when there is only one page.
 */
export async function paginate(
  ctx: CommandContext,
  pageCount: number,
  render: (index: number, on: boolean) => Pick<ReplyOptions, 'content' | 'embeds' | 'files' | 'allowedMentions'>,
  userId: string,
  labels: PaginateLabels,
  idleMs: number,
  startIndex = 0,
  toggle?: (on: boolean) => string,
): Promise<void> {
  if (pageCount <= 1 && !toggle) {
    await ctx.reply(render(0, false));
    return;
  }
  const start = Math.min(Math.max(startIndex, 0), Math.max(pageCount - 1, 0));

  const buttons = (index: number, on: boolean) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(pageCount > 1
        ? [
            new ButtonBuilder().setCustomId(PREV_ID).setLabel(labels.previous).setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
            new ButtonBuilder().setCustomId(NEXT_ID).setLabel(labels.next).setStyle(ButtonStyle.Secondary).setDisabled(index === pageCount - 1),
          ]
        : []),
      ...(toggle ? [new ButtonBuilder().setCustomId(TOGGLE_ID).setLabel(toggle(on)).setStyle(ButtonStyle.Primary)] : []),
    );

  let index = start;
  let on = false;
  const sent = await ctx.reply({ ...render(start, on), components: [buttons(start, on)] });
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: idleMs });

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== userId) {
        await replyPrivately(interaction, labels.notYours);
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      if (interaction.customId === TOGGLE_ID) on = !on;
      else index = interaction.customId === NEXT_ID ? Math.min(index + 1, pageCount - 1) : Math.max(index - 1, 0);
      await interaction.editReply({ ...render(index, on), components: [buttons(index, on)] }).catch(() => {});
    })();
  });

  collector.on('end', () => {
    void message.edit({ components: [] }).catch(() => {});
  });
}
