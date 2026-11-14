import { parseBets } from '../../../lib/game/casino/roulette.js';
import type { ClientMessage } from '../../../protocol/roulette.js';
import * as table from '../table/protocol.js';

export * from '../../../protocol/roulette.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/roulette.ts (the site keeps a copy). */

/** Reads a message from the page. Null when it isn't a valid one. */
export const parseClientMessage = (text: string): ClientMessage | null => table.parseTableMessage(text, parseBets);
