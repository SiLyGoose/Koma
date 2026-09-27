import { CURRENCY_EMOJI } from '../core.js';
import type { MineOre } from '../mine.js';
import { boldMoney } from './currency.js';

const ORE: Record<MineOre, { name: string; emoji: string }> = {
  coal: { name: 'Coal', emoji: '⚫' },
  iron: { name: 'Iron', emoji: '⛓️' },
  gold: { name: 'Gold', emoji: '🟡' },
  diamond: { name: 'Diamond', emoji: '💎' },
};

export const mineText = {
  usage: (p: string) => `Use \`${p}mine <bet>\` to go down the mine, like \`${p}mine 100\`, or \`${p}mine all\`.`,
  /** `k!mine` with no bet, when the mine is played on the web. */
  lobby: (user: string) => `${user}, press **Open the mine** to go to the mine in your browser. Pick your bet there, and play as many runs as you like.`,
  badBet: (p: string) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}mine 100\`, or \`all\`.`,
  alreadyPlaying: 'You are already down the mine. Finish that run first.',
  notYours: 'This is not your run.',
  ore: ORE,
  title: '⛏️ Mine',
  /** `multiplier` is like "2.3x". */
  resultTitle: (multiplier: string) => `⛏️ Mine: cashed out at ${multiplier}`,
  boomTitle: '🧨 Mine: boom!',
  /** How a run starts. `dynamite` is how much the first field has. */
  start: (user: string, bet: string, dynamite: number, ores: number) =>
    `${user} goes down the mine with ${boldMoney(bet)}. Move with the arrows: stepping onto a hidden tile digs it. ` +
    `This field has **${ores}** ores and **${dynamite}** 🧨 dynamite. Dig up every ore to clear it, or cash out whenever you like.`,
  /** The run is played on the web page. */
  webStart: (user: string, bet: string, dynamite: number, ores: number) =>
    `${user} goes down the mine with ${boldMoney(bet)}. Press **Open the mine** to play it in your browser with WASD or the arrow keys. ` +
    `This field has **${ores}** ores and **${dynamite}** 🧨 dynamite.`,
  webFooter: (idleSeconds: number) => `Only you can open your run. Idle for ${idleSeconds}s and you cash out automatically. You can start more runs from the page.`,
  openButton: 'Open the mine',
  link: 'Here is your way into the mine. Keep the link to yourself: for the next 2 hours it lets whoever has it play with your points.',
  linkButton: 'Play in the browser',
  walk: 'You walk over dug ground.',
  rock: '🪨 Just rock.',
  /** `gained` is like "+0.5x". */
  found: (ore: MineOre, gained: string) => `${ORE[ore].emoji} **${ORE[ore].name}**! ${gained}`,
  /** The field's last ore, the bonus for clearing it, and the next field. */
  cleared: (ore: MineOre, gained: string, bonus: string, field: number, dynamite: number) =>
    `${ORE[ore].emoji} **${ORE[ore].name}**! ${gained}\n✨ **Field cleared!** ${bonus} bonus. On to field ${field}, with **${dynamite}** 🧨 dynamite.`,
  boom: (user: string, bet: string) => `🧨 **BOOM!** ${user} dug up dynamite and lost ${boldMoney(bet)}`,
  cashedOut: (user: string, bet: string, multiplier: string, payout: string) =>
    `${user} cashed out ${boldMoney(bet)} at **${multiplier}** and got ${boldMoney(payout)}`,
  /** The run was left alone for too long and cashed out by itself. */
  idleCashedOut: (user: string, bet: string, multiplier: string, payout: string) =>
    `${user} left the mine, so ${boldMoney(bet)} was cashed out at **${multiplier}** for ${boldMoney(payout)}`,
  /** The run had already been settled (cashed out by the sweeper), so nothing was paid now. */
  alreadySettled: 'This run had already been cashed out.',
  betField: 'Bet',
  multiplierField: 'Multiplier',
  cashOutField: 'Cash out',
  fieldField: 'Field',
  /** One line about the field being dug. */
  fieldValue: (field: number, oresLeft: number, dynamite: number) => `#${field} · ${oresLeft} ore${oresLeft === 1 ? '' : 's'} left · ${dynamite} 🧨`,
  balanceField: 'Balance',
  cashOutButton: (payout: string) => `Cash out (${payout})`,
  /** `bonus` is like "+1x". */
  footer: (idleSeconds: number, bonus: string) => `Each ore raises the multiplier, and clearing a field adds ${bonus}. Idle for ${idleSeconds}s and you cash out automatically.`,
  cancelled: 'Something went wrong down the mine, so the run was cashed out at the multiplier it had reached.',
};
