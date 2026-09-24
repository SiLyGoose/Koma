import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Client, type Message, type SendableChannels } from 'discord.js';
import { CONFIG } from '../config.js';
import { CRATE, CURRENCY_EMOJI, TEXT } from '../constants/index.js';
import { createEmbed, type BotEmbed } from '../lib/embed.js';
import { fmt, mention } from '../lib/format.js';
import { crateTier, rollPile, splitPile, type CrateShare, type CrateTier } from '../lib/events/crate.js';
import { listOpenCrates, payCrate, recordGrab, saveOpenCrate, takeOpenCrate } from '../services/events.js';
import type { OpenCrateDoc } from '../types.js';
import { claimGuild } from './busy.js';
import { checkEventChannel } from './channel.js';
import { crateFile, prepareEndPictures, type CrateFile } from './crate-picture.js';
import type { EventContext, GameEvent } from './types.js';
import { replyPrivately } from '../discord/reply.js';

/*
 * The point crate: a pile of points falls into the channel with a Grab button. Everyone who
 * presses it before the timer ends splits the pile evenly. Nobody grabbing means the points blow
 * away. The points are made by the bot (they are not taken from anyone). The message carries a
 * picture of the crate (crate-picture.ts): closed while it is open, then opened or crumbled, its
 * runes glowing emerald, violet or red by how big the pile is.
 */

/** Shows the attached crate picture in the embed, if there is one (`picture`). */
const withPicture = (embed: BotEmbed, picture: boolean): BotEmbed => (picture ? embed.setImage(`attachment://${CRATE.imageName}`) : embed);

/** The crate as it looks while it is open. `endsAt` is when it opens, in seconds since 1970. `picture` is whether its picture is attached. */
export function crateEmbed(pile: number, endsAt: number, grabbed: number, picture = false): BotEmbed {
  return withPicture(
    createEmbed()
      .setTitle(TEXT.crate.title)
      .setDescription(TEXT.crate.description(fmt(pile), endsAt))
      .addFields({ name: TEXT.crate.grabbedField, value: grabbed === 0 ? TEXT.crate.grabbedNobody : TEXT.crate.grabbedCount(grabbed) }),
    picture,
  );
}

/** The row with the Grab button, switched off once the crate has opened. */
export function grabRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CRATE.grabId).setLabel(TEXT.crate.button).setStyle(ButtonStyle.Success).setDisabled(disabled),
  );
}

/** What each grabber got, as lines for a field: the first CRATE.listMax, then how many more there were. */
function shareLines(shares: readonly CrateShare[]): string {
  const lines = shares.slice(0, CRATE.listMax).map((share) => TEXT.crate.shareLine(mention(share.userId), fmt(share.amount)));
  if (shares.length > CRATE.listMax) lines.push(TEXT.crate.moreShares(shares.length - CRATE.listMax));
  return lines.join('\n');
}

/**
 * The crate after it opened. `shares` are the payouts that went through, and `grabbed` is how
 * many people grabbed it (more than `shares.length` when some payouts failed).
 */
export function openedEmbed(pile: number, grabbed: number, shares: readonly CrateShare[], failed: number, picture = false): BotEmbed {
  const each = Math.floor(pile / grabbed);
  const extra = pile - each * grabbed;
  const embed = createEmbed()
    .setTitle(TEXT.crate.openedTitle)
    .setDescription(TEXT.crate.opened(fmt(pile), grabbed, fmt(each), extra));
  if (shares.length > 0) embed.addFields({ name: TEXT.crate.sharesField, value: shareLines(shares) });
  if (failed > 0) embed.setFooter({ text: TEXT.crate.someFailed(failed) });
  return withPicture(embed, picture);
}

export const crumbledEmbed = (pile: number, picture = false): BotEmbed =>
  withPicture(createEmbed().setTitle(TEXT.crate.crumbledTitle).setDescription(TEXT.crate.crumbled(fmt(pile))), picture);

export const failedEmbed = (): BotEmbed => createEmbed().setTitle(TEXT.crate.failedTitle).setDescription(TEXT.crate.failed);

/** Everything the crate needs while it is open, whether it was just posted or picked up again after a restart. */
interface OpenCrate {
  guildId: string;
  /** Where to post the result if the crate message can't be edited; null if the channel can't be used any more. */
  channel: SendableChannels | null;
  /** The crate message; null if it can't be found (deleted). Then nothing can be listened to and it is settled at once. */
  message: Message | null;
  messageId: string;
  pile: number;
  /** How big the pile is for its range, which is the glow colour of its picture. */
  tier: CrateTier;
  /** Whether the crate message has its picture attached (so every edit of it must keep showing it). */
  pictured: boolean;
  /** When it opens, in milliseconds since 1970. */
  endsAtMs: number;
  /** Who has grabbed it. A member is added the moment their press arrives (before anything is awaited), so pressing many times counts once. */
  grabbers: Set<string>;
  /** Whether the crate was saved in the database. Only then does settling it first have to take that record. */
  persisted: boolean;
}

/**
 * Shows the last state of the crate: on its own message (its picture swapped for `picture`, or
 * removed if there is none), or as a new message if that can't be edited (it was deleted).
 */
async function showResult(crate: OpenCrate, embed: BotEmbed, picture: CrateFile | null): Promise<void> {
  const files = picture ? [picture] : [];
  try {
    if (!crate.message) throw new Error('the crate message is gone');
    await crate.message.edit({ embeds: [embed], components: [], attachments: [], files });
  } catch {
    if (!crate.channel) {
      console.error(`Could not show the result of the crate in ${crate.guildId}: the channel can't be used any more.`);
      return;
    }
    await crate.channel.send({ embeds: [embed], files }).catch((err) => console.error('Could not show the result of a crate:', err));
  }
}

/** Waits for the grabbing to stop: until the crate opens, listening for the Grab button on the message. */
async function collectGrabs(crate: OpenCrate): Promise<void> {
  const { message, grabbers } = crate;
  const remaining = crate.endsAtMs - Date.now();
  if (!message || remaining <= 0) return;

  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: remaining });
  const endsAt = Math.floor(crate.endsAtMs / 1000);

  let shownCount = grabbers.size;
  let inFlight: Promise<void> | null = null;
  const refresh = setInterval(() => {
    if (inFlight || grabbers.size === shownCount) return;
    shownCount = grabbers.size;
    inFlight = message
      .edit({ embeds: [crateEmbed(crate.pile, endsAt, shownCount, crate.pictured)] })
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        inFlight = null;
      });
  }, CRATE.refreshMs);

  collector.on('collect', (interaction) => {
    if (interaction.customId !== CRATE.grabId) return;
    const already = grabbers.has(interaction.user.id);
    grabbers.add(interaction.user.id);
    if (!already && crate.persisted) {
      recordGrab(crate.guildId, crate.messageId, interaction.user.id).catch((err) => console.error('Could not save a crate grab:', err));
    }
    void replyPrivately(interaction, already ? TEXT.crate.alreadyGrabbed : TEXT.crate.grabbed);
  });

  await new Promise<void>((resolve) => collector.once('end', () => resolve()));
  clearInterval(refresh);
  // Wait for an edit that is still going, so the result can't be overwritten by an older state.
  await inFlight;
}

/** The crate has opened: pays the grabbers (or lets the points blow away) and shows what happened. */
async function settleCrate(crate: OpenCrate): Promise<void> {
  const { guildId, pile } = crate;

  // Whoever removes the saved crate is the one that pays, so it can never be paid twice.
  if (crate.persisted) {
    let taken: OpenCrateDoc | null;
    try {
      taken = await takeOpenCrate(guildId, crate.messageId);
    } catch (err) {
      console.error(`Could not settle the crate in ${guildId} (it stays saved and is tried again at the next start):`, err);
      return;
    }
    if (!taken) {
      console.log(`The crate in ${guildId} was already settled by someone else.`);
      return;
    }
  }

  const ids = [...crate.grabbers];
  console.log(`The crate in ${guildId} opened: ${pile} points, ${ids.length} ${ids.length === 1 ? 'grabber' : 'grabbers'}.`);
  if (ids.length === 0) {
    const picture = await crateFile('lost', crate.tier);
    await showResult(crate, crumbledEmbed(pile, picture !== null), picture);
    return;
  }

  let shares: CrateShare[];
  let paid: CrateShare[];
  try {
    shares = splitPile(pile, ids);
    ({ paid } = await payCrate(guildId, shares));
  } catch (err) {
    console.error(`Could not hand out a crate in ${guildId}:`, err);
    await showResult(crate, failedEmbed(), null);
    return;
  }
  const picture = await crateFile('opened', crate.tier);
  await showResult(crate, openedEmbed(pile, ids.length, paid, shares.length - paid.length, picture !== null), picture);
}

async function runCrate(ctx: EventContext): Promise<void> {
  const { guild, channel } = ctx;
  const { minPoints, maxPoints, seconds } = CONFIG.events.crate;
  const pile = rollPile(minPoints, maxPoints);
  const tier = crateTier(pile, minPoints, maxPoints);
  // Drawn before the timer starts, so a slow first picture does not eat into the time to grab.
  const picture = await crateFile('closed', tier);
  const endsAtMs = Date.now() + seconds * 1000;

  const message = await channel.send({
    embeds: [crateEmbed(pile, Math.floor(endsAtMs / 1000), 0, picture !== null)],
    components: [grabRow()],
    ...(picture ? { files: [picture] } : {}),
  });
  prepareEndPictures(tier);
  console.log(`A crate of ${pile} points landed in ${guild.id}, open for ${seconds} seconds.`);

  // Saved, so a restart of the bot while it is open does not lose it. If saving fails the crate still runs, it just can't be picked up again.
  let persisted = false;
  try {
    await saveOpenCrate(guild.id, { channelId: channel.id, messageId: message.id, pile, endsAt: new Date(endsAtMs) });
    persisted = true;
  } catch (err) {
    console.error(`Could not save the crate in ${guild.id}, so it will not survive a restart:`, err);
  }

  const crate: OpenCrate = { guildId: guild.id, channel, message, messageId: message.id, pile, tier, pictured: picture !== null, endsAtMs, grabbers: new Set(), persisted };
  await collectGrabs(crate);
  await settleCrate(crate);
}

/** Picks one crate up again after a restart: goes on listening if it is still open, or settles it if its time ran out while the bot was off. */
async function resumeCrate(client: Client, guildId: string, saved: OpenCrateDoc): Promise<void> {
  const release = claimGuild(guildId);
  if (!release) {
    console.error(`The crate saved for ${guildId} was not picked up: an event is already running there.`);
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

  const crate: OpenCrate = {
    guildId,
    channel,
    message,
    messageId: saved.messageId,
    pile: saved.pile,
    tier: crateTier(saved.pile, CONFIG.events.crate.minPoints, CONFIG.events.crate.maxPoints),
    pictured: Boolean(message?.attachments?.find((file) => file.name === CRATE.imageName)),
    endsAtMs: saved.endsAt.getTime(),
    grabbers: new Set(saved.grabbers),
    persisted: true,
  };
  prepareEndPictures(crate.tier);
  const left = Math.max(0, Math.round((crate.endsAtMs - Date.now()) / 1000));
  console.log(`Picked up the crate in ${guildId}: ${saved.pile} points, ${saved.grabbers.length} grabbed so far, ${message ? `${left} seconds left` : 'its message is gone, so it is settled now'}.`);

  // Runs on its own: the bot does not wait for the crate to end before it carries on starting up.
  void (async () => {
    try {
      await collectGrabs(crate);
      await settleCrate(crate);
    } catch (err) {
      console.error(`The resumed crate in ${guildId} failed:`, err);
    } finally {
      release();
    }
  })();
}

/** Picks up every crate that was left open when the bot last stopped. */
async function resumeCrates(client: Client): Promise<void> {
  for (const { guildId, crate } of await listOpenCrates()) {
    try {
      await resumeCrate(client, guildId, crate);
    } catch (err) {
      console.error(`Could not pick up the crate in ${guildId}:`, err);
    }
  }
}

export const pointCrate: GameEvent = {
  id: 'crate',
  label: 'Point crate',
  description: `A crate of ${CURRENCY_EMOJI} falls into the channel. Everyone who presses Grab in time splits it.`,
  weight: 1,
  run: runCrate,
  resume: resumeCrates,
};
