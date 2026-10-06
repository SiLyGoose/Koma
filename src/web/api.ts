import express, { Router, type Express } from 'express';
import type { pinecraftLeaderboard } from '../services/pinecraft.js';
import type { WebConfig } from './config.js';
import type { GachaStore } from './gacha.js';
import type { GearStore } from './gear.js';
import type { exchangeCode } from './login.js';
import { signedIn } from './middleware/auth.js';
import { errors, notFound } from './middleware/errors.js';
import { cors, siteOnly } from './middleware/site.js';
import type { RaidSiteDeps } from './raid/server.js';
import { databankRoutes } from './routes/databank.js';
import { gachaRoutes } from './routes/gacha.js';
import { gearRoutes } from './routes/gear.js';
import { liveRoutes } from './routes/live.js';
import { loginRoutes } from './routes/login.js';
import { publicRoutes } from './routes/public.js';
import { raidRoutes } from './routes/raid.js';

export type { GearMembers } from './services/gear.js';
export type { Leaderboard, Live } from './services/live.js';
export type { Me } from './services/login.js';

/*
 * What the site asks the bot over https, for members who log in on it with Discord (login.ts)
 * rather than opening a game from a link in Discord:
 *
 *   GET  /api/login?state=…   sends the browser to Discord to log in (Discord sends it back to the site)
 *   POST /api/login {code}    trades the code Discord gave the site for a session: { session, me }
 *   GET  /api/me              who is logged in, and the servers they can play in: Me
 *   POST /api/play {guild, game}   a link to play `game` in that server: { url }
 *   GET  /api/live?guild=…    who's on the site in that server, and what they're doing: Live
 *   POST /api/watch {guild, game, target}   a link to watch `target` play `game`: { url }
 *   GET  /api/pinecraft/leaderboard?guild=…&stat=dug|earned   the server's best miners: Leaderboard
 *   GET  /api/gear?guild=…    the member's gear in that server: GearView (gear.ts)
 *   GET  /api/gear?guild=…&user=…   someone else's gear in that server, to look at: GearView without their points or komaGems
 *   GET  /api/gear/members?guild=…   who in that server has gear, the member first: GearMembers
 *   POST /api/gear/equip {guild, copy}   puts on one of their copies: GearView
 *   POST /api/gear/unequip {guild, slot}   empties a slot: GearView
 *   POST /api/gear/unequip-all {guild}   empties every slot: GearView
 *   POST /api/gear/loadout {guild, loadout}   switches to loadout number `loadout`: GearView
 *   POST /api/gear/refine {guild, copy, material?}   refines one of their copies a level, using up `material` (another copy of it): GearView
 *   POST /api/gear/forge {guild, copy}   forges one of their R5 copies into a masterwork with komaGems: GearView
 *   POST /api/gear/sell {guild, copies}   sells those of their copies (not worn, in a loadout or locked) for points: GearView & { sold: GearSale }
 *   POST /api/gear/lock {guild, copy, locked}   locks (or unlocks) one of their copies, so it's never sold or used up by a refine: GearView
 *   GET  /api/databank        every item and what it does at each level: Databank (databank.ts)
 *   GET  /api/gacha?guild=…   the banner page: what a pull costs the member, their komaTokens and pity: BannerView (gacha.ts)
 *   POST /api/gacha/pull {guild, multi}   one pull, or a multi pull (`multi` true): BannerResult
 *
 * /api/live, /api/watch and the leaderboard also take the token from a game page's own link, as
 * "Authorization: Game <token>" (the server is the link's). So do GET /api/gear (the raid page shows
 * the party's gear: anyone in the link's server) and the routes that change what the link's member
 * wears (routes/gear.ts: the raid's party screen lets them change it before the fight). And GET /api/raid/gear?user=…: a raider's gear as they fought the raid the
 * page shows (its end screen), when it was kept. The front page's /api/live counts as
 * being on the site (live.ts).
 *
 * Everything but the first and the databank takes the session as "Authorization: Bearer <session>", and only answers
 * the site's own origin. Errors are { error } with a code the site knows (errors.ts).
 *
 * Each request goes through four layers, each using only the one below it:
 *   routes/        which paths there are, and the middleware and controller each goes through
 *   middleware/    who is asking (auth.ts), the site's origin (site.ts), and answering errors (errors.ts)
 *   controllers/   reads what a request says (validate.ts), asks a service, and answers
 *   services/      what the site can do, with no requests in sight: the stores (gear.ts, gacha.ts), Discord, live.ts…
 * Errors are thrown anywhere as an ApiError (errors.ts).
 */

export interface ApiDeps {
  config: WebConfig;
  /** The bot's application id (the OAuth2 client id), once it has logged in to Discord. */
  clientId: () => string | null;
  /** One of the bot's servers, or null when it isn't in it. */
  guild: (guildId: string) => { name: string; icon: string | null } | null;
  /** A member's name in a server, or null when they aren't in it (any more). */
  memberName: (guildId: string, userId: string) => Promise<string | null>;
  balance: (guildId: string, userId: string) => Promise<number>;
  /** A member's avatar picture in a server, if the bot knows it. */
  avatar?: (guildId: string, userId: string) => string | null;
  /** Pinecraft's leaderboards (the database's, unless a test says otherwise). */
  leaderboard?: typeof pinecraftLeaderboard;
  /** Members' gear, for the gear page (the database's, unless a test says otherwise). */
  gear?: GearStore;
  /** The gacha, for the banner page (the database's, unless a test says otherwise). */
  gacha?: GachaStore;
  login?: typeof exchangeCode;
  /** The raid's page (web/raid), once the bot is logged in to Discord. */
  raid?: RaidSiteDeps;
}

/** Big enough for a sale of the most copies POST /api/gear/sell takes. */
const MAX_BODY_BYTES = 32_768;

/** The site's API, under /api. Anything else is a plain 404. */
export function createApi(deps: ApiDeps): Express {
  const { origin } = deps.config;
  const api = Router()
    .use(cors(origin))
    .use(publicRoutes(deps))
    // Everything else is for the site only, with bodies in JSON (whatever they say they are).
    .use(siteOnly(origin), express.json({ limit: MAX_BODY_BYTES, type: () => true }))
    .use('/databank', databankRoutes())
    .use(loginRoutes(deps))
    .use(liveRoutes(deps))
    .use('/gear', gearRoutes(deps))
    .use('/gacha', gachaRoutes(deps))
    .use('/raid', raidRoutes(deps))
    // Nothing else is there (once they've logged in).
    .use(signedIn(deps), notFound);

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use('/api', api);
  app.use(errors);
  app.use((_req, res) => void res.status(404).type('text/plain').send('Not found'));
  return app;
}
