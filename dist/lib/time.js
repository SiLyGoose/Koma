import { HOUR_MS } from '../constants/index.js';
export { HOUR_MS };
export function currentHour(now = Date.now()) {
    return Math.floor(now / HOUR_MS);
}
/** Waits `ms` milliseconds. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function nextHourUnix(hour) {
    return ((hour + 1) * HOUR_MS) / 1000;
}
//# sourceMappingURL=time.js.map