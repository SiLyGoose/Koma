import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { RaidShopService } from '../services/raid-shop.js';
import { parse } from '../lib/validate.js';

/* The raid shop's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Item = z.object({ item: z.string() });
/** How many komaGems to craft from komaDust at once. */
const Craft = z.object({ count: z.number().int().min(1).max(1000) });

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
      const { count } = parse(Craft, req.body);
      res.json(await shop.craft(res.locals.guildId, res.locals.session.userId, count));
    },
  } satisfies Record<string, RequestHandler>;
}
