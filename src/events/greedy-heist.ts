import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../config.js';
import { HEIST, TEXT } from '../constants/index.js';
import { replyPrivately } from '../discord/reply.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { addRoundLoot, alarmChance, roundPot, type HeistPlayer } from '../lib/events/heist.js';
import { fmt, formatPercent, mention } from '../lib/format.js';
import { chance } from '../lib/random.js';
import { payShares } from '../services/events.js';
import { fineIntoVault, getVaultPool, takeFromVault, vaultCost, type VaultFine } from '../services/vault.js';
import type { EventContext, GameEvent } from './types.js';
import { collectJoiners, limitedLines, LiveMessage, showResult } from './vault-game.js';

/*
 * Greedy Heist: a crew joins, then the vault's prize (the pool times events.vault.multiplier) is
 * handed out a slice per round to whoever is still inside, while the alarm gets more likely every
 * round (lib/events/heist.ts has the rules). Escape keeps your loot; anyone still inside when the
 * alarm goes off loses theirs and pays a fine into the vault. Loot is only paid when the heist
 * ends, and what is paid comes out of the pool; loot nobody got away with stays in the vault.
 */

export function heistRow(id: string, label: string, style: ButtonStyle): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style));
}

export function heistJoinEmbed(prize: number, rounds: number, fine: number, endsAtUnix: number, joined: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.heist.title)
    .setDescription(TEXT.heist.joinDescription(fmt(prize), rounds, fmt(fine), endsAtUnix))
    .addFields({ name: TEXT.heist.crewField, value: joined === 0 ? TEXT.heist.crewNobody : TEXT.heist.crewCount(joined) });
}

/** Players with the most loot first. */
const byLoot = (players: readonly HeistPlayer[]): HeistPlayer[] => [...players].sort((a, b) => b.loot - a.loot);

const lootLines = (players: readonly HeistPlayer[]): string =>
  limitedLines(
    byLoot(players).map((player) => TEXT.heist.playerLine(mention(player.userId), fmt(player.loot))),
    HEIST.listMax,
    TEXT.heist.more,
    TEXT.heist.nobody,
  );

/** The live heist after `round` rounds (0 when it has just started). */
export function heistRoundEmbed(round: number, rounds: number, left: number, nextChance: number, players: readonly HeistPlayer[]): BotEmbed {
  const embed = createEmbed()
    .setTitle(TEXT.heist.roundTitle(round, rounds))
    .setDescription(TEXT.heist.roundDescription(fmt(left), formatPercent(nextChance)))
    .addFields({ name: TEXT.heist.insideField, value: lootLines(players.filter((p) => p.status === 'inside')) });
  const escaped = players.filter((p) => p.status === 'escaped');
  if (escaped.length > 0) embed.addFields({ name: TEXT.heist.escapedField, value: lootLines(escaped) });
  return embed;
}

export type HeistEnd = { kind: 'alarm'; round: number } | { kind: 'getaway' } | { kind: 'allOut' };

export function heistResultEmbed(
  end: HeistEnd,
  players: readonly HeistPlayer[],
  fines: readonly VaultFine[],
  fine: number,
  taken: number,
  failedPayouts: number,
): BotEmbed {
  const caught = players.filter((p) => p.status === 'caught');
  const embed = createEmbed();
  if (end.kind === 'alarm') embed.setTitle(TEXT.heist.alarmTitle).setDescription(`${TEXT.heist.alarm(end.round, caught.length, fmt(fine))}\n${TEXT.heist.summary(fmt(taken))}`);
  else if (end.kind === 'getaway') embed.setTitle(TEXT.heist.getawayTitle).setDescription(`${TEXT.heist.getaway}\n${TEXT.heist.summary(fmt(taken))}`);
  else embed.setTitle(TEXT.heist.allOutTitle).setDescription(`${TEXT.heist.allOut}\n${TEXT.heist.summary(fmt(taken))}`);

  const escaped = players.filter((p) => p.status === 'escaped');
  if (escaped.length > 0) embed.addFields({ name: TEXT.heist.escapedField, value: lootLines(escaped) });
  if (caught.length > 0) {
    const paid = new Map(fines.map((f) => [f.userId, f.amount]));
    const lines = caught.map((p) => TEXT.heist.caughtLine(mention(p.userId), fmt(paid.get(p.userId) ?? 0)));
    embed.addFields({ name: TEXT.heist.caughtField, value: limitedLines(lines, HEIST.listMax, TEXT.heist.more, TEXT.heist.nobody) });
  }
  if (failedPayouts > 0) embed.setFooter({ text: TEXT.heist.someFailed(failedPayouts) });
  return embed;
}

export const heistNoCrewEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.heist.noCrewTitle).setDescription(TEXT.heist.noCrew);
export const heistFailedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.heist.failedTitle).setDescription(TEXT.heist.failed);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function runHeist(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  // Settings are read once, so a change while the heist runs doesn't alter it half way.
  const cfg = { ...CONFIG.events.heist };
  const basePool = await getVaultPool(guild.id);
  if (basePool <= 0) {
    console.log(`Skipped a Greedy Heist in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }
  const prize = Math.round(basePool * CONFIG.events.vault.multiplier);

  // Joining.
  const endsAtMs = Date.now() + cfg.joinSeconds * 1000;
  const joinRow = heistRow(HEIST.joinId, TEXT.heist.joinButton, ButtonStyle.Success);
  const message = await channel.send({ embeds: [heistJoinEmbed(prize, cfg.rounds, cfg.fine, Math.floor(endsAtMs / 1000), 0)], components: [joinRow] });
  console.log(`A Greedy Heist for ${prize} points (base ${basePool}) opened in ${guild.id}.`);
  const ids = await collectJoiners({
    message,
    endsAtMs,
    joinId: HEIST.joinId,
    refreshMs: HEIST.refreshMs,
    render: (joined) => ({ embeds: [heistJoinEmbed(prize, cfg.rounds, cfg.fine, Math.floor(endsAtMs / 1000), joined)], components: [joinRow] }),
    joinedText: TEXT.heist.joined,
    alreadyText: TEXT.heist.alreadyJoined,
  });
  if (ids.length === 0) {
    await showResult(message, channel, heistNoCrewEmbed(), 'a Greedy Heist');
    return;
  }

  // The heist itself.
  const players: HeistPlayer[] = ids.map((userId) => ({ userId, loot: 0, status: 'inside' }));
  const byId = new Map(players.map((player) => [player.userId, player]));
  const insideCount = (): number => players.filter((p) => p.status === 'inside').length;
  let round = 0;
  let handedOut = 0;
  const escapeRow = heistRow(HEIST.escapeId, TEXT.heist.escapeButton, ButtonStyle.Danger);
  const view = () => ({
    embeds: [heistRoundEmbed(round, cfg.rounds, prize - handedOut, alarmChance(round + 1, cfg.alarmStart, cfg.alarmStep), players)],
    components: [escapeRow],
  });
  await message.edit(view()).catch(() => {});

  // Wakes the round loop early once nobody is left inside.
  let wakeAllOut: () => void = () => {};
  const allOut = new Promise<void>((resolve) => {
    wakeAllOut = resolve;
  });

  const live = new LiveMessage(message, HEIST.refreshMs);
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
  collector.on('collect', (interaction) => {
    if (interaction.customId !== HEIST.escapeId) return;
    const player = byId.get(interaction.user.id);
    if (!player) {
      void replyPrivately(interaction, TEXT.heist.notInHeist);
      return;
    }
    if (player.status !== 'inside') {
      void replyPrivately(interaction, TEXT.heist.alreadyEscaped(fmt(player.loot)));
      return;
    }
    // Decided the moment the press arrives, before anything is awaited, so a press can't race a round.
    player.status = 'escaped';
    live.show(view());
    void replyPrivately(interaction, TEXT.heist.escaped(fmt(player.loot)));
    if (insideCount() === 0) wakeAllOut();
  });

  let end: HeistEnd | null = null;
  try {
    for (let next = 1; next <= cfg.rounds; next++) {
      await Promise.race([sleep(cfg.roundSeconds * 1000), allOut]);
      if (insideCount() === 0) {
        end = { kind: 'allOut' };
        break;
      }
      if (chance(alarmChance(next, cfg.alarmStart, cfg.alarmStep))) {
        for (const player of players) if (player.status === 'inside') player.status = 'caught';
        end = { kind: 'alarm', round: next };
        break;
      }
      handedOut += addRoundLoot(players, roundPot(prize, cfg.rounds, next));
      round = next;
      live.show(view());
    }
  } finally {
    collector.stop();
    await live.stop();
  }
  if (!end) {
    for (const player of players) if (player.status === 'inside') player.status = 'escaped';
    end = { kind: 'getaway' };
  }

  // Pay the escapees, take that out of the pool, fine the caught.
  const shares = players.filter((p) => p.status === 'escaped' && p.loot > 0).map((p) => ({ userId: p.userId, amount: p.loot }));
  const caughtIds = players.filter((p) => p.status === 'caught').map((p) => p.userId);
  let taken = 0;
  let failed = 0;
  let fines: VaultFine[] = [];
  try {
    const payout = await payShares(guild.id, shares, 'heist_loot');
    taken = payout.paid.reduce((sum, share) => sum + share.amount, 0);
    failed = payout.failed.length;
    await takeFromVault(guild.id, vaultCost(basePool, prize, taken));
    if (caughtIds.length > 0) fines = await fineIntoVault(guild.id, caughtIds, cfg.fine, 'heist_fine');
  } catch (err) {
    console.error(`Could not settle a Greedy Heist in ${guild.id}:`, err);
    await showResult(message, channel, heistFailedEmbed(), 'a Greedy Heist');
    return;
  }
  console.log(`A Greedy Heist in ${guild.id} ended (${end.kind}): ${taken} of ${prize} points taken, ${caughtIds.length} caught.`);
  await showResult(message, channel, heistResultEmbed(end, players, fines, cfg.fine, taken, failed), 'a Greedy Heist');
}

export const greedyHeist: GameEvent = {
  id: 'heist',
  label: 'Greedy Heist',
  description:
    'A crew breaks into the vault. Every round, loot is split between everyone still inside and the alarm gets more likely. Escape to keep your loot; get caught and you lose it and pay a fine.',
  weight: 1,
  run: runHeist,
};
