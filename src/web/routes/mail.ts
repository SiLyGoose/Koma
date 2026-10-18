import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { member, signedIn } from '../middleware/auth.js';
import { MAIL_HEROES, mailStore } from '../models/mail.js';

/*
 * /api/mail: the mailbox, for a logged-in member in a server they're in (and a game's link, for its own member there): their
 * mail, reading it, and claiming what it carries (a selector with the hero, and a unique treasure's skill, they pick).
 */

const Read = z.object({ id: z.string().max(64).nullish() });
const Pick = z.object({ hero: z.string().max(64), skill: z.number().int().min(1).max(4).optional() });
/** A claim: the mail, and its selectors' picks (`picks`, one for each in order; or `hero` and `skill`, one for them all). */
const Claim = z.object({ id: z.string().max(64), hero: z.string().max(64).optional(), skill: z.number().int().min(1).max(4).optional(), picks: z.array(Pick).max(20).optional() });

export function mailRoutes(deps: ApiDeps): Router {
  const store = deps.mail ?? mailStore;
  const siteOrLink = [signedIn(deps, 'play'), member(deps)];
  const handlers = {
    tickets(_req, res) {
      res.json({ heroes: MAIL_HEROES });
    },
    async view(_req, res) {
      res.json(await store.view(res.locals.guildId, res.locals.session.userId));
    },
    async read(req, res) {
      const { id } = parse(Read, req.body);
      res.json(await store.read(res.locals.guildId, res.locals.session.userId, id ?? null));
    },
    async claim(req, res) {
      const { id, hero, skill, picks } = parse(Claim, req.body);
      const one = hero ? { hero, ...(skill && { skill }) } : undefined;
      const result = await store.claim(res.locals.guildId, res.locals.session.userId, id, picks?.map((pick) => ({ hero: pick.hero, ...(pick.skill && { skill: pick.skill }) })) ?? one);
      if (typeof result === 'string') throw new ApiError(result);
      res.json(result);
    },
  } satisfies Record<string, RequestHandler>;
  return Router().get('/', ...siteOrLink, handlers.view).get('/tickets', ...siteOrLink, handlers.tickets).post('/read', ...siteOrLink, handlers.read).post('/claim', ...siteOrLink, handlers.claim);
}
