import { TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import type { PatchNotes } from '../lib/patch-notes.js';

/*
 * The patch notes post (`newsletter patch`): the admin's intro, then a field for each section
 * (Added, Changed, Fixed, Removed) that has something in it.
 */

export function patchNotesEmbed(notes: PatchNotes): BotEmbed {
  const t = TEXT.newsletter;
  const embed = createEmbed().setTitle(t.patchTitle);
  if (notes.intro !== '') embed.setDescription(notes.intro);
  for (const { section, lines } of notes.sections) embed.addFields({ name: t.patchSections[section], value: lines.join('\n') });
  return embed;
}
