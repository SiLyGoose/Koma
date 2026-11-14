import { boldMoney } from './currency.js';
export const pinecraftText = {
    title: '⛏️ Pinecraft',
    /** The message under `k!pinecraft`. */
    lobby: (user) => `${user}, your mine is on the Koma site: log in with Discord and dig. Hold WASD or the arrow keys against a block to break it: ` +
        'every block takes one ⚡ energy, and the ores you find pay out straight away. The rarer the ore, the longer it takes to break.',
    energyField: '⚡ Energy',
    energyValue: (energy, max, full) => `**${energy}** / ${max}${full ? ` (full ${full})` : ''}`,
    earnedField: 'Earned from ores',
    earnedValue: (earned) => boldMoney(earned),
    /** When everyone's mine starts over (a Discord timestamp, like "in 3 days"). */
    resetField: '🔄 New mine',
    resetValue: (when) => `${when}`,
    /** Without the web site, Pinecraft can't be played. */
    off: 'Pinecraft is played in the browser, and the web site is not set up on this bot yet.',
    playButton: 'Play Pinecraft',
};
//# sourceMappingURL=pinecraft.js.map