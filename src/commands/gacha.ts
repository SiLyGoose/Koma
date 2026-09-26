import { CURRENCY_NAME, MULTI_PULLS, PITY_STARS, SLOT_EMOJI, TEXT, TOKEN_NAME } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem } from '../lib/game/equipment.js';
import { fmt, formatPercent, mentionList, money, starString } from '../lib/format.js';
import { CONFIG, STARS } from '../config.js';
import { pullGacha, pullMulti } from '../services/economy/index.js';
import type { Command, CommandContext } from '../discord/types.js';
import { replyWithShootingStar } from '../animations/gacha-reply.js';
import type { Stars } from '../types.js';

/** What a pull or multi pull was paid with: komaTokens, points (and what gear saved), or both. */
export function spentText(paid: { cost: number; baseCost: number; tokensUsed: number }): string {
  const points =
    paid.cost < paid.baseCost ? TEXT.gacha.spentWithGear(fmt(paid.cost), fmt(paid.baseCost - paid.cost)) : TEXT.gacha.spent(fmt(paid.cost));
  if (paid.tokensUsed === 0) return points;
  return paid.cost === 0 && paid.baseCost === 0 ? TEXT.gacha.spentTokens(paid.tokensUsed) : TEXT.gacha.spentTokensAndPoints(paid.tokensUsed, points);
}

/** The balance after a pull: points, and the komaTokens left under them if the pull used any. */
export function balanceText(after: { balance: number; tokens: number; tokensUsed: number }): string {
  if (after.tokensUsed === 0) return money(after.balance);
  return TEXT.gacha.balanceWithTokens(money(after.balance), after.tokens);
}

export const gacha: Command = {
  name: 'gacha',
  aliases: ['pull'],
  description: `Pull a random item with ${TOKEN_NAME} or ${CURRENCY_NAME}. Add "multi" for ${MULTI_PULLS} at once.`,
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
      .setTitle(TEXT.gacha.title(starString(item.stars), item.name, SLOT_EMOJI[item.slot]))
      .setDescription(
        [
          ...(item.description.trim() === '' ? [] : [TEXT.gacha.description(item.description)]),
          ...(item.usableBy && !canUseItem(item, ctx.user.id) ? [TEXT.gacha.exclusive(mentionList(item.usableBy), formatPercent(CONFIG.equipment.borrowed.effectiveness))] : []),
        ].join('\n') || null,
      )
      .addFields(
        { name: TEXT.gacha.spentField, value: spentText(result), inline: true },
        { name: TEXT.gacha.balanceField, value: balanceText(result), inline: true },
      )
      .setFooter({ text: result.isNew ? TEXT.gacha.footerNew : TEXT.gacha.footerOwned(result.count) })
      .setAuthor({ name: TEXT.gacha.author(ctx.user.displayName), iconURL: ctx.user.displayAvatarURL() });
    if (result.pity) embed.addFields(pityField(result.pity));
    await replyWithShootingStar(ctx, embed, item.stars, 'single');
  },
};

/** How close the member now is to a guaranteed top-tier item, next to what they spent and have left. */
export function pityField(pity: { count: number; hardPity: number }) {
  return { name: TEXT.gacha.pityField(starString(PITY_STARS)), value: TEXT.gacha.pityProgress(fmt(pity.count), fmt(pity.hardPity)), inline: true };
}

/** `gacha multi`: all the pulls in one embed, in the order they were pulled. */
async function multiPull(ctx: CommandContext): Promise<void> {
  const result = await pullMulti(ctx.guildId, ctx.user.id);

  if (!result.ok) {
    const covered = Math.min(result.tokens, MULTI_PULLS);
    await ctx.reply(
      covered > 0
        ? TEXT.gacha.multiCantAffordWithTokens(ctx.prefix, MULTI_PULLS, covered, fmt(result.cost), fmt(result.balance))
        : TEXT.gacha.multiCantAfford(ctx.prefix, MULTI_PULLS, fmt(result.cost), fmt(result.balance)),
    );
    return;
  }

  const lines = result.pulls.map(({ item, isNew }) =>
    (item.stars === PITY_STARS ? TEXT.gacha.multiLineTop : TEXT.gacha.multiLine)(starString(item.stars), SLOT_EMOJI[item.slot], item.name, isNew),
  );

  // One note per exclusive item that only works part way for this member.
  const notes: string[] = [];
  const noted = new Set<string>();
  for (const { item } of result.pulls) {
    if (!item.usableBy || canUseItem(item, ctx.user.id) || noted.has(item.id)) continue;
    noted.add(item.id);
    notes.push(TEXT.gacha.multiExclusive(item.name, mentionList(item.usableBy), formatPercent(CONFIG.equipment.borrowed.effectiveness)));
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
      { name: TEXT.gacha.spentField, value: spentText(result), inline: true },
      { name: TEXT.gacha.balanceField, value: balanceText(result), inline: true },
    )
    .setFooter({ text: newCount > 0 ? TEXT.gacha.multiFooterNew(newCount) : TEXT.gacha.multiFooterNoneNew })
    .setAuthor({ name: TEXT.gacha.author(ctx.user.displayName), iconURL: ctx.user.displayAvatarURL() });
  if (result.pity) embed.addFields(pityField(result.pity));
  // The shooting star takes the colour of the best item pulled.
  const best = Math.max(...result.pulls.map((pull) => pull.item.stars)) as Stars;
  await replyWithShootingStar(ctx, embed, best, 'multi');
}
