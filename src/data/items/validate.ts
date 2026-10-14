import { PITY_STARS, REFINE } from '../../constants/index.js';
import { normalize } from '../../lib/text.js';
import { EFFECTS } from '../../perks/index.js';
import { SLOTS, STARS } from '../../types.js';
import { LIMITED_BANNER } from './banner.js';
import { ITEMS } from './catalog.js';
import { gachaItems, ITEMS_BY_ID } from './lookup.js';

/** Throws at startup if the catalog would break the gacha or the equipment system. */
export function validateItems(): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const item of ITEMS) {
    if (ids.has(item.id)) throw new Error(`Duplicate item id in catalog: ${item.id}`);
    ids.add(item.id);

    const name = normalize(item.name);
    if (names.has(name)) throw new Error(`Two items share the name "${item.name}", so it could not be equipped by name.`);
    names.add(name);

    if (!SLOTS.includes(item.slot)) throw new Error(`${item.id} has an unknown slot: ${item.slot}`);
    if (item.usableBy !== undefined) {
      if (item.usableBy.length === 0) throw new Error(`${item.id} has an empty usableBy list, so nobody could use it. Remove it or add ids.`);
      for (const userId of item.usableBy) {
        if (!/^\d{17,20}$/.test(userId)) throw new Error(`${item.id} has a usableBy entry that is not a Discord user id: "${userId}"`);
      }
    }
    for (const effect of item.effects) {
      if (!(effect in EFFECTS)) throw new Error(`${item.id} has an unknown effect: ${effect}`);
    }
    if (item.limited && item.raidDrop) throw new Error(`${item.id} is both a limited item and a raid drop`);
    if (item.tmDrop && (item.raidDrop || item.limited)) throw new Error(`${item.id} is TechnoMagic gear and a raid drop or limited item too: it can only come from one place`);
    if (item.tmDrop && item.usableBy) throw new Error(`${item.id} is TechnoMagic gear made for a member, but only heroes wear it`);
    if (item.tmDrop && item.stars !== 4) throw new Error(`${item.id} is TechnoMagic gear that isn't counted as 4-star: it is a tier of its own above 4 stars, and costs what 4-star gear does to refine and sell`);
    if (item.tmDrop && !item.tmSet) throw new Error(`${item.id} is TechnoMagic gear of no set: every piece belongs to the set of the raid that drops it`);
    if (item.tmSet && !item.tmDrop) throw new Error(`${item.id} is in a TechnoMagic set, but isn't TechnoMagic gear`);
    if (item.tmDrop && !item.effects.every((effect) => effect.startsWith('tm'))) throw new Error(`${item.id} is TechnoMagic gear with a perk that isn't the TechnoMagic Raid's (perks/technomagic/)`);
    if (item.tmDrop && !item.class) throw new Error(`${item.id} is TechnoMagic gear for no class: every piece the TechnoMagic Raid drops is a class item`);
    if (item.bonus) {
      const { level, text, adds = [], removes = [] } = item.bonus;
      if (item.stars !== 4) throw new Error(`${item.id} has a refine bonus, but only 4-star items can have one`);
      if (level !== REFINE.maxLevel) throw new Error(`${item.id}'s refine bonus must be at R${REFINE.maxLevel}`);
      if ((typeof text === 'string' ? text : text(() => 0, () => '0%')).trim() === '') throw new Error(`${item.id}'s refine bonus has no text`);
      if (adds.length + removes.length === 0) throw new Error(`${item.id}'s refine bonus neither adds nor removes a perk`);
      for (const effect of adds) {
        if (!(effect in EFFECTS)) throw new Error(`${item.id}'s refine bonus adds an unknown effect: ${effect}`);
        if (item.effects.includes(effect)) throw new Error(`${item.id}'s refine bonus adds ${effect}, which the item already has`);
      }
      for (const effect of removes) {
        if (!item.effects.includes(effect)) throw new Error(`${item.id}'s refine bonus removes ${effect}, which the item doesn't have`);
      }
    }
  }
  if (new Set(LIMITED_BANNER.featured).size !== LIMITED_BANNER.featured.length) throw new Error('The limited banner features an item twice');
  for (const id of LIMITED_BANNER.featured) {
    const item = ITEMS_BY_ID.get(id);
    if (!item) throw new Error(`The limited banner features an unknown item: ${id}`);
    if (!item.limited) throw new Error(`The limited banner features ${id}, which isn't marked limited, so the standard banner gives it too`);
    if (item.stars !== PITY_STARS) throw new Error(`The limited banner features ${id}, which isn't a ${PITY_STARS}-star item`);
  }
  for (const stars of STARS) {
    if (gachaItems(stars).length === 0) {
      throw new Error(`The ${stars}-star tier has no items the gacha can pull (raid drops and limited items don't count), so it could never be rolled.`);
    }
  }
}
