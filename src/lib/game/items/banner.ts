import { zonedTime } from '../../events/raid-week.js';

/*
 * When the limited banner (data/items/banner.ts) is open: between the settings' gacha.limited.start
 * and gacha.limited.end, each a date ("2026-10-31") or a date and time ("2026-10-31 18:00") on the
 * Eastern clock, or "off".
 */

/** What a banner time setting has to look like (the settings check it's a real date as well). */
export const BANNER_TIME_PATTERN = /^(off|\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?)$/;

/** The instant a banner time setting means: null for "off", NaN for a date there isn't (the 31st of a 30-day month). */
export function bannerTime(text: string): number | null {
  if (text === 'off') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(text);
  if (!match) return Number.NaN;
  const [year, month, day, hour, minute] = match.slice(1).map((part) => Number(part ?? 0)) as [number, number, number, number, number];
  // Date.UTC rolls a date that doesn't exist over into the next month, so reading it back catches it.
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const real = check.getUTCMonth() === month - 1 && check.getUTCDate() === day && check.getUTCHours() === hour && check.getUTCMinutes() === minute;
  return real ? zonedTime(year, month, day, hour, minute) : Number.NaN;
}

export interface BannerWindow {
  /** Whether pulls can be made on it now. */
  open: boolean;
  /** When it opens and closes (ms), or null where the setting is off. */
  start: number | null;
  end: number | null;
}

/**
 * Where the limited banner stands at `now`, from its settings (CONFIG.gacha.limited): closed with no
 * start, open from its start until its end (for good with no end).
 */
export function limitedWindow(settings: { start: string; end: string }, now: number = Date.now()): BannerWindow {
  const start = bannerTime(settings.start);
  const end = bannerTime(settings.end);
  const open = start !== null && now >= start && (end === null || now < end);
  return { open, start, end };
}
