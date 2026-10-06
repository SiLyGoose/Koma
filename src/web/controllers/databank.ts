import type { RequestHandler } from 'express';
import { databankView } from '../databank.js';

/* Every item and what it does at each level: the same for everyone. */

export function databankController() {
  return {
    view(_req, res) {
      res.json(databankView());
    },
  } satisfies Record<string, RequestHandler>;
}
