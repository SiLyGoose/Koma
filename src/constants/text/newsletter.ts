import { boldMoney } from './currency.js';

export const newsletterText = {
  // ---------------------------------------------------------------------------
  // The weekly digest, sent when the raid week resets.

  /** `date` is the day the new week started, like "October 3". */
  weeklyTitle: (date: string) => `📰 Koma Weekly · ${date}`,
  weeklyIntro: 'A new raid week has begun.',
  /** In a preview: the digest covers the week so far, and goes out when it ends. */
  previewIntro: (unix: number) => `Preview: this week so far. The real one goes out <t:${unix}:R>.`,
  /** The same, while the weekly digest is turned off (NEWSLETTER.weeklyDigest). */
  previewIntroOff: "Preview: this week so far. The weekly newsletter is turned off, so this won't be sent.",

  robsField: (preview: boolean) => (preview ? '💰 This week in robs so far' : '💰 Last week in robs'),
  robsNone: 'Nobody robbed anyone.',
  /** `attempts` robs: `gotAway` got away with it, `caught` were caught, `slipped` slipped (Piplup). */
  robsCount: (attempts: number, gotAway: number, caught: number, slipped: number) =>
    `**${attempts}** rob${attempts === 1 ? '' : 's'}: ${gotAway} got away, ${caught} got caught${slipped > 0 ? `, ${slipped} slipped` : ''}.`,
  robsBiggest: (robber: string, victim: string, amount: string) => `💸 Biggest heist: ${robber} took ${boldMoney(amount)} from ${victim}`,
  robsTopRobber: (who: string, amount: string, count: number) =>
    `🥷 Top robber: ${who}, ${boldMoney(amount)} from ${count} rob${count === 1 ? '' : 's'}`,
  robsMostRobbed: (who: string, amount: string, count: number) =>
    `🎯 Most robbed: ${who}, lost ${boldMoney(amount)} in ${count} rob${count === 1 ? '' : 's'}`,

  /** `boss` is like "🐉 Ember Wyrm". A preview's is next week's. */
  newBoss: (boss: string, preview: boolean) => `${preview ? "Next week's" : "This week's"} raid boss is **${boss}**. Good luck!`,

  // ---------------------------------------------------------------------------
  // Patch notes, sent by the bot admin.

  patchTitle: '🛠️ Patch notes',
  /** Each section's field name (lib/patch-notes.ts). */
  patchSections: { added: '✨ Added', changed: '🔧 Changed', fixed: '🐛 Fixed', removed: '🗑️ Removed' },
  /** A section too long for its embed field. `section` is its field name. */
  patchSectionTooLong: (section: string, max: number) => `The ${section} section can be at most ${max} characters. Move some of it into another section or the intro.`,
  patchConfirm: (servers: number) => `Send to ${servers} server${servers === 1 ? '' : 's'}`,
  patchCancel: 'Cancel',
  notYours: 'Only the bot admin can answer this.',
  /** Shown with the preview, above the buttons. */
  patchPreviewFooter: 'Preview. Nothing has been sent yet.',
  patchSent: (sent: number, failed: number) =>
    `Patch notes sent to ${sent} server${sent === 1 ? '' : 's'}.${failed > 0 ? ` ${failed} could not be reached (their newsletter channel is gone or I can't post there).` : ''}`,
  patchCancelled: 'Patch notes cancelled. Nothing was sent.',
  patchTimedOut: 'No answer, so the patch notes were not sent.',
  patchNoServers: (p: string) => `No server has a newsletter channel yet. Choose one with \`${p}config set newsletter #channel\`.`,
  patchEmpty: (p: string) =>
    [
      `Write the notes after the command, one change per line. A line with just **Added**, **Changed**, **Fixed** or **Removed** starts that section, and anything above the first one is the intro:`,
      '```',
      `${p}newsletter patch`,
      'A few new things this week!',
      'Added',
      '- Raid bosses in the databank',
      'Changed',
      '- Multi pulls always give a 3★ or better',
      '```',
    ].join('\n'),
  patchTooLong: (max: number) => `Patch notes can be at most ${max} characters.`,

  // ---------------------------------------------------------------------------
  // The command itself.

  adminOnly: 'Only the bot admin can use the newsletter command.',
  noChannel: (p: string) => `This server has no newsletter channel. Choose one with \`${p}config set newsletter #channel\`.`,
  usage: (p: string) =>
    [
      `\`${p}newsletter preview\`: what this server's weekly newsletter looks like so far`,
      `\`${p}newsletter patch <notes>\`: send patch notes to every server's newsletter channel, in Added, Changed, Fixed and Removed sections (you see a preview first)`,
    ].join('\n'),
};
