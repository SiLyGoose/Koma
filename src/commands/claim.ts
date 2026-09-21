import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import { claimHourly } from '../services/economy.js';
import { reply } from './reply.js';
import type { Command } from './types.js';

export const claim: Command = {
  name: 'claim',
  description: 'Claim your points for this hour.',

  async execute({ message }) {
    const result = await claimHourly(message.guildId, message.author.id);

    if (!result.ok) {
      await reply(message, TEXT.claim.already(result.nextClaimUnix));
      return;
    }

    const embed = createEmbed()
      .setTitle(TEXT.claim.title)
      .setDescription(
        (result.bonus > 0
          ? TEXT.claim.claimedWithGear(message.author.toString(), fmt(result.amount), fmt(result.bonus))
          : TEXT.claim.claimed(message.author.toString(), fmt(result.amount))) +
          (result.taxed
            ? `\n${TEXT.claim.taxed(`<@${result.taxed.toUserId}>`, fmt(result.taxed.amount), fmt(result.amount - result.taxed.amount))}`
            : ''),
      )
      .addFields(
        { name: TEXT.claim.balanceField, value: fmt(result.balance), inline: true },
        { name: TEXT.claim.nextField, value: TEXT.claim.next(result.nextClaimUnix), inline: true },
      );
    await reply(message, { embeds: [embed] });
  },
};
