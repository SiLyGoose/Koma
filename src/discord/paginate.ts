import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import type { CommandContext, ReplyOptions } from './types.js';
import { replyPrivately } from './reply.js';

export const PREV_ID = 'databank_prev';
export const NEXT_ID = 'databank_next';
export const TOGGLE_ID = 'databank_toggle';

/**
 * An extra button under a book that flips one on/off switch of what `render` shows (say, strengths
 * at R1 instead of R5). Every switch starts off. `label` and `disabled` see every switch's state
 * (in the order the toggles were given), so a button can say what pressing it will show, or be
 * greyed out while another switch makes it pointless.
 */
export interface PaginateToggle {
  /** Its button's custom id: different for each toggle. */
  id: string;
  label: (flags: readonly boolean[]) => string;
  disabled?: (flags: readonly boolean[]) => boolean;
}

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
 * `toggles` add one more button each (see PaginateToggle), which flips that toggle's switch in the
 * `flags` passed to `render` (all off to start). A press stays on the page you are on, and the
 * buttons are there even when there is only one page.
 *
 * `ephemeral` in what `render` returns is used for the first reply only (a slash reply's privacy
 * can't change afterwards).
 */
export async function paginate(
  ctx: CommandContext,
  pageCount: number,
  render: (index: number, flags: readonly boolean[]) => Pick<ReplyOptions, 'content' | 'embeds' | 'files' | 'allowedMentions' | 'ephemeral'>,
  userId: string,
  labels: PaginateLabels,
  idleMs: number,
  startIndex = 0,
  toggles: readonly PaginateToggle[] = [],
): Promise<void> {
  let flags: boolean[] = toggles.map(() => false);
  if (pageCount <= 1 && toggles.length === 0) {
    await ctx.reply(render(0, flags));
    return;
  }
  const start = Math.min(Math.max(startIndex, 0), Math.max(pageCount - 1, 0));

  const buttons = (index: number) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(pageCount > 1
        ? [
            new ButtonBuilder().setCustomId(PREV_ID).setLabel(labels.previous).setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
            new ButtonBuilder().setCustomId(NEXT_ID).setLabel(labels.next).setStyle(ButtonStyle.Secondary).setDisabled(index === pageCount - 1),
          ]
        : []),
      ...toggles.map((toggle) =>
        new ButtonBuilder().setCustomId(toggle.id).setLabel(toggle.label(flags)).setStyle(ButtonStyle.Primary).setDisabled(toggle.disabled?.(flags) ?? false),
      ),
    );

  let index = start;
  const sent = await ctx.reply({ ...render(start, flags), components: [buttons(start)] });
  const message = await sent.fetchMessage();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: idleMs });

  collector.on('collect', (interaction) => {
    void (async () => {
      if (interaction.user.id !== userId) {
        await replyPrivately(interaction, labels.notYours);
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      const flipped = toggles.findIndex((toggle) => toggle.id === interaction.customId);
      if (flipped >= 0) flags = flags.map((flag, i) => (i === flipped ? !flag : flag));
      else index = interaction.customId === NEXT_ID ? Math.min(index + 1, pageCount - 1) : Math.max(index - 1, 0);
      const { ephemeral: _, ...page } = render(index, flags);
      // A page with files replaces the last page's instead of adding to them.
      await interaction.editReply({ ...page, ...(page.files ? { attachments: [] } : {}), components: [buttons(index)] }).catch(() => {});
    })();
  });

  collector.on('end', () => {
    void message.edit({ components: [] }).catch(() => {});
  });
}
