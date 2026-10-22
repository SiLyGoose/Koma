import type { RequestHandler } from 'express';
import { z } from 'zod';
import { LOADOUT_NUMBERS } from '../../lib/game/items/loadouts.js';
import { RAID_CLASS_IDS } from '../../constants/index.js';
import { SLOTS } from '../../types.js';
import { ApiError } from '../lib/errors.js';
import type { GearService } from '../services/gear.js';
import { CopyId, parse, UserId } from '../lib/validate.js';

/* The gear page's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

/** The most copies one sale sells. */
export const SELL_MAX = 1000;

/** The longest a loadout's new name is read at all (the name's own rules, and its real length, are checkLoadoutName's). */
const NAME_MAX = 200;

const Copy = z.object({ copy: CopyId });
const Unequip = z.object({ slot: z.enum(SLOTS) });
const Loadout = z.object({ loadout: z.number().refine((n) => LOADOUT_NUMBERS.includes(n)) });
const Rename = Loadout.extend({ name: z.string().max(NAME_MAX) });
const Refine = z.object({ copy: CopyId, material: CopyId.nullish() });
const Sell = z.object({ copies: z.array(CopyId).min(1).max(SELL_MAX), salvage: z.boolean().optional() });
const Lock = z.object({ copy: CopyId, locked: z.boolean() });
const Class = z.object({ class: z.enum(RAID_CLASS_IDS).nullable() });

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

    async unlockLoadout(req, res) {
      const { loadout } = parse(Loadout, req.body);
      res.json(await gear.unlockLoadout(res.locals.guildId, res.locals.session.userId, loadout));
    },

    async renameLoadout(req, res) {
      const { loadout, name } = parse(Rename, req.body);
      res.json(await gear.renameLoadout(res.locals.guildId, res.locals.session.userId, loadout, name));
    },

    async refine(req, res) {
      const { copy, material } = parse(Refine, req.body);
      res.json(await gear.refine(res.locals.guildId, res.locals.session.userId, copy, material ?? null));
    },

    async sell(req, res) {
      const { copies, salvage } = parse(Sell, req.body);
      res.json(await gear.sell(res.locals.guildId, res.locals.session.userId, copies, salvage));
    },

    async setClass(req, res) {
      const { class: id } = parse(Class, req.body);
      res.json(await gear.setClass(res.locals.guildId, res.locals.session.userId, id));
    },

    async lock(req, res) {
      const { copy, locked } = parse(Lock, req.body);
      res.json(await gear.lock(res.locals.guildId, res.locals.session.userId, copy, locked));
    },
  } satisfies Record<string, RequestHandler>;
}
