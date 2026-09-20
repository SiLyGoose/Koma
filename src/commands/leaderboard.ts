import { createEmbed } from '../lib/embed.js';
import { CONFIG } from '../config.js';
import { TEXT } from '../constants.js';
import { fmt } from '../lib/format.js';
import { getLeaderboard } from '../services/economy.js';
import { reply } from './reply.js';
import type { Command } from './types.js';
import { getPrefix } from '../services/settings.js';

export const leaderboard: Command = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  description: 'See who has the most points in this server.',

  async execute({ message }) {
    const rows = await getLeaderboard(message.guildId, CONFIG.leaderboardSize);

    if (rows.length === 0) {
      await reply(message, TEXT.leaderboard.empty(getPrefix()));
      return;
    }

    const lines = rows.map((row, index) => TEXT.leaderboard.row(index + 1, row.userId, fmt(row.points)));
    const embed = createEmbed()
      .setTitle(TEXT.leaderboard.title)
      .setDescription(lines.join('\n'));
    await reply(message, { embeds: [embed] });
  },
};
