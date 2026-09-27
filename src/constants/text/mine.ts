import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const mineText = {
  usage: (p: string, min: number, max: number) =>
    `Use \`${p}mine\` to open the mine, or \`${p}mine <bet> [mines]\` to start a round, like \`${p}mine 100 3\` or \`${p}mine all 5\` (${min} to ${max} mines).`,
  /** `k!mine` with no bet. */
  lobby: (user: string) =>
    `${user}, press **Open the mine** to play in your browser. Pick your bet and how many mines, then turn over tiles: every gem raises your multiplier, a mine loses the bet. Cash out whenever you like.`,
  badBet: (p: string) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}mine 100\`, or \`all\`.`,
  badMines: (p: string, min: number, max: number) => `The mines have to be a whole number from ${min} to ${max}, like \`${p}mine 100 3\`.`,
  alreadyPlaying: 'You already have a round going in the mine. Finish that one first.',
  /** Without the web site, the mine can't be played. */
  off: 'The mine is played in the browser, and the web site is not set up on this bot yet.',
  notYours: 'This is not your mine.',
  title: '💣 Mine',
  /** A round started from Discord, to be played on the page. */
  start: (user: string, bet: string, mines: number, first: string) =>
    `${user} bet ${boldMoney(bet)} on a board with **${mines}** 💣. Press **Open the mine** to play it in your browser. The first gem pays **${first}**.`,
  footer: (idleSeconds: number, cap: string) => `Only you can open your round. Idle for ${idleSeconds}s and you cash out automatically. Rounds stop at ${cap}.`,
  openButton: 'Open the mine',
  link: 'Here is your way into the mine. Keep the link to yourself: for the next 2 hours it lets whoever has it play with your points.',
  linkButton: 'Play in the browser',
  /** `multiplier` is like "2.3x". */
  resultTitle: (multiplier: string) => `💎 Mine: cashed out at ${multiplier}`,
  boomTitle: '💣 Mine: boom!',
  boom: (user: string, bet: string, gems: number) => `💣 **BOOM!** ${user} hit a mine after ${gems} gem${gems === 1 ? '' : 's'} and lost ${boldMoney(bet)}`,
  cashedOut: (user: string, bet: string, multiplier: string, payout: string) => `${user} cashed out ${boldMoney(bet)} at **${multiplier}** and got ${boldMoney(payout)}`,
  /** Every gem turned over, or the cap reached: cashed out by itself. */
  doneCashedOut: (user: string, bet: string, multiplier: string, payout: string) =>
    `${user} ran the board! ${boldMoney(bet)} cashed out at **${multiplier}** for ${boldMoney(payout)}`,
  /** The round was left alone for too long and cashed out by itself. */
  idleCashedOut: (user: string, bet: string, multiplier: string, payout: string) =>
    `${user} walked away, so ${boldMoney(bet)} was cashed out at **${multiplier}** for ${boldMoney(payout)}`,
  /** The round had already been settled (cashed out by the sweeper), so nothing was paid now. */
  alreadySettled: 'This round had already been cashed out.',
  cancelled: 'Something went wrong in the mine, so the round was cashed out at the multiplier it had reached.',
  betField: 'Bet',
  minesField: 'Mines',
  balanceField: 'Balance',
};
