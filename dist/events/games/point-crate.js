import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../../config.js';
import { CRATE, CURRENCY_EMOJI, TEXT } from '../../constants/index.js';
import { createEmbed } from '../../lib/embed.js';
import { fmt, mention } from '../../lib/format.js';
import { crateTier, rollPile, splitPile } from '../../lib/events/crate.js';
import { listOpenCrates, payCrate, recordGrab, saveOpenCrate, takeOpenCrate } from '../../services/events.js';
import { claimGuild } from '../busy.js';
import { checkEventChannel } from '../channel.js';
import { crateFile, prepareEndPictures } from './crate-picture.js';
import { eventPing } from '../ping.js';
import { replyPrivately } from '../../discord/reply.js';
/*
 * The point crate: a pile of points falls into the channel with a Grab button. Everyone who
 * presses it before the timer ends splits the pile evenly. Nobody grabbing means the points blow
 * away. The points are made by the bot (they are not taken from anyone). The message carries a
 * picture of the crate (crate-picture.ts): closed while it is open, then opened or crumbled, its
 * runes glowing emerald, violet or red by how big the pile is.
 */
/** Shows the attached crate picture in the embed, if there is one (`picture`). */
const withPicture = (embed, picture) => (picture ? embed.setImage(`attachment://${CRATE.imageName}`) : embed);
/** The crate as it looks while it is open. `endsAt` is when it opens, in seconds since 1970. `picture` is whether its picture is attached. */
export function crateEmbed(pile, endsAt, grabbed, picture = false) {
    return withPicture(createEmbed()
        .setTitle(TEXT.crate.title)
        .setDescription(TEXT.crate.description(fmt(pile), endsAt))
        .addFields({ name: TEXT.crate.grabbedField, value: grabbed === 0 ? TEXT.crate.grabbedNobody : TEXT.crate.grabbedCount(grabbed) }), picture);
}
/** The row with the Grab button, switched off once the crate has opened. */
export function grabRow(disabled = false) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CRATE.grabId).setLabel(TEXT.crate.button).setStyle(ButtonStyle.Success).setDisabled(disabled));
}
/** What each grabber got, as lines for a field: the first CRATE.listMax, then how many more there were. */
function shareLines(shares) {
    const lines = shares.slice(0, CRATE.listMax).map((share) => TEXT.crate.shareLine(mention(share.userId), fmt(share.amount)));
    if (shares.length > CRATE.listMax)
        lines.push(TEXT.crate.moreShares(shares.length - CRATE.listMax));
    return lines.join('\n');
}
/**
 * The crate after it opened. `shares` are the payouts that went through, and `grabbed` is how
 * many people grabbed it (more than `shares.length` when some payouts failed).
 */
export function openedEmbed(pile, grabbed, shares, failed, picture = false) {
    const each = Math.floor(pile / grabbed);
    const extra = pile - each * grabbed;
    const embed = createEmbed()
        .setTitle(TEXT.crate.openedTitle)
        .setDescription(TEXT.crate.opened(fmt(pile), grabbed, fmt(each), extra));
    if (shares.length > 0)
        embed.addFields({ name: TEXT.crate.sharesField, value: shareLines(shares) });
    if (failed > 0)
        embed.setFooter({ text: TEXT.crate.someFailed(failed) });
    return withPicture(embed, picture);
}
export const crumbledEmbed = (pile, picture = false) => withPicture(createEmbed().setTitle(TEXT.crate.crumbledTitle).setDescription(TEXT.crate.crumbled(fmt(pile))), picture);
export const failedEmbed = () => createEmbed().setTitle(TEXT.crate.failedTitle).setDescription(TEXT.crate.failed);
/**
 * Shows the last state of the crate: on its own message (its picture swapped for `picture`, or
 * removed if there is none), or as a new message if that can't be edited (it was deleted).
 */
async function showResult(crate, embed, picture) {
    const files = picture ? [picture] : [];
    try {
        if (!crate.message)
            throw new Error('the crate message is gone');
        await crate.message.edit({ embeds: [embed], components: [], attachments: [], files });
    }
    catch {
        if (!crate.channel) {
            console.error(`Could not show the result of the crate in ${crate.guildId}: the channel can't be used any more.`);
            return;
        }
        await crate.channel.send({ embeds: [embed], files }).catch((err) => console.error('Could not show the result of a crate:', err));
    }
}
/** Waits for the grabbing to stop: until the crate opens, listening for the Grab button on the message. */
async function collectGrabs(crate) {
    const { message, grabbers } = crate;
    const remaining = crate.endsAtMs - Date.now();
    if (!message || remaining <= 0)
        return;
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: remaining });
    const endsAt = Math.floor(crate.endsAtMs / 1000);
    let shownCount = grabbers.size;
    let inFlight = null;
    const refresh = setInterval(() => {
        if (inFlight || grabbers.size === shownCount)
            return;
        shownCount = grabbers.size;
        inFlight = message
            .edit({ embeds: [crateEmbed(crate.pile, endsAt, shownCount, crate.pictured)] })
            .then(() => { }, () => { })
            .finally(() => {
            inFlight = null;
        });
    }, CRATE.refreshMs);
    collector.on('collect', (interaction) => {
        if (interaction.customId !== CRATE.grabId)
            return;
        const already = grabbers.has(interaction.user.id);
        grabbers.add(interaction.user.id);
        if (!already && crate.persisted) {
            recordGrab(crate.guildId, crate.messageId, interaction.user.id).catch((err) => console.error('Could not save a crate grab:', err));
        }
        void replyPrivately(interaction, already ? TEXT.crate.alreadyGrabbed : TEXT.crate.grabbed);
    });
    await new Promise((resolve) => collector.once('end', () => resolve()));
    clearInterval(refresh);
    // Wait for an edit that is still going, so the result can't be overwritten by an older state.
    await inFlight;
}
/** The crate has opened: pays the grabbers (or lets the points blow away) and shows what happened. */
async function settleCrate(crate) {
    const { guildId, pile } = crate;
    // Whoever removes the saved crate is the one that pays, so it can never be paid twice.
    if (crate.persisted) {
        let taken;
        try {
            taken = await takeOpenCrate(guildId, crate.messageId);
        }
        catch (err) {
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
    let shares;
    let paid;
    try {
        shares = splitPile(pile, ids);
        ({ paid } = await payCrate(guildId, shares));
    }
    catch (err) {
        console.error(`Could not hand out a crate in ${guildId}:`, err);
        await showResult(crate, failedEmbed(), null);
        return;
    }
    const picture = await crateFile('opened', crate.tier);
    await showResult(crate, openedEmbed(pile, ids.length, paid, shares.length - paid.length, picture !== null), picture);
}
async function runCrate(ctx) {
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
        ...(await eventPing(guild)),
    });
    prepareEndPictures(tier);
    console.log(`A crate of ${pile} points landed in ${guild.id}, open for ${seconds} seconds.`);
    // Saved, so a restart of the bot while it is open does not lose it. If saving fails the crate still runs, it just can't be picked up again.
    let persisted = false;
    try {
        await saveOpenCrate(guild.id, { channelId: channel.id, messageId: message.id, pile, endsAt: new Date(endsAtMs) });
        persisted = true;
    }
    catch (err) {
        console.error(`Could not save the crate in ${guild.id}, so it will not survive a restart:`, err);
    }
    const crate = { guildId: guild.id, channel, message, messageId: message.id, pile, tier, pictured: picture !== null, endsAtMs, grabbers: new Set(), persisted };
    await collectGrabs(crate);
    await settleCrate(crate);
}
/**
 * Whether a crate message has its picture attached. Discord leaves an attachment its embed shows out of the message's
 * attachments, so it is looked for in the embed's image too: missed, every edit would drop it from the embed and Discord
 * would show the still-attached picture above it.
 */
const isPictured = (message) => message.attachments.some((file) => file.name === CRATE.imageName) ||
    message.embeds.some((embed) => embed.image?.url.split('?')[0]?.endsWith(`/${CRATE.imageName}`) === true);
/** Picks one crate up again after a restart: goes on listening if it is still open, or settles it if its time ran out while the bot was off. */
async function resumeCrate(client, guildId, saved) {
    const release = claimGuild(guildId);
    if (!release) {
        console.error(`The crate saved for ${guildId} was not picked up: an event is already running there.`);
        return;
    }
    let channel = null;
    let message = null;
    try {
        const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
        if (guild) {
            const checked = await checkEventChannel(guild, saved.channelId);
            if (checked.ok) {
                channel = checked.channel;
                message = await channel.messages.fetch(saved.messageId).catch(() => null);
            }
        }
    }
    catch (err) {
        release();
        throw err;
    }
    const crate = {
        guildId,
        channel,
        message,
        messageId: saved.messageId,
        pile: saved.pile,
        tier: crateTier(saved.pile, CONFIG.events.crate.minPoints, CONFIG.events.crate.maxPoints),
        pictured: message !== null && isPictured(message),
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
        }
        catch (err) {
            console.error(`The resumed crate in ${guildId} failed:`, err);
        }
        finally {
            release();
        }
    })();
}
/** Picks up every crate that was left open when the bot last stopped. */
async function resumeCrates(client) {
    for (const { guildId, crate } of await listOpenCrates()) {
        try {
            await resumeCrate(client, guildId, crate);
        }
        catch (err) {
            console.error(`Could not pick up the crate in ${guildId}:`, err);
        }
    }
}
export const pointCrate = {
    id: 'crate',
    label: 'Point crate',
    description: `A crate of ${CURRENCY_EMOJI} falls into the channel. Everyone who presses Grab in time splits it.`,
    weight: 1,
    run: runCrate,
    resume: resumeCrates,
};
//# sourceMappingURL=point-crate.js.map