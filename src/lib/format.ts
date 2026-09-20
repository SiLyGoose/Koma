import { FIELD_MAX_LENGTH, NUMBER_LOCALE, PERCENT_DECIMALS, STAR_SYMBOL, TEXT } from '../constants.js';

export const fmt = (n: number): string => n.toLocaleString(NUMBER_LOCALE);

export const starString = (stars: number): string => STAR_SYMBOL.repeat(stars);

/** Joins lines with newlines, cutting off with "...and N more" so it fits an embed field. */
export function joinLimited(lines: string[], maxLength = FIELD_MAX_LENGTH): string {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : (lines[i] as string);
    if (next.length > maxLength) {
      return `${out}\n${TEXT.common.moreLines(lines.length - i)}`;
    }
    out = next;
  }
  return out;
}

/** 0.1 -> "10%", 0.125 -> "12.5%". */
export const formatPercent = (fraction: number): string => `${Number((fraction * 100).toFixed(PERCENT_DECIMALS))}%`;
