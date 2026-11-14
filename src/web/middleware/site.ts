import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

/**
 * CORS for the site's own origin (and its preflights), and nothing cached. A preflight's answer is kept by the browser
 * for two hours (Chrome's most), so it doesn't ask again before every request: each sends a login, which needs one.
 */
export const cors =
  (origin: string): RequestHandler =>
  (req, res, next) => {
    if (req.headers.origin === origin) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'OPTIONS') return next();
    res.status(204).set({ 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '7200' }).end();
  };

/** Only the site's own origin is answered with data. */
export const siteOnly =
  (origin: string): RequestHandler =>
  (req, _res, next) => {
    if (req.headers.origin !== origin) throw new ApiError('not_found');
    next();
  };
