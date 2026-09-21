import { MULTI_PULLS, PITY_STARS, TEXT } from '../constants.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem } from '../lib/game/equipment.js';
import { fmt, mentionList, starString } from '../lib/format.js';
import { STARS } from '../config.js';
import { pullGacha, pullMulti } from '../services/economy.js';
import type { Command, CommandContext } from '../discord/types.js';

export const gacha: Command = {
  name: 'gacha',
  aliases: ['pull'],
  description: `Spend points to pull a random item. Add "multi" to pull ${MULTI_PULLS} at once.`,
  usage: 'gacha [multi]',
  slashUsage: 'gacha [multi]',

  async execute(ctx) {
    const { args } = ctx;
    // `gacha` is one pull and `gacha multi` is a multi pull; anything else gets a hint.
    const mode = args[0]?.toLowerCase();
    if (args.length > 1 || (mode !== undefined && mode !== 'multi')) {
      await ctx.reply(TEXT.gacha.usage(ctx.prefix));
      return;
    }
    if (mode === 'multi') {
      await multiPull(ctx);
      return;
    }

    const result = await pullGacha(ctx.guildId, ctx.user.id);

    if (!result.ok) {
      await ctx.reply(TEXT.gacha.cantAfford(ctx.prefix, fmt(result.cost), fmt(result.balance)));
      return;
    }

    const { item } = result;
    const embed = createEmbed()
      .setTitle(TEXT.gacha.title(starString(item.stars), item.name))
      .setDescription(
        TEXT.gacha.description(item.description) +
          (item.usableBy && !canUseItem(item, ctx.user.id) ? `\n${TEXT.gacha.exclusive(mentionList(item.usableBy))}` : ''),
      )
      .addFields(
        {
          name: TEXT.gacha.spentField,
          value:
            result.cost < result.baseCost
              ? TEXT.gacha.spentWithGear(fmt(result.cost), fmt(result.baseCost - result.cost))
              : TEXT.gacha.spent(fmt(result.cost)),
          inline: true,
        },
        { name: TEXT.gacha.balanceField, value: fmt(result.balance), inline: true },
      )
      .setFooter({ text: result.isNew ? TEXT.gacha.footerNew : TEXT.gacha.footerOwned(result.count) })
      .setAuthor({ name: TEXT.gacha.author(ctx.user.displayName), iconURL: ctx.user.displayAvatarURL() });
    // if (result.pity) {
    //   embed.addFields({
    //     name: TEXT.gacha.pityField(starString(PITY_STARS)),
    //     value: TEXT.gacha.pityProgress(fmt(result.pity.count), fmt(result.pity.hardPity)),
    //     inline: true,
    //   });
    // }
    await ctx.reply({ embeds: [embed] });
  },
};

/** `gacha multi`: all the pulls in one embed, in the order they were pulled. */
async function multiPull(ctx: CommandContext): Promise<void> {
  const result = await pullMulti(ctx.guildId, ctx.user.id);

  if (!result.ok) {
    await ctx.reply(TEXT.gacha.multiCantAfford(ctx.prefix, MULTI_PULLS, fmt(result.cost), fmt(result.balance)));
    return;
  }

  const lines = result.pulls.map(({ item, isNew }) =>
    (item.stars === PITY_STARS ? TEXT.gacha.multiLineTop : TEXT.gacha.multiLine)(starString(item.stars), item.name, isNew),
  );

  // One note per exclusive item that this member can't use the effects of.
  const notes: string[] = [];
  const noted = new Set<string>();
  for (const { item } of result.pulls) {
    if (!item.usableBy || canUseItem(item, ctx.user.id) || noted.has(item.id)) continue;
    noted.add(item.id);
    notes.push(TEXT.gacha.multiExclusive(item.name, mentionList(item.usableBy)));
  }

  // How many pulls gave each tier, best tier first.
  const summary = [...STARS]
    .reverse()
    .map((stars) => ({ stars, count: result.pulls.filter((pull) => pull.item.stars === stars).length }))
    .filter((tier) => tier.count > 0)
    .map((tier) => TEXT.gacha.multiTier(starString(tier.stars), tier.count))
    .join(' · ');

  const newCount = result.pulls.filter((pull) => pull.isNew).length;
  const embed = createEmbed()
    .setTitle(TEXT.gacha.multiTitle(MULTI_PULLS))
    .setDescription([...lines, ...(notes.length > 0 ? ['', ...notes] : [])].join('\n'))
    .addFields(
      { name: TEXT.gacha.multiSummaryField, value: summary, inline: false },
      {
        name: TEXT.gacha.spentField,
        value:
          result.cost < result.baseCost
            ? TEXT.gacha.spentWithGear(fmt(result.cost), fmt(result.baseCost - result.cost))
            : TEXT.gacha.spent(fmt(result.cost)),
        inline: true,
      },
      { name: TEXT.gacha.balanceField, value: fmt(result.balance), inline: true },
    )
    .setFooter({ text: newCount > 0 ? TEXT.gacha.multiFooterNew(newCount) : TEXT.gacha.multiFooterNoneNew })
    .setAuthor({ name: TEXT.gacha.author(ctx.user.displayName), iconURL: ctx.user.displayAvatarURL() });
  await ctx.reply({ embeds: [embed] });
}
