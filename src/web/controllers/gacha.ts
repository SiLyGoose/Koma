import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { GachaService } from '../services/gacha.js';
import { parse } from '../lib/validate.js';
import { BANNERS, type BannerId } from '../../types.js';

/* The banner page's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

/** Which banner: the standard one when it isn't said. */
const Banner = z.enum(BANNERS as [BannerId, ...BannerId[]]).nullish();
const View = z.object({ banner: Banner });
const Pull = z.object({ multi: z.boolean().nullish(), banner: Banner });
/** The item the guarantee is to give: any of them when it isn't said. */
const Pick = z.object({ banner: Banner, item: z.string().nullish() });

export function gachaController(gacha: GachaService) {
  return {
    async view(req, res) {
      const { banner } = parse(View, req.query);
      res.json(await gacha.view(res.locals.guildId, res.locals.session.userId, banner ?? 'standard'));
    },

    async pull(req, res) {
      const { multi, banner } = parse(Pull, req.body);
      res.json(await gacha.pull(res.locals.guildId, res.locals.session.userId, multi ?? false, banner ?? 'standard'));
    },

    async pick(req, res) {
      const { banner, item } = parse(Pick, req.body);
      res.json(await gacha.pick(res.locals.guildId, res.locals.session.userId, banner ?? 'standard', item ?? null));
    },
  } satisfies Record<string, RequestHandler>;
}
