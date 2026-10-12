import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';
import type { RaidService } from '../services/raid.js';

/* The raid page's pictures, raiders' gear as they fought, and how a server's raid stands. */

const queryString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function raidController(raid: RaidService) {
  return {
    /** For the raid page's <img>: the same for everyone, so it's cached. */
    bossPicture(req, res) {
      const png = raid.bossPicture(queryString(req.query.boss), queryString(req.query.mood));
      res.set('Cache-Control', 'public, max-age=86400').type('png').send(png);
    },

    /** After middleware/auth.ts's member: the server asked about. */
    async week(_req, res) {
      res.json(await raid.week(res.locals.guildId));
    },

    /** After middleware/auth.ts's signedIn: the raid's link only. */
    async gear(req, res) {
      const { link } = res.locals;
      if (!link) throw new ApiError('not_found');
      res.json(await raid.gear(link.guildId, queryString(req.query.user) ?? ''));
    },
  } satisfies Record<string, RequestHandler>;
}
