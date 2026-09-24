import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Client, type Message, type SendableChannels } from 'discord.js';
import { CONFIG } from '../config.js';
import { TEXT, VAULT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, formatPercent, mention } from '../lib/format.js';
import { splitPile, type CrateShare } from '../lib/events/crate.js';
import { vaultChance } from '../lib/events/vault.js';
import { chance } from '../lib/random.js';
import { listOpenVaults, payVaultLoot, recordJoin, saveOpenVault, takeOpenVault } from '../services/events.js';
import { fineVaultJoiners, getVaultPool, settleVaultSuccess } from '../services/vault.js';
import type { OpenVaultDoc } from '../types.js';
import { claimGuild } from './busy.js';
import { checkEventChannel } from './channel.js';
import type { EventContext, GameEvent } from './types.js';
import { replyPrivately } from '../discord/reply.js';

/*
 * The vault breaker: a vault holding everything lost to gambling (and to caught robbers) so far,
 * times a multiplier, needs a crew to crack it. Everyone who presses Join before the timer ends is
 * in; the more who join, the better the odds (see lib/events/vault.ts). Success splits the prize
 * between the crew and pays it out of the pool (settleVaultSuccess); failure fines every joiner and
 * the fines go back into the pool (fineVaultJoiners), so a vault that fails only grows the next one.
 * No picture yet, like the point crate when it first shipped — see design-decisions.md.
 */

export function vaultEmbed(prize: number, endsAt: number, joined: number, minPlayers: number): BotEmbed {
  return createEmbed()
    .setTitle(TEXT.vault.title)
    .setDescription(TEXT.vault.description(fmt(prize), minPlayers, endsAt))
    .addFields({ name: TEXT.vault.joinedField, value: joined === 0 ? TEXT.vault.joinedNobody : TEXT.vault.joinedCount(joined, minPlayers) });
}

export function joinRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(VAULT.joinId).setLabel(TEXT.vault.button).setStyle(ButtonStyle.Success).setDisabled(disabled),
  );
}

/** What each cracker got, as lines for a field: the first VAULT.listMax, then how many more there were. */
function shareLines(shares: readonly CrateShare[]): string {
  const lines = shares.slice(0, VAULT.listMax).map((share) => TEXT.vault.shareLine(mention(share.userId), fmt(share.amount)));
  if (shares.length > VAULT.listMax) lines.push(TEXT.vault.moreShares(shares.length - VAULT.listMax));
  return lines.join('\n');
}

export function successEmbed(prize: number, joined: number, chanceText: string, shares: readonly CrateShare[], failed: number): BotEmbed {
  const each = Math.floor(prize / joined);
  const extra = prize - each * joined;
  const embed = createEmbed()
    .setTitle(TEXT.vault.successTitle)
    .setDescription(TEXT.vault.success(fmt(prize), joined, chanceText, fmt(each), extra));
  if (shares.length > 0) embed.addFields({ name: TEXT.vault.sharesField, value: shareLines(shares) });
  if (failed > 0) embed.setFooter({ text: TEXT.vault.someFailed(failed) });
  return embed;
}

export const heldEmbed = (chanceText: string, joined: number, fine: number): BotEmbed =>
  createEmbed().setTitle(TEXT.vault.failTitle).setDescription(TEXT.vault.fail(chanceText, joined, fmt(fine)));

export const notEnoughEmbed = (joined: number, minPlayers: number): BotEmbed =>
  createEmbed().setTitle(TEXT.vault.notEnoughTitle).setDescription(TEXT.vault.notEnough(joined, minPlayers));

export const failedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.vault.failedTitle).setDescription(TEXT.vault.failed);

/** Everything the vault breaker needs while it is open, whether it was just posted or picked up again after a restart. */
interface OpenVault {
  guildId: string;
  /** Where to post the result if the vault message can't be edited; null if the channel can't be used any more. */
  channel: SendableChannels | null;
  /** The vault breaker message; null if it can't be found (deleted). Then nothing can be listened to and it is settled at once. */
  message: Message | null;
  messageId: string;
  /** The server's vaultPool at the moment this was posted (see OpenVaultDoc). */
  basePool: number;
  /** basePool times events.vault.multiplier, fixed for this attempt. */
  prize: number;
  /** When it closes, in milliseconds since 1970. */
  endsAtMs: number;
  /** Who has joined. A member is added the moment their press arrives (before anything is awaited), so pressing many times counts once. */
  joiners: Set<string>;
  /** Whether the vault breaker was saved in the database. Only then does settling it first have to take that record. */
  persisted: boolean;
}

/** Shows the last state of the vault breaker: on its own message, or as a new message if that can't be edited (it was deleted). */
async function showResult(vault: OpenVault, embed: BotEmbed): Promise<void> {
  try {
    if (!vault.message) throw new Error('the vault breaker message is gone');
    await vault.message.edit({ embeds: [embed], components: [], attachments: [], files: [] });
  } catch {
    if (!vault.channel) {
      console.error(`Could not show the result of the vault breaker in ${vault.guildId}: the channel can't be used any more.`);
      return;
    }
    await vault.channel.send({ embeds: [embed] }).catch((err) => console.error('Could not show the result of a vault breaker:', err));
  }
}

/** Waits for the joining to stop: until the vault closes, listening for the Join button on the message. */
async function collectJoiners(vault: OpenVault): Promise<void> {
  const { message, joiners } = vault;
  const remaining = vault.endsAtMs - Date.now();
  if (!message || remaining <= 0) return;

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: remaining });
  const minPlayers = CONFIG.events.vault.minPlayers;

  let shownCount = joiners.size;
  let inFlight: Promise<void> | null = null;
  const refresh = setInterval(() => {
    if (inFlight || joiners.size === shownCount) return;
    shownCount = joiners.size;
    inFlight = message
      .edit({ embeds: [vaultEmbed(vault.prize, Math.floor(vault.endsAtMs / 1000), shownCount, minPlayers)] })
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        inFlight = null;
      });
  }, VAULT.refreshMs);

  collector.on('collect', (interaction) => {
    if (interaction.customId !== VAULT.joinId) return;
    const already = joiners.has(interaction.user.id);
    joiners.add(interaction.user.id);
    if (!already && vault.persisted) {
      recordJoin(vault.guildId, vault.messageId, interaction.user.id).catch((err) => console.error('Could not save a vault breaker join:', err));
    }
    void replyPrivately(interaction, already ? TEXT.vault.alreadyJoined : TEXT.vault.joined);
  });

  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  clearInterval(refresh);
  // Wait for an edit that is still going, so the result can't be overwritten by an older state.
  await inFlight;
}

/** The vault breaker has closed: rolls it (or reports too few joined), then pays out or fines. */
async function settleVault(vault: OpenVault): Promise<void> {
  const { guildId, prize, basePool } = vault;

  // Whoever removes the saved vault breaker is the one that settles it, so it can never run twice.
  if (vault.persisted) {
    let taken: OpenVaultDoc | null;
    try {
      taken = await takeOpenVault(guildId, vault.messageId);
    } catch (err) {
      console.error(`Could not settle the vault breaker in ${guildId} (it stays saved and is tried again at the next start):`, err);
      return;
    }
    if (!taken) {
      console.log(`The vault breaker in ${guildId} was already settled by someone else.`);
      return;
    }
  }

  const ids = [...vault.joiners];
  const cfg = CONFIG.events.vault;
  console.log(`The vault breaker in ${guildId} closed: ${prize} points at stake, ${ids.length} ${ids.length === 1 ? 'person' : 'people'} joined.`);

  if (ids.length < cfg.minPlayers) {
    await showResult(vault, notEnoughEmbed(ids.length, cfg.minPlayers));
    return;
  }

  const successChance = vaultChance(ids.length, cfg.minPlayers, cfg.baseChance, cfg.chancePerPlayer, cfg.maxChance);
  const chanceText = formatPercent(successChance);

  if (chance(successChance)) {
    let shares: CrateShare[];
    let paid: CrateShare[];
    try {
      shares = splitPile(prize, ids);
      ({ paid } = await payVaultLoot(guildId, shares));
      await settleVaultSuccess(guildId, basePool);
    } catch (err) {
      console.error(`Could not hand out a vault breaker's prize in ${guildId}:`, err);
      await showResult(vault, failedEmbed());
      return;
    }
    await showResult(vault, successEmbed(prize, ids.length, chanceText, paid, shares.length - paid.length));
    return;
  }

  try {
    await fineVaultJoiners(guildId, ids, cfg.fine);
  } catch (err) {
    console.error(`Could not fine the crew of a failed vault breaker in ${guildId}:`, err);
    await showResult(vault, failedEmbed());
    return;
  }
  await showResult(vault, heldEmbed(chanceText, ids.length, cfg.fine));
}

async function runVaultBreak(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  const cfg = CONFIG.events.vault;
  const basePool = await getVaultPool(guild.id);

  // Nothing has been lost to gambling since the last one: skip rather than post a vault worth 0.
  if (basePool <= 0) {
    console.log(`Skipped a vault breaker in ${guild.id}: nothing has been lost to gambling yet.`);
    return;
  }

  const prize = Math.round(basePool * cfg.multiplier);
  const endsAtMs = Date.now() + cfg.joinSeconds * 1000;

  const message = await channel.send({
    embeds: [vaultEmbed(prize, Math.floor(endsAtMs / 1000), 0, cfg.minPlayers)],
    components: [joinRow()],
  });
  console.log(`A vault breaker for ${prize} points (base ${basePool}) opened in ${guild.id}, open for ${cfg.joinSeconds} seconds.`);

  // Saved, so a restart of the bot while it is open does not lose it. If saving fails the vault breaker still runs, it just can't be picked up again.
  let persisted = false;
  try {
    await saveOpenVault(guild.id, { channelId: channel.id, messageId: message.id, basePool, prize, endsAt: new Date(endsAtMs) });
    persisted = true;
  } catch (err) {
    console.error(`Could not save the vault breaker in ${guild.id}, so it will not survive a restart:`, err);
  }

  const vault: OpenVault = { guildId: guild.id, channel, message, messageId: message.id, basePool, prize, endsAtMs, joiners: new Set(), persisted };
  await collectJoiners(vault);
  await settleVault(vault);
}

/** Picks one vault breaker up again after a restart: goes on listening if it is still open, or settles it if its time ran out while the bot was off. */
async function resumeVault(client: Client, guildId: string, saved: OpenVaultDoc): Promise<void> {
  const release = claimGuild(guildId);
  if (!release) {
    console.error(`The vault breaker saved for ${guildId} was not picked up: an event is already running there.`);
    return;
  }

  let channel: SendableChannels | null = null;
  let message: Message | null = null;
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
    if (guild) {
      const checked = await checkEventChannel(guild, saved.channelId);
      if (checked.ok) {
        channel = checked.channel;
        message = await channel.messages.fetch(saved.messageId).catch(() => null);
      }
    }
  } catch (err) {
    release();
    throw err;
  }

  const vault: OpenVault = {
    guildId,
    channel,
    message,
    messageId: saved.messageId,
    basePool: saved.basePool,
    prize: saved.prize,
    endsAtMs: saved.endsAt.getTime(),
    joiners: new Set(saved.joiners),
    persisted: true,
  };
  const left = Math.max(0, Math.round((vault.endsAtMs - Date.now()) / 1000));
  console.log(
    `Picked up the vault breaker in ${guildId}: ${saved.prize} points at stake, ${saved.joiners.length} joined so far, ${
      message ? `${left} seconds left` : 'its message is gone, so it is settled now'
    }.`,
  );

  // Runs on its own: the bot does not wait for the vault breaker to end before it carries on starting up.
  void (async () => {
    try {
      await collectJoiners(vault);
      await settleVault(vault);
    } catch (err) {
      console.error(`The resumed vault breaker in ${guildId} failed:`, err);
    } finally {
      release();
    }
  })();
}

/** Picks up every vault breaker that was left open when the bot last stopped. */
async function resumeVaults(client: Client): Promise<void> {
  for (const { guildId, vault } of await listOpenVaults()) {
    try {
      await resumeVault(client, guildId, vault);
    } catch (err) {
      console.error(`Could not pick up the vault breaker in ${guildId}:`, err);
    }
  }
}

export const vaultBreaker: GameEvent = {
  id: 'vault',
  label: 'Vault breaker',
  description: 'A vault holding everything lost to gambling opens. A crew has to press Join in time to crack it, splitting the loot; too few, or unlucky, and it stays shut.',
  weight: 1,
  run: runVaultBreak,
  resume: resumeVaults,
};
