import { CURRENCY_EMOJI } from '../../core.js';
import { levelTag } from './refine.js';
export const inventoryText = {
    emptySelf: (p) => `Your inventory is empty. Use \`${p}claim\` to earn ${CURRENCY_EMOJI}, then \`${p}gacha\` to pull items.`,
    emptyOther: (name) => `${name} has no items yet.`,
    title: (name) => `${name}'s inventory`,
    /** The title of one category (`inventory armor`). `category` is its name, like "Armor". */
    categoryTitle: (title, category) => `${title} · ${category}`,
    summary: (total, unique, catalogSize) => `${total} items · ${unique}/${catalogSize} unique collected`,
    /**
     * One line of alike copies: `slot` is the slot's emoji, followed by a padlock when they're `locked`; `level` is their
     * refinement (a hero's gear, `hero`: its stars), shown once it is past 1.
     */
    item: (name, count, slot, level, locked = false, hero = false) => `${slot}${locked ? ' 🔒' : ''} ${name} ×${count}${level > 1 ? ` · ${levelTag(level, hero)}` : ''}`,
    itemEquipped: (name, count, slot, level, locked = false, hero = false) => `${slot}${locked ? ' 🔒' : ''} ${name} ×${count}${level > 1 ? ` · ${levelTag(level, hero)}` : ''} · equipped`,
    /** `stars` is the star string; `have` of `total` items in that tier are owned. */
    tierField: (stars, have, total) => `${stars} (${have}/${total})`,
    tierEmpty: 'None yet',
    /** Items that were pulled once but have since been removed from the catalog. */
    otherField: 'Other',
    otherItem: (id, count) => `${id} ×${count}`,
};
//# sourceMappingURL=inventory.js.map