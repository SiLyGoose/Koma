import { balance } from './balance.js';
import { blackjack } from './blackjack.js';
import { claim } from './claim.js';
import { config } from './config.js';
import { databank } from './databank.js';
import { equip } from './equip.js';
import { events } from './events.js';
import { gacha } from './gacha.js';
import { gear } from './gear.js';
import { give } from './give.js';
import { createHelpCommand } from './help.js';
import { inventory } from './inventory.js';
import { leaderboard } from './leaderboard.js';
import { plinko } from './plinko.js';
import { rob } from './rob.js';
import { sell } from './sell.js';
import type { Command } from '../discord/types.js';
import { unequip } from './unequip.js';

export const commands: Command[] = [
  claim,
  gacha,
  inventory,
  equip,
  unequip,
  sell,
  gear,
  databank,
  balance,
  rob,
  plinko,
  blackjack,
  leaderboard,
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
