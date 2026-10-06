import { isAdmin } from '../config.js';
import { FIELD_MAX_LENGTH, NEWSLETTER, TEXT } from '../constants/index.js';
import { askToConfirm } from '../discord/confirm.js';
import type { Command, CommandContext } from '../discord/types.js';
import { createEmbed } from '../lib/embed.js';
import { parsePatchNotes } from '../lib/patch-notes.js';
import { patchNotesEmbed } from '../newsletter/patch-notes.js';
import { broadcastPatchNotes, previewDigest } from '../newsletter/send.js';
import { listNewsletterGuilds } from '../services/newsletter.js';

/*
 * The newsletter, for the bot admin (src/newsletter): see what this server's weekly digest looks
 * like so far, or send patch notes (what's been added, changed, fixed or removed) to every server's
 * newsletter channel. Prefix only (SLASH_EXCLUDED): patch notes keep their line breaks, which a
 * slash command's options can't hold.
 */

/** The command's free text after its first `skip` words, line breaks kept (a slash command only has the words). */
function textAfter(ctx: CommandContext, skip: number): string {
  if (ctx.text === undefined) return ctx.args.slice(skip).join(' ');
  return ctx.text.replace(new RegExp(`^(?:\\S+\\s*){${skip}}`), '').trim();
}

async function preview(ctx: CommandContext): Promise<void> {
  const digest = await previewDigest(ctx.guildId);
  await ctx.reply({ ...digest, allowedMentions: { parse: [] } });
}

async function patch(ctx: CommandContext): Promise<void> {
  const t = TEXT.newsletter;
  const notes = textAfter(ctx, 1);
  if (notes === '') {
    await ctx.reply(t.patchEmpty(ctx.prefix));
    return;
  }
  if (notes.length > NEWSLETTER.maxPatchLength) {
    await ctx.reply(t.patchTooLong(NEWSLETTER.maxPatchLength));
    return;
  }
  const parsed = parsePatchNotes(notes);
  // Only headings, with nothing under them.
  if (parsed.intro === '' && parsed.sections.length === 0) {
    await ctx.reply(t.patchEmpty(ctx.prefix));
    return;
  }
  // Each section is an embed field, which holds less than the whole post.
  const tooLong = parsed.sections.find(({ lines }) => lines.join('\n').length > FIELD_MAX_LENGTH);
  if (tooLong) {
    await ctx.reply(t.patchSectionTooLong(t.patchSections[tooLong.section], FIELD_MAX_LENGTH));
    return;
  }
  const servers = await listNewsletterGuilds();
  if (servers.length === 0) {
    await ctx.reply(t.patchNoServers(ctx.prefix));
    return;
  }

  const notesEmbed = () => patchNotesEmbed(parsed);
  const answer = await askToConfirm(
    ctx,
    notesEmbed().setFooter({ text: t.patchPreviewFooter }),
    ctx.user.id,
    { confirm: t.patchConfirm(servers.length), cancel: t.patchCancel, notYours: t.notYours },
    NEWSLETTER.confirmMs,
  );
  if (answer.decision !== 'confirm') {
    await answer.finish([notesEmbed(), createEmbed().setDescription(answer.decision === 'cancel' ? t.patchCancelled : t.patchTimedOut)]);
    return;
  }
  const { sent, failed } = await broadcastPatchNotes(ctx.guild.client, notesEmbed());
  await answer.finish([notesEmbed(), createEmbed().setDescription(t.patchSent(sent, failed))]);
}

export const newsletter: Command = {
  name: 'newsletter',
  category: 'bot',
  aliases: ['news'],
  description: 'Patch notes and the weekly newsletter (bot admin only).',
  usage: 'newsletter preview | patch <notes>',
  adminOnly: true,

  async execute(ctx) {
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.newsletter.adminOnly);
      return;
    }
    const action = ctx.args[0]?.toLowerCase();
    if (action === 'preview') return preview(ctx);
    if (action === 'patch') return patch(ctx);
    await ctx.reply(TEXT.newsletter.usage(ctx.prefix));
  },
};
