import { z } from 'zod';
import { GAMES } from '../config.js';
import { parse } from '../lib/validate.js';
/* Logging in, who is logged in, and links to play. */
const State = z.object({ state: z.string().regex(/^[\w-]{8,128}$/) });
const Code = z.object({ code: z.string().max(256) });
const Renew = z.union([z.object({ token: z.string().max(2048) }).strict(), z.object({ refresh: z.string().max(2048) }).strict()]);
const Play = z.object({ guild: z.string(), game: z.string().refine((game) => game in GAMES) });
export function loginController(login) {
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
        /** A game page's link renewed (no session: what it trades is in the body). */
        async refreshLink(req, res) {
            res.json(await login.refreshLink(parse(Renew, req.body)));
        },
        /** After middleware/auth.ts's signedIn. */
        async play(req, res) {
            const { guild, game } = parse(Play, req.body);
            res.json({ url: await login.playLink(res.locals.session, guild, game) });
        },
    };
}
//# sourceMappingURL=login.js.map