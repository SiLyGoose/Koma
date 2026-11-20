import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CONFIG } from '../../config.js';
import { CLICK_GAP_MS, POTATO, TEXT } from '../../constants/index.js';
import { replyPrivately } from '../../discord/reply.js';
import { createEmbed } from '../../lib/embed.js';
import { ClickGate } from '../../lib/events/clicks.js';
import { splitPile } from '../../lib/events/crate.js';
import { addMove, blowUp, playersIn, potatoBlasts, pressPass, rollFuseMs, servePotato } from '../../lib/events/potato.js';
import { fmt, mention } from '../../lib/format.js';
import { payShares } from '../../services/events.js';
import { claimVault, fineIntoVault, getVaultPool, vaultCost } from '../../services/vault.js';
import { siteGameLink, webConfig } from '../../web/config.js';
import { eventPing } from '../ping.js';
import { POTATO_TRAIL } from '../../protocol/potato.js';
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
export function potatoRow(id, label, style, disabled = false, site = null) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled), ...(site ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(site).setLabel(TEXT.potato.siteButton).setEmoji('🥔')] : []));
}
export function potatoJoinEmbed(prize, blasts, fine, endsAtUnix, joined) {
    return createEmbed()
        .setTitle(TEXT.potato.title)
        .setDescription(TEXT.potato.joinDescription(fmt(prize), blasts, fmt(fine), endsAtUnix))
        .addFields({ name: TEXT.potato.playersField, value: joined === 0 ? TEXT.potato.playersNobody : TEXT.potato.playersCount(joined) });
}
/** Who's still in and who's been blown up. */
function addPlayerFields(embed, state) {
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
export function potatoLiveEmbed(blast, blasts, prize, state) {
    const embed = createEmbed()
        .setTitle(TEXT.potato.liveTitle(blast, blasts))
        .setDescription(TEXT.potato.holding(state.holder ? mention(state.holder) : TEXT.potato.nobody, fmt(prize)));
    return addPlayerFields(embed, state);
}
/** Potato `blast` just went off in `blown`'s hands; `more` when another is coming. */
export function potatoBlastEmbed(blast, blasts, blown, fine, more, state) {
    const embed = createEmbed()
        .setTitle(TEXT.potato.blastTitle(blast, blasts))
        .setDescription(blown ? TEXT.potato.blast(mention(blown), fmt(fine), more) : TEXT.potato.blastNobody);
    return addPlayerFields(embed, state);
}
/** The end: who split the prize, and who paid what. */
export function potatoResultEmbed(prize, state, paid, fines, failedPayouts) {
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
    if (failedPayouts > 0)
        embed.setFooter({ text: TEXT.potato.someFailed(failedPayouts) });
    return embed;
}
export const potatoNotEnoughEmbed = (joined) => createEmbed().setTitle(TEXT.potato.notEnoughTitle).setDescription(TEXT.potato.notEnough(joined));
export const potatoFailedEmbed = () => createEmbed().setTitle(TEXT.potato.failedTitle).setDescription(TEXT.potato.failed);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** The Hot Potato going on in each server, and how the last ended (for the site). */
export const potatoGames = new SiteGames('Hot Potato');
async function runPotato(ctx) {
    const { guild, channel } = ctx;
    // Settings are read once, so a change while the game runs doesn't alter it half way.
    const cfg = { ...CONFIG.events.potato, fine: CONFIG.events.fine };
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
    const joiners = new Set();
    const names = new Map();
    const nameOf = (userId) => names.get(userId) ?? 'Someone';
    let phase = 'joining';
    let state = null;
    let blasts = cfg.blasts;
    let blast = 0;
    let blown = null;
    // When the potato going round came out, and what has happened to the potatoes (for the site).
    let servedAt = 0;
    const trail = [];
    const moved = (kind, from, to) => addMove(trail, { kind, from, to, blast, at: Date.now() }, POTATO_TRAIL);
    let refreshJoin = () => { };
    let refreshPlay = () => { };
    const gate = new ClickGate(CLICK_GAP_MS);
    const changed = () => potatoGames.changed(guild.id);
    const game = {
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
            if (phase !== 'joining')
                return 'closed';
            if (joiners.has(userId))
                return 'already';
            joiners.add(userId);
            names.set(userId, name);
            refreshJoin();
            changed();
            return 'ok';
        },
        pass(userId, to) {
            // Too soon after this player's last press that counted: it does nothing.
            if (!gate.admit(userId))
                return { result: 'tooFast' };
            if (!state)
                return { result: joiners.has(userId) ? 'noPotato' : 'notPlaying' };
            // Decided the moment the press arrives, before anything is awaited, so two presses can't both move the potato.
            const result = pressPass(state, userId, undefined, to);
            if (result.kind === 'passed')
                moved('pass', userId, result.to);
            if (result.kind === 'grabbed')
                moved('grab', result.from, userId);
            if (result.kind === 'passed' || result.kind === 'grabbed') {
                refreshPlay();
                changed();
            }
            if (result.kind === 'passed')
                return { result: 'passed', to: result.to, name: nameOf(result.to) };
            if (result.kind === 'grabbed')
                return { result: 'grabbed', from: result.from, name: nameOf(result.from) };
            return { result: result.kind };
        },
    };
    /** How it ended, for the site. */
    const ending = (kind, paid = [], fines = []) => {
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
    let end = null;
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
        refreshJoin = () => { };
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
            if (interaction.customId !== POTATO.passId)
                return;
            const press = game.pass(interaction.user.id);
            if (press.result === 'tooFast') {
                void interaction.deferUpdate().catch(() => { });
                return;
            }
            const text = press.result === 'passed'
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
                if (more)
                    await sleep(POTATO.pauseMs);
            }
            blast = blasts;
        }
        finally {
            refreshPlay = () => { };
            collector.stop();
            await live.stop();
        }
        // Pay those left, take that out of the pool, fine those blown up.
        const winners = playersIn(playing).map((p) => p.userId);
        const outIds = playing.players.filter((p) => p.out).map((p) => p.userId);
        let paid = [];
        let failed = 0;
        let fines = [];
        try {
            const payout = await payShares(guild.id, splitPile(prize, winners), 'potato_prize');
            paid = payout.paid;
            failed = payout.failed.length;
            const taken = paid.reduce((sum, share) => sum + share.amount, 0);
            await claimVault(guild.id, vaultCost(basePool, prize, taken));
            if (outIds.length > 0)
                fines = await fineIntoVault(guild.id, outIds, cfg.fine, 'potato_fine');
        }
        catch (err) {
            console.error(`Could not settle Hot Potato in ${guild.id}:`, err);
            end = ending('failed');
            await showResult(message, channel, potatoFailedEmbed(), 'Hot Potato');
            return;
        }
        end = ending('done', paid, fines);
        console.log(`Hot Potato in ${guild.id} ended: ${winners.length} of ${ids.length} left, ${blasts} potatoes.`);
        await showResult(message, channel, potatoResultEmbed(prize, playing, paid, fines, failed), 'Hot Potato');
    }
    finally {
        potatoGames.closed(guild.id, end);
    }
}
export const hotPotato = {
    id: 'potato',
    label: 'Hot Potato',
    description: "A potato with a hidden fuse goes round. Holding it? Press Pass to toss it on; press Pass when it isn't yours and you grab it. Whoever holds it when it goes off is out and pays a fine; everyone left splits the vault prize.",
    weight: 1,
    run: runPotato,
};
//# sourceMappingURL=hot-potato.js.map