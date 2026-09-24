import { CURRENCY_EMOJI } from '../core.js';

export const inventoryText = {
  emptySelf: (p: string) => `Your inventory is empty. Use \`${p}claim\` to earn ${CURRENCY_EMOJI}, then \`${p}gacha\` to pull items.`,
  emptyOther: (name: string) => `${name} has no items yet.`,
  title: (name: string) => `${name}'s inventory`,
  summary: (total: string, unique: number, catalogSize: number) =>
    `${total} items · ${unique}/${catalogSize} unique collected`,
  item: (name: string, count: number, slot: string) => `${name} ×${count} · ${slot}`,
  itemEquipped: (name: string, count: number, slot: string) => `${name} ×${count} · ${slot} · equipped`,
  /** `stars` is the star string; `have` of `total` items in that tier are owned. */
  tierField: (stars: string, have: number, total: number) => `${stars} (${have}/${total})`,
  tierEmpty: 'None yet',
  /** Items that were pulled once but have since been removed from the catalog. */
  otherField: 'Other',
  otherItem: (id: string, count: number) => `${id} ×${count}`,
};
