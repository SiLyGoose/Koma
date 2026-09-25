import { commonText } from './common.js';
import { balanceText } from './balance.js';
import { wheelText } from './wheel.js';
import { d20Text } from './d20.js';
import { stonksText } from './stonks.js';
import { claimText } from './claim.js';
import { gachaText } from './gacha.js';
import { betText } from './bet.js';
import { plinkoText } from './plinko.js';
import { blackjackText } from './blackjack.js';
import { sellText } from './sell.js';
import { inventoryText } from './inventory.js';
import { databankText } from './databank.js';
import { leaderboardText } from './leaderboard.js';
import { helpText } from './help.js';
import { gearText } from './gear.js';
import { equipText } from './equip.js';
import { unequipText } from './unequip.js';
import { refineText } from './refine.js';
import { robText } from './rob.js';
import { eventsText } from './events.js';
import { crateText } from './crate.js';
import { vaultText } from './vault.js';
import { heistText } from './heist.js';
import { splitStealText } from './split-steal.js';
import { codedleText } from './codedle.js';
import { giveText } from './give.js';
import { configText } from './config.js';
import { raidText } from './raid.js';

/*
 * Every message the bot sends, one file per command or feature in this folder. `p` is the command
 * prefix (like "k!"), `user` and `victim` are mentions. Text templates are functions: the numbers
 * passed to them are already formatted with thousands separators ("1,250"), and `unix` values are
 * Unix seconds for Discord's <t:...:R> "in 5 minutes" timestamps.
 *
 * To add a section, create a file here and add it below. The key is how code reaches it
 * (TEXT.<key>).
 */
export const TEXT = {
  common: commonText,
  balance: balanceText,
  wheel: wheelText,
  d20: d20Text,
  stonks: stonksText,
  claim: claimText,
  gacha: gachaText,
  bet: betText,
  plinko: plinkoText,
  blackjack: blackjackText,
  sell: sellText,
  inventory: inventoryText,
  databank: databankText,
  leaderboard: leaderboardText,
  help: helpText,
  gear: gearText,
  equip: equipText,
  unequip: unequipText,
  refine: refineText,
  rob: robText,
  events: eventsText,
  crate: crateText,
  vault: vaultText,
  heist: heistText,
  splitSteal: splitStealText,
  codedle: codedleText,
  give: giveText,
  config: configText,
  raid: raidText,
};
