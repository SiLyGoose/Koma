import { CURRENCY_EMOJI, ROB_STREAK_WINDOW_MS } from '../../constants/index.js';
import { definePerk } from '../define.js';
import type { EffectTotals } from '../registry.js';

/*
 * Thoccy Keyboard's perks. The streak: every successful rob the wearer has made in the last
 * ROB_STREAK_WINDOW_MS (6 hours), this one included, adds robStreak (10%) to what they take, up to
 * robStreakCap. A failed rob wipes the streak, and leaves the wearer vulnerable: the next successful
 * rob against them takes robVulnerable more, and the mark stays until that happens or they rob
 * someone successfully. The rules are carried out in services/economy/rob.ts.
 */

const windowHours = ROB_STREAK_WINDOW_MS / (60 * 60 * 1000);

/** How much more a rob takes for a streak of `count` successful robs (this one included), by the wearer's gear. */
export function streakRate(count: number, gear: Partial<EffectTotals>): number {
  const step = Math.max(0, gear.robStreak ?? 0);
  const cap = Math.max(0, gear.robStreakCap ?? 0);
  return count > 0 ? Math.min(cap, step * count) : 0;
}

export const robStreak = definePerk({
  description: `Hackermans (Thoccy Keyboard), streak: how much more ${CURRENCY_EMOJI} the wearer takes for each successful rob of theirs in the last ${windowHours} hours (this one included), up to robStreakCap. A failed rob starts it over.`,
  defaults: { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1 },
  min: 0,
  max: 10,
  atR1: 1,
  text: (value) => `Hackermans: +${value} ${CURRENCY_EMOJI} for each successful rob in the last ${windowHours} hours`,
});

export const robStreakCap = definePerk({
  description: 'Hackermans (Thoccy Keyboard), streak cap: the most the streak can add to a rob, at R5 (three fifths of it at R1).',
  defaults: { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 },
  min: 0,
  max: 10,
  atR1: 0.6,
  text: (value) => `Hackermans: the streak adds up to +${value}`,
});

export const robVulnerable = definePerk({
  description: `Hackermans (Thoccy Keyboard), vulnerable: after the wearer fails a rob, the next successful rob against them takes this much more ${CURRENCY_EMOJI}, at R5 (a third more at R1). It lasts until that happens or the wearer robs someone successfully.`,
  defaults: { 1: 0.15, 2: 0.15, 3: 0.15, 4: 0.15 },
  min: 0,
  max: 10,
  atR1: 4 / 3,
  text: (value) => `Hackermans: fail a rob and you're vulnerable: the next rob against you takes +${value}`,
});
