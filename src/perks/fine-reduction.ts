import { definePerk } from './define.js';

/** Caught protection: part of the fine is waived when the wearer is caught robbing. Used in rob-formulas.ts robFine. */
export const fineReduction = definePerk({
  description: 'Percent of the fine waived when the wearer is caught robbing.',
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 },
  min: 0,
  max: 1,
  text: (value) => `-${value} fine when caught`,
});
