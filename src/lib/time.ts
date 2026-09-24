import { HOUR_MS } from '../constants/index.js';

export { HOUR_MS };

export function currentHour(now: number = Date.now()): number {
  return Math.floor(now / HOUR_MS);
}

export function nextHourUnix(hour: number): number {
  return ((hour + 1) * HOUR_MS) / 1000;
}
