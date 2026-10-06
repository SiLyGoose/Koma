import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../errors.js';

/** The end of the API's routes: nothing is there. */
export const notFound: RequestHandler = () => {
  throw new ApiError('not_found');
};

/** Answers what a route threw: its error code, a body that isn't JSON (or is too big), or 500 for anything else. */
export const errors: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ApiError) return void res.status(err.status).json({ error: err.code });
  // express.json's: { type: 'entity.parse.failed', status: 400 }, 'entity.too.large' (413), …
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return void res.status(400).json({ error: 'bad_request' });
  console.error(`The site's ${req.method} ${req.path} failed:`, err);
  if (!res.headersSent) res.status(500).json({ error: 'failed' });
};
