/*
 * Patch notes (`newsletter patch <version> <notes>`), read from what the bot admin writes: the
 * version, then the notes. Anything before the first section heading is the intro. A line that is
 * only a section's name ("Added", "changed:", "## Fixed", "**New**") starts that section, and the
 * lines under it are its changes. Nothing here talks to Discord.
 */

/** The sections patch notes can have, in the order they are shown. */
export const PATCH_SECTIONS = ['added', 'changed', 'fixed', 'removed'] as const;
export type PatchSection = (typeof PATCH_SECTIONS)[number];

/** Every word that starts a section (any letter case). */
const SECTION_WORDS: Readonly<Record<string, PatchSection>> = {
  added: 'added',
  add: 'added',
  new: 'added',
  changed: 'changed',
  change: 'changed',
  changes: 'changed',
  updated: 'changed',
  updates: 'changed',
  fixed: 'fixed',
  fix: 'fixed',
  fixes: 'fixed',
  removed: 'removed',
  remove: 'removed',
};

export interface PatchNotes {
  /** What comes before the first section, as written (line breaks kept); '' when there is none. */
  intro: string;
  /** The sections with something in them, in PATCH_SECTIONS order. A section written twice is one. */
  sections: { section: PatchSection; lines: string[] }[];
}

/**
 * The version the notes are for, as the admin typed it ("1.0", "v2.3.1", "1.4-beta"), without a
 * leading "v". Null when the word isn't a version (say, the notes were written without one).
 */
export function parseVersion(word: string | undefined): string | null {
  const match = /^v?(\d+(?:\.\d+){0,3}(?:-[a-z0-9]+)?)$/i.exec(word?.trim() ?? '');
  return match ? (match[1] as string) : null;
}

/** The section a line starts, or null when it is an ordinary line. */
export function sectionHeading(line: string): PatchSection | null {
  const word = line
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/[*_]/g, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
  return SECTION_WORDS[word] ?? null;
}

/** Reads the admin's patch notes. A change written as "- x", "* x" or "• x" is shown as "• x"; blank lines in a section are dropped. */
export function parsePatchNotes(text: string): PatchNotes {
  const intro: string[] = [];
  const found = new Map<PatchSection, string[]>();
  let current: PatchSection | null = null;
  for (const line of text.split('\n')) {
    const heading = sectionHeading(line);
    if (heading) {
      current = heading;
      if (!found.has(heading)) found.set(heading, []);
      continue;
    }
    if (current === null) {
      intro.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '') continue;
    found.get(current)?.push(trimmed.replace(/^[-*•]\s+/, '• '));
  }
  return {
    intro: intro.join('\n').trim(),
    sections: PATCH_SECTIONS.filter((section) => (found.get(section)?.length ?? 0) > 0).map((section) => ({ section, lines: found.get(section) ?? [] })),
  };
}
