import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from 'discord.js';
import { CONFIG } from '../config.js';
import { BLACKJACK, BLACKJACK_IMAGE_NAME, TEXT } from '../constants/index.js';
import { renderTable } from '../animations/images/blackjack-image.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt } from '../lib/format.js';
import { allBet, parseBetText, parseBlackjackArgs, payoutRatio } from '../lib/game/blackjack.js';
import { buttonPlan } from '../lib/game/plinko.js';
import { placeBet, refundBet, type PlaceBetResult } from '../services/blackjack.js';
import { getBalance } from '../services/economy.js';
import { loadProfile } from '../discord/profile.js';
import type { Command, CommandContext } from '../discord/types.js';
import { enterTable, leaveTable, openingMessage, playRound, startHeartbeat, type TablePlayer } from '../animations/blackjack-round.js';

const JOIN_ID = 'bj_join';
const LEAVE_ID = 'bj_leave';
const START_ID = 'bj_start';
const AGAIN_ID = 'bj_again';
const DOUBLE_BET_ID = 'bj_double_bet';
const HALF_ID = 'bj_half';

const mention = (userId: string): string => `<@${userId}>`;

const say = (press: ButtonInteraction, content: string): Promise<void> =>
  press
    .reply({ content, flags: MessageFlags.Ephemeral })
    .then(() => undefined)
    .catch(() => undefined);

/** Says why a bet was refused. */
function refusalText(prefix: string, bet: number, result: Exclude<PlaceBetResult, { ok: true }>): string {
  if (result.reason === 'too_poor') return TEXT.blackjack.cantAfford(prefix, fmt(bet), fmt(result.balance));
  return result.reason === 'too_small' ? TEXT.blackjack.tooSmall(fmt(result.limit)) : TEXT.blackjack.tooBig(fmt(result.limit));
}

/** The bet a member asked for in points: "all" is as much as they have, up to the biggest bet. */
async function resolveBet(guildId: string, userId: string, wanted: number | 'all'): Promise<number> {
  if (wanted !== 'all') return wanted;
  const { points } = await getBalance(guildId, userId);
  return allBet(points, CONFIG.blackjack.minBet, CONFIG.blackjack.maxBet);
}

/** A player as far as their name and picture go: the Discord user, and their server member if it is known. */
interface Who {
  user: Parameters<typeof loadProfile>[0];
  member?: Parameters<typeof loadProfile>[1];
}

const logRefundFailure = (userId: string) => (err: unknown) =>
  console.error(`Could not return a blackjack bet of ${userId} (the sweeper will when its lease runs out):`, err);

// ---------------------------------------------------------------------------
// Playing alone
// ---------------------------------------------------------------------------

/** The buttons under a finished solo game: play again, double the bet, halve it. */
function againButtons(baseBet: number, balance: number | null): ActionRowBuilder<ButtonBuilder>[] {
  const { minBet, maxBet } = CONFIG.blackjack;
  const plan = buttonPlan(baseBet, balance ?? 0, minBet, maxBet);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(AGAIN_ID).setLabel(TEXT.blackjack.againButton(fmt(plan.again.bet))).setStyle(ButtonStyle.Primary).setDisabled(!plan.again.enabled),
      new ButtonBuilder().setCustomId(DOUBLE_BET_ID).setLabel(TEXT.blackjack.doubleBetButton(fmt(plan.double.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.double.enabled),
      new ButtonBuilder().setCustomId(HALF_ID).setLabel(TEXT.blackjack.halfButton(fmt(plan.half.bet))).setStyle(ButtonStyle.Secondary).setDisabled(!plan.half.enabled),
    ),
  ];
}

const betForButton = (customId: string, bet: number): number | null =>
  customId === AGAIN_ID ? bet : customId === DOUBLE_BET_ID ? bet * 2 : customId === HALF_ID ? Math.floor(bet / 2) : null;

/**
 * A game against the dealer for one member. When it ends the buttons offer another game on the same
 * message (with the same bet, double it or half of it); they stop working after BLACKJACK.buttonsIdleMs.
 */
async function playSolo(ctx: CommandContext, wanted: number | 'all'): Promise<void> {
  const { guildId } = ctx;
  const userId = ctx.user.id;
  if (!enterTable(guildId, userId)) {
    await ctx.reply(TEXT.blackjack.alreadyPlaying);
    return;
  }
  const gameId = randomUUID();
  const stopBeat = startHeartbeat(gameId);
  /** The bet that is on the table right now, if any: it is given back if this function ends before the round pays it. */
  let onTable: TablePlayer | null = null;
  let entered = true;

  try {
    // Their name and picture are fetched while the bet is taken (this never fails: no picture is fine).
    const profileLoading = loadProfile(ctx.user, ctx.guild.members?.cache?.get(userId));
    let baseBet = await resolveBet(guildId, userId, wanted);
    const placed = await placeBet(guildId, userId, gameId, baseBet);
    if (!placed.ok) {
      await ctx.reply(refusalText(ctx.prefix, baseBet, placed));
      return;
    }
    let current: TablePlayer = { userId, betId: placed.betId, bet: placed.bet, profile: await profileLoading };
    onTable = current;

    const sent = await ctx.reply(openingMessage([current]));
    const message = await sent.fetchMessage();

    for (;;) {
      const results = await playRound(message, [current], { finalComponents: (r) => againButtons(baseBet, r[0]?.balance ?? null) });
      onTable = null;
      leaveTable(guildId, userId);
      entered = false;
      if (!results) return; // called off: the bets were returned and the message says so

      // Wait for a button: another game, or nothing, which takes the buttons away.
      let started = false;
      while (!started) {
        const press = await message
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: BLACKJACK.buttonsIdleMs,
            filter: (b) => {
              if (b.customId !== AGAIN_ID && b.customId !== DOUBLE_BET_ID && b.customId !== HALF_ID) return false;
              if (b.user.id === userId) return true;
              void say(b, TEXT.blackjack.notYours);
              return false;
            },
          })
          .catch(() => null);
        if (!press) {
          await message.edit({ components: [] }).catch(() => {});
          return;
        }
        await press.deferUpdate().catch(() => {});
        const bet = betForButton(press.customId, baseBet);
        if (bet === null) continue;
        if (!enterTable(guildId, userId)) {
          await press.followUp({ content: TEXT.blackjack.alreadyPlaying, flags: MessageFlags.Ephemeral }).catch(() => {});
          continue;
        }
        entered = true;
        try {
          const again = await placeBet(guildId, userId, gameId, bet);
          if (!again.ok) {
            leaveTable(guildId, userId);
            entered = false;
            await press.followUp({ content: refusalText(ctx.prefix, bet, again), flags: MessageFlags.Ephemeral }).catch(() => {});
            continue;
          }
          current = { userId, betId: again.betId, bet: again.bet, profile: current.profile };
          onTable = current;
          baseBet = again.bet;
          started = true;
        } catch (err) {
          leaveTable(guildId, userId);
          entered = false;
          throw err;
        }
      }
    }
  } finally {
    stopBeat();
    if (onTable) await refundBet(onTable.betId).catch(logRefundFailure(userId));
    if (entered) leaveTable(guildId, userId);
  }
}

// ---------------------------------------------------------------------------
// A party table
// ---------------------------------------------------------------------------

/**
 * Opens a table others can join for CONFIG.blackjack.joinSeconds. The Join button asks each player
 * for their own bet in a pop-up and takes it at once. Anyone at the table can start the game early;
 * otherwise it starts when the time is up. With nobody at the table it just closes.
 */
async function playParty(ctx: CommandContext, hostBet: number | 'all' | null): Promise<void> {
  const { guildId } = ctx;
  const max = BLACKJACK.maxSeats;
  const gameId = randomUUID();
  const stopBeat = startHeartbeat(gameId);
  const lobby: TablePlayer[] = [];
  /** Everyone marked as being at a table by this function, so they are released however it ends. */
  const marked = new Set<string>();
  let phase: 'open' | 'starting' = 'open';
  const closesAt = Date.now() + CONFIG.blackjack.joinSeconds * 1000;

  /** Takes a player's bet and gives them a seat. Returns text to show them if they couldn't sit. */
  const sit = async (who: Who, wanted: number | 'all'): Promise<string | null> => {
    const userId = who.user.id as string;
    if (!enterTable(guildId, userId)) return TEXT.blackjack.alreadyPlaying;
    marked.add(userId);
    try {
      const profileLoading = loadProfile(who.user, who.member);
      const bet = await resolveBet(guildId, userId, wanted);
      const placed = await placeBet(guildId, userId, gameId, bet);
      if (!placed.ok) {
        leaveTable(guildId, userId);
        marked.delete(userId);
        return refusalText(ctx.prefix, bet, placed);
      }
      const profile = await profileLoading;
      // The table may have filled up or started while the bet was being taken.
      if (phase !== 'open' || lobby.length >= max) {
        const closed = phase !== 'open';
        await refundBet(placed.betId).catch(logRefundFailure(userId));
        leaveTable(guildId, userId);
        marked.delete(userId);
        return closed ? TEXT.blackjack.tableClosed : TEXT.blackjack.tableFull;
      }
      lobby.push({ userId, betId: placed.betId, bet: placed.bet, profile });
      return null;
    } catch (err) {
      leaveTable(guildId, userId);
      marked.delete(userId);
      throw err;
    }
  };

  const lobbyView = (): { embeds: BotEmbed[]; files: { attachment: Buffer; name: string }[]; components: ActionRowBuilder<ButtonBuilder>[] } => {
    const picture = renderTable({ seats: Array.from({ length: max }, (_, i) => (lobby[i] ? { name: lobby[i]?.profile?.name, avatar: lobby[i]?.profile?.avatar, cards: [], bet: (lobby[i] as TablePlayer).bet } : null)), dealer: [] });
    const embed = createEmbed()
      .setTitle(TEXT.blackjack.partyTitle)
      .setDescription(TEXT.blackjack.lobby(ctx.user.toString(), `<t:${Math.ceil(closesAt / 1000)}:R>`, max))
      .addFields({
        name: TEXT.blackjack.playersField(lobby.length, max),
        value: lobby.length === 0 ? TEXT.blackjack.nobody : lobby.map((p, i) => TEXT.blackjack.seatLine(i + 1, mention(p.userId), fmt(p.bet))).join('\n'),
      })
      .setImage(`attachment://${BLACKJACK_IMAGE_NAME}`)
      .setFooter({ text: TEXT.blackjack.footer(payoutRatio(CONFIG.blackjack.naturalPayout)) });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(JOIN_ID).setLabel(TEXT.blackjack.joinButton).setStyle(ButtonStyle.Success).setDisabled(lobby.length >= max),
      new ButtonBuilder().setCustomId(LEAVE_ID).setLabel(TEXT.blackjack.leaveButton).setStyle(ButtonStyle.Secondary).setDisabled(lobby.length === 0),
      new ButtonBuilder().setCustomId(START_ID).setLabel(TEXT.blackjack.startButton).setStyle(ButtonStyle.Primary).setDisabled(lobby.length === 0),
    );
    return { embeds: [embed], files: [{ attachment: picture, name: BLACKJACK_IMAGE_NAME }], components: [row] };
  };

  try {
    if (hostBet !== null) {
      const refused = await sit({ user: ctx.user, member: ctx.guild.members?.cache?.get(ctx.user.id) }, hostBet);
      if (refused) {
        await ctx.reply(refused);
        return;
      }
    }

    const sent = await ctx.reply(lobbyView());
    const message = await sent.fetchMessage();

    // Edits of the lobby go one after the other, each drawing the table as it is when its turn comes.
    let editing: Promise<void> = Promise.resolve();
    const refresh = (): Promise<void> => {
      editing = editing.then(async () => {
        if (phase !== 'open') return;
        try {
          await message.edit({ ...lobbyView(), attachments: [] });
        } catch (err) {
          console.error('Could not update a blackjack lobby:', err);
        }
      });
      return editing;
    };

    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: Math.max(1000, closesAt - Date.now()) });
    const closed = new Promise<void>((resolve) => {
      collector.on('end', () => {
        phase = 'starting'; // from here nobody can be added, so the players are the ones at the table now
        resolve();
      });
    });

    const handleLobbyPress = async (press: ButtonInteraction): Promise<void> => {
      const userId = press.user.id;
      const at = lobby.findIndex((p) => p.userId === userId);

      if (press.customId === JOIN_ID) {
        if (phase !== 'open') return say(press, TEXT.blackjack.tableClosed);
        if (at !== -1) return say(press, TEXT.blackjack.alreadySeated);
        if (lobby.length >= max) return say(press, TEXT.blackjack.tableFull);

        const modalId = `bj_bet_${gameId}_${userId}`;
        await press.showModal(
          new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(TEXT.blackjack.modalTitle)
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('bet')
                  .setLabel(TEXT.blackjack.betLabel(fmt(CONFIG.blackjack.minBet), fmt(CONFIG.blackjack.maxBet)))
                  .setPlaceholder(TEXT.blackjack.betPlaceholder)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(20),
              ),
            ),
        );
        const submit = await press
          .awaitModalSubmit({ time: BLACKJACK.modalMs, filter: (m) => m.customId === modalId && m.user.id === userId })
          .catch(() => null);
        if (!submit) return;

        const reject = (content: string): Promise<void> =>
          submit
            .reply({ content, flags: MessageFlags.Ephemeral })
            .then(() => undefined)
            .catch(() => undefined);
        const wanted = parseBetText(submit.fields.getTextInputValue('bet'));
        if (wanted === null) return reject(TEXT.blackjack.badBetBox);
        if (phase !== 'open') return reject(TEXT.blackjack.tableClosed);
        const refused = await sit({ user: press.user, member: press.member }, wanted);
        if (refused) return reject(refused);
        await submit.deferUpdate().catch(() => {});
        await refresh();
        return;
      }

      if (press.customId === LEAVE_ID) {
        if (phase !== 'open') return say(press, TEXT.blackjack.tableClosed);
        if (at === -1) return say(press, TEXT.blackjack.notSeated);
        const [gone] = lobby.splice(at, 1) as [TablePlayer];
        await press.deferUpdate().catch(() => {});
        await refundBet(gone.betId).catch(logRefundFailure(userId));
        leaveTable(guildId, userId);
        marked.delete(userId);
        await refresh();
        return;
      }

      if (press.customId === START_ID) {
        if (at === -1) return say(press, TEXT.blackjack.joinFirst);
        await press.deferUpdate().catch(() => {});
        if (phase === 'open') collector.stop('start');
      }
    };

    collector.on('collect', (press) => {
      void handleLobbyPress(press).catch((err) => console.error('A blackjack lobby button failed:', err));
    });

    await closed;
    await editing;

    const players = [...lobby];
    if (players.length === 0) {
      const empty = createEmbed().setTitle(TEXT.blackjack.partyTitle).setDescription(TEXT.blackjack.noPlayers);
      await message.edit({ embeds: [empty], files: [], attachments: [], components: [] }).catch(() => {});
      return;
    }
    await playRound(message, players);
  } finally {
    stopBeat();
    // Anything not paid out by now (the round never ran, or failed) is given back; a bet that was paid is already gone, so this does nothing to it.
    for (const p of lobby) await refundBet(p.betId).catch(logRefundFailure(p.userId));
    for (const userId of marked) leaveTable(guildId, userId);
  }
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export const blackjack: Command = {
  name: 'blackjack',
  aliases: ['bj'],
  description:
    'Play blackjack against the dealer: hit, stand or double. Bet to play alone, or open a party table that up to 5 players join.',
  usage: 'blackjack <bet | all>  or  blackjack party [bet]',
  slashUsage: 'blackjack play <bet>  or  blackjack party [bet]',

  async execute(ctx) {
    const parsed = parseBlackjackArgs(ctx.args);
    if (!parsed.ok) {
      await ctx.reply(parsed.error === 'usage' ? TEXT.blackjack.usage(ctx.prefix) : TEXT.blackjack.badBet(ctx.prefix));
      return;
    }
    if (parsed.kind === 'party') await playParty(ctx, parsed.bet);
    else await playSolo(ctx, parsed.bet);
  },
};
