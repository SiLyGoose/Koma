import { FIELD_MAX_LENGTH, TEXT } from '../constants.js';

/** One settings group's raw content before it's laid out as a page. */
export interface ConfigGroup {
  name: string;
  lines: string[];
}

/** One embed field of the settings list. */
export interface ConfigField {
  name: string;
  value: string;
}

/**
 * Lays the settings list out as a flip-through book, one page per group -- so flipping pages
 * means moving from one group (General, Claim, Gacha, ...) to the next, not scrolling one giant
 * embed. A group only spans more than one page when its own combined text is longer than
 * `maxField` (Discord's ~1000-character field-value limit): then it's split into its own
 * numbered run of pages, one field each, never splitting a single settings line unless that line
 * alone is over the limit (mirrors `buildDatabank`'s per-item length guard). Returns at least one
 * page unless every group is empty.
 */
export function buildConfigPages(groups: readonly ConfigGroup[], maxField = FIELD_MAX_LENGTH): ConfigField[][] {
  const pages: ConfigField[][] = [];
  for (const group of groups) {
    const text = group.lines.join('\n');
    if (text === '') continue;

    if (text.length <= maxField) {
      pages.push([{ name: group.name, value: text }]);
      continue;
    }

    // Oversized group: its own run of numbered pages, one field per page, never splitting a
    // single line unless that line alone is over the limit.
    const chunks: string[] = [];
    let value = '';
    for (const line of group.lines) {
      const piece = line.slice(0, maxField);
      if (value !== '' && value.length + 1 + piece.length > maxField) {
        chunks.push(value);
        value = '';
      }
      value = value === '' ? piece : `${value}\n${piece}`;
    }
    if (value !== '') chunks.push(value);

    for (const [i, chunkValue] of chunks.entries()) {
      pages.push([{ name: TEXT.config.groupFieldPage(group.name, i + 1, chunks.length), value: chunkValue }]);
    }
  }
  return pages;
}
