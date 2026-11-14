import { CURRENCY_EMOJI } from '../../core.js';
import { boldMoney } from '../currency.js';
export const blackjackText = {
    usage: (p) => `Use \`${p}blackjack <bet>\` to play alone, like \`${p}blackjack 100\` or \`${p}blackjack all\`, or \`${p}blackjack party\` (optionally with a bet) to open a table others can join.`,
    badBet: (p) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}blackjack 100\`, or \`all\`.`,
    /** For a member who is at one table and tries to sit at another. */
    alreadyPlaying: 'You are already at a blackjack table. Finish that game first.',
    title: 'Blackjack',
    partyTitle: 'Blackjack party',
    /** `closes` is a Discord timestamp that counts down by itself, like "in 12 seconds". */
    lobby: (host, closes, max) => `${host} opened a table for up to ${max} players. Press **Join** and type your bet. The game starts ${closes}, or as soon as a player at the table presses **Start now**.`,
    playersField: (count, max) => `Players (${count}/${max})`,
    nobody: 'Nobody has joined yet.',
    /** One player at a party table: `seat` counts from 1. */
    seatLine: (seat, user, bet) => `**${seat}.** ${user} · ${bet} ${CURRENCY_EMOJI}`,
    joinButton: 'Join',
    leaveButton: 'Leave',
    startButton: 'Start now',
    modalTitle: 'Join the table',
    betLabel: (min, max) => `Bet (${min} to ${max}) or "all"`,
    betPlaceholder: 'For example 100',
    tableFull: 'The table is full.',
    tableClosed: 'That table has already started.',
    alreadySeated: 'You already have a seat at this table.',
    notSeated: 'You do not have a seat at this table.',
    joinFirst: 'Join the table first, then you can start it.',
    /** The party closed with nobody at it. */
    noPlayers: 'Nobody joined, so the table closed.',
    dealing: (count) => (count === 1 ? 'Dealing the cards...' : `Dealing to ${count} players...`),
    /** `deadline` is a Discord timestamp: the player stands by themselves then. */
    turn: (user, deadline) => `${user}, hit, stand or double? You stand automatically ${deadline}.`,
    timedOut: (user) => `${user} took too long and stands.`,
    hitButton: 'Hit',
    standButton: 'Stand',
    doubleButton: (bet) => `Double (${bet})`,
    notYourTurn: 'It is not your turn.',
    notYours: 'This is not your game.',
    badBetBox: 'The bet has to be a whole number, like 100, or "all".',
    notAtTable: 'You are not playing at this table.',
    doubleCantAfford: (bet, balance) => `Doubling costs ${boldMoney(bet)} more and you have ${boldMoney(balance)}`,
    dealerPlays: 'The dealer plays...',
    dealerBlackjack: 'The dealer has blackjack!',
    /** `total` is a number, or "?" while a card is face down. */
    dealerLine: (total, status) => `**Dealer:** ${total}${status ? ` · ${status}` : ''}`,
    /** One player during a game: their total, and what they did or what they bet. */
    playerLine: (seat, user, total, soft, status, bet) => `**${seat}.** ${user}: **${soft ? `soft ${total}` : total}**${status ? ` · ${status}` : ''} · ${bet} ${CURRENCY_EMOJI}`,
    statusBlackjack: 'blackjack!',
    statusBust: 'bust',
    statusStand: 'stands',
    statusDoubled: 'doubled',
    statusActive: 'to play',
    resultTitle: 'Blackjack: results',
    /** One player in the results: `change` is signed, like "+200" or "-50", `verb` is the outcome. */
    resultLine: (seat, user, verb, total, change) => `**${seat}.** ${user}: ${verb} (${total}) · ${boldMoney(change)}`,
    outcomeBlackjack: 'Blackjack!',
    outcomeWin: 'Won',
    outcomePush: 'Push',
    outcomeLose: 'Lost',
    outcomeBust: 'Bust',
    balanceField: 'Balance',
    /** `payout` is like "3 to 2". */
    footer: (payout) => `Blackjack pays ${payout}. The dealer stands on 17. Double on your first two cards.`,
    /** The "double the bet" button under a finished game; "Double" alone is the move during a hand. */
    doubleBetButton: (bet) => `Double bet (${bet})`,
    /** Shown when a bet was already given back (the table was thought to be dead) so it can't pay out. */
    betReturned: (user) => `${user}'s bet had already been returned.`,
    cancelled: 'Something went wrong at this table, so the game was called off and the bets were returned.',
};
//# sourceMappingURL=blackjack.js.map