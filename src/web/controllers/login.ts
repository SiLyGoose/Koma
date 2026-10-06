import type { RequestHandler } from 'express';
import { z } from 'zod';
import { GAMES, type Game } from '../config.js';
import type { LoginService } from '../services/login.js';
import { parse } from '../validate.js';

/* Logging in, who is logged in, and links to play. */

const State = z.object({ state: z.string().regex(/^[\w-]{8,128}$/) });
const Code = z.object({ code: z.string().max(256) });
const Play = z.object({ guild: z.string(), game: z.string().refine((game): game is Game => game in GAMES) });

export function loginController(login: LoginService) {
  return {
    /** Sends the browser to Discord to log in (Discord sends it back to the site). */
    redirect(req, res) {
      const { state } = parse(State, req.query);
      res.redirect(302, login.authorizeUrl(state));
    },

    async logIn(req, res) {
      const { code } = parse(Code, req.body);
      res.json(await login.logIn(code));
    },

    /** After middleware/auth.ts's signedIn. */
    async me(_req, res) {
      res.json(await login.me(res.locals.session));
    },

    /** After middleware/auth.ts's signedIn. */
    async play(req, res) {
      const { guild, game } = parse(Play, req.body);
      res.json({ url: await login.playLink(res.locals.session, guild, game) });
    },
  } satisfies Record<string, RequestHandler>;
}
