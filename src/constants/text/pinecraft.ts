import { boldMoney } from './currency.js';

export const pinecraftText = {
  title: '⛏️ Pinecraft',
  /** The message under `k!pinecraft`. */
  lobby: (user: string) =>
    `${user}, your mine is on the Koma site: log in with Discord and dig. Hold WASD or the arrow keys against a block to break it: ` +
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
  playButton: 'Play Pinecraft',
};
