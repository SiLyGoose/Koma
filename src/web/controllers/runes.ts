import type { RequestHandler } from 'express';
import { z } from 'zod';
import { RUNE_BOXES, RUNES_AT_ONCE, type RuneBoxId } from '../../protocol/runes.js';
import type { RuneService } from '../services/runes.js';
import { CopyId, parse } from '../lib/validate.js';

/* The runes' requests (the Inventory's Runes and the heroes page's). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

/** How many of each rune (its id), and whether they're disassembled rather than sold. */
const Sell = z.object({
  runes: z.record(z.string().max(64), z.number().int().min(1).max(RUNES_AT_ONCE)).refine((runes) => Object.keys(runes).length > 0 && Object.keys(runes).length <= 300),
  disassemble: z.boolean().optional(),
});
/** A Mysterious Rune (protocol/runes.ts RUNE_BOXES), and how many. */
const Craft = z.object({ box: z.enum(RUNE_BOXES.map((box) => box.id) as [RuneBoxId, ...RuneBoxId[]]), count: z.number().int().min(1).max(RUNES_AT_ONCE) });
/** The rune in a copy's socket. */
const Break = z.object({ copy: CopyId, socket: z.number().int().min(0).max(8) });

export function runeController(runes: RuneService) {
  return {
    async sell(req, res) {
      const { runes: counts, disassemble } = parse(Sell, req.body);
      res.json(await runes.sell(res.locals.guildId, res.locals.session.userId, counts, disassemble ?? false));
    },

    async craft(req, res) {
      const { box, count } = parse(Craft, req.body);
      res.json(await runes.craft(res.locals.guildId, res.locals.session.userId, box, count));
    },

    async break(req, res) {
      const { copy, socket } = parse(Break, req.body);
      res.json(await runes.break(res.locals.guildId, res.locals.session.userId, copy, socket));
    },
  } satisfies Record<string, RequestHandler>;
}
