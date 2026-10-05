import { commonText } from './common.js';
import { balanceText } from './balance.js';
import { wheelText } from './wheel.js';
import { d20Text } from './d20.js';
import { claimText } from './claim.js';
import { skipText } from './skip.js';
import { gachaText } from './items/gacha.js';
import { betText } from './casino/bet.js';
import { plinkoText } from './casino/plinko.js';
import { baccaratText } from './casino/baccarat.js';
import { rouletteText } from './casino/roulette.js';
import { blackjackText } from './casino/blackjack.js';
import { minesText } from './casino/mines.js';
import { pinecraftText } from './pinecraft.js';
import { sellText } from './items/sell.js';
import { inventoryText } from './items/inventory.js';
import { databankText } from './items/databank.js';
import { leaderboardText } from './leaderboard.js';
import { helpText } from './help.js';
import { gearText } from './items/gear.js';
import { equipText } from './items/equip.js';
import { unequipText } from './items/unequip.js';
import { loadoutText } from './items/loadout.js';
import { refineText } from './items/refine.js';
import { forgeText } from './items/forge.js';
import { lockText } from './items/lock.js';
import { robText } from './rob.js';
import { receiptText } from './receipt.js';
import { eventsText } from './events/events.js';
import { crateText } from './events/crate.js';
import { vaultText } from './events/vault.js';
import { heistText } from './events/heist.js';
import { splitStealText } from './events/split-steal.js';
import { codedleText } from './events/codedle.js';
import { giveText } from './give.js';
import { configText } from './config.js';
import { raidText } from './raid.js';
import { newsletterText } from './newsletter.js';
import { statusText } from './status.js';

/*
 * Every message the bot sends, one file per command or feature: the casino games' in casino/, the
 * items' and gear's in items/, the events' in events/, and the rest here. `p` is the command
 * prefix (like "k!"), `user` and `victim` are mentions. Text templates are functions: the numbers
 * passed to them are already formatted with thousands separators ("1,250"), and `unix` values are
 * Unix seconds for Discord's <t:...:R> "in 5 minutes" timestamps.
 *
 * To add a section, create a file (in its group's folder) and add it below. The key is how code reaches it
 * (TEXT.<key>).
 */
export const TEXT = {
  common: commonText,
  balance: balanceText,
  wheel: wheelText,
  d20: d20Text,
  claim: claimText,
  gacha: gachaText,
  bet: betText,
  plinko: plinkoText,
  baccarat: baccaratText,
  roulette: rouletteText,
  blackjack: blackjackText,
  mines: minesText,
  pinecraft: pinecraftText,
  sell: sellText,
  inventory: inventoryText,
  databank: databankText,
  leaderboard: leaderboardText,
  help: helpText,
  gear: gearText,
  equip: equipText,
  unequip: unequipText,
  loadout: loadoutText,
  refine: refineText,
  forge: forgeText,
  lock: lockText,
  rob: robText,
  receipt: receiptText,
  events: eventsText,
  crate: crateText,
  vault: vaultText,
  skip: skipText,
  heist: heistText,
  splitSteal: splitStealText,
  codedle: codedleText,
  give: giveText,
  config: configText,
  raid: raidText,
  newsletter: newsletterText,
  status: statusText,
};
