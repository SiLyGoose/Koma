import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../config.js';
import { SPLIT_STEAL, TEXT } from '../constants/index.js';
import { replyPrivately } from '../discord/reply.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import type { CrateShare } from '../lib/events/crate.js';
import { choiceOf, resolveSplitSteal, type SplitStealChoice, type SplitStealOutcome } from '../lib/events/split-steal.js';
import { fmt, mention } from '../lib/format.js';
import { payShares } from '../services/events.js';
import { getVaultPool, takeFromVault, vaultCost } from '../services/vault.js';
import type { EventContext, GameEvent } from './types.js';
import { collectJoiners, limitedLines, LiveMessage, showResult } from './vault-game.js';

/*
 * Split or Steal: players join, then each secretly picks Split or Steal (lib/events/split-steal.ts
 * has the rules). The prize is the vault pool times events.vault.multiplier; what is paid comes
 * out of the pool, and when two or more steal it all stays in the vault.
 */

export function joinRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SPLIT_STEAL.joinId).setLabel(TEXT.splitSteal.joinButton).setStyle(ButtonStyle.Primary),
  );
}

export function choiceRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SPLIT_STEAL.splitId).setLabel(TEXT.splitSteal.splitButton).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(SPLIT_STEAL.stealId).setLabel(TEXT.splitSteal.stealButton).setStyle(ButtonStyle.Danger),
  );
}

export function splitStealJoinEmbed(prize: number, minPlayers: number, endsAtUnix: number, joined: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.splitSteal.title)
    .setDescription(TEXT.splitSteal.joinDescription(fmt(prize), minPlayers, endsAtUnix))
    .addFields({ name: TEXT.splitSteal.playersField, value: joined === 0 ? TEXT.splitSteal.playersNobody : TEXT.splitSteal.playersCount(joined, minPlayers) });
}

/** The choosing screen: who is playing, and how many have chosen (never what). */
export function splitStealDecideEmbed(prize: number, endsAtUnix: number, players: readonly string[], chosen: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.splitSteal.decideTitle)
    .setDescription(TEXT.splitSteal.decideDescription(fmt(prize), endsAtUnix))
    .addFields({
      name: TEXT.splitSteal.playersField,
      value: limitedLines(players.map(mention), SPLIT_STEAL.listMax, TEXT.splitSteal.more, TEXT.splitSteal.playersNobody),
    })
    .setFooter({ text: TEXT.splitSteal.chosenCount(chosen, players.length) });
}

/** The reveal: what happened, then everyone's choice and what they won. */
export function splitStealResultEmbed(
  prize: number,
  players: readonly string[],
  choices: ReadonlyMap<string, SplitStealChoice>,
  outcome: SplitStealOutcome,
  paid: readonly CrateShare[],
  failedPayouts: number,
): BotEmbed {
  const embed = createEmbed();
  if (outcome.kind === 'shared') {
    const each = Math.floor(prize / players.length);
    embed.setTitle(TEXT.splitSteal.sharedTitle).setDescription(TEXT.splitSteal.shared(fmt(prize), players.length, fmt(each), prize - each * players.length));
  } else if (outcome.kind === 'stolen') {
    embed.setTitle(TEXT.splitSteal.stolenTitle).setDescription(TEXT.splitSteal.stolen(mention(outcome.thief), fmt(prize)));
  } else {
    embed.setTitle(TEXT.splitSteal.greedTitle).setDescription(TEXT.splitSteal.greed(outcome.stealers.length));
  }

  const won = new Map(paid.map((share) => [share.userId, share.amount]));
  const lines = players.map((userId) => {
    const picked = choices.get(userId);
    const label = picked === 'steal' ? TEXT.splitSteal.steal : picked === 'split' ? TEXT.splitSteal.split : TEXT.splitSteal.noChoice;
    const amount = won.get(userId) ?? 0;
    return TEXT.splitSteal.choiceLine(mention(userId), label, amount > 0 ? fmt(amount) : '');
  });
  embed.addFields({ name: TEXT.splitSteal.choicesField, value: limitedLines(lines, SPLIT_STEAL.listMax, TEXT.splitSteal.more, TEXT.splitSteal.playersNobody) });
  if (failedPayouts > 0) embed.setFooter({ text: TEXT.splitSteal.someFailed(failedPayouts) });
  return embed;
}

export const splitStealNotEnoughEmbed = (joined: number, minPlayers: number): BotEmbed =>
  createEmbed().setTitle(TEXT.splitSteal.notEnoughTitle).setDescription(TEXT.splitSteal.notEnough(joined, minPlayers));
export const splitStealFailedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.splitSteal.failedTitle).setDescription(TEXT.splitSteal.failed);

async function runSplitSteal(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  const cfg = { ...CONFIG.events.splitSteal };
  const basePool = await getVaultPool(guild.id);
  if (basePool <= 0) {
    console.log(`Skipped Split or Steal in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }
  const prize = Math.round(basePool * CONFIG.events.vault.multiplier);

  // Joining.
  const joinEndsMs = Date.now() + cfg.joinSeconds * 1000;
  const joinUnix = Math.floor(joinEndsMs / 1000);
  const message = await channel.send({ embeds: [splitStealJoinEmbed(prize, cfg.minPlayers, joinUnix, 0)], components: [joinRow()] });
  console.log(`Split or Steal for ${prize} points (base ${basePool}) opened in ${guild.id}.`);
  const players = await collectJoiners({
    message,
    endsAtMs: joinEndsMs,
    joinId: SPLIT_STEAL.joinId,
    refreshMs: SPLIT_STEAL.refreshMs,
    render: (joined) => ({ embeds: [splitStealJoinEmbed(prize, cfg.minPlayers, joinUnix, joined)], components: [joinRow()] }),
    joinedText: TEXT.splitSteal.joined,
    alreadyText: TEXT.splitSteal.alreadyJoined,
  });
  if (players.length < cfg.minPlayers) {
    await showResult(message, channel, splitStealNotEnoughEmbed(players.length, cfg.minPlayers), 'Split or Steal');
    return;
  }

  // Choosing: each press is private, and the last one before time runs out counts.
  const decideEndsMs = Date.now() + cfg.decideSeconds * 1000;
  const decideUnix = Math.floor(decideEndsMs / 1000);
  const playing = new Set(players);
  const choices = new Map<string, SplitStealChoice>();
  const view = () => ({ embeds: [splitStealDecideEmbed(prize, decideUnix, players, choices.size)], components: [choiceRow()] });
  await message.edit(view()).catch(() => {});

  const live = new LiveMessage(message, SPLIT_STEAL.refreshMs);
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: cfg.decideSeconds * 1000 });
  collector.on('collect', (interaction) => {
    const picked: SplitStealChoice | null =
      interaction.customId === SPLIT_STEAL.splitId ? 'split' : interaction.customId === SPLIT_STEAL.stealId ? 'steal' : null;
    if (!picked) return;
    if (!playing.has(interaction.user.id)) {
      void replyPrivately(interaction, TEXT.splitSteal.notPlaying);
      return;
    }
    const first = !choices.has(interaction.user.id);
    choices.set(interaction.user.id, picked);
    if (first) live.show(view());
    void replyPrivately(interaction, picked === 'split' ? TEXT.splitSteal.choseSplit(decideUnix) : TEXT.splitSteal.choseSteal(decideUnix));
  });
  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  await live.stop();

  // The reveal.
  const outcome = resolveSplitSteal(prize, players, choices);
  let paid: CrateShare[] = [];
  let failed = 0;
  try {
    const payout = await payShares(guild.id, outcome.shares, 'split_steal');
    paid = payout.paid;
    failed = payout.failed.length;
    const taken = paid.reduce((sum, share) => sum + share.amount, 0);
    await takeFromVault(guild.id, vaultCost(basePool, prize, taken));
  } catch (err) {
    console.error(`Could not settle Split or Steal in ${guild.id}:`, err);
    await showResult(message, channel, splitStealFailedEmbed(), 'Split or Steal');
    return;
  }
  const stealers = players.filter((userId) => choiceOf(choices, userId) === 'steal').length;
  console.log(`Split or Steal in ${guild.id} ended (${outcome.kind}): ${players.length} players, ${stealers} stole.`);
  await showResult(message, channel, splitStealResultEmbed(prize, players, choices, outcome, paid, failed), 'Split or Steal');
}

export const splitOrSteal: GameEvent = {
  id: 'split-steal',
  label: 'Split or Steal',
  description:
    'Players join, then secretly pick Split or Steal. All split: the vault prize is shared. One steals: they take it all. Two or more steal: nobody gets anything.',
  weight: 1,
  run: runSplitSteal,
};
