import { RAID_TIME_ZONE } from '../../constants/index.js';

/*
 * The raid's week: each server gets one raid per week, and the week starts every Saturday at
 * midnight in RAID_TIME_ZONE (so 00:00 Eastern, whether that is EST or EDT at the time).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock date and weekday (0 is Sunday) in `timeZone` at the instant `ms`. */
function zonedParts(ms: number, timeZone: string): { year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** How far `timeZone`'s clock is ahead of UTC at the instant `ms`, in milliseconds (negative for Eastern). */
function zoneOffset(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/** The instant it is midnight at the start of this calendar date in `timeZone`. */
function zonedMidnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day);
  // Midnight is never inside a daylight saving jump in the US (those happen at 2am), so one correction is exact.
  return guess - zoneOffset(guess - zoneOffset(guess, timeZone), timeZone);
}

export interface RaidWeek {
  /** The Saturday the week starts on, as YYYY-MM-DD. Stored with the raid, so each week has one. */
  key: string;
  /** When the week started. */
  start: Date;
  /** When the next week starts (the next raid can be started from then). */
  next: Date;
}

/** The raid week that `now` falls in. */
export function raidWeek(now: Date = new Date(), timeZone: string = RAID_TIME_ZONE): RaidWeek {
  const today = zonedParts(now.getTime(), timeZone);
  const back = (today.weekday - 6 + 7) % 7; // days since Saturday
  const saturday = new Date(Date.UTC(today.year, today.month - 1, today.day) - back * DAY_MS);
  const nextSaturday = new Date(saturday.getTime() + 7 * DAY_MS);
  const ymd = (d: Date): [number, number, number] => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  return {
    key: saturday.toISOString().slice(0, 10),
    start: new Date(zonedMidnight(...ymd(saturday), timeZone)),
    next: new Date(zonedMidnight(...ymd(nextSaturday), timeZone)),
  };
}
