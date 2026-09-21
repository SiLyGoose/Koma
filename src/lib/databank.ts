import { DATABANK_PAGE_LENGTH, FIELD_MAX_LENGTH, SLOT_LABELS, TEXT } from '../constants.js';
import { STARS, type ItemDef } from '../types.js';
import { describeEffects } from './equipment.js';
import { mentionList, starString } from './format.js';

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
