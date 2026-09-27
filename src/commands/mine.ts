import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, type Message } from 'discord.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, MINE, MINE_MINES, MINE_WEB, TEXT } from '../constants/index.js';
import { createEmbed } from '../lib/embed.js';
import { fmt, formatMultiplier, money } from '../lib/format.js';
import { parseBetArg } from '../lib/game/bet.js';
import { multiplierFor, validMines } from '../lib/game/mine.js';
import { refusalText } from '../discord/bet.js';
import { replyPrivately } from '../discord/reply.js';
import type { Command, CommandContext } from '../discord/types.js';
import { gameLink, webConfig, type WebConfig } from '../web/config.js';
import { startWebRun, type MineSession } from '../web/mine-session.js';
import { signToken, type Player } from '../web/token.js';

/*
 * The mine, played like Stake's Mines on its web page (web/mine-session.ts, and the Koma-UI repo).
 * `k!mine` posts the Open button, whose private link opens the page's lobby, where a bet and a
 * number of mines are picked. `k!mine <bet> [mines]` starts a round from Discord, played on the
 * page; the message shows how it went once it is over.
 */

const OPEN_ID = 'mine_open';

/** The button that gives a member their private link to the page. */
const openRow = (): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(OPEN_ID).setLabel(TEXT.mine.openButton).setEmoji('💣').setStyle(ButtonStyle.Primary),
  );

const playerOf = (ctx: CommandContext): Player => ({ guildId: ctx.guildId, userId: ctx.user.id, name: ctx.user.displayName });

/**
 * Answers the Open button on `message`: the member it is for gets a link of their own to the page,
 * which opens their round if one is going and the lobby otherwise. Anyone else is told it isn't theirs.
 * Listens for `ms`, then takes the button away.
 */
function handOutLinks(ctx: CommandContext, message: Message, config: WebConfig, ms: number): void {
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, filter: (b) => b.customId === OPEN_ID, time: ms });
  collector.on('collect', (press) => {
    if (press.user.id !== ctx.user.id) {
      void replyPrivately(press, TEXT.mine.notYours);
      return;
    }
    const link = gameLink(config, 'mines', signToken(playerOf(ctx), MINE_WEB.linkTtlMs));
    void press
      .reply({
        content: TEXT.mine.link,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(TEXT.mine.linkButton))],
        flags: MessageFlags.Ephemeral,
      })
      .catch((err) => console.error('Could not send a mine link:', err));
  });
  collector.on('end', () => void message.edit({ components: [] }).catch(() => {}));
}

/** `k!mine` with no bet: the Open button, whose link opens the page's lobby (or the round they have going). */
async function openLobby(ctx: CommandContext, config: WebConfig): Promise<void> {
  const embed = createEmbed()
    .setTitle(TEXT.mine.title)
    .setDescription(TEXT.mine.lobby(ctx.user.toString()))
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  const sent = await ctx.reply({ embeds: [embed], components: [openRow()] });
  handOutLinks(ctx, await sent.fetchMessage(), config, MINE_WEB.lobbyButtonMs);
}

/** How a finished round is shown on the message that started it. */
function endEmbed(ctx: CommandContext, session: MineSession, status: string, payout: number, balance: number) {
  const user = ctx.user.toString();
  const bet = fmt(session.bet);
  const multiplier = formatMultiplier(session.multiplier);
  const text =
    status === 'boom'
      ? TEXT.mine.boom(user, bet, session.gems)
      : status === 'idle'
        ? TEXT.mine.idleCashedOut(user, bet, multiplier, fmt(payout))
        : status === 'done'
          ? TEXT.mine.doneCashedOut(user, bet, multiplier, fmt(payout))
          : TEXT.mine.cashedOut(user, bet, multiplier, fmt(payout));
  return createEmbed()
    .setTitle(status === 'boom' ? TEXT.mine.boomTitle : TEXT.mine.resultTitle(multiplier))
    .setDescription(text)
    .addFields(
      { name: TEXT.mine.betField, value: money(session.bet), inline: true },
      { name: TEXT.mine.minesField, value: `💣 ${session.mines}`, inline: true },
      { name: TEXT.mine.balanceField, value: money(balance), inline: true },
    )
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
}

/**
 * `k!mine <bet> [mines]`: takes the bet and starts a round, played on the page (the Open button's
 * links), then shows on the message how it went.
 */
async function play(ctx: CommandContext, config: WebConfig, wanted: number | 'all', mines: number): Promise<void> {
  const started = await startWebRun(playerOf(ctx), wanted, mines);
  if (!started.ok) {
    if (started.reason === 'busy') await ctx.reply(TEXT.mine.alreadyPlaying);
    else await ctx.reply(refusalText(ctx.prefix, wanted === 'all' ? 0 : wanted, started));
    return;
  }
  const { session } = started;
  const rules = CONFIG.mine;
  const embed = createEmbed()
    .setTitle(TEXT.mine.title)
    .setDescription(TEXT.mine.start(ctx.user.toString(), fmt(session.bet), session.mines, formatMultiplier(multiplierFor(rules, session.mines, 1))))
    .addFields(
      { name: TEXT.mine.betField, value: money(session.bet), inline: true },
      { name: TEXT.mine.minesField, value: `💣 ${session.mines}`, inline: true },
    )
    .setFooter({ text: TEXT.mine.footer(Math.round(MINE.idleMs / 1000), formatMultiplier(rules.maxMultiplier)) })
    .setAuthor({ name: ctx.user.displayName, iconURL: ctx.user.displayAvatarURL() });
  let message: Message;
  try {
    const sent = await ctx.reply({ embeds: [embed], components: [openRow()] });
    message = await sent.fetchMessage();
  } catch (err) {
    // Nowhere to show it: the round goes on (it cashes out by itself if nobody opens it).
    console.error('Could not post a mine round:', err);
    return;
  }
  handOutLinks(ctx, message, config, MINE_WEB.lobbyButtonMs);

  const end = await session.ended;
  if (!end.settled) {
    const text = end.status === 'failed' ? TEXT.mine.cancelled : TEXT.mine.alreadySettled;
    await message.edit({ embeds: [createEmbed().setTitle(TEXT.mine.title).setDescription(text)] }).catch(() => {});
    return;
  }
  await message
    .edit({ embeds: [endEmbed(ctx, session, end.status, end.settled.payout, end.settled.balance)] })
    .catch((err) => console.error('Could not show the end of a mine round:', err));
}

export const mine: Command = {
  name: 'mine',
  aliases: ['mines'],
  description: `Stake-style mines in your browser: bet ${CURRENCY_NAME}, pick how many mines hide on a 5x5 board, then turn over tiles. Every gem raises your multiplier, a mine loses the bet. Cash out any time.`,
  usage: 'mine [bet | all] [mines]',
  slashUsage: 'mine [bet] [mines]',

  async execute(ctx) {
    const config = webConfig();
    if (!config) {
      await ctx.reply(TEXT.mine.off);
      return;
    }
    if (ctx.args.length === 0) {
      await openLobby(ctx, config);
      return;
    }
    if (ctx.args.length > 2) {
      await ctx.reply(TEXT.mine.usage(ctx.prefix, MINE_MINES.min, MINE_MINES.max));
      return;
    }
    const parsed = parseBetArg(ctx.args.slice(0, 1));
    if (!parsed.ok) {
      await ctx.reply(parsed.error === 'usage' ? TEXT.mine.usage(ctx.prefix, MINE_MINES.min, MINE_MINES.max) : TEXT.mine.badBet(ctx.prefix));
      return;
    }
    const minesText = ctx.args[1];
    const mines = minesText === undefined ? MINE_MINES.start : Number(minesText);
    if (!validMines(mines)) {
      await ctx.reply(TEXT.mine.badMines(ctx.prefix, MINE_MINES.min, MINE_MINES.max));
      return;
    }
    await play(ctx, config, parsed.bet, mines);
  },
};
