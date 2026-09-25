import { CONFIG } from '../../config.js';
import { DATABANK_ITEMS_PER_PAGE, FIELD_MAX_LENGTH, REFINE, SLOT_LABELS, STAR_SYMBOL, TEXT } from '../../constants/index.js';
import { STARS, type ItemDef, type Stars } from '../../types.js';
import { describeEffects } from './equipment.js';
import { formatPercent, mentionList, starString } from '../format.js';

/** One embed field of the databank. */
export interface DatabankField {
  name: string;
  value: string;
}

/**
 * The text for one item: its name and slot, then one line per effect at today's strength at a
 * refinement level (fully refined unless given), then who it is exclusive to when only some
 * members can use it.
 */
export function itemBlock(item: ItemDef, level: number = REFINE.maxLevel): string {
  const effects = describeEffects(item, 1, level);
  return [
    TEXT.databank.item(item.name, SLOT_LABELS[item.slot]),
    ...(effects.length > 0 ? effects : [TEXT.databank.noEffects]),
    ...(item.usableBy ? [TEXT.databank.exclusive(mentionList(item.usableBy))] : []),
  ].join('\n');
}

/**
 * Lays every item out for the databank as a flip-through book: one chapter per star tier
 * (highest first), each chapter split into pages of at most `itemsPerPage` items (never a fresh
 * field just to say "continued" — a tier that needs more than one page gets separate pages,
 * numbered in its own header). Pages from different tiers still share a page when there's room
 * (so a small catalog reads as one screen), but a page never shows more than `itemsPerPage`
 * items in total, and a tier's own page is never split once it's under the limit. Effect
 * strengths are read from the live settings, so the list always matches the game. Returns at
 * least one page unless there are no items at all.
 */
export function buildDatabank(
  items: readonly ItemDef[],
  itemsPerPage = DATABANK_ITEMS_PER_PAGE,
  maxField = FIELD_MAX_LENGTH,
  level: number = REFINE.maxLevel,
): DatabankField[][] {
  // Pages break by each item's longest text at any refinement level, so the book is laid out the
  // same whichever level is shown: flipping the level never moves an item to another page.
  const levels = Array.from({ length: REFINE.maxLevel }, (_, i) => i + 1);
  const widest = (item: ItemDef): number => Math.max(...levels.map((l) => itemBlock(item, l).slice(0, maxField).length));
  // Chapter by chapter: each tier's items chunked into fields of at most `itemsPerPage` items
  // (or fewer, if Discord's own field-length limit would be hit first).
  const chapters: { field: DatabankField; count: number }[][] = [];
  for (const stars of [...STARS].reverse()) {
    const tier = items.filter((item) => item.stars === stars);
    if (tier.length === 0) continue;

    const symbol = starString(stars);
    const chunks: { field: DatabankField; count: number }[] = [];
    let value = '';
    let size = 0;
    let count = 0;
    const flush = () => {
      if (value === '') return;
      chunks.push({ field: { name: '', value }, count });
      value = '';
      size = 0;
      count = 0;
    };
    for (const item of tier) {
      const block = itemBlock(item, level).slice(0, maxField);
      const width = widest(item);
      if (value !== '' && (count >= itemsPerPage || size + 2 + width > maxField)) flush();
      value = value === '' ? block : `${value}\n\n${block}`;
      size = size === 0 ? width : size + 2 + width;
      count += 1;
    }
    flush();

    // Only a tier that needed more than one page says which page of how many; a tier that fits
    // on one just shows its total count, same as before.
    for (const [i, chunk] of chunks.entries()) {
      chunk.field.name =
        chunks.length > 1 ? TEXT.databank.tierFieldPage(symbol, tier.length, i + 1, chunks.length) : TEXT.databank.tierField(symbol, tier.length);
    }
    chapters.push(chunks);
  }

  // Page by page: pack chunks in, never splitting one, never letting a page's item count go
  // over `itemsPerPage`.
  const pages: DatabankField[][] = [];
  let page: DatabankField[] = [];
  let pageCount = 0;
  for (const chunks of chapters) {
    for (const chunk of chunks) {
      if (page.length > 0 && pageCount + chunk.count > itemsPerPage) {
        pages.push(page);
        page = [];
        pageCount = 0;
      }
      page.push(chunk.field);
      pageCount += chunk.count;
    }
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** What `databank <something>` asked for, when it is a star tier rather than an item. */
export type StarQuery = { kind: 'tier'; stars: Stars } | { kind: 'bad_tier' };

/**
 * Reads a databank argument as a star tier: `3`, `3 star`, `3 stars`, `3-star`, `3star`, `3*`,
 * `star 3` or `stars 3` (any letter case), or that many star symbols (`★★★`). A number that isn't
 * one of the tiers is `bad_tier`. Anything else isn't a tier (null), so it is looked up as an item.
 */
export function parseStarQuery(query: string): StarQuery | null {
  const text = query.trim().toLowerCase();
  if (text === '') return null;

  let count: number | null = null;
  const symbols = STAR_SYMBOL.length > 0 ? text.split(STAR_SYMBOL).join('') : text;
  if (STAR_SYMBOL.length > 0 && symbols === '') {
    count = text.length / STAR_SYMBOL.length;
  } else {
    const match = /^(?:stars?\s*)?(\d+)(?:\s*-?\s*(?:stars?|\*))?$/.exec(text);
    if (match) count = Number(match[1]);
  }
  if (count === null) return null;
  return (STARS as readonly number[]).includes(count) ? { kind: 'tier', stars: count as Stars } : { kind: 'bad_tier' };
}

/** The full page of one item: what `databank <item>` shows. */
export interface ItemDetail {
  title: string;
  /** The item's flavor text. */
  description: string;
  fields: { name: string; value: string; inline: boolean }[];
}

/** Lays out one item in full: its name and stars, flavor text, slot, effects at today's strength at a refinement level (fully refined unless given), and who it is exclusive to. */
export function itemDetail(item: ItemDef, level: number = REFINE.maxLevel): ItemDetail {
  const effects = describeEffects(item, 1, level);
  return {
    title: TEXT.databank.detailTitle(starString(item.stars), item.name),
    description: item.description.trim() === '' ? '' : TEXT.gacha.description(item.description),
    fields: [
      { name: TEXT.databank.detailSlotField, value: SLOT_LABELS[item.slot], inline: true },
      { name: TEXT.databank.detailEffectsField(level), value: effects.length > 0 ? effects.join('\n') : TEXT.databank.noEffects, inline: false },
      ...(item.usableBy
        ? [{ name: TEXT.databank.detailExclusiveField, value: TEXT.databank.detailExclusive(mentionList(item.usableBy), formatPercent(CONFIG.equipment.borrowed.effectiveness)), inline: false }]
        : []),
    ],
  };
}
