import { randomInt } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../../config.js';
import { LASER, TEXT } from '../../constants/index.js';
import { replyPrivately } from '../../discord/reply.js';
import { createEmbed, type BotEmbed } from '../../lib/embed.js';
import type { CrateShare } from '../../lib/events/crate.js';
import { decoyCount, isIn, judgePress, laserWindowMs, parseSlotId, rankedSplit, rankWinners, recordDuck, rollDecoys, settleRound, slotId, type DuckResult, type LaserPhase, type LaserPlayer } from '../../lib/events/laser.js';
import { fmt, mention } from '../../lib/format.js';
import { randInt } from '../../lib/random.js';
import { payShares } from '../../services/events.js';
import { claimVault, fineIntoVault, getVaultPool, vaultCost, type VaultFine } from '../../services/vault.js';
import { siteGameLink, webConfig } from '../../web/config.js';
import { eventPing } from '../ping.js';
import type { LaserEnded, LaserLive } from '../../protocol/laser.js';
import type { EventContext, GameEvent } from '../types.js';
import { SiteGames } from './site-games.js';
import { collectJoiners, limitedLines, showResult } from './vault-game.js';

/*
 * Laser Grid: players join, then play rounds of "wait for it" (lib/events/laser.ts has the rules).
 * Each round shows a row of buttons, and after a random wait the laser fires: one of them turns
 * into Duck!, and everyone still in has a few seconds (fewer every round) to press it. Too early,
 * the wrong button or too slow, and you're caught and pay a fine into the vault. Only a player's
 * first press in a round counts, and every button's id carries its round and whether the laser
 * had fired when it was shown, so a press is judged by the screen the player actually saw, and a
 * press left over from an earlier round counts for nothing. Those never caught split the prize by place, fastest first
 * (the vault pool times events.vault.multiplier), which comes out of the pool; if everyone is
 * caught, it stays in the vault.
 *
 * Each round edits the message three times (ready, laser, result), a second or more apart, so it
 * edits the message itself rather than through a LiveMessage, and knows when the laser went out.
 *
 * It is played on the site too (web/games/laser/, its Play on the site button): laserGames has the game going in each
 * server, which a page joins and presses in just as the buttons do. The pages are shown the laser only once the Discord
 * message with it has gone out, so nobody sees Duck! first; a page that didn't join in time watches.
 */

/** "3s", "2.5s", "1.25s". */
const secondsText = (ms: number): string => `${Number((ms / 1000).toFixed(2))}s`;
/** A reaction time: "0.42s". */
const reactionText = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

const WHY: Record<Exclude<DuckResult, 'ducked'>, string> = { early: TEXT.laser.early, wrong: TEXT.laser.wrong, late: TEXT.laser.late };

/** Join, and (site: the site's link to the game) Play on the site. A round's row has no room for the link (five slots). */
export function laserJoinRow(site: string | null = null): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LASER.joinId).setLabel(TEXT.laser.joinButton).setStyle(ButtonStyle.Success),
    ...(site ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(site).setLabel(TEXT.laser.siteButton).setEmoji('⚡')] : []),
  );
}

/**
 * Round `round`'s row of buttons: before the laser fires (`wait`), all alike; after (`go`), the
 * `duckSlot` one says Duck!, the `decoys` are fake ducks (as green, with their own word) and the rest are lasers.
 * `disabled` once the round is over.
 */
export function laserRow(round: number, phase: LaserPhase, duckSlot: number, disabled = false, decoys: ReadonlyMap<number, string> = new Map()): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let slot = 0; slot < LASER.slots; slot++) {
    const button = new ButtonBuilder().setCustomId(slotId(round, phase, slot)).setDisabled(disabled);
    if (phase === 'wait') button.setLabel(TEXT.laser.waitButton).setStyle(ButtonStyle.Secondary);
    else if (slot === duckSlot) button.setLabel(TEXT.laser.duckButton).setStyle(ButtonStyle.Success);
    else if (decoys.has(slot)) button.setLabel(decoys.get(slot) as string).setStyle(ButtonStyle.Success);
    else button.setLabel(TEXT.laser.laserButton).setStyle(ButtonStyle.Danger);
    row.addComponents(button);
  }
  return row;
}

/** `prize` is what's up with `joined` players so far, `bonus` what every player who joins adds to it. */
export function laserJoinEmbed(prize: number, bonus: number, rounds: number, windowSeconds: number, minWindowSeconds: number, fine: number, endsAtUnix: number, joined: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.laser.title)
    .setDescription(TEXT.laser.joinDescription(fmt(prize), bonus > 0 ? fmt(bonus) : '', rounds, secondsText(windowSeconds * 1000), secondsText(minWindowSeconds * 1000), fmt(fine), endsAtUnix))
    .addFields({ name: TEXT.laser.playersField, value: joined === 0 ? TEXT.laser.playersNobody : TEXT.laser.playersCount(joined) });
}

/** Who's still in and who's been caught (most recent first). */
function addPlayerFields(embed: BotEmbed, players: readonly LaserPlayer[]): BotEmbed {
  const left = players.filter(isIn).map((p) => mention(p.userId));
  embed.addFields({ name: TEXT.laser.inField, value: limitedLines(left, LASER.listMax, TEXT.laser.more, TEXT.laser.nobody) });
  const caught = players.filter((p) => !isIn(p)).sort((a, b) => b.caughtRound - a.caughtRound);
  if (caught.length > 0) {
    const lines = caught.map((p) => TEXT.laser.caughtLine(mention(p.userId), p.caughtRound, WHY[p.caughtFor as keyof typeof WHY]));
    embed.addFields({ name: TEXT.laser.caughtField, value: limitedLines(lines, LASER.listMax, TEXT.laser.more, TEXT.laser.nobody) });
  }
  return embed;
}

/** Round `round` before the laser fires (`fired` false) or after. `windowMs` is the time to duck. */
export function laserRoundEmbed(round: number, rounds: number, windowMs: number, fired: boolean, players: readonly LaserPlayer[]): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.laser.roundTitle(round, rounds))
    .setDescription(fired ? TEXT.laser.fire(secondsText(windowMs)) : TEXT.laser.ready(players.filter(isIn).length, secondsText(windowMs)));
  return addPlayerFields(embed, players);
}

/** Round `round` is over: `caught` this round, and the fastest duck (`fastest` null if nobody ducked). */
export function laserRoundOverEmbed(round: number, rounds: number, caught: number, fastest: { userId: string; ms: number } | null, players: readonly LaserPlayer[]): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.laser.roundTitle(round, rounds))
    .setDescription(TEXT.laser.roundOver(caught, fastest ? TEXT.laser.fastest(mention(fastest.userId), reactionText(fastest.ms)) : ''));
  return addPlayerFields(embed, players);
}

/** The end: who made it through and split the prize (none: it stays in the vault, `lastRound` being when the last were caught), and who paid what. */
export function laserResultEmbed(prize: number, lastRound: number, players: readonly LaserPlayer[], paid: readonly CrateShare[], fines: readonly VaultFine[], failedPayouts: number): BotEmbed {
  const winners = rankWinners(players);
  const embed = createEmbed();
  if (winners.length === 0) {
    embed.setTitle(TEXT.laser.allCaughtTitle).setDescription(TEXT.laser.allCaught(lastRound));
  } else {
    embed.setTitle(TEXT.laser.clearTitle).setDescription(TEXT.laser.clear(winners.length, fmt(prize)));
    const won = new Map(paid.map((share) => [share.userId, share.amount]));
    const lines = winners.map((p, i) => TEXT.laser.winnerLine(i + 1, mention(p.userId), fmt(won.get(p.userId) ?? 0), reactionText(p.totalMs)));
    embed.addFields({ name: TEXT.laser.winnersField, value: limitedLines(lines, LASER.listMax, TEXT.laser.more, TEXT.laser.nobody) });
  }
  const caught = players.filter((p) => !isIn(p)).sort((a, b) => b.caughtRound - a.caughtRound);
  if (caught.length > 0) {
    const fined = new Map(fines.map((f) => [f.userId, f.amount]));
    const lines = caught.map((p) => TEXT.laser.finedLine(mention(p.userId), fmt(fined.get(p.userId) ?? 0), p.caughtRound, WHY[p.caughtFor as keyof typeof WHY]));
    embed.addFields({ name: TEXT.laser.caughtField, value: limitedLines(lines, LASER.listMax, TEXT.laser.more, TEXT.laser.nobody) });
  }
  if (failedPayouts > 0) embed.setFooter({ text: TEXT.laser.someFailed(failedPayouts) });
  return embed;
}

export const laserNoCrewEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.laser.noCrewTitle).setDescription(TEXT.laser.noCrew);
export const laserFailedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.laser.failedTitle).setDescription(TEXT.laser.failed);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** What a press did, as the site is told it: how fast a duck was, or how the press was caught or why it did nothing. */
export type LaserPress =
  | { result: 'ducked'; ms: number }
  /** A press after the player's first this round: it does nothing, and says what the first was (ms: how fast, if it was a duck). */
  | { result: 'already'; first: DuckResult; ms?: number }
  | { result: Exclude<DuckResult, 'ducked'> | 'stale' | 'closed' | 'out' | 'notPlaying'; ms?: undefined };

/** A Laser Grid going on, as the site plays it (web/games/laser/): the same game as its Discord message. */
export interface LaserGame {
  /** The game as everyone sees it (where Duck! is only once the laser has fired). */
  live(): LaserLive;
  /** Whether `userId` joined it (and so plays it, rather than watching). */
  plays(userId: string): boolean;
  join(userId: string, name: string): 'ok' | 'closed' | 'already';
  /** `userId` pressed slot `slot` of round `round`, shown in `phase` (a button's id says the same: lib/events/laser.ts's slotId). */
  press(userId: string, round: number, phase: LaserPhase, slot: number): LaserPress;
}

/** The Laser Grid going on in each server, and how the last ended (for the site). */
export const laserGames = new SiteGames<LaserGame, LaserEnded>('Laser Grid');

/** What a player is told in Discord about their press. */
function pressReply(press: LaserPress): string {
  if (press.result === 'ducked') return TEXT.laser.ducked(reactionText(press.ms));
  if (press.result === 'early') return TEXT.laser.caughtEarly;
  if (press.result === 'wrong') return TEXT.laser.caughtWrong;
  if (press.result === 'late') return TEXT.laser.caughtLate;
  if (press.result === 'stale') return TEXT.laser.staleButton;
  if (press.result === 'closed') return TEXT.laser.roundClosed;
  if (press.result === 'already') return TEXT.laser.alreadyPressed(press.first === 'ducked' ? TEXT.laser.firstDucked(reactionText(press.ms ?? 0)) : WHY[press.first]);
  if (press.result === 'out') return TEXT.laser.youreOut;
  return TEXT.laser.notPlaying;
}

async function runLaser(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  // Settings are read once, so a change while the game runs doesn't alter it half way.
  const cfg = { ...CONFIG.events.laser, fine: CONFIG.events.fine };
  const basePool = await getVaultPool(guild.id);
  if (basePool <= 0) {
    console.log(`Skipped Laser Grid in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }
  // The vault's prize, plus events.laser.bonusPerPlayer for every player who joins (new money: paying it all
  // still takes only basePool out of the vault, see vaultCost).
  const vaultPrize = Math.round(basePool * CONFIG.events.vault.multiplier);
  const prizeFor = (joined: number): number => vaultPrize + cfg.bonusPerPlayer * joined;
  const endsAtMs = Date.now() + cfg.joinSeconds * 1000;
  const endsAtUnix = Math.floor(endsAtMs / 1000);
  const web = webConfig();
  const site = web ? siteGameLink(web, 'laser', guild.id) : null;

  // The game, shared by the Discord message and the site's pages. The round being played, its phase, where Duck! is,
  // and when the round's time runs out (unknown, so nothing is late, until the laser is on screen).
  const joiners = new Set<string>();
  const names = new Map<string, string>();
  const nameOf = (userId: string): string => names.get(userId) ?? 'Someone';
  let players: LaserPlayer[] = [];
  let byId = new Map<string, LaserPlayer>();
  let phase: LaserLive['phase'] = 'joining';
  let round = 0;
  let windowMs = laserWindowMs(1, cfg.rounds, cfg.windowSeconds, cfg.minWindowSeconds);
  let duckSlot = 0;
  let decoys = new Map<number, string>();
  let firedAtMs: number | null = null;
  let deadlineMs = Number.POSITIVE_INFINITY;
  let fastest: { userId: string; ms: number } | null = null;
  let refreshJoin: () => void = () => {};
  // Each player's first press this round, and how fast those who ducked did it.
  const results = new Map<string, DuckResult>();
  const reactions = new Map<string, number>();
  const changed = (): void => laserGames.changed(guild.id);
  const open = (): boolean => phase === 'ready' || phase === 'fire';
  /** How `player`'s press this round went, for the site (never which button): their first press, or caught for not pressing. */
  const pressNow = (player: LaserPlayer): LaserLive['players'][number]['now'] => {
    const result = results.get(player.userId);
    if (result) return { result, ms: reactions.get(player.userId) ?? null };
    return player.caughtRound === round && player.caughtFor !== null && round > 0 ? { result: player.caughtFor, ms: null } : null;
  };

  // What the site is shown: the laser only once it's on screen in Discord (its time started), so no page sees Duck! first.
  const shownPhase = (): LaserLive['phase'] => (phase === 'fire' && firedAtMs === null ? 'ready' : phase);

  const game: LaserGame = {
    live: () => ({
      phase: shownPhase(),
      prize: prizeFor(phase === 'joining' ? joiners.size : players.length),
      bonusPerPlayer: cfg.bonusPerPlayer,
      fine: cfg.fine,
      joinEndsAt: endsAtMs,
      rounds: cfg.rounds,
      round,
      windowMs,
      slots: LASER.slots,
      duckSlot: shownPhase() === 'fire' || shownPhase() === 'roundOver' ? duckSlot : null,
      decoys: shownPhase() === 'fire' || shownPhase() === 'roundOver' ? [...decoys].map(([slot, label]) => ({ slot, label })) : [],
      deadline: phase === 'fire' && Number.isFinite(deadlineMs) ? deadlineMs : null,
      players:
        phase === 'joining'
          ? [...joiners].map((id) => ({ id, name: nameOf(id), caughtRound: 0, caughtFor: null, bestMs: null, totalMs: 0, now: null }))
          : players.map((p) => ({ id: p.userId, name: nameOf(p.userId), caughtRound: p.caughtRound, caughtFor: p.caughtFor, bestMs: p.bestMs, totalMs: p.totalMs, now: pressNow(p) })),
      fastest: phase === 'roundOver' && fastest ? { id: fastest.userId, ms: fastest.ms } : null,
      vault: basePool,
    }),
    plays: (userId) => joiners.has(userId),
    join(userId, name) {
      if (phase !== 'joining') return 'closed';
      if (joiners.has(userId)) return 'already';
      joiners.add(userId);
      names.set(userId, name);
      refreshJoin();
      changed();
      return 'ok';
    },
    press(userId, pressedRound, pressedPhase, slot) {
      const player = byId.get(userId);
      if (!player) return { result: 'notPlaying' };
      if (!isIn(player)) return { result: 'out' };
      if (pressedRound !== round) return { result: 'stale' };
      if (!open()) return { result: 'closed' };
      // A player's first press in a round is the one that counts, and can't be changed.
      const first = results.get(userId);
      if (first) return { result: 'already', first, ms: reactions.get(userId) };
      // Judged the moment the press arrives, before anything is awaited.
      const nowMs = Date.now();
      const result = judgePress(pressedPhase, slot, duckSlot, nowMs, deadlineMs);
      results.set(userId, result);
      if (result !== 'ducked') return { result };
      const ms = Math.max(0, nowMs - (firedAtMs ?? nowMs));
      reactions.set(userId, ms);
      recordDuck(player, ms);
      return { result: 'ducked', ms };
    },
  };

  /** How it ended, for the site. */
  const ending = (kind: LaserEnded['kind'], lastRound: number, paid: readonly CrateShare[] = [], fines: readonly VaultFine[] = []): LaserEnded => {
    const won = new Map(paid.map((share) => [share.userId, share.amount]));
    const fined = new Map(fines.map((f) => [f.userId, f.amount]));
    return {
      kind,
      prize: prizeFor(players.length),
      lastRound,
      winners: rankWinners(players).map((p) => ({ id: p.userId, name: nameOf(p.userId), won: won.get(p.userId) ?? 0, bestMs: p.bestMs, totalMs: p.totalMs })),
      caught: players
        .filter((p) => !isIn(p))
        .map((p) => ({ id: p.userId, name: nameOf(p.userId), fine: fined.get(p.userId) ?? 0, round: p.caughtRound, caughtFor: p.caughtFor as Exclude<DuckResult, 'ducked'> })),
      endedAt: Date.now(),
    };
  };

  // Joining.
  const joinEmbed = (joined: number) => laserJoinEmbed(prizeFor(joined), cfg.bonusPerPlayer, cfg.rounds, cfg.windowSeconds, cfg.minWindowSeconds, cfg.fine, endsAtUnix, joined);
  const message = await channel.send({ embeds: [joinEmbed(0)], components: [laserJoinRow(site)], ...(await eventPing(guild)) });
  console.log(`Laser Grid for ${vaultPrize} points (base ${basePool}) plus ${cfg.bonusPerPlayer} a player opened in ${guild.id}.`);
  laserGames.opened(guild.id, game);
  let end: LaserEnded | null = null;
  try {
    const ids = await collectJoiners({
      message,
      endsAtMs,
      joinId: LASER.joinId,
      refreshMs: 1_500,
      render: (joined) => ({ embeds: [joinEmbed(joined)], components: [laserJoinRow(site)] }),
      joinedText: TEXT.laser.joined,
      alreadyText: TEXT.laser.alreadyJoined,
      joiners,
      names,
      listen: (refresh) => (refreshJoin = refresh),
      joined: changed,
    });
    refreshJoin = () => {};
    players = ids.map((userId) => ({ userId, caughtRound: 0, caughtFor: null, bestMs: null, totalMs: 0 }));
    byId = new Map(players.map((player) => [player.userId, player]));
    if (ids.length === 0) {
      phase = 'roundOver';
      end = ending('nobody', 0);
      await showResult(message, channel, laserNoCrewEmbed(), 'Laser Grid');
      return;
    }
    const prize = prizeFor(ids.length);

    // The rounds.
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
    collector.on('collect', (interaction) => {
      const pressed = parseSlotId(interaction.customId);
      if (!pressed) return;
      const press = game.press(interaction.user.id, pressed.round, pressed.phase, pressed.slot);
      if (press.result !== 'stale' && press.result !== 'closed' && press.result !== 'already' && press.result !== 'out' && press.result !== 'notPlaying') changed();
      void replyPrivately(interaction, pressReply(press));
    });

    let lastRound = 0;
    try {
      for (round = 1; round <= cfg.rounds; round++) {
        results.clear();
        reactions.clear();
        fastest = null;
        duckSlot = randomInt(LASER.slots);
        decoys = rollDecoys(LASER.slots, duckSlot, decoyCount(round, LASER.maxDecoys), TEXT.laser.decoyLabels);
        firedAtMs = null;
        deadlineMs = Number.POSITIVE_INFINITY;
        windowMs = laserWindowMs(round, cfg.rounds, cfg.windowSeconds, cfg.minWindowSeconds);

        phase = 'ready';
        changed();
        await message.edit({ embeds: [laserRoundEmbed(round, cfg.rounds, windowMs, false, players)], components: [laserRow(round, 'wait', duckSlot)] }).catch(() => {});
        await sleep(randInt(LASER.minDelayMs, LASER.maxDelayMs));
        // The time starts once the laser is on screen (a press of it before then is never late). The site's pages are
        // told once the Discord message has gone out, so neither sees it first.
        phase = 'fire';
        await message.edit({ embeds: [laserRoundEmbed(round, cfg.rounds, windowMs, true, players)], components: [laserRow(round, 'go', duckSlot, false, decoys)] }).catch(() => {});
        firedAtMs = Date.now();
        deadlineMs = firedAtMs + windowMs;
        changed();
        await sleep(windowMs);

        const caught = settleRound(players, results, round);
        lastRound = round;
        fastest = [...reactions].reduce<{ userId: string; ms: number } | null>((best, [userId, ms]) => (best === null || ms < best.ms ? { userId, ms } : best), null);
        phase = 'roundOver';
        changed();
        if (!players.some(isIn) || round === cfg.rounds) break;
        await message.edit({ embeds: [laserRoundOverEmbed(round, cfg.rounds, caught.length, fastest, players)], components: [laserRow(round, 'go', duckSlot, true, decoys)] }).catch(() => {});
        await sleep(LASER.pauseMs);
      }
      round = lastRound;
    } finally {
      phase = 'roundOver';
      collector.stop();
    }

    // Pay those never caught, take that out of the pool, fine the caught.
    // Fastest first: first place gets the most, and each place after a little less (rankedSplit).
    const winners = rankWinners(players).map((p) => p.userId);
    const caughtIds = players.filter((p) => !isIn(p)).map((p) => p.userId);
    let paid: CrateShare[] = [];
    let failed = 0;
    let fines: VaultFine[] = [];
    try {
      if (winners.length > 0) {
        const payout = await payShares(guild.id, rankedSplit(prize, winners), 'laser_prize');
        paid = payout.paid;
        failed = payout.failed.length;
        const taken = paid.reduce((sum, share) => sum + share.amount, 0);
        await claimVault(guild.id, vaultCost(basePool, prize, taken));
      }
      if (caughtIds.length > 0) fines = await fineIntoVault(guild.id, caughtIds, cfg.fine, 'laser_fine');
    } catch (err) {
      console.error(`Could not settle Laser Grid in ${guild.id}:`, err);
      end = ending('failed', lastRound);
      await showResult(message, channel, laserFailedEmbed(), 'Laser Grid');
      return;
    }
    end = ending('done', lastRound, paid, fines);
    console.log(`Laser Grid in ${guild.id} ended after round ${lastRound}: ${winners.length} of ${ids.length} made it through.`);
    await showResult(message, channel, laserResultEmbed(prize, lastRound, players, paid, fines, failed), 'Laser Grid');
  } finally {
    laserGames.closed(guild.id, end);
  }
}

export const laserGrid: GameEvent = {
  id: 'laser',
  label: 'Laser Grid',
  description:
    'Wait for the laser, then press Duck! before time runs out (less every round). Too early, the wrong button or too slow and you are caught and fined; everyone never caught splits the vault prize.',
  weight: 1,
  run: runLaser,
};
