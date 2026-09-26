/**
 * Discord user ids of the members who own a signature item, by name. Use these in an item's
 * `usableBy` list (see data/items/catalog.ts) instead of pasting raw ids.
 */
export const MEMBERS = {
  aaron: '658356661240463380',
  allen: '391017642208526348',
  alvin: '137980346393165824',
  caitlyn: '659644281031622697',
  gene: '184130311620263936',
  harrison: '1014831847487840307',
  helen: '262072810422140929',
  jj: '570657734870171648',
  simon: '257214680823627777',
} as const;

export type MemberName = keyof typeof MEMBERS;
