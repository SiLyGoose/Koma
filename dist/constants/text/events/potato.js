import { boldMoney } from '../currency.js';
export const potatoText = {
    title: 'Hot Potato',
    /** `prize` is what's in play, `blasts` how many potatoes go off at most, `fine` what blowing up costs, `unix` when joining closes. */
    joinDescription: (prize, blasts, fine, unix) => `${boldMoney(prize)} from the vault goes to whoever's still standing. Press **Join** before <t:${unix}:R> (at least **2** players).\n\n` +
        `A potato with a hidden fuse goes to one player. If it's yours, press **Pass** to toss it to someone at random. ` +
        `**Press Pass when it isn't yours and you grab it.** Whoever holds it when it goes off is out and pays a ${boldMoney(fine)} fine. ` +
        `Up to **${blasts}** ${blasts === 1 ? 'potato goes' : 'potatoes go'} off, then everyone left splits the prize.`,
    joinButton: 'Join',
    passButton: 'Pass',
    /** The link to the game on the site (play it there, or watch and chat once joining has closed). */
    siteButton: 'Play on the site',
    playersField: 'Players',
    playersNobody: 'Nobody yet',
    playersCount: (count) => `${count} ${count === 1 ? 'person' : 'people'}${count < 2 ? ' (needs 2)' : ''}`,
    joined: "You're in! The first potato comes out when the timer ends.",
    alreadyJoined: 'You already joined this game.',
    notEnoughTitle: 'Not enough players',
    notEnough: (count) => `Only **${count}** ${count === 1 ? 'person' : 'people'} joined; it takes at least **2**. The money stays in the vault.`,
    /** The live game. `blast` is the potato out now (1 is the first). */
    liveTitle: (blast, blasts) => `Hot Potato: potato ${blast} of ${blasts}`,
    /** `holder` is a mention. */
    holding: (holder, prize) => `🥔 ${holder} has the potato!\nIf it's yours, press **Pass**. If it isn't, **don't**: you'd grab it. The fuse is hidden.\n\n${boldMoney(prize)} goes to whoever's left.`,
    /** Between potatoes: `user` (a mention) was holding the one that just went off. */
    blastTitle: (blast, blasts) => `💥 Potato ${blast} of ${blasts} went off!`,
    blast: (user, fine, more) => `${user} was holding it, and is out (a ${boldMoney(fine)} fine).${more ? '\nThe next potato is coming...' : ''}`,
    blastNobody: 'It went off in nobody\'s hands.',
    inField: 'Still in',
    outField: 'Blown up',
    /** One player still in, with how many times they've passed. */
    inLine: (user, passes) => `${user}${passes > 0 ? ` (${passes} ${passes === 1 ? 'pass' : 'passes'})` : ''}`,
    /** One player out, with the potato that got them. */
    outLine: (user, blast) => `${user} (potato ${blast})`,
    nobody: 'Nobody',
    more: (count) => `...and ${count} more`,
    notPlaying: "You're not in this game.",
    youreOut: "You're out: a potato already went off in your hands.",
    noPotato: 'No potato right now. The next one is coming.',
    /** `to` is a mention. */
    passed: (to) => `You tossed it to ${to}!`,
    /** `from` is a mention. */
    grabbed: (from) => `It wasn't yours! You grabbed the potato from ${from}. Pass it on, quick!`,
    resultTitle: 'The last potato went off',
    /** `count` people split `prize`, each getting `each` (as the crate's `opened`). */
    result: (count, prize, each, extra) => `**${count}** ${count === 1 ? 'player is' : 'players are'} still standing and ${count === 1 ? 'takes' : 'split'} ${boldMoney(prize)}` +
        (count === 1 ? '.' : `: ${boldMoney(each)} each${extra > 0 ? `, and ${extra} lucky ${extra === 1 ? 'player' : 'players'} got 1 more` : ''}.`),
    winnersField: 'Winners',
    winnerLine: (user, won) => `${user} +${boldMoney(won)}`,
    /** One player out, and the fine they paid. */
    finedLine: (user, fine, blast) => `${user} paid ${boldMoney(fine)} (potato ${blast})`,
    failedTitle: 'The game fell apart',
    failed: 'Something went wrong while settling the game, so nobody was paid or fined. Ask the bot admin to look at the logs.',
    someFailed: (count) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
//# sourceMappingURL=potato.js.map