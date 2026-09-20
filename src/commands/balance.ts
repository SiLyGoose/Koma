import { CONFIG } from '../config.js';
import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import { getBalance } from '../services/economy.js';
import { reply } from './reply.js';
import { memberNotFound, resolveUserArg } from './resolve.js';
import type { Command } from './types.js';
import { getPrefix } from '../services/settings.js';

export const balance: Command = {
  name: 'balance',
  aliases: ['bal', 'p', 'profile'],
  description: 'Check your points, or another member\'s.',
  usage: 'balance [@user]',

  async execute({ message, args }) {
    let target = message.author;
    if (args[0]) {
      const resolved = await resolveUserArg(message, args[0]);
      if (!resolved) {
        await reply(message, memberNotFound('balance @user'));
        return;
      }
      target = resolved;
    }

    const info = await getBalance(message.guildId, target.id);

    const embed = createEmbed()
      .setTitle(TEXT.balance.title(target.displayName))
      .setDescription(TEXT.balance.points(fmt(info.points)));

    const isSelf = target.id === message.author.id;

    if (isSelf) {
      embed.addFields(
        {
          name: TEXT.balance.claimField,
          value: info.canClaim ? TEXT.balance.claimReady(getPrefix()) : TEXT.balance.claimWait(info.nextClaimUnix),
        },
        {
          name: TEXT.balance.robField,
          value:
            info.robReadyAtUnix === null
              ? TEXT.balance.robReady(getPrefix())
              : TEXT.balance.robWait(info.robReadyAtUnix),
        },
      );
    }

    if (CONFIG.rob.victimProtectionMinutes > 0) {
      embed.addFields({
        name: TEXT.balance.protectionField,
        value:
          info.robProtectedUntilUnix === null
            ? isSelf
              ? TEXT.balance.protectionNoneSelf
              : TEXT.balance.protectionNoneOther
            : isSelf
              ? TEXT.balance.protectionEndsSelf(info.robProtectedUntilUnix)
              : TEXT.balance.protectionEndsOther(info.robProtectedUntilUnix),
      });
    }

    await reply(message, { embeds: [embed] });
  },
};
