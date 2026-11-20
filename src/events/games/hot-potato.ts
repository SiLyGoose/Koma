import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../../config.js';
import { CLICK_GAP_MS, POTATO, TEXT } from '../../constants/index.js';
import { replyPrivately } from '../../discord/reply.js';
import { createEmbed, type BotEmbed } from '../../lib/embed.js';
import { ClickGate } from '../../lib/events/clicks.js';
import { splitPile, type CrateShare } from '../../lib/events/crate.js';
import { addMove, blowUp, playersIn, potatoBlasts, pressPass, rollFuseMs, servePotato, type PotatoState } from '../../lib/events/potato.js';
import { fmt, mention } from '../../lib/format.js';
import { payShares } from '../../services/events.js';
import { claimVault, fineIntoVault, getVaultPool, vaultCost, type VaultFine } from '../../services/vault.js';
import { siteGameLink, webConfig } from '../../web/config.js';
import { eventPing } from '../ping.js';
import { POTATO_TRAIL, type PotatoEnded, type PotatoLive, type PotatoMove } from '../../protocol/potato.js';
import type { EventContext, GameEvent } from '../types.js';
import { SiteGames } from './site-games.js';
import { collectJoiners, limitedLines, LiveMessage, showResult } from './vault-game.js';

/*
 * Hot Potato: players join, then potatoes with a hidden fuse go round (lib/events/potato.ts has
 * the rules). The holder presses Pass to toss it on; anyone else pressing Pass grabs it, and every
 * player's presses count at most once every CLICK_GAP_MS, so mashing the button never helps.
 * Whoever holds a potato when it goes off is out and pays a fine into the vault; the players left
 * when the last one has gone off split the prize (the vault pool times events.vault.multiplier),
 * which comes out of the pool.
 *
 * It is played on the site too (web/games/potato/, its Play on the site button): potatoGames has the game going in each
 * server, which a page joins and passes in just as the buttons do; a page that didn't join in time watches it.
 */

/** One button, and (site: the site's link to the game) Play on the site. */
export function potatoRow(id: string, label: string, style: ButtonStyle, disabled = false, site: string | null = null): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled),
    ...(site ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(site).setLabel(TEXT.potato.siteButton).setEmoji('🥔')] : []),
  );
}

export function potatoJoinEmbed(prize: number, blasts: number, fine: number, endsAtUnix: number, joined: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.potato.title)
    .setDescription(TEXT.potato.joinDescription(fmt(prize), blasts, fmt(fine), endsAtUnix))
    .addFields({ name: TEXT.potato.playersField, value: joined === 0 ? TEXT.potato.playersNobody : TEXT.potato.playersCount(joined) });
}

/** Who's still in and who's been blown up. */
function addPlayerFields(embed: BotEmbed, state: PotatoState): BotEmbed {
  const left = playersIn(state).map((p) => TEXT.potato.inLine(mention(p.userId), p.passes));
  embed.addFields({ name: TEXT.potato.inField, value: limitedLines(left, POTATO.listMax, TEXT.potato.more, TEXT.potato.nobody) });
  const out = state.players.filter((p) => p.out).sort((a, b) => a.blastedBy - b.blastedBy);
  if (out.length > 0) {
    const lines = out.map((p) => TEXT.potato.outLine(mention(p.userId), p.blastedBy));
    embed.addFields({ name: TEXT.potato.outField, value: limitedLines(lines, POTATO.listMax, TEXT.potato.more, TEXT.potato.nobody) });
  }
  return embed;
}

/** Potato `blast` going round, held by `state.holder`. */
export function potatoLiveEmbed(blast: number, blasts: number, prize: number, state: PotatoState): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.potato.liveTitle(blast, blasts))
    .setDescription(TEXT.potato.holding(state.holder ? mention(state.holder) : TEXT.potato.nobody, fmt(prize)));
  return addPlayerFields(embed, state);
}

/** Potato `blast` just went off in `blown`'s hands; `more` when another is coming. */
export function potatoBlastEmbed(blast: number, blasts: number, blown: string | null, fine: number, more: boolean, state: PotatoState): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.potato.blastTitle(blast, blasts))
    .setDescription(blown ? TEXT.potato.blast(mention(blown), fmt(fine), more) : TEXT.potato.blastNobody);
  return addPlayerFields(embed, state);
}

/** The end: who split the prize, and who paid what. */
export function potatoResultEmbed(prize: number, state: PotatoState, paid: readonly CrateShare[], fines: readonly VaultFine[], failedPayouts: number): BotEmbed {
  const winners = playersIn(state);
  const each = winners.length > 0 ? Math.floor(prize / winners.length) : 0;
  const embed = createEmbed()
    .setTitle(TEXT.potato.resultTitle)
    .setDescription(TEXT.potato.result(winners.length, fmt(prize), fmt(each), prize - each * winners.length));
  const won = new Map(paid.map((share) => [share.userId, share.amount]));
  const winLines = winners.map((p) => TEXT.potato.winnerLine(mention(p.userId), fmt(won.get(p.userId) ?? 0)));
  embed.addFields({ name: TEXT.potato.winnersField, value: limitedLines(winLines, POTATO.listMax, TEXT.potato.more, TEXT.potato.nobody) });
  const out = state.players.filter((p) => p.out).sort((a, b) => a.blastedBy - b.blastedBy);
  if (out.length > 0) {
    const fined = new Map(fines.map((f) => [f.userId, f.amount]));
    const lines = out.map((p) => TEXT.potato.finedLine(mention(p.userId), fmt(fined.get(p.userId) ?? 0), p.blastedBy));
    embed.addFields({ name: TEXT.potato.outField, value: limitedLines(lines, POTATO.listMax, TEXT.potato.more, TEXT.potato.nobody) });
  }
  if (failedPayouts > 0) embed.setFooter({ text: TEXT.potato.someFailed(failedPayouts) });
  return embed;
}

export const potatoNotEnoughEmbed = (joined: number): BotEmbed => createEmbed().setTitle(TEXT.potato.notEnoughTitle).setDescription(TEXT.potato.notEnough(joined));
export const potatoFailedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.potato.failedTitle).setDescription(TEXT.potato.failed);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** What a press of Pass did, as the site is told it: lib/events/potato.ts's PassResult, with names, or too soon after the last that counted. */
export type PotatoPress =
  | { result: 'passed'; to: string; name: string }
  | { result: 'grabbed'; from: string; name: string }
  | { result: 'tooFast' | 'out' | 'notPlaying' | 'noPotato' };

/** A Hot Potato going on, as the site plays it (web/games/potato/): the same game as its Discord message. */
export interface PotatoGame {
  /** The game as everyone sees it. */
  live(): PotatoLive;
  /** Whether `userId` joined it (and so plays it, rather than watching). */
  plays(userId: string): boolean;
  join(userId: string, name: string): 'ok' | 'closed' | 'already';
  /** A press of Pass (`to`: the player the holder picked, on the site). */
  pass(userId: string, to?: string): PotatoPress;
}

/** The Hot Potato going on in each server, and how the last ended (for the site). */
export const potatoGames = new SiteGames<PotatoGame, PotatoEnded>('Hot Potato');

async function runPotato(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  // Settings are read once, so a change while the game runs doesn't alter it half way.
  const cfg = { ...CONFIG.events.potato };
  const basePool = await getVaultPool(guild.id);
  if (basePool <= 0) {
    console.log(`Skipped Hot Potato in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }
  const prize = Math.round(basePool * CONFIG.events.vault.multiplier);
  const endsAtMs = Date.now() + cfg.joinSeconds * 1000;
  const endsAtUnix = Math.floor(endsAtMs / 1000);
  const web = webConfig();
  const site = web ? siteGameLink(web, 'potato', guild.id) : null;

  // The game, shared by the Discord message and the site's pages. While joining there is no state yet: just who joined.
  const joiners = new Set<string>();
  const names = new Map<string, string>();
  const nameOf = (userId: string): string => names.get(userId) ?? 'Someone';
  let phase: PotatoLive['phase'] = 'joining';
  let state: PotatoState | null = null;
  let blasts = cfg.blasts;
  let blast = 0;
  let blown: string | null = null;
  // When the potato going round came out, and what has happened to the potatoes (for the site).
  let servedAt = 0;
  const trail: PotatoMove[] = [];
  const moved = (kind: PotatoMove['kind'], from: string | null, to: string | null): void => addMove(trail, { kind, from, to, blast, at: Date.now() }, POTATO_TRAIL);
  let refreshJoin: () => void = () => {};
  let refreshPlay: () => void = () => {};
  const gate = new ClickGate(CLICK_GAP_MS);
  const changed = (): void => potatoGames.changed(guild.id);

  const game: PotatoGame = {
    live: () => ({
      phase,
      prize,
      fine: cfg.fine,
      joinEndsAt: endsAtMs,
      blasts,
      blast,
      players: state
        ? state.players.map((p) => ({ id: p.userId, name: nameOf(p.userId), out: p.out, blastedBy: p.blastedBy, passes: p.passes }))
        : [...joiners].map((id) => ({ id, name: nameOf(id), out: false, blastedBy: 0, passes: 0 })),
      holder: state?.holder ?? null,
      blown,
      vault: basePool,
      servedAt,
      trail: [...trail],
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
    pass(userId, to) {
      // Too soon after this player's last press that counted: it does nothing.
      if (!gate.admit(userId)) return { result: 'tooFast' };
      if (!state) return { result: joiners.has(userId) ? 'noPotato' : 'notPlaying' };
      // Decided the moment the press arrives, before anything is awaited, so two presses can't both move the potato.
      const result = pressPass(state, userId, undefined, to);
      if (result.kind === 'passed') moved('pass', userId, result.to);
      if (result.kind === 'grabbed') moved('grab', result.from, userId);
      if (result.kind === 'passed' || result.kind === 'grabbed') {
        refreshPlay();
        changed();
      }
      if (result.kind === 'passed') return { result: 'passed', to: result.to, name: nameOf(result.to) };
      if (result.kind === 'grabbed') return { result: 'grabbed', from: result.from, name: nameOf(result.from) };
      return { result: result.kind };
    },
  };

  /** How it ended, for the site. */
  const ending = (kind: PotatoEnded['kind'], paid: readonly CrateShare[] = [], fines: readonly VaultFine[] = []): PotatoEnded => {
    const won = new Map(paid.map((share) => [share.userId, share.amount]));
    const fined = new Map(fines.map((f) => [f.userId, f.amount]));
    const players = state?.players ?? [];
    return {
      kind,
      prize,
      winners: players.filter((p) => !p.out).map((p) => ({ id: p.userId, name: nameOf(p.userId), won: won.get(p.userId) ?? 0 })),
      out: players.filter((p) => p.out).map((p) => ({ id: p.userId, name: nameOf(p.userId), fine: fined.get(p.userId) ?? 0, blast: p.blastedBy })),
      trail: [...trail],
      endedAt: Date.now(),
    };
  };

  // Joining.
  const joinRow = potatoRow(POTATO.joinId, TEXT.potato.joinButton, ButtonStyle.Success, false, site);
  const message = await channel.send({ embeds: [potatoJoinEmbed(prize, cfg.blasts, cfg.fine, endsAtUnix, 0)], components: [joinRow], ...(await eventPing(guild)) });
  console.log(`Hot Potato for ${prize} points (base ${basePool}) opened in ${guild.id}.`);
  potatoGames.opened(guild.id, game);
  let end: PotatoEnded | null = null;
  try {
    const ids = await collectJoiners({
      message,
      endsAtMs,
      joinId: POTATO.joinId,
      refreshMs: POTATO.refreshMs,
      render: (joined) => ({ embeds: [potatoJoinEmbed(prize, cfg.blasts, cfg.fine, endsAtUnix, joined)], components: [joinRow] }),
      joinedText: TEXT.potato.joined,
      alreadyText: TEXT.potato.alreadyJoined,
      joiners,
      names,
      listen: (refresh) => (refreshJoin = refresh),
      joined: changed,
    });
    refreshJoin = () => {};
    if (ids.length < 2) {
      phase = 'blast';
      end = ending('notEnough');
      await showResult(message, channel, potatoNotEnoughEmbed(ids.length), 'Hot Potato');
      return;
    }

    // The potatoes.
    state = { players: ids.map((userId) => ({ userId, out: false, blastedBy: 0, passes: 0 })), holder: null };
    blasts = potatoBlasts(cfg.blasts, ids.length);
    const passRow = potatoRow(POTATO.passId, TEXT.potato.passButton, ButtonStyle.Danger, false, site);
    const idleRow = potatoRow(POTATO.passId, TEXT.potato.passButton, ButtonStyle.Danger, true, site);
    const playing = state;
    const view = () => ({ embeds: [potatoLiveEmbed(blast, blasts, prize, playing)], components: [passRow] });

    const live = new LiveMessage(message, POTATO.refreshMs);
    refreshPlay = () => live.show(view());
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
    collector.on('collect', (interaction) => {
      if (interaction.customId !== POTATO.passId) return;
      const press = game.pass(interaction.user.id);
      if (press.result === 'tooFast') {
        void interaction.deferUpdate().catch(() => {});
        return;
      }
      const text =
        press.result === 'passed'
          ? TEXT.potato.passed(mention(press.to))
          : press.result === 'grabbed'
            ? TEXT.potato.grabbed(mention(press.from))
            : press.result === 'out'
              ? TEXT.potato.youreOut
              : press.result === 'noPotato'
                ? TEXT.potato.noPotato
                : TEXT.potato.notPlaying;
      void replyPrivately(interaction, text);
    });

    try {
      for (blast = 1; blast <= blasts; blast++) {
        phase = 'potato';
        blown = null;
        moved('serve', null, servePotato(playing));
        servedAt = Date.now();
        live.show(view());
        changed();
        await sleep(rollFuseMs(cfg.minFuseSeconds, cfg.maxFuseSeconds));
        blown = blowUp(playing, blast);
        moved('blast', blown, null);
        phase = 'blast';
        const more = blast < blasts;
        live.show({ embeds: [potatoBlastEmbed(blast, blasts, blown, cfg.fine, more, playing)], components: [idleRow] });
        changed();
        if (more) await sleep(POTATO.pauseMs);
      }
      blast = blasts;
    } finally {
      refreshPlay = () => {};
      collector.stop();
      await live.stop();
    }

    // Pay those left, take that out of the pool, fine those blown up.
    const winners = playersIn(playing).map((p) => p.userId);
    const outIds = playing.players.filter((p) => p.out).map((p) => p.userId);
    let paid: CrateShare[] = [];
    let failed = 0;
    let fines: VaultFine[] = [];
    try {
      const payout = await payShares(guild.id, splitPile(prize, winners), 'potato_prize');
      paid = payout.paid;
      failed = payout.failed.length;
      const taken = paid.reduce((sum, share) => sum + share.amount, 0);
      await claimVault(guild.id, vaultCost(basePool, prize, taken));
      if (outIds.length > 0) fines = await fineIntoVault(guild.id, outIds, cfg.fine, 'potato_fine');
    } catch (err) {
      console.error(`Could not settle Hot Potato in ${guild.id}:`, err);
      end = ending('failed');
      await showResult(message, channel, potatoFailedEmbed(), 'Hot Potato');
      return;
    }
    end = ending('done', paid, fines);
    console.log(`Hot Potato in ${guild.id} ended: ${winners.length} of ${ids.length} left, ${blasts} potatoes.`);
    await showResult(message, channel, potatoResultEmbed(prize, playing, paid, fines, failed), 'Hot Potato');
  } finally {
    potatoGames.closed(guild.id, end);
  }
}

export const hotPotato: GameEvent = {
  id: 'potato',
  label: 'Hot Potato',
  description:
    "A potato with a hidden fuse goes round. Holding it? Press Pass to toss it on; press Pass when it isn't yours and you grab it. Whoever holds it when it goes off is out and pays a fine; everyone left splits the vault prize.",
  weight: 1,
  run: runPotato,
};
