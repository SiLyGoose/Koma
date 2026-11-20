import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, money } from '../lib/format.js';
import { parseBetArg } from '../lib/game/casino/bet.js';
import { pay as payService } from '../services/economy/index.js';
import { memberNotFound, resolveUserArg } from '../discord/resolve.js';
import type { Command } from '../discord/types.js';

/** Give some of your points to another member. */
export const pay: Command = {
  name: 'pay',
  category: 'economy',
  description: `Give some of your ${CURRENCY_NAME} to another member.`,
  usage: 'pay @user <amount | all>',
  slashUsage: 'pay user amount',

  async execute(ctx) {
    const { args } = ctx;
    if (args.length !== 2) {
      await ctx.reply(TEXT.pay.usage(ctx.prefix));
      return;
    }
    const parsed = parseBetArg(args.slice(1));
    if (!parsed.ok) {
      await ctx.reply(TEXT.pay.badAmount);
      return;
    }

    const target = await resolveUserArg(ctx, args[0] as string);
    if (!target) {
      await ctx.reply(memberNotFound(ctx, 'pay @user <amount>'));
      return;
    }
    if (target.bot) {
      await ctx.reply(TEXT.pay.botTarget);
      return;
    }
    if (target.id === ctx.user.id) {
      await ctx.reply(TEXT.pay.selfTarget);
      return;
    }

    const result = await payService(ctx.guildId, ctx.user.id, target.id, parsed.bet);
    if (!result.ok) {
      await ctx.reply(result.balance > 0 ? TEXT.pay.tooPoor(fmt(result.balance)) : TEXT.pay.nothing);
      return;
    }

    const embed = createEmbed()
      .setTitle(TEXT.pay.title)
      .setDescription(TEXT.pay.done(ctx.user.toString(), target.toString(), fmt(result.paid)))
      .addFields(
        { name: TEXT.pay.yourBalanceField, value: money(result.balance), inline: true },
        { name: TEXT.pay.theirBalanceField, value: money(result.theirBalance), inline: true },
      );
    // Ping the member paid, so they know.
    await ctx.reply({ embeds: [embed], allowedMentions: { users: [target.id] } });
  },
};
