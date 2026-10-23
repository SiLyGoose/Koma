import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { RaidShopService } from '../services/raid-shop.js';
import { parse } from '../lib/validate.js';

/* The raid shop's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Item = z.object({ item: z.string() });
/** How many komaGems (or, `recipe` 'uw' or 'ut', tickets) to craft from komaDust at once. */
const Craft = z.object({ count: z.number().int().min(1).max(1000), recipe: z.enum(['gem', 'uw', 'ut']).default('gem') });
/** A ticket used: its kind, and the hero (and, a unique treasure's, which of its four) it is picked as. */
const Use = z.object({ of: z.enum(['uw', 'ut']), hero: z.string().min(1).max(100), skill: z.number().int().min(1).max(4).optional() });

export function raidShopController(shop: RaidShopService) {
  return {
    async view(_req, res) {
      res.json(await shop.view(res.locals.guildId, res.locals.session.userId));
    },

    async buy(req, res) {
      const { item } = parse(Item, req.body);
      res.json(await shop.buy(res.locals.guildId, res.locals.session.userId, item));
    },

    async refresh(_req, res) {
      res.json(await shop.refresh(res.locals.guildId, res.locals.session.userId));
    },

    async craft(req, res) {
      const { count, recipe } = parse(Craft, req.body);
      res.json(await shop.craft(res.locals.guildId, res.locals.session.userId, count, recipe));
    },

    async use(req, res) {
      const { of, hero, skill } = parse(Use, req.body);
      res.json(await shop.use(res.locals.guildId, res.locals.session.userId, of, { hero, ...(skill !== undefined && { skill }) }));
    },
  } satisfies Record<string, RequestHandler>;
}
