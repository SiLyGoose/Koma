import type { RequestHandler } from 'express';
import { z } from 'zod';
import { TRANSCEND_PERKS } from '../../data/transcend.js';
import { HERO_SLOTS } from '../../types.js';
import { ApiError } from '../lib/errors.js';
import type { HeroService } from '../services/heroes.js';
import { CopyId, parse, UserId } from '../lib/validate.js';

/* The heroes' requests (the shop's and the heroes page's). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Hero = z.object({ hero: z.string().max(64) });
const Slot = z.enum(HERO_SLOTS as [string, ...string[]]);
const Equip = Hero.extend({ slot: Slot, copy: CopyId });
/** One slot, or (left out) all of them. */
const Unequip = Hero.extend({ slot: Slot.nullish() });
/** Every perk picked (data/transcend.ts's). */
const Transcend = Hero.extend({ perks: z.array(z.enum(TRANSCEND_PERKS.map((perk) => perk.id) as [string, ...string[]])).max(TRANSCEND_PERKS.length) });

export function heroController(heroes: HeroService) {
  return {
    /** Their own heroes, or (?user=…) someone else's in the server, to look at. */
    async view(req, res) {
      const { guildId, session } = res.locals;
      const other = req.query.user;
      if (other === undefined || other === session.userId) return void res.json(await heroes.view(guildId, session.userId));
      const user = UserId.safeParse(other).data;
      if (user === undefined) throw new ApiError('not_found');
      res.json(await heroes.peek(guildId, user));
    },

    async members(_req, res) {
      res.json(await heroes.members(res.locals.guildId, res.locals.session));
    },

    async buy(req, res) {
      const { hero } = parse(Hero, req.body);
      res.json(await heroes.buy(res.locals.guildId, res.locals.session.userId, hero));
    },

    async equip(req, res) {
      const { hero, slot, copy } = parse(Equip, req.body);
      res.json(await heroes.equip(res.locals.guildId, res.locals.session.userId, hero, slot as (typeof HERO_SLOTS)[number], copy));
    },

    async unequip(req, res) {
      const { hero, slot } = parse(Unequip, req.body);
      res.json(await heroes.unequip(res.locals.guildId, res.locals.session.userId, hero, (slot ?? null) as (typeof HERO_SLOTS)[number] | null));
    },

    async transcend(req, res) {
      const { hero, perks } = parse(Transcend, req.body);
      res.json(await heroes.transcend(res.locals.guildId, res.locals.session.userId, hero, perks));
    },
  } satisfies Record<string, RequestHandler>;
}
