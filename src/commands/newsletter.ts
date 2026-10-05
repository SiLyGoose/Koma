import { isAdmin } from '../config.js';
import { NEWSLETTER, TEXT } from '../constants/index.js';
import { askToConfirm } from '../discord/confirm.js';
import type { Command, CommandContext } from '../discord/types.js';
import { createEmbed } from '../lib/embed.js';
import { raidWeek } from '../lib/events/raid-week.js';
import { broadcastPatchNotes, previewDigest } from '../newsletter/send.js';
import { getNewsletterNote, listNewsletterGuilds, setNewsletterNote } from '../services/newsletter.js';

/*
 * The newsletter, for the bot admin (src/newsletter): see what this server's weekly digest looks
 * like so far, add an announcement to the next one (every server's), or send patch notes to every
 * server's newsletter channel. Prefix only (SLASH_EXCLUDED): patch notes keep their line breaks,
 * which a slash command's options can't hold.
 */

/** The command's free text after its first `skip` words, line breaks kept (a slash command only has the words). */
function textAfter(ctx: CommandContext, skip: number): string {
  if (ctx.text === undefined) return ctx.args.slice(skip).join(' ');
  return ctx.text.replace(new RegExp(`^(?:\\S+\\s*){${skip}}`), '').trim();
}

/** The week whose digest the next note goes out with (the one after this), and when it starts. */
function nextDigestWeek(now: Date = new Date()): { key: string; unix: number } {
  const next = raidWeek(raidWeek(now).next);
  return { key: next.key, unix: Math.floor(next.start.getTime() / 1000) };
}

async function preview(ctx: CommandContext): Promise<void> {
  const digest = await previewDigest(ctx.guildId);
  await ctx.reply({ ...digest, allowedMentions: { parse: [] } });
}

async function note(ctx: CommandContext): Promise<void> {
  const t = TEXT.newsletter;
  const text = textAfter(ctx, 1);
  const week = nextDigestWeek();
  if (text === '') {
    const current = await getNewsletterNote(week.key);
    await ctx.reply(current === null ? t.noteNone(ctx.prefix) : { content: t.noteShow(current, week.unix), allowedMentions: { parse: [] } });
    return;
  }
  if (text.toLowerCase() === 'clear') {
    await setNewsletterNote(week.key, null);
    await ctx.reply(t.noteCleared);
    return;
  }
  if (text.length > NEWSLETTER.maxNoteLength) {
    await ctx.reply(t.noteTooLong(NEWSLETTER.maxNoteLength));
    return;
  }
  await setNewsletterNote(week.key, text);
  await ctx.reply(t.noteSet(week.unix));
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
  const servers = await listNewsletterGuilds();
  if (servers.length === 0) {
    await ctx.reply(t.patchNoServers(ctx.prefix));
    return;
  }

  const notesEmbed = () => createEmbed().setTitle(t.patchTitle).setDescription(notes);
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
  usage: 'newsletter preview | note [text | clear] | patch <notes>',
  adminOnly: true,

  async execute(ctx) {
    if (!isAdmin(ctx.user.id)) {
      await ctx.reply(TEXT.newsletter.adminOnly);
      return;
    }
    const action = ctx.args[0]?.toLowerCase();
    if (action === 'preview') return preview(ctx);
    if (action === 'note') return note(ctx);
    if (action === 'patch') return patch(ctx);
    await ctx.reply(TEXT.newsletter.usage(ctx.prefix));
  },
};
