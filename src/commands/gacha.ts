import { CURRENCY_NAME, MULTI_PULLS, PITY_STARS, SLOT_EMOJI, TEXT, TOKEN_NAME } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { canUseItem } from '../lib/game/items/equipment.js';
import { fmt, formatPercent, mentionList, money, tierLabel } from '../lib/format.js';
import { CONFIG, STARS } from '../config.js';
import { featuredItems, LIMITED_BANNER } from '../data/items.js';
import { limitedWindow } from '../lib/game/items/banner.js';
import { topChance } from '../lib/game/items/gacha.js';
import { getPity, pullGacha, pullMulti, type PulledItem } from '../services/economy/index.js';
import type { Command, CommandContext } from '../discord/types.js';
import { replyWithShootingStar } from '../animations/gacha-reply.js';
import type { BannerId, Stars } from '../types.js';

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

/** The words that pick the limited banner, and the Hero Item one. */
const LIMITED_WORDS: readonly string[] = ['limited', 'lim', 'event'];
const HERO_WORDS: readonly string[] = ['hero', 'heroes', 'uw'];

/** One pulled item's line, as a multi pull lists it (a top-tier one in bold). */
const pullLine = ({ item, isNew }: PulledItem): string =>
  (item.stars === PITY_STARS ? TEXT.gacha.multiLineTop : TEXT.gacha.multiLine)(tierLabel(item.stars), SLOT_EMOJI[item.slot], item.name, isNew);

/** Why the limited banner takes no pulls right now: it hasn't opened yet, it is over, or there is none. */
function closedText(): string {
  const { start, end } = limitedWindow(CONFIG.gacha.limited);
  const now = Date.now();
  if (start !== null && now < start) return TEXT.gacha.limitedOpens(Math.ceil(start / 1000));
  if (start !== null && end !== null && now >= end) return TEXT.gacha.limitedEnded;
  return TEXT.gacha.limitedNone;
}

export const gacha: Command = {
  name: 'gacha',
  category: 'items',
  aliases: ['pull'],
  description: `Pull an item with ${TOKEN_NAME} or ${CURRENCY_NAME}. "multi" pulls ${MULTI_PULLS}; "limited" or "hero" picks a banner.`,
  usage: 'gacha [limited | hero] [multi] | gacha banner',
  slashUsage: 'gacha [limited] [hero] [multi] [banner]',

  async execute(ctx) {
    // `gacha` is one pull; "multi" makes it a multi pull, and "limited" picks the limited banner or "hero"
    // the Hero Item one (not both), in any order. `gacha banner` shows the limited banner. Anything else gets a hint.
    const words = ctx.args.map((arg) => arg.toLowerCase());
    if (words.length === 1 && words[0] === 'banner') {
      await showBanner(ctx);
      return;
    }
    const multi = words.includes('multi');
    const limited = words.some((word) => LIMITED_WORDS.includes(word));
    const hero = words.some((word) => HERO_WORDS.includes(word));
    const known = (word: string): boolean => word === 'multi' || LIMITED_WORDS.includes(word) || HERO_WORDS.includes(word);
    if ((limited && hero) || words.length !== Number(multi) + Number(limited) + Number(hero) || !words.every(known)) {
      await ctx.reply(TEXT.gacha.usage(ctx.prefix));
      return;
    }
    const banner: BannerId = limited ? 'limited' : hero ? 'hero' : 'standard';
    if (multi) {
      await multiPull(ctx, banner);
      return;
    }

    const result = await pullGacha(ctx.guildId, ctx.user.id, banner);

    if (!result.ok) {
      await ctx.reply(result.reason === 'closed' ? closedText() : TEXT.gacha.cantAfford(ctx.prefix, fmt(result.cost), fmt(result.balance)));
      return;
    }

    const { item } = result;
    const embed = createEmbed()
      .setTitle(TEXT.gacha.title(tierLabel(item.stars), item.name, SLOT_EMOJI[item.slot]))
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
      .setAuthor({ name: authorText(ctx, banner), iconURL: ctx.user.displayAvatarURL() });
    if (result.pity) embed.addFields(pityField(result.pity, banner));
    if (result.extra) embed.addFields({ name: TEXT.gacha.extraField, value: pullLine(result.extra), inline: false });
    // The shooting star takes the colour of the better item when the pull gave two.
    await replyWithShootingStar(ctx, embed, Math.max(item.stars, result.extra?.item.stars ?? 0) as Stars, 'single');
  },
};

/** Whose pull it is, over the result: from the limited banner, by its name; from the Hero Item one. */
const authorText = (ctx: CommandContext, banner: BannerId): string =>
  banner === 'limited'
    ? TEXT.gacha.authorLimited(ctx.user.displayName, LIMITED_BANNER.name)
    : banner === 'hero'
      ? TEXT.gacha.authorHero(ctx.user.displayName)
      : TEXT.gacha.author(ctx.user.displayName);

/** How close the member now is to a guaranteed top-tier item on the banner pulled from, next to what they spent and have left. */
export function pityField(pity: { count: number; hardPity: number }, banner: BannerId = 'standard') {
  const name = (banner === 'limited' ? TEXT.gacha.pityFieldLimited : banner === 'hero' ? TEXT.gacha.pityFieldHero : TEXT.gacha.pityField)(tierLabel(PITY_STARS));
  return { name, value: TEXT.gacha.pityProgress(fmt(pity.count), fmt(pity.hardPity)), inline: true };
}

/** `gacha banner`: the limited banner's featured items, when it is open, and where the member's pity and guarantee on it stand. */
async function showBanner(ctx: CommandContext): Promise<void> {
  const { open, start, end } = limitedWindow(CONFIG.gacha.limited);
  const featured = featuredItems();
  if (featured.length === 0 || (!open && !(start !== null && Date.now() < start))) {
    await ctx.reply(closedText());
    return;
  }
  const stars = tierLabel(PITY_STARS);
  const chance = formatPercent(CONFIG.gacha.limited.featuredChance);
  const when = !open && start !== null ? TEXT.gacha.bannerOpens(Math.ceil(start / 1000)) : end === null ? TEXT.gacha.bannerNoEnd : TEXT.gacha.bannerUntil(Math.ceil(end / 1000));
  const pity = await getPity(ctx.guildId, ctx.user.id, 'limited');
  const { hardPity } = CONFIG.gacha.pity;
  const embed = createEmbed()
    .setTitle(TEXT.gacha.bannerTitle(LIMITED_BANNER.name))
    .setDescription([...featured.map((item) => TEXT.gacha.bannerFeatured(tierLabel(item.stars), item.name, SLOT_EMOJI[item.slot])), '', TEXT.gacha.bannerOdds(stars, chance)].join('\n'))
    .addFields({ name: TEXT.gacha.bannerWhenField, value: when, inline: false })
    .setFooter({ text: TEXT.gacha.bannerFooter(ctx.prefix) });
  // As pulls count it: only while pity is on and the top tier can be pulled at all.
  if (hardPity > 0 && topChance(1) > 0) embed.addFields(pityField({ count: pity.count, hardPity }, 'limited'));
  embed.addFields({
    name: TEXT.gacha.bannerGuaranteeField,
    value: pity.guaranteed ? TEXT.gacha.bannerGuaranteed(stars) : TEXT.gacha.bannerNotGuaranteed(stars, chance),
    inline: true,
  });
  await ctx.reply({ embeds: [embed] });
}

/** `gacha multi`: all the pulls in one embed, in the order they were pulled. */
async function multiPull(ctx: CommandContext, banner: BannerId): Promise<void> {
  const result = await pullMulti(ctx.guildId, ctx.user.id, banner);

  if (!result.ok) {
    const covered = Math.min(result.tokens, MULTI_PULLS);
    await ctx.reply(
      result.reason === 'closed'
        ? closedText()
        : covered > 0
          ? TEXT.gacha.multiCantAffordWithTokens(ctx.prefix, MULTI_PULLS, covered, fmt(result.cost), fmt(result.balance))
          : TEXT.gacha.multiCantAfford(ctx.prefix, MULTI_PULLS, fmt(result.cost), fmt(result.balance)),
    );
    return;
  }

  // The pulls in order, then whatever they gave on top (Pot of Greed).
  const everything = [...result.pulls, ...result.extras];
  const lines = [...result.pulls.map(pullLine), ...result.extras.map((extra) => TEXT.gacha.multiExtraLine(pullLine(extra)))];

  // One note per exclusive item that only works part way for this member.
  const notes: string[] = [];
  const noted = new Set<string>();
  for (const { item } of everything) {
    if (!item.usableBy || canUseItem(item, ctx.user.id) || noted.has(item.id)) continue;
    noted.add(item.id);
    notes.push(TEXT.gacha.multiExclusive(item.name, mentionList(item.usableBy), formatPercent(CONFIG.equipment.borrowed.effectiveness)));
  }

  // How many items came of each tier, best tier first.
  const summary = [...STARS]
    .reverse()
    .map((stars) => ({ stars, count: everything.filter((pull) => pull.item.stars === stars).length }))
    .filter((tier) => tier.count > 0)
    .map((tier) => TEXT.gacha.multiTier(tierLabel(tier.stars), tier.count))
    .join(' · ');

  const newCount = everything.filter((pull) => pull.isNew).length;
  const embed = createEmbed()
    .setTitle(TEXT.gacha.multiTitle(MULTI_PULLS))
    .setDescription([...lines, ...(notes.length > 0 ? ['', ...notes] : [])].join('\n'))
    .addFields(
      { name: TEXT.gacha.multiSummaryField, value: summary, inline: false },
      { name: TEXT.gacha.spentField, value: spentText(result), inline: true },
      { name: TEXT.gacha.balanceField, value: balanceText(result), inline: true },
    )
    .setFooter({ text: newCount > 0 ? TEXT.gacha.multiFooterNew(newCount) : TEXT.gacha.multiFooterNoneNew })
    .setAuthor({ name: authorText(ctx, banner), iconURL: ctx.user.displayAvatarURL() });
  if (result.pity) embed.addFields(pityField(result.pity, banner));
  // The shooting star takes the colour of the best item pulled.
  const best = Math.max(...everything.map((pull) => pull.item.stars)) as Stars;
  await replyWithShootingStar(ctx, embed, best, 'multi');
}
