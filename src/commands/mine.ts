import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, MINE, MINE_IMAGE_NAME, MINE_WEB, TEXT } from '../constants/index.js';
import { renderMine } from '../animations/images/mine-image.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, money } from '../lib/format.js';
import { betForButton, isBetButton, parseBetArg, type BetButtonIds } from '../lib/game/bet.js';
import { dynamiteOn, payoutFor, startRun, step, stepFrom, type Direction, type MineRules, type MineRun } from '../lib/game/mine.js';
import { betButtonRow, refusalText, resolveBet } from '../discord/bet.js';
import { followUpPrivately, replyPrivately } from '../discord/reply.js';
import type { Command, CommandContext, EditOptions, ReplyOptions } from '../discord/types.js';
import { claimMiner, releaseMiner, renewMineLease, saveMultiplier, settleRun, startMineRun } from '../services/mine.js';
import { mineWebConfig, playLink, type MineWebConfig } from '../web/config.js';
import { MineSession } from '../web/mine-session.js';
import { signToken, type Player } from '../web/token.js';

const MOVE_IDS: Readonly<Record<Direction, string>> = { left: 'mine_left', up: 'mine_up', down: 'mine_down', right: 'mine_right' };
const MOVE_EMOJI: Readonly<Record<Direction, string>> = { left: '⬅️', up: '⬆️', down: '⬇️', right: '➡️' };
const CASH_OUT_ID = 'mine_cash';
const OPEN_ID = 'mine_open';
export const MINE_BET_IDS: BetButtonIds = { again: 'mine_again', double: 'mine_double', half: 'mine_half' };

const directionOf = (customId: string): Direction | undefined =>
  (Object.keys(MOVE_IDS) as Direction[]).find((direction) => MOVE_IDS[direction] === customId);

/** A run being played: the bet taken for it, the settings it started with, and what the last move did. */
interface Live {
  runId: string;
  bet: number;
  /** The player's points after the bet was taken. */
  balance: number;
  run: MineRun;
  rules: MineRules;
  note: string;
}

/** "+0.5x". */
const plus = (multiplier: number): string => `+${formatMultiplier(multiplier)}`;

/** The picture of the field, as a file to attach. */
const picture = (live: Live, over: boolean): { attachment: Buffer; name: string } => ({
  attachment: renderMine({ ...live.run, over, boom: live.run.status === 'boom' }),
  name: MINE_IMAGE_NAME,
});

/** The message while the run is played: the field, what the last move did, and the arrows and cash out button. */
function playingView(ctx: CommandContext, live: Live): ReplyOptions & EditOptions {
  const { run, rules, bet } = live;
  const cashOut = payoutFor(bet, run.multiplier);
  const embed = createEmbed()
    .setTitle(TEXT.mine.title)
    .setDescription(live.note)
    .addFields(
      { name: TEXT.mine.betField, value: money(bet), inline: true },
      { name: TEXT.mine.multiplierField, value: `**${formatMultiplier(run.multiplier)}**`, inline: true },
      { name: TEXT.mine.cashOutField, value: money(cashOut), inline: true },
      { name: TEXT.mine.fieldField, value: TEXT.mine.fieldValue(run.field, run.oresLeft, dynamiteOn(rules, run.field)) },
    )
    .setImage(`attachment://${MINE_IMAGE_NAME}`)
    .setFooter({ text: TEXT.mine.footer(Math.round(MINE.idleMs / 1000), plus(rules.fieldBonus)) })
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(Object.keys(MOVE_IDS) as Direction[]).map((direction) =>
      new ButtonBuilder()
        .setCustomId(MOVE_IDS[direction])
        .setEmoji(MOVE_EMOJI[direction])
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(stepFrom(run.pos, direction) === null),
    ),
    new ButtonBuilder().setCustomId(CASH_OUT_ID).setLabel(TEXT.mine.cashOutButton(fmt(cashOut))).setEmoji('💰').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], files: [picture(live, false)], components: [row] };
}

type Ending = 'boom' | 'cash' | 'idle';

/** The finished run: every tile shown, what it paid, and the again / double / half buttons. */
function endView(ctx: CommandContext, live: Live, ending: Ending, balance: number, payout: number): EditOptions {
  const user = ctx.user.toString();
  const bet = fmt(live.bet);
  const multiplier = formatMultiplier(live.run.multiplier);
  const text =
    ending === 'boom'
      ? TEXT.mine.boom(user, bet)
      : ending === 'idle'
        ? TEXT.mine.idleCashedOut(user, bet, multiplier, fmt(payout))
        : TEXT.mine.cashedOut(user, bet, multiplier, fmt(payout));
  const embed: BotEmbed = createEmbed()
    .setTitle(ending === 'boom' ? TEXT.mine.boomTitle : TEXT.mine.resultTitle(multiplier))
    .setDescription(text)
    .addFields(
      { name: TEXT.mine.betField, value: money(live.bet), inline: true },
      { name: TEXT.mine.fieldField, value: `#${live.run.field}`, inline: true },
      { name: TEXT.mine.balanceField, value: money(balance), inline: true },
    )
    .setImage(`attachment://${MINE_IMAGE_NAME}`)
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  return {
    embeds: [embed],
    files: [picture(live, true)],
    attachments: [],
    components: mineWebConfig() ? [betButtonRow(MINE_BET_IDS, live.bet, balance, CONFIG.mine), openRow()] : [betButtonRow(MINE_BET_IDS, live.bet, balance, CONFIG.mine)],
  };
}

/**
 * Plays one run on `message` until it ends: dynamite, a cash out, or MINE.idleMs without a press
 * (which cashes out). Only the member who is playing can use the buttons; presses made while the
 * last one is still being worked out are dropped. Returns the balance after the payout, or null
 * when the run could not be settled here (the sweeper will).
 */
async function dig(ctx: CommandContext, message: Message, live: Live): Promise<number | null> {
  const beat = setInterval(() => {
    renewMineLease(live.runId).catch((err) => console.error('Could not renew the lease of a mine run:', err));
  }, MINE.heartbeatMs);
  beat.unref();

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: MINE.idleMs });
  let busy = false;
  let over = false;

  const finish = async (ending: Ending): Promise<number | null> => {
    over = true;
    const settled = await settleRun(live.runId, ending === 'boom' ? 0 : live.run.multiplier);
    if (!settled.ok) {
      await message.edit({ embeds: [createEmbed().setTitle(TEXT.mine.title).setDescription(TEXT.mine.alreadySettled)], files: [], attachments: [], components: [] });
      return null;
    }
    await message.edit(endView(ctx, live, ending, settled.balance, settled.payout)).catch((err) => console.error('Could not show the end of a mine run:', err));
    return settled.balance;
  };

  /** Something failed partway: cash out at the multiplier reached (the sweeper does it if even that fails). */
  const giveUp = async (err: unknown): Promise<null> => {
    console.error('A mine run failed:', err);
    over = true;
    await settleRun(live.runId, live.run.status === 'boom' ? 0 : live.run.multiplier).catch(() => {});
    await message.edit({ embeds: [createEmbed().setTitle(TEXT.mine.title).setDescription(TEXT.mine.cancelled)], files: [], attachments: [], components: [] }).catch(() => {});
    return null;
  };

  try {
    return await new Promise<number | null>((resolve) => {
      const press = async (interaction: ButtonInteraction): Promise<void> => {
        if (interaction.user.id !== ctx.user.id) {
          await replyPrivately(interaction, TEXT.mine.notYours);
          return;
        }
        await interaction.deferUpdate().catch(() => {});
        if (busy || over) return;
        busy = true;
        try {
          if (interaction.customId === CASH_OUT_ID) {
            over = true;
            collector.stop('done');
            resolve(await finish('cash'));
            return;
          }
          const direction = directionOf(interaction.customId);
          if (!direction) return;
          const result = step(live.run, direction, live.rules);
          switch (result.kind) {
            case 'edge':
              return;
            case 'walk':
              live.note = TEXT.mine.walk;
              break;
            case 'rock':
              live.note = TEXT.mine.rock;
              break;
            case 'ore':
              live.note = TEXT.mine.found(result.ore, plus(result.gained));
              break;
            case 'cleared':
              live.note = TEXT.mine.cleared(result.ore, plus(result.gained), plus(result.bonus), live.run.field, dynamiteOn(live.rules, live.run.field));
              break;
            case 'boom':
              over = true;
              collector.stop('done');
              resolve(await finish('boom'));
              return;
          }
          if (result.kind === 'ore' || result.kind === 'cleared') await saveMultiplier(live.runId, live.run.multiplier);
          await message.edit({ ...playingView(ctx, live), attachments: [] });
        } catch (err) {
          over = true;
          collector.stop('done');
          resolve(await giveUp(err));
        } finally {
          busy = false;
        }
      };

      collector.on('collect', (interaction) => void press(interaction));
      collector.on('end', (_, reason) => {
        if (over) return;
        // Left alone: cash out. Wait for a press still being worked out first.
        void (async () => {
          while (busy) await new Promise((r) => setTimeout(r, 100));
          if (over) return;
          try {
            resolve(await finish(reason === 'idle' ? 'idle' : 'cash'));
          } catch (err) {
            resolve(await giveUp(err));
          }
        })();
      });
    });
  } finally {
    clearInterval(beat);
  }
}

// ---------------------------------------------------------------------------
// Playing on the web page (when MINE_WEB_URL is set)
// ---------------------------------------------------------------------------

/** The button that gives a member their private link to the page. */
const openRow = (): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(OPEN_ID).setLabel(TEXT.mine.openButton).setEmoji('⛏️').setStyle(ButtonStyle.Primary),
  );

const playerOf = (ctx: CommandContext): Player => ({ guildId: ctx.guildId, userId: ctx.user.id, name: ctx.user.displayName });

/**
 * Answers the Open button on `message`: the member it is for gets a link of their own to the page,
 * which opens their run if one is going and the lobby otherwise. Anyone else is told it isn't theirs.
 * Listens for `ms`, or until stopped.
 */
function handOutLinks(ctx: CommandContext, message: Message, config: MineWebConfig, ms?: number): () => void {
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, filter: (b) => b.customId === OPEN_ID, time: ms });
  collector.on('collect', (press) => {
    if (press.user.id !== ctx.user.id) {
      void replyPrivately(press, TEXT.mine.notYours);
      return;
    }
    const link = playLink(config, signToken(playerOf(ctx), MINE_WEB.linkTtlMs));
    void press
      .reply({
        content: TEXT.mine.link,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(TEXT.mine.linkButton))],
        flags: MessageFlags.Ephemeral,
      })
      .catch((err) => console.error('Could not send a mine link:', err));
  });
  if (ms !== undefined) collector.on('end', () => void message.edit({ components: [] }).catch(() => {}));
  return () => collector.stop();
}

/** The message while the run is played on the web: who is digging, and the button that gives them their link. */
function webView(ctx: CommandContext, live: Live): ReplyOptions & EditOptions {
  const { run, rules, bet } = live;
  const embed = createEmbed()
    .setTitle(TEXT.mine.title)
    .setDescription(TEXT.mine.webStart(ctx.user.toString(), fmt(bet), dynamiteOn(rules, run.field), rules.ores))
    .addFields({ name: TEXT.mine.betField, value: money(bet), inline: true })
    .setFooter({ text: TEXT.mine.webFooter(Math.round(MINE.idleMs / 1000)) })
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  return { embeds: [embed], files: [], components: [openRow()] };
}

/**
 * Plays one run on the web page: the run's session (web/mine-session.ts) takes the moves (the Open
 * button's links are handed out by play). When the run is over the message shows how it went.
 * Returns the balance after the payout, or null when it could not be settled here.
 */
async function digOnWeb(ctx: CommandContext, message: Message, live: Live, balance: number): Promise<number | null> {
  const session = new MineSession({ runId: live.runId, player: playerOf(ctx), bet: live.bet, balance, run: live.run, rules: live.rules });
  const end = await session.ended;
  if (!end.settled) {
    const text = end.status === 'failed' ? TEXT.mine.cancelled : TEXT.mine.alreadySettled;
    await message.edit({ embeds: [createEmbed().setTitle(TEXT.mine.title).setDescription(text)], files: [], attachments: [], components: [] }).catch(() => {});
    return null;
  }
  const ending: Ending = end.status === 'boom' ? 'boom' : end.status === 'idle' ? 'idle' : 'cash';
  await message.edit(endView(ctx, live, ending, end.settled.balance, end.settled.payout)).catch((err) => console.error('Could not show the end of a mine run:', err));
  return end.settled.balance;
}

/** The message a run starts with: the arrows in Discord, or the Open button on the web. */
const startView = (ctx: CommandContext, live: Live): ReplyOptions & EditOptions => (mineWebConfig() ? webView(ctx, live) : playingView(ctx, live));

/**
 * `k!mine` with no bet, on the web: a message with the Open button, whose link opens the page's
 * lobby (or the run they have going), where they can pick a bet and play.
 */
async function openLobby(ctx: CommandContext, config: MineWebConfig): Promise<void> {
  const embed = createEmbed()
    .setTitle(TEXT.mine.title)
    .setDescription(TEXT.mine.lobby(ctx.user.toString()))
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  const sent = await ctx.reply({ embeds: [embed], components: [openRow()] });
  handOutLinks(ctx, await sent.fetchMessage(), config, MINE_WEB.lobbyButtonMs);
}

/** Takes the bet and lays out the first field. Null (after telling them why) when the bet was refused. */
async function begin(ctx: CommandContext, bet: number, refuse: (text: string) => Promise<unknown>): Promise<Live | null> {
  const started = await startMineRun(ctx.guildId, ctx.user.id, bet);
  if (!started.ok) {
    await refuse(refusalText(ctx.prefix, bet, started));
    return null;
  }
  // The run keeps the settings it started with, whatever is changed while it is played.
  const rules: MineRules = structuredClone(CONFIG.mine);
  const run = startRun(rules);
  return {
    runId: started.runId,
    bet: started.bet,
    balance: started.balance,
    run,
    rules,
    note: TEXT.mine.start(ctx.user.toString(), fmt(started.bet), dynamiteOn(rules, 1), rules.ores),
  };
}

/**
 * A run in the mine, then more on the same message for as long as the member presses again,
 * double or half under the finished one (those buttons stop working after MINE.idleMs).
 */
async function play(ctx: CommandContext, wanted: number | 'all'): Promise<void> {
  const { guildId } = ctx;
  const userId = ctx.user.id;
  if (!claimMiner(guildId, userId)) {
    await ctx.reply(TEXT.mine.alreadyPlaying);
    return;
  }
  let stopLinks = (): void => {};
  try {
    let live = await begin(ctx, await resolveBet(ctx.guildId, ctx.user.id, wanted, CONFIG.mine), (text) => ctx.reply(text));
    if (!live) return;
    let message: Message;
    try {
      const sent = await ctx.reply(startView(ctx, live));
      message = await sent.fetchMessage();
      const config = mineWebConfig();
      if (config) stopLinks = handOutLinks(ctx, message, config);
    } catch (err) {
      // Nowhere to play it: give the bet back as it is (1x).
      await settleRun(live.runId, 1).catch(() => {});
      throw err;
    }

    for (;;) {
      const balance = mineWebConfig() ? await digOnWeb(ctx, message, live, live.balance) : await dig(ctx, message, live);
      releaseMiner(guildId, userId);
      if (balance === null) return;

      // Wait for again / double / half; nothing for a while takes the buttons away.
      let next: Live | null = null;
      while (!next) {
        const press = await message
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: MINE.idleMs,
            filter: (b) => {
              if (!isBetButton(MINE_BET_IDS, b.customId)) return false;
              if (b.user.id === ctx.user.id) return true;
              void replyPrivately(b, TEXT.mine.notYours);
              return false;
            },
          })
          .catch(() => null);
        if (!press) {
          await message.edit({ components: [] }).catch(() => {});
          return;
        }
        await press.deferUpdate().catch(() => {});
        const bet = betForButton(MINE_BET_IDS, press.customId, live.bet);
        if (bet === null) continue;
        if (!claimMiner(guildId, userId)) {
          await followUpPrivately(press, TEXT.mine.alreadyPlaying);
          continue;
        }
        try {
          next = await begin(ctx, bet, (text) => followUpPrivately(press, text));
        } catch (err) {
          releaseMiner(guildId, userId);
          throw err;
        }
        if (!next) releaseMiner(guildId, userId);
      }
      live = next;
      try {
        await message.edit({ ...startView(ctx, live), attachments: [] });
      } catch (err) {
        await settleRun(live.runId, 1).catch(() => {});
        throw err;
      }
    }
  } finally {
    stopLinks();
    releaseMiner(guildId, userId);
  }
}

export const mine: Command = {
  name: 'mine',
  aliases: ['mines'],
  description: `Bet ${CURRENCY_NAME} and dig through a 5x5 mine field. Ores raise your multiplier, clearing a field adds a bonus, and dynamite ends the run. Cash out any time.`,
  usage: 'mine <bet | all>',
  slashUsage: 'mine <bet>',

  async execute(ctx) {
    // With no bet, on the web: the link to the page, where they pick one.
    const config = mineWebConfig();
    if (ctx.args.length === 0 && config) {
      await openLobby(ctx, config);
      return;
    }
    const parsed = parseBetArg(ctx.args);
    if (!parsed.ok) {
      await ctx.reply(parsed.error === 'usage' ? TEXT.mine.usage(ctx.prefix) : TEXT.mine.badBet(ctx.prefix));
      return;
    }
    await play(ctx, parsed.bet);
  },
};
