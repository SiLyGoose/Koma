import { boldMoney } from './currency.js';

export const newsletterText = {
  // ---------------------------------------------------------------------------
  // The weekly digest, sent when the raid week resets.

  /** `date` is the day the new week started, like "October 3". */
  weeklyTitle: (date: string) => `📰 Koma Weekly · ${date}`,
  weeklyIntro: 'A new raid week has begun. Here is how last week went.',
  /** In a preview: the digest covers the week so far, and goes out when it ends. */
  previewIntro: (unix: number) => `Preview: this week so far. The real one goes out <t:${unix}:R>.`,
  noteField: '📣 Announcement',

  /** A preview's covers the week so far. */
  raidField: (preview: boolean) => (preview ? "⚔️ This week's raid so far" : "⚔️ Last week's raid"),
  /** `boss` is like "🐉 Ember Wyrm". */
  raidWon: (boss: string, raiders: number, rounds: number) =>
    `The party of ${raiders} beat **${boss}** in ${rounds} round${rounds === 1 ? '' : 's'}!`,
  raidWiped: (boss: string, raiders: number, rounds: number) => `**${boss}** wiped out the party of ${raiders} in round ${rounds}.`,
  raidFled: (boss: string, raiders: number, how: string) => `**${boss}** ${how} before the party of ${raiders} could finish it.`,
  raidNotFought: (boss: string) => `Nobody took on **${boss}**.`,
  /** A raid still being played as the digest was made (it started just before the reset, or a preview). */
  raidOngoing: (boss: string) => `The raid against **${boss}** is still going.`,
  /** The week's extra raid (bought with `skip raid`), one line under the main one. */
  extraRaid: (result: string) => `Extra raid: ${result}`,
  raidTopDamage: (who: string, amount: string) => `🗡️ Most damage: ${who} (**${amount}**)`,
  raidTopHealer: (who: string, amount: string) => `💚 Most healing: ${who} (**${amount}**)`,
  raidTopGuard: (who: string, amount: string) => `🛡️ Most damage blocked: ${who} (**${amount}**)`,
  raidLastHit: (who: string) => `⭐ Final blow: ${who}`,

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

  /** Above the new boss's card. `boss` is like "🐉 Ember Wyrm". A preview's is next week's. */
  newBoss: (boss: string, preview: boolean) => `${preview ? "Next week's" : "This week's"} raid boss is **${boss}**. Good luck!`,

  // ---------------------------------------------------------------------------
  // Patch notes, sent by the bot admin.

  patchTitle: '🛠️ Patch notes',
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
  patchEmpty: (p: string) => `Write the notes after the command, like \`${p}newsletter patch\` and then the notes (new lines are kept).`,
  patchTooLong: (max: number) => `Patch notes can be at most ${max} characters.`,

  // ---------------------------------------------------------------------------
  // The admin's note on the next weekly digest.

  noteSet: (unix: number) => `Added. It goes out with every server's weekly newsletter <t:${unix}:R>.`,
  noteCleared: 'The note for the next weekly newsletter is cleared.',
  noteNone: (p: string) => `There is no note for the next weekly newsletter. Add one with \`${p}newsletter note <text>\`.`,
  noteShow: (note: string, unix: number) => `This goes out with the weekly newsletter <t:${unix}:R>:\n>>> ${note}`,
  noteTooLong: (max: number) => `The note can be at most ${max} characters.`,

  // ---------------------------------------------------------------------------
  // The command itself.

  adminOnly: 'Only the bot admin can use the newsletter command.',
  noChannel: (p: string) => `This server has no newsletter channel. Choose one with \`${p}config set newsletter #channel\`.`,
  usage: (p: string) =>
    [
      `\`${p}newsletter preview\`: what this server's weekly newsletter looks like so far`,
      `\`${p}newsletter note <text>\`: an announcement on top of the next weekly newsletter (\`${p}newsletter note clear\` removes it, \`${p}newsletter note\` shows it)`,
      `\`${p}newsletter patch <notes>\`: send patch notes to every server's newsletter channel (you see a preview first)`,
    ].join('\n'),
};
