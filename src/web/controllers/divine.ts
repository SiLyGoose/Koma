import type { RequestHandler } from 'express';
import { z } from 'zod';
import { RUNES_AT_ONCE } from '../../protocol/runes.js';
import type { DivineService } from '../services/divine.js';
import { CopyId, parse } from '../lib/validate.js';

/* The Divine Punishment Raid's requests (protocol/divine.ts). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Group = z.enum(['apocalypsion', 'solenis']);
const Open = z.object({ group: Group, type: z.enum(['boss', 'karma']), level: z.number().int().min(1).max(10_000).optional() });
const Reset = z.object({ group: Group });
const Void = z.object({ socket: z.enum(['doh', 'laz', 'geb', 'oth', 'ans']), count: z.number().int().min(1).max(100).optional() });
const Artifact = z.object({ fragment: z.enum(['doomstone', 'tear', 'fuel', 'engraving']) });
const Ticket = z.object({ of: z.enum(['uw', 'ut']), hero: z.string().min(1).max(64), skill: z.number().int().min(1).max(4).optional() });
/** A Rune of Blasphemy (KR_BLASPHEMY's id) and its gauge's runes (ids → counts). */
const Craft = z.object({
  rune: z.string().min(1).max(64),
  ingredients: z.record(z.string().max(64), z.number().int().min(1).max(RUNES_AT_ONCE)).refine((runes) => Object.keys(runes).length > 0 && Object.keys(runes).length <= 20),
});
/** One in storage (its id), or one in a copy's socket. */
const Break = z.union([z.object({ id: z.string().min(1).max(64) }), z.object({ copy: CopyId, socket: z.number().int().min(0).max(8) })]);
const Socket = z.object({ copy: CopyId, socket: z.number().int().min(0).max(8), id: z.string().min(1).max(64) });
const Unsocket = z.object({ copy: CopyId, socket: z.number().int().min(0).max(8) });

export function divineController(divine: DivineService) {
  const who = (res: Parameters<RequestHandler>[1]): [string, string] => [res.locals.guildId, res.locals.session.userId];
  return {
    async view(_req, res) {
      res.json(await divine.view(...who(res)));
    },
    async open(req, res) {
      const { group, type, level } = parse(Open, req.body);
      res.json(await divine.open(...who(res), group, type, level));
    },
    async reset(req, res) {
      const { group } = parse(Reset, req.body);
      res.json(await divine.reset(...who(res), group));
    },
    async buyVoid(req, res) {
      const { socket, count } = parse(Void, req.body);
      res.json(await divine.buyVoid(...who(res), socket, count ?? 1));
    },
    async artifact(req, res) {
      const { fragment } = parse(Artifact, req.body);
      res.json(await divine.artifact(...who(res), fragment));
    },
    async ticket(req, res) {
      const { of, hero, skill } = parse(Ticket, req.body);
      res.json(await divine.ticket(...who(res), of, { hero, ...(skill !== undefined && { skill }) }));
    },
    async craft(req, res) {
      const { rune, ingredients } = parse(Craft, req.body);
      res.json(await divine.craft(...who(res), rune, ingredients));
    },
    async breakRune(req, res) {
      res.json(await divine.breakRune(...who(res), parse(Break, req.body)));
    },
    async extend(_req, res) {
      res.json(await divine.extend(...who(res)));
    },
    async socket(req, res) {
      const { copy, socket, id } = parse(Socket, req.body);
      res.json(await divine.socket(...who(res), copy, socket, id));
    },
    async unsocket(req, res) {
      const { copy, socket } = parse(Unsocket, req.body);
      res.json(await divine.unsocket(...who(res), copy, socket));
    },
  } satisfies Record<string, RequestHandler>;
}
