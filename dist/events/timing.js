import { MINUTE_MS } from '../constants/index.js';
import { randInt } from '../lib/random.js';
export function decideTick(now, nextAt, staleMs) {
    if (nextAt === null)
        return 'schedule';
    if (now < nextAt)
        return 'wait';
    if (now - nextAt > staleMs)
        return 'skip';
    return 'fire';
}
/** How long to wait until the next event: a random whole number of minutes from `minMinutes` to `maxMinutes`, in milliseconds. */
export function randomGapMs(minMinutes, maxMinutes, rand = randInt) {
    if (!Number.isInteger(minMinutes) || !Number.isInteger(maxMinutes) || minMinutes < 1 || maxMinutes < minMinutes) {
        throw new Error(`The time between events needs two whole numbers of minutes, 1 or more, in order (got ${minMinutes} and ${maxMinutes})`);
    }
    return rand(minMinutes, maxMinutes) * MINUTE_MS;
}
//# sourceMappingURL=timing.js.map