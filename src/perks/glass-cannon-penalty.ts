import { definePerk } from './define.js';

/** Glass cannon, risk half (see glass-cannon.ts). */
export const glassCannonPenalty = definePerk({
  description:
    'Glass cannon, risk: extra fine the wearer pays when caught robbing, as a percent of the normal fine (150% is 2.5x).',
  defaults: { 1: 0.75, 2: 1, 3: 1.25, 4: 1.5 },
  min: 0,
  max: 10,
  text: (value) => `Glass cannon: +${value} fine when caught`,
  modifies: { robFine: { factor: (s) => 1 + s } },
});
