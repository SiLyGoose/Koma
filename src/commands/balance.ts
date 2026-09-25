import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatPercent, mention } from '../lib/format.js';
import { getBalance } from '../services/economy/index.js';
import { commandPrefix } from '../discord/slash.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

export const balance: Command = {
  name: 'balance',
  aliases: ['bal', 'p', 'profile'],
  description: `Check your ${CURRENCY_NAME}, or another member's.`,
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
      .setDescription(`${TEXT.balance.points(fmt(info.points))}\n${TEXT.balance.tokens(info.tokens)}\n${TEXT.balance.gems(info.gems)}`)
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
            ? // rob has no slash command (SLASH_EXCLUDED), so its hint always names the real
              // message prefix, never "/", even when balance itself was run as a slash command.
              TEXT.balance.robReady(commandPrefix(ctx, 'rob'))
            : TEXT.balance.robWait(info.robReadyAtUnix),
      },
    );

    const isSelf = target.id === ctx.user.id;


    // Status effects on the member, shown only while there is one, to anyone looking.
    const effects: string[] = [];
    if (info.withered) {
      // The Withered status from a Coughing Baby.
      const rate = formatPercent(info.withered.rate);
      const taker = mention(info.withered.byUserId);
      effects.push(isSelf ? TEXT.balance.witheredSelf(rate, taker) : TEXT.balance.witheredOther(rate, taker));
    }
    if (info.robTax) {
      // The Yowch, My Coins! mark from a Jew Frog.
      const rate = formatPercent(info.robTax.rate);
      const taker = mention(info.robTax.byUserId);
      effects.push(isSelf ? TEXT.balance.robTaxSelf(rate, taker) : TEXT.balance.robTaxOther(rate, taker));
    }
    if (effects.length > 0) embed.addFields({ name: TEXT.balance.effectsField, value: effects.join('\n') });

    await ctx.reply({ embeds: [embed] });
  },
};
