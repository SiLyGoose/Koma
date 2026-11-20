/**
 * Discord user ids of the members who own a signature item, by name. Use these in an item's
 * `usableBy` list (see data/items/catalog.ts) instead of pasting raw ids.
 */
export const MEMBERS = {
  PINNFY: '658356661240463380',
  FAKER: '391017642208526348',
  INU: '137980346393165824',
  POTATO: '659644281031622697',
  GENE: '184130311620263936',
  NOVA: '1014831847487840307',
  HXLON: '262072810422140929',
  MANJAMIN: '570657734870171648',
  LVMYMP5K: '177216253587488770',
  ZEIU: '257214680823627777',
  LUNAEA: '257061151542607872',
} as const;

export type MemberName = keyof typeof MEMBERS;
