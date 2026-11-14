import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, LEADERBOARD_BUTTONS, TEXT } from '../constants/index.js';
import { fmt } from '../lib/format.js';
import { getLeaderboard } from '../services/economy/index.js';
import { topLosers, topVaultDonors, topWinners } from '../services/vault.js';
import { commandPrefix } from '../discord/slash.js';
import type { Command, CommandContext } from '../discord/types.js';

type Board = 'balance' | 'donors' | 'losses' | 'winnings';

const BOARD_BY_ID: Record<string, Board> = {
  [LEADERBOARD_BUTTONS.balanceId]: 'balance',
  [LEADERBOARD_BUTTONS.donorsId]: 'donors',
  [LEADERBOARD_BUTTONS.lossesId]: 'losses',
  [LEADERBOARD_BUTTONS.winningsId]: 'winnings',
};

/** One board: who has the most points, who gave the most to the vault, who lost the most, or who won the most at the casino. */
async function boardEmbed(ctx: CommandContext, board: Board): Promise<BotEmbed> {
  const t = TEXT.leaderboard;
  const size = CONFIG.leaderboardSize;
  if (board === 'balance') {
    const rows = await getLeaderboard(ctx.guildId, size);
    const lines = rows.map((row, index) => t.row(index + 1, row.userId, fmt(row.points)));
    return createEmbed().setTitle(t.title).setDescription(lines.length > 0 ? lines.join('\n') : t.empty(ctx.prefix));
  }
  const top = { donors: topVaultDonors, losses: topLosers, winnings: topWinners }[board];
  const rows = await top(ctx.guildId, size);
  const lines = rows.map((row, index) => t.row(index + 1, row.userId, fmt(row.amount)));
  if (board === 'donors') {
    return createEmbed().setTitle(t.donorsTitle).setDescription(lines.length > 0 ? lines.join('\n') : t.noDonors(commandPrefix(ctx, 'donate')));
  }
  if (board === 'winnings') {
    return createEmbed().setTitle(t.winningsTitle).setDescription(lines.length > 0 ? lines.join('\n') : t.noWinnings).setFooter({ text: t.winningsFooter });
  }
  return createEmbed().setTitle(t.lossesTitle).setDescription(lines.length > 0 ? lines.join('\n') : t.noLosses).setFooter({ text: t.lossesFooter });
}

/** A button per board; the one showing is highlighted and can't be pressed. */
function buttonRows(showing: Board): ActionRowBuilder<ButtonBuilder>[] {
  const t = TEXT.leaderboard;
  const button = (id: string, label: string) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(BOARD_BY_ID[id] === showing ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(BOARD_BY_ID[id] === showing);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(LEADERBOARD_BUTTONS.balanceId, t.balanceButton),
      button(LEADERBOARD_BUTTONS.donorsId, t.donorsButton),
      button(LEADERBOARD_BUTTONS.lossesId, t.lossesButton),
      button(LEADERBOARD_BUTTONS.winningsId, t.winningsButton),
    ),
  ];
}

export const leaderboard: Command = {
  name: 'leaderboard',
  category: 'economy',
  aliases: ['lb', 'top'],
  description: `See who has the most ${CURRENCY_NAME} in this server, and who has donated, lost and won the most.`,

  async execute(ctx) {
    const sent = await ctx.reply({ embeds: [await boardEmbed(ctx, 'balance')], components: buttonRows('balance') });

    // Anyone can switch boards: they're public. The buttons go away after LEADERBOARD_BUTTONS.idleMs without a press.
    const message = await sent.fetchMessage();
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: LEADERBOARD_BUTTONS.idleMs });
    collector.on('collect', (interaction) => {
      void (async () => {
        const board = BOARD_BY_ID[interaction.customId];
        if (!board) return;
        try {
          await interaction.deferUpdate();
          await interaction.editReply({ embeds: [await boardEmbed(ctx, board)], components: buttonRows(board) });
        } catch (err) {
          console.error('A leaderboard button failed:', err);
        }
      })();
    });
    collector.on('end', () => {
      void message.edit({ components: [] }).catch(() => {});
    });
  },
};
