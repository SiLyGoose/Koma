import { DATABANK_BUTTONS, REFINE, SLOT_LABELS, TEXT } from '../constants/index.js';
import { ITEMS, findItem } from '../data/items.js';
import { STARS } from '../types.js';
import { createEmbed } from '../lib/embed.js';
import { buildDatabank, itemDetail, parseStarQuery } from '../lib/game/items/databank.js';
import { takeSlot } from '../lib/game/items/slot-filter.js';
import { starString } from '../lib/format.js';
import { paginate, TOGGLE_ID, type PaginateToggle } from '../discord/paginate.js';
import type { ItemDef } from '../types.js';
import type { Command } from '../discord/types.js';

export const databank: Command = {
  name: 'databank',
  category: 'items',
  aliases: ['items', 'db'],
  description: 'See every item and what it does. Add an item name or id to see just that one, a star tier (1-4), a category (weapon, armor, treasure), or both.',
  usage: 'databank [item | stars] [category]',
  slashUsage: 'databank [item] [stars] [category]',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    // Every view starts at the listed (fully refined) strengths without masterwork bonuses. One button
    // flips to a new copy's (R1) strengths and back; another, where an item shown has a masterwork
    // bonus, turns the bonuses on (only at R5, where they exist).
    const levelOf = (flags: readonly boolean[]): number => (flags[0] ? 1 : REFINE.maxLevel);
    const masterworkOf = (flags: readonly boolean[]): boolean => (flags[1] ?? false) && !flags[0];
    const togglesFor = (shown: readonly ItemDef[]): PaginateToggle[] => [
      { id: TOGGLE_ID, label: (flags) => TEXT.databank.showLevel(flags[0] ? REFINE.maxLevel : 1) },
      ...(shown.some((item) => item.bonus)
        ? [{ id: DATABANK_BUTTONS.masterworkId, label: (flags: readonly boolean[]) => TEXT.databank.masterworkButton(!flags[1]), disabled: (flags: readonly boolean[]) => flags[0] ?? false }]
        : []),
    ];
    const labels = { previous: TEXT.databank.previousButton, next: TEXT.databank.nextButton, notYours: TEXT.databank.notYours };

    // A category (`weapon`, `armor`, `treasure`) only counts alone or next to a star tier; with
    // other words, they are all an item's name.
    const taken = takeSlot(args);
    const takenRest = taken.rest.join(' ').trim();
    const slot = taken.slot !== null && (takenRest === '' || parseStarQuery(takenRest) !== null) ? taken.slot : null;
    const query = (slot === null ? args.join(' ') : takenRest).trim();

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
      const renderDetail = (_index: number, flags: readonly boolean[]) => {
        const detail = itemDetail(item, levelOf(flags), masterworkOf(flags));
        const embed = createEmbed().setTitle(detail.title).addFields(detail.fields).setFooter({ text: TEXT.databank.detailFooter(p) });
        if (detail.description !== '') embed.setDescription(detail.description);
        return { embeds: [embed] };
      };
      await paginate(ctx, 1, renderDetail, ctx.user.id, labels, DATABANK_BUTTONS.idleMs, 0, togglesFor([item]));
      return;
    }

    const items = ITEMS.filter((item) => (wanted === undefined || item.stars === wanted) && (slot === null || item.slot === slot));
    // Laid out the same at every level (see buildDatabank), so the page count never changes with it.
    const book = (level: number, masterwork = false) => buildDatabank(items, undefined, undefined, level, masterwork);
    const pages = book(REFINE.maxLevel);
    const lowPages = book(1);
    const masterworkPages = book(REFINE.maxLevel, true);
    if (pages.length === 0) {
      await ctx.reply(
        slot === null ? TEXT.databank.noItemsInTier(starString(wanted ?? 1)) : TEXT.databank.noItemsInCategory(SLOT_LABELS[slot], wanted === undefined ? null : starString(wanted)),
      );
      return;
    }
    // The title and description of a single tier or category name it.
    const tierTitle = wanted === undefined ? TEXT.databank.title : TEXT.databank.tierTitle(starString(wanted));
    const title = slot === null ? tierTitle : TEXT.databank.categoryTitle(tierTitle, SLOT_LABELS[slot]);
    const description = (level: number) =>
      slot !== null
        ? TEXT.databank.categoryDescription(SLOT_LABELS[slot], wanted === undefined ? null : starString(wanted), level)
        : wanted === undefined
          ? TEXT.databank.description(level)
          : TEXT.databank.tierDescription(starString(wanted), level);

    // Usually one page. A long tier or the whole catalog becomes a book: Previous/Next buttons
    // flip between pages on the same message instead of dumping every page into the channel.
    const render = (index: number, flags: readonly boolean[]) => {
      const level = levelOf(flags);
      const masterwork = masterworkOf(flags);
      const shown = level === 1 ? lowPages : masterwork ? masterworkPages : pages;
      const titled = TEXT.databank.titleAt(title, level, masterwork);
      const embed = createEmbed()
        .setTitle(pages.length > 1 ? TEXT.databank.titlePage(titled, index + 1, pages.length) : titled)
        .addFields(shown[index] ?? []);
      if (index === 0) embed.setDescription(description(level));
      if (index === pages.length - 1) embed.setFooter({ text: TEXT.databank.footer(p) });
      return { embeds: [embed] };
    };
    await paginate(ctx, pages.length, render, ctx.user.id, labels, DATABANK_BUTTONS.idleMs, 0, togglesFor(items));
  },
};
