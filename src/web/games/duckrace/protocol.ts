import { parseBets } from '../../../lib/game/casino/duckrace.js';
import type { ClientMessage } from '../../../protocol/duckrace.js';
import * as table from '../table/protocol.js';

export * from '../../../protocol/duckrace.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/duckrace.ts (the site keeps a copy). */

/** Reads a message from the page. Null when it isn't a valid one. */
export const parseClientMessage = (text: string): ClientMessage | null => table.parseTableMessage(text, parseBets);
