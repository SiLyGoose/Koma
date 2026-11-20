import { HOUR_MS } from '../constants/index.js';

export { HOUR_MS };

export function currentHour(now: number = Date.now()): number {
  return Math.floor(now / HOUR_MS);
}

/** Waits `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function nextHourUnix(hour: number): number {
  return ((hour + 1) * HOUR_MS) / 1000;
}
