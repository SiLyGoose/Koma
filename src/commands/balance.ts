import { CONFIG } from '../config.js';
import { TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatPercent } from '../lib/format.js';
import { getBalance } from '../services/economy.js';
import { memberNotFound, resolveUserArg } from './resolve.js';
import type { Command } from './types.js';

export const balance: Command = {
  name: 'balance',
  aliases: ['bal', 'p', 'profile'],
  description: 'Check your points, or another member\'s.',
  usage: 'balance [@user]',
  slashUsage: 'balance [user]',

  async execute(ctx) {
    const { args } = ctx;
    let target = ctx.user;
    if (args[0]) {
      const resolved = await resolveUserArg(ctx, args[0]);
      if (!resolved) {
        await ctx.reply(memberNotFound(ctx, 'balance @user'));
        return;
      }
      target = resolved;
    }

    const info = await getBalance(ctx.guildId, target.id);

    const embed = createEmbed()
      .setTitle(TEXT.balance.title(target.displayName))
      .setDescription(TEXT.balance.points(fmt(info.points)))
      .addFields(
      {
        name: TEXT.balance.claimField,
        value: info.bonusClaim
          ? TEXT.balance.claimBonusReady(ctx.prefix)
          : info.canClaim
            ? TEXT.balance.claimReady(ctx.prefix)
            : TEXT.balance.claimWait(info.nextClaimUnix),
      },
      {
        name: TEXT.balance.robField,
        value:
          info.robReadyAtUnix === null
            ? TEXT.balance.robReady(ctx.prefix)
            : TEXT.balance.robWait(info.robReadyAtUnix),
      },
    );

    const isSelf = target.id === ctx.user.id;

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

    // Status effects on the member, shown only while there is one, to anyone looking.
    const effects: string[] = [];
    if (info.withered) {
      // The Withered status from a Coughing Baby.
      const rate = formatPercent(info.withered.rate);
      const taker = `<@${info.withered.byUserId}>`;
      effects.push(isSelf ? TEXT.balance.witheredSelf(rate, taker) : TEXT.balance.witheredOther(rate, taker));
    }
    if (info.robTax) {
      // The Yowch, My Coins! mark from a Jew Frog.
      const rate = formatPercent(info.robTax.rate);
      const taker = `<@${info.robTax.byUserId}>`;
      effects.push(isSelf ? TEXT.balance.robTaxSelf(rate, taker) : TEXT.balance.robTaxOther(rate, taker));
    }
    if (effects.length > 0) embed.addFields({ name: TEXT.balance.effectsField, value: effects.join('\n') });

    await ctx.reply({ embeds: [embed] });
  },
};
