import { DATABANK_BUTTONS, REFINE, TEXT } from '../constants/index.js';
import { ITEMS, findItem } from '../data/items.js';
import { STARS } from '../types.js';
import { createEmbed } from '../lib/embed.js';
import { buildDatabank, itemDetail, parseStarQuery } from '../lib/game/databank.js';
import { starString } from '../lib/format.js';
import { paginate } from '../discord/paginate.js';
import type { Command } from '../discord/types.js';

export const databank: Command = {
  name: 'databank',
  aliases: ['items', 'db'],
  description: 'See every item and what it does. Add an item name or id to see just that one, or a star tier (1-4) to see that tier.',
  usage: 'databank [item | stars]',
  slashUsage: 'databank [item] [stars]',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    // Every view starts at the listed (fully refined) strengths, and a button flips to a new copy's (R1) and back.
    const levelOf = (on: boolean): number => (on ? 1 : REFINE.maxLevel);
    const toggle = (on: boolean): string => TEXT.databank.showLevel(levelOf(!on));
    const labels = { previous: TEXT.databank.previousButton, next: TEXT.databank.nextButton, notYours: TEXT.databank.notYours };

    const query = args.join(' ').trim();

    // With a star tier (`3`, `3 star`, `★★★`): every item of that tier.
    const tier = parseStarQuery(query);
    if (tier?.kind === 'bad_tier') {
      await ctx.reply(TEXT.databank.badTier(p, Math.min(...STARS), Math.max(...STARS)));
      return;
    }
    const wanted = tier?.stars;

    // With a name or id: the full details of that one item.
    if (query !== '' && wanted === undefined) {
      const lookup = findItem(query);
      if (lookup.kind === 'none') {
        await ctx.reply(TEXT.databank.noSuchItem(p, query));
        return;
      }
      if (lookup.kind === 'ambiguous') {
        await ctx.reply(TEXT.databank.ambiguous(lookup.matches.map((item) => item.name)));
        return;
      }
      const { item } = lookup;
      const renderDetail = (_index: number, on: boolean) => {
        const detail = itemDetail(item, levelOf(on));
        const embed = createEmbed().setTitle(detail.title).addFields(detail.fields).setFooter({ text: TEXT.databank.detailFooter(p) });
        if (detail.description !== '') embed.setDescription(detail.description);
        return { embeds: [embed] };
      };
      await paginate(ctx, 1, renderDetail, ctx.user.id, labels, DATABANK_BUTTONS.idleMs, 0, toggle);
      return;
    }

    const items = wanted === undefined ? ITEMS : ITEMS.filter((item) => item.stars === wanted);
    // Laid out the same at every level (see buildDatabank), so the page count never changes with it.
    const book = (level: number) => buildDatabank(items, undefined, undefined, level);
    const pages = book(REFINE.maxLevel);
    const lowPages = book(1);
    if (wanted !== undefined && pages.length === 0) {
      await ctx.reply(TEXT.databank.noItemsInTier(starString(wanted)));
      return;
    }
    // The title and description of a single tier name that tier.
    const title = wanted === undefined ? TEXT.databank.title : TEXT.databank.tierTitle(starString(wanted));
    const description = (level: number) =>
      wanted === undefined ? TEXT.databank.description(level) : TEXT.databank.tierDescription(starString(wanted), level);

    // Usually one page. A long tier or the whole catalog becomes a book: Previous/Next buttons
    // flip between pages on the same message instead of dumping every page into the channel.
    const render = (index: number, on: boolean) => {
      const level = levelOf(on);
      const shown = on ? lowPages : pages;
      const titled = TEXT.databank.titleAt(title, level);
      const embed = createEmbed()
        .setTitle(pages.length > 1 ? TEXT.databank.titlePage(titled, index + 1, pages.length) : titled)
        .addFields(shown[index] ?? []);
      if (index === 0) embed.setDescription(description(level));
      if (index === pages.length - 1) embed.setFooter({ text: TEXT.databank.footer(p) });
      return { embeds: [embed] };
    };
    await paginate(ctx, pages.length, render, ctx.user.id, labels, DATABANK_BUTTONS.idleMs, 0, toggle);
  },
};
