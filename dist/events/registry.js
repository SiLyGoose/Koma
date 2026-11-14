import { randomUnit } from '../lib/random.js';
import { codedle } from './games/codedle.js';
import { greedyHeist } from './games/greedy-heist.js';
import { pointCrate } from './games/point-crate.js';
import { splitOrSteal } from './games/split-or-steal.js';
/*
 * Every event the bot can run. To add one, write it (see GameEvent in types.ts) and add it here:
 * the scheduler, `events start` and the slash command's choices all read this list.
 */
export const GAME_EVENTS = [pointCrate, greedyHeist, splitOrSteal, codedle];
/** Discord shows at most this many choices for one slash option. */
const MAX_EVENTS = 25;
const ID_PATTERN = /^[a-z0-9-]+$/;
/** Throws if the list of events would break something: no events, a repeated or badly written id, a weight that is not a positive number. */
export function validateEvents(list = GAME_EVENTS) {
    const problems = [];
    if (list.length === 0)
        problems.push('there are no events');
    if (list.length > MAX_EVENTS)
        problems.push(`there are more than ${MAX_EVENTS} events (Discord's limit for a list of choices)`);
    const seen = new Set();
    for (const event of list) {
        if (!ID_PATTERN.test(event.id))
            problems.push(`the id "${event.id}" must be lower-case letters, numbers and dashes`);
        if (seen.has(event.id))
            problems.push(`the id "${event.id}" is used twice`);
        seen.add(event.id);
        if (event.label.trim() === '' || event.label.length > 100)
            problems.push(`"${event.id}" needs a label of 1 to 100 characters`);
        if (!(Number.isFinite(event.weight) && event.weight > 0))
            problems.push(`"${event.id}" needs a weight above 0`);
    }
    if (problems.length > 0)
        throw new Error(`Invalid GAME_EVENTS: ${problems.join('; ')}`);
}
/**
 * A random event, each one as likely as its weight compared with the others. `roll` is a number
 * from 0 up to but not including 1 (injectable so this can be tested).
 */
export function pickEvent(list = GAME_EVENTS, roll = randomUnit()) {
    const last = list[list.length - 1];
    if (!last)
        throw new Error('There are no events to pick from');
    const total = list.reduce((sum, event) => sum + event.weight, 0);
    const target = roll * total;
    let passed = 0;
    for (const event of list) {
        passed += event.weight;
        if (target < passed)
            return event;
    }
    return last;
}
/** The event whose id or label is `query`, ignoring case and spaces at the ends; undefined if none. */
export function findEvent(query, list = GAME_EVENTS) {
    const wanted = query.trim().toLowerCase();
    if (wanted === '')
        return undefined;
    return list.find((event) => event.id === wanted || event.label.toLowerCase() === wanted);
}
/** Each event with its share of the random picks, from 0 to 1 (the shares add up to 1). */
export function eventChances(list = GAME_EVENTS) {
    const total = list.reduce((sum, event) => sum + event.weight, 0);
    return list.map((event) => ({ event, chance: total > 0 ? event.weight / total : 0 }));
}
//# sourceMappingURL=registry.js.map