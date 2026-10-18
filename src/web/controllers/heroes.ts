import type { RequestHandler } from 'express';
import { z } from 'zod';
import { TRANSCEND_PERKS } from '../../data/transcend.js';
import { HERO_SLOTS } from '../../types.js';
import { ApiError } from '../lib/errors.js';
import type { HeroService } from '../services/heroes.js';
import { CopyId, parse, UserId } from '../lib/validate.js';
import { SELL_MAX } from './gear.js';

/* The heroes' requests (the shop's and the heroes page's). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Hero = z.object({ hero: z.string().max(64) });
const Slot = z.enum(HERO_SLOTS as [string, ...string[]]);
const Equip = Hero.extend({ slot: Slot, copy: CopyId });
const Refine = z.object({ copy: CopyId });
const Sell = z.object({ copies: z.array(CopyId).min(1).max(SELL_MAX) });
const Lock = z.object({ copy: CopyId, locked: z.boolean() });
/** A rune into a copy's socket, or (null) the one in it out. */
const Rune = z.object({ copy: CopyId, socket: z.number().int().min(0).max(8), rune: z.string().max(64).nullable() });
/** One of a copy's options (from 0), or its unique option. */
const Reroll = z.object({ copy: CopyId, option: z.union([z.number().int().min(0).max(8), z.literal('unique')]) });
/** One slot, or (left out) all of them. */
const Unequip = Hero.extend({ slot: Slot.nullish() });
/** Every perk picked (data/transcend.ts's). */
const Perks = Hero.extend({ perks: z.array(z.enum(TRANSCEND_PERKS.map((perk) => perk.id) as [string, ...string[]])).max(TRANSCEND_PERKS.length) });

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

    async perks(req, res) {
      const { hero, perks } = parse(Perks, req.body);
      res.json(await heroes.perks(res.locals.guildId, res.locals.session.userId, hero, perks));
    },

    async transcend(req, res) {
      const { hero } = parse(Hero, req.body);
      res.json(await heroes.transcend(res.locals.guildId, res.locals.session.userId, hero));
    },

    async refine(req, res) {
      const { copy } = parse(Refine, req.body);
      res.json(await heroes.refine(res.locals.guildId, res.locals.session.userId, copy));
    },

    async rune(req, res) {
      const { copy, socket, rune } = parse(Rune, req.body);
      res.json(await heroes.rune(res.locals.guildId, res.locals.session.userId, copy, socket, rune));
    },

    async reroll(req, res) {
      const { copy, option } = parse(Reroll, req.body);
      res.json(await heroes.reroll(res.locals.guildId, res.locals.session.userId, copy, option));
    },

    async upgrade(req, res) {
      const { copy } = parse(Refine, req.body);
      res.json(await heroes.upgrade(res.locals.guildId, res.locals.session.userId, copy));
    },

    async sell(req, res) {
      const { copies } = parse(Sell, req.body);
      res.json(await heroes.sell(res.locals.guildId, res.locals.session.userId, copies));
    },

    async lock(req, res) {
      const { copy, locked } = parse(Lock, req.body);
      res.json(await heroes.lock(res.locals.guildId, res.locals.session.userId, copy, locked));
    },
  } satisfies Record<string, RequestHandler>;
}
