import { boldMoney } from './currency.js';

export const pinecraftText = {
  title: '⛏️ Pinecraft',
  /** The message under `k!pinecraft`. */
  lobby: (user: string) =>
    `${user}, press **Open Pinecraft** to go down your mine in the browser. Hold WASD or the arrow keys against a block to break it: ` +
    'every block takes one ⚡ energy, and the ores you find pay out straight away. The rarer the ore, the longer it takes to break.',
  energyField: '⚡ Energy',
  energyValue: (energy: number, max: number, full: string | null) => `**${energy}** / ${max}${full ? ` (full ${full})` : ''}`,
  earnedField: 'Earned from ores',
  earnedValue: (earned: string) => boldMoney(earned),
  /** When everyone's mine starts over (a Discord timestamp, like "in 3 days"). */
  resetField: '🔄 New mine',
  resetValue: (when: string) => `${when} (energy and earnings are kept)`,
  /** Without the web site, Pinecraft can't be played. */
  off: 'Pinecraft is played in the browser, and the web site is not set up on this bot yet.',
  openButton: 'Open Pinecraft',
  notYours: 'This is not your mine. Use the pinecraft command to get your own.',
  link: 'Here is your way into your mine. Keep the link to yourself: for the next 2 hours it lets whoever has it play as you.',
  linkButton: 'Play in the browser',
};
