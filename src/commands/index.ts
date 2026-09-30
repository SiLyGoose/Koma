import { balance } from './balance.js';
import { blackjack } from './blackjack.js';
import { claim } from './claim.js';
import { config } from './config.js';
import { databank } from './databank.js';
import { donate } from './donate.js';
import { equip } from './equip.js';
import { events } from './events.js';
import { gacha } from './gacha.js';
import { gear } from './gear.js';
import { give } from './give.js';
import { createHelpCommand } from './help.js';
import { inventory } from './inventory.js';
import { leaderboard } from './leaderboard.js';
import { loadout } from './loadout.js';
import { mines } from './mines.js';
import { pinecraft } from './pinecraft.js';
import { plinko } from './plinko.js';
import { baccarat } from './baccarat.js';
import { roulette } from './roulette.js';
import { raid } from './raid.js';
import { refine } from './refine.js';
import { rob } from './rob.js';
import { sell } from './sell.js';
import { skip } from './skip.js';
import type { Command } from '../discord/types.js';
import { unequip } from './unequip.js';
import { forge } from './forge.js';
import { lock, unlock } from './lock.js';
import { vault } from './vault.js';

export const commands: Command[] = [
  claim,
  skip,
  gacha,
  inventory,
  equip,
  unequip,
  loadout,
  refine,
  forge,
  lock,
  unlock,
  sell,
  gear,
  databank,
  balance,
  rob,
  plinko,
  baccarat,
  roulette,
  blackjack,
  mines,
  pinecraft,
  raid,
  leaderboard,
  vault,
  donate,
  config,
  events,
  give,
  createHelpCommand(() => commands),
];

/** Every command name and alias, lowercase, mapped to its command. */
export const commandMap: ReadonlyMap<string, Command> = buildCommandMap(commands);

function buildCommandMap(list: Command[]): Map<string, Command> {
  const map = new Map<string, Command>();
  for (const command of list) {
    for (const key of [command.name, ...(command.aliases ?? [])]) {
      if (map.has(key)) throw new Error(`Duplicate command name or alias: ${key}`);
      map.set(key, command);
    }
  }
  return map;
}
