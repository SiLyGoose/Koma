import { TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import type { PatchNotes } from '../lib/patch-notes.js';

/*
 * The patch notes post (`newsletter patch`): the version in the title, the admin's intro, then a
 * field for each section (Added, Changed, Fixed, Removed) that has something in it.
 */

/** `version` is without a leading "v" (lib/patch-notes.ts parseVersion). */
export function patchNotesEmbed(version: string, notes: PatchNotes): BotEmbed {
  const t = TEXT.newsletter;
  const embed = createEmbed().setTitle(t.patchTitle(version));
  if (notes.intro !== '') embed.setDescription(notes.intro);
  for (const { section, lines } of notes.sections) embed.addFields({ name: t.patchSections[section], value: lines.join('\n') });
  return embed;
}
