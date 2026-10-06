import type { RequestHandler } from 'express';
import { z } from 'zod';
import { LOADOUT_NUMBERS } from '../../lib/game/items/loadouts.js';
import { SLOTS } from '../../types.js';
import { ApiError } from '../lib/errors.js';
import type { GearService } from '../services/gear.js';
import { CopyId, parse, UserId } from '../lib/validate.js';

/* The gear page's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

/** The most copies one sale sells. */
const SELL_MAX = 1000;

const Copy = z.object({ copy: CopyId });
const Unequip = z.object({ slot: z.enum(SLOTS) });
const Loadout = z.object({ loadout: z.number().refine((n) => LOADOUT_NUMBERS.includes(n)) });
const Refine = z.object({ copy: CopyId, material: CopyId.nullish() });
const Sell = z.object({ copies: z.array(CopyId).min(1).max(SELL_MAX) });
const Lock = z.object({ copy: CopyId, locked: z.boolean() });

export function gearController(gear: GearService) {
  return {
    /** Their own gear, or (?user=…) someone else's in the server, to look at. */
    async view(req, res) {
      const { guildId, session } = res.locals;
      const other = req.query.user;
      if (other === undefined || other === session.userId) return void res.json(await gear.view(guildId, session.userId));
      const user = UserId.safeParse(other).data;
      if (user === undefined) throw new ApiError('not_found');
      res.json(await gear.peek(guildId, user));
    },

    async members(_req, res) {
      res.json(await gear.members(res.locals.guildId, res.locals.session));
    },

    async equip(req, res) {
      const { copy } = parse(Copy, req.body);
      res.json(await gear.equip(res.locals.guildId, res.locals.session.userId, copy));
    },

    async unequip(req, res) {
      const { slot } = parse(Unequip, req.body);
      res.json(await gear.unequip(res.locals.guildId, res.locals.session.userId, slot));
    },

    async unequipAll(_req, res) {
      res.json(await gear.unequipAll(res.locals.guildId, res.locals.session.userId));
    },

    async loadout(req, res) {
      const { loadout } = parse(Loadout, req.body);
      res.json(await gear.switchLoadout(res.locals.guildId, res.locals.session.userId, loadout));
    },

    async refine(req, res) {
      const { copy, material } = parse(Refine, req.body);
      res.json(await gear.refine(res.locals.guildId, res.locals.session.userId, copy, material ?? null));
    },

    async forge(req, res) {
      const { copy } = parse(Copy, req.body);
      res.json(await gear.forge(res.locals.guildId, res.locals.session.userId, copy));
    },

    async sell(req, res) {
      const { copies } = parse(Sell, req.body);
      res.json(await gear.sell(res.locals.guildId, res.locals.session.userId, copies));
    },

    async lock(req, res) {
      const { copy, locked } = parse(Lock, req.body);
      res.json(await gear.lock(res.locals.guildId, res.locals.session.userId, copy, locked));
    },
  } satisfies Record<string, RequestHandler>;
}
