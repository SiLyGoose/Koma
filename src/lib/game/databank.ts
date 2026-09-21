import { DATABANK_PAGE_LENGTH, FIELD_MAX_LENGTH, SLOT_LABELS, STAR_SYMBOL, TEXT } from '../../constants.js';
import { STARS, type ItemDef, type Stars } from '../../types.js';
import { describeEffects } from './equipment.js';
import { mentionList, starString } from '../format.js';

/** One embed field of the databank. */
export interface DatabankField {
  name: string;
  value: string;
}

/** Discord allows at most 25 fields in an embed. */
const MAX_FIELDS_PER_PAGE = 25;

/**
 * The text for one item: its name and slot, then one line per effect at today's strength, then
 * who it is exclusive to when only some members can use it.
 */
export function itemBlock(item: ItemDef): string {
  const effects = describeEffects(item);
  return [
    TEXT.databank.item(item.name, SLOT_LABELS[item.slot]),
    ...(effects.length > 0 ? effects : [TEXT.databank.noEffects]),
    ...(item.usableBy ? [TEXT.databank.exclusive(mentionList(item.usableBy))] : []),
  ].join('\n');
}

/**
 * Lays every item out for the databank: one group per star tier (highest first), each split
 * into fields that fit Discord's field limit, then packed into pages that fit one message.
 * Effect strengths are read from the live settings, so the list always matches the game.
 * Returns at least one page unless there are no items at all.
 */
export function buildDatabank(
  items: readonly ItemDef[],
  maxField = FIELD_MAX_LENGTH,
  maxPage = DATABANK_PAGE_LENGTH,
): DatabankField[][] {
  const fields: DatabankField[] = [];

  for (const stars of [...STARS].reverse()) {
    const tier = items.filter((item) => item.stars === stars);
    if (tier.length === 0) continue;

    const symbol = starString(stars);
    let value = '';
    let first = true;
    const flush = () => {
      if (value === '') return;
      fields.push({ name: first ? TEXT.databank.tierField(symbol, tier.length) : TEXT.databank.tierMore(symbol), value });
      first = false;
      value = '';
    };
    for (const item of tier) {
      const block = itemBlock(item).slice(0, maxField);
      if (value !== '' && value.length + 2 + block.length > maxField) flush();
      value = value === '' ? block : `${value}\n\n${block}`;
    }
    flush();
  }

  const pages: DatabankField[][] = [];
  let page: DatabankField[] = [];
  let length = 0;
  for (const field of fields) {
    const size = field.name.length + field.value.length;
    if (page.length > 0 && (length + size > maxPage || page.length >= MAX_FIELDS_PER_PAGE)) {
      pages.push(page);
      page = [];
      length = 0;
    }
    page.push(field);
    length += size;
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

/** Lays out one item in full: its name and stars, flavor text, slot, effects at today's strength, and who it is exclusive to. */
export function itemDetail(item: ItemDef): ItemDetail {
  const effects = describeEffects(item);
  return {
    title: TEXT.databank.detailTitle(starString(item.stars), item.name),
    description: item.description.trim() === '' ? '' : TEXT.gacha.description(item.description),
    fields: [
      { name: TEXT.databank.detailSlotField, value: SLOT_LABELS[item.slot], inline: true },
      { name: TEXT.databank.detailEffectsField, value: effects.length > 0 ? effects.join('\n') : TEXT.databank.noEffects, inline: false },
      ...(item.usableBy
        ? [{ name: TEXT.databank.detailExclusiveField, value: TEXT.databank.detailExclusive(mentionList(item.usableBy)), inline: false }]
        : []),
    ],
  };
}
