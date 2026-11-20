import { boldMoney } from '../currency.js';

export const laserText = {
  title: 'Laser Grid',
  /**
   * `prize` is what's in play with the players so far, `bonus` what each player who joins adds (empty when nothing), `rounds` how many,
   * `start`/`end` the time to duck in the first and last round ("3s"), `fine` what getting caught costs, `unix` when joining closes.
   */
  joinDescription: (prize: string, bonus: string, rounds: number, start: string, end: string, fine: string, unix: number) =>
    `The vault's laser grid is on, and ${boldMoney(prize)} goes to whoever makes it through` +
    (bonus === '' ? '. ' : `, ${boldMoney(bonus)} more for every player who joins. `) +
    `Press **Join** before <t:${unix}:R>.\n\n` +
    `Every round, wait for the laser: one button turns into **Duck!**. Press it within **${start}** (down to **${end}** by round **${rounds}**). ` +
    `Watch out for fake ducks: green buttons that don't say **Duck!**. Press too early, press the wrong button or don't press in time, and you're caught: out, with a ${boldMoney(fine)} fine. Only your first press each round counts. ` +
    `Everyone who's never caught splits the prize by speed: the fastest gets the most.`,
  joinButton: 'Join',
  waitButton: '·',
  laserButton: '⚡',
  duckButton: 'Duck!',
  /** What a fake duck says instead: green like Duck!, but never the word. */
  decoyLabels: ['Dock!', 'Duke!', 'Luck!', 'Dusk!', 'Deck!', 'Dunk!', 'Puck!', 'Quack!'],
  /** The link to the game on the site (play it there, or watch and chat once joining has closed). */
  siteButton: 'Play on the site',
  playersField: 'Players',
  playersNobody: 'Nobody yet',
  playersCount: (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`,
  joined: "You're in! The first round starts when the timer ends.",
  alreadyJoined: 'You already joined this game.',
  noCrewTitle: 'Nobody showed up',
  noCrew: 'Nobody joined, so the grid is off. The vault keeps its money.',
  roundTitle: (round: number, rounds: number) => `Laser Grid: round ${round} of ${rounds}`,
  /** `left` players still in, `window` the time they'll have ("2.5s"). */
  ready: (left: number, window: string) =>
    `**${left}** still in. Get ready... wait for **Duck!**, then press it within **${window}**.\n**Don't press anything yet.**`,
  fire: (window: string) => `⚡ **DUCK!** You have **${window}**! Only the one that says **Duck!**.`,
  /** The round's result: `caught` how many, `fastest` "<mention> in 0.42s" or empty. */
  roundOver: (caught: number, fastest: string) =>
    `${caught === 0 ? 'Nobody was caught!' : `**${caught}** caught.`}${fastest === '' ? '' : `\nFastest: ${fastest}.`}`,
  fastest: (user: string, seconds: string) => `${user} in ${seconds}`,
  inField: 'Still in',
  caughtField: 'Caught',
  /** One player caught, and how (`why` is one of `early`/`wrong`/`late`). */
  caughtLine: (user: string, round: number, why: string) => `${user}: ${why} (round ${round})`,
  early: 'too early',
  wrong: 'wrong button',
  late: 'too slow',
  nobody: 'Nobody',
  more: (count: number) => `...and ${count} more`,
  notPlaying: "You're not in this game.",
  youreOut: "You're out: the laser already caught you.",
  staleButton: 'That button is from an earlier round.',
  roundClosed: 'This round is over. Wait for the next one.',
  /** A press after the first this round. irst is what the first did (`ducked in 0.42s`, or one of early/wrong/late's words). */
  alreadyPressed: (first: string) => `You already pressed this round (${first}), and it can't be changed. Only your first press counts.`,
  firstDucked: (seconds: string) => `ducked in ${seconds}`,
  /** What a player's own press did. `seconds` is how fast they ducked ("0.42s"). */
  ducked: (seconds: string) => `Ducked in **${seconds}**!`,
  caughtEarly: "Too early! The laser hadn't fired yet. You're caught.",
  caughtWrong: "Wrong button! You're caught.",
  caughtLate: "Too slow! You're caught.",
  clearTitle: 'Through the grid!',
  /** `count` people split `prize` by place (the fastest in all first). */
  clear: (count: number, prize: string) =>
    count === 1
      ? `**1** player made it through and takes all ${boldMoney(prize)}`
      : `**${count}** players made it through and split ${boldMoney(prize)} by speed: the fastest in all gets the most, and each place after a little less.`,
  allCaughtTitle: 'Everyone got caught',
  allCaught: (round: number) => `The laser caught the last of them in round **${round}**. The money stays in the vault.`,
  winnersField: 'Winners',
  /** A winner: their place (1 is first), what they won, and all their ducks' time added up ("3.21s"). */
  winnerLine: (place: number, user: string, won: string, total: string) => `**${place}.** ${user} +${boldMoney(won)} (${total} in all)`,
  /** One caught player, and the fine they paid. */
  finedLine: (user: string, fine: string, round: number, why: string) => `${user} paid ${boldMoney(fine)}: ${why} (round ${round})`,
  failedTitle: 'The grid fell apart',
  failed: 'Something went wrong while settling the game, so nobody was paid or fined. Ask the bot admin to look at the logs.',
  someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
