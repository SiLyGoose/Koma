import { DATABANK_BUTTONS, RAID_BOSS_IDS, RAID_CLASS_IDS, REFINE, SLOT_LABELS, TEXT, type RaidBossId, type RaidClassId } from '../constants/index.js';
import { CONFIG } from '../config.js';
import { ITEMS } from '../data/items.js';
import { STARS } from '../types.js';
import { createEmbed } from '../lib/embed.js';
import { buildDatabank, itemBlock, itemDetail, parseStarQuery } from '../lib/game/items/databank.js';
import { classTraits } from '../lib/game/raid-classes.js';
import { takeSlot } from '../lib/game/items/slot-filter.js';
import { starString } from '../lib/format.js';
import { paginate, TOGGLE_ID, type PaginateToggle } from '../discord/paginate.js';
import type { Command, CommandContext } from '../discord/types.js';
import { resolveItem } from '../discord/item-pick.js';
import { bossByName, bossFile, bossInfoEmbed } from './raid.js';
import { bossForWeek } from '../lib/events/raid-boss.js';
import { raidWeek } from '../lib/events/raid-week.js';

/** The first word that turns the databank to the raid bosses (`databank bosses`). */
const BOSS_WORDS = ['boss', 'bosses'];

/** The first word that turns the databank to the raid classes (`databank classes`). */
const CLASS_WORDS = ['class', 'classes'];

/** The raid class a word names: its id, or its name, whatever the case. */
const classByName = (word: string): RaidClassId | undefined => {
  const wanted = word.trim().toLowerCase();
  return RAID_CLASS_IDS.find((id) => id === wanted || TEXT.raid.classes[id].name.toLowerCase() === wanted);
};

const labels = () => ({ previous: TEXT.databank.previousButton, next: TEXT.databank.nextButton, notYours: TEXT.databank.notYours });

/**
 * `databank bosses [name]`: every raid boss, one page each with its picture, as `raid stats` shows
 * it. Opens on the boss named, if one is; this week's boss in this server says so.
 */
async function bossBook(ctx: CommandContext, name: string): Promise<void> {
  let start = 0;
  if (name !== '') {
    const boss = bossByName(name);
    if (!boss) {
      await ctx.reply(TEXT.databank.noSuchBoss(ctx.prefix, name, TEXT.raid.andList(RAID_BOSS_IDS.map((id) => `**${TEXT.raid.bosses[id].name}**`))));
      return;
    }
    start = RAID_BOSS_IDS.indexOf(boss);
  }
  const week = raidWeek();
  const current = bossForWeek(ctx.guildId, week.key);
  const render = (index: number) => {
    const boss = RAID_BOSS_IDS[index] as RaidBossId;
    const embed = bossInfoEmbed(CONFIG.raid, boss, boss === current ? week.next : undefined);
    if (RAID_BOSS_IDS.length > 1) embed.setTitle(TEXT.databank.titlePage(TEXT.raid.bossTitle(TEXT.raid.bosses[boss]), index + 1, RAID_BOSS_IDS.length));
    return { embeds: [embed], files: [bossFile(boss, 'calm')] };
  };
  await paginate(ctx, RAID_BOSS_IDS.length, render, ctx.user.id, labels(), DATABANK_BUTTONS.idleMs, start);
}

/** One raid class's page: what it does in a fight, and its class items with what each does fully refined (the raiders', not the TechnoMagic gear only heroes wear). */
export function classEmbed(id: RaidClassId) {
  const t = TEXT.databank;
  const items = ITEMS.filter((item) => item.class === id && !item.tmDrop);
  return createEmbed()
    .setTitle(TEXT.raid.classLabel(id))
    .setDescription(classTraits(id).join('\n'))
    .addFields({ name: t.classItemsField, value: items.length === 0 ? t.classNoItems : items.map((item) => itemBlock(item)).join('\n\n') });
}

/**
 * `databank classes [name]`: every raid class, one page each: what it does in a fight (only what isn't
 * as for a raider without a class) and its class items. Opens on the class named, if one is.
 */
async function classBook(ctx: CommandContext, name: string): Promise<void> {
  let start = 0;
  if (name !== '') {
    const id = classByName(name);
    if (!id) {
      await ctx.reply(TEXT.databank.noSuchClass(ctx.prefix, name, TEXT.raid.andList(RAID_CLASS_IDS.map((cls) => `${TEXT.raid.classes[cls].emoji} **${TEXT.raid.classes[cls].name}**`))));
      return;
    }
    start = RAID_CLASS_IDS.indexOf(id);
  }
  const render = (index: number) => {
    const id = RAID_CLASS_IDS[index] as RaidClassId;
    const embed = classEmbed(id).setFooter({ text: TEXT.databank.classFooter(ctx.prefix) });
    if (RAID_CLASS_IDS.length > 1) embed.setTitle(TEXT.databank.titlePage(TEXT.raid.classLabel(id), index + 1, RAID_CLASS_IDS.length));
    return { embeds: [embed] };
  };
  await paginate(ctx, RAID_CLASS_IDS.length, render, ctx.user.id, labels(), DATABANK_BUTTONS.idleMs, start);
}

export const databank: Command = {
  name: 'databank',
  category: 'items',
  aliases: ['items', 'db'],
  description:
    'See every item and what it does. Add an item name or id to see just that one, a star tier (1-4), a category (weapon, armor, treasure), or both. `databank bosses` shows the Weekly Bosses instead, and `databank classes` the raid classes (or just the name of one, like `databank knight`).',
  usage: 'databank [item | stars] [category]  or  databank bosses [boss]  or  databank classes [class]',
  slashUsage: 'databank [item] [stars] [category] [boss]',

  async execute(ctx) {
    const { args } = ctx;
    const p = ctx.prefix;
    if (args[0] !== undefined && BOSS_WORDS.includes(args[0].toLowerCase())) {
      await bossBook(ctx, args.slice(1).join(' ').trim());
      return;
    }
    // The raid classes: `databank classes`, `databank class knight`, or a class's name by itself.
    if (args[0] !== undefined && CLASS_WORDS.includes(args[0].toLowerCase())) {
      await classBook(ctx, args.slice(1).join(' ').trim());
      return;
    }
    if (args.length === 1 && classByName(args[0] ?? '')) {
      await classBook(ctx, args[0] ?? '');
      return;
    }
    // Every view starts at the listed (fully refined) strengths. A button flips to a new copy's (R1)
    // strengths and back.
    const levelOf = (flags: readonly boolean[]): number => (flags[0] ? 1 : REFINE.maxLevel);
    const toggles: PaginateToggle[] = [{ id: TOGGLE_ID, label: (flags) => TEXT.databank.showLevel(flags[0] ? REFINE.maxLevel : 1) }];

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
      const pick = await resolveItem(ctx, query, { ambiguous: TEXT.databank.ambiguous, noSuchItem: TEXT.databank.noSuchItem(p, query) });
      if (!pick) return;
      const { item } = pick;
      const renderDetail = (_index: number, flags: readonly boolean[]) => {
        const detail = itemDetail(item, levelOf(flags));
        const embed = createEmbed().setTitle(detail.title).addFields(detail.fields).setFooter({ text: TEXT.databank.detailFooter(p) });
        if (detail.description !== '') embed.setDescription(detail.description);
        return { embeds: [embed] };
      };
      // After a "Did you mean...?", the item shows on that question's message.
      await paginate(pick.ctx, 1, renderDetail, ctx.user.id, labels(), DATABANK_BUTTONS.idleMs, 0, toggles);
      return;
    }

    const items = ITEMS.filter((item) => (wanted === undefined || item.stars === wanted) && (slot === null || item.slot === slot));
    // Laid out the same at every level (see buildDatabank), so the page count never changes with it.
    const book = (level: number) => buildDatabank(items, undefined, undefined, level);
    const pages = book(REFINE.maxLevel);
    const lowPages = book(1);
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
      const shown = level === 1 ? lowPages : pages;
      const titled = TEXT.databank.titleAt(title, level);
      const embed = createEmbed()
        .setTitle(pages.length > 1 ? TEXT.databank.titlePage(titled, index + 1, pages.length) : titled)
        .addFields(shown[index] ?? []);
      if (index === 0) embed.setDescription(description(level));
      if (index === pages.length - 1) embed.setFooter({ text: TEXT.databank.footer(p) });
      return { embeds: [embed] };
    };
    await paginate(ctx, pages.length, render, ctx.user.id, labels(), DATABANK_BUTTONS.idleMs, 0, toggles);
  },
};
