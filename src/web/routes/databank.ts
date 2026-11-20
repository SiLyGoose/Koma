import { Router } from 'express';
import { databankController } from '../controllers/databank.js';

/* /api/databank: every item, for anyone on the site (no login). */
export function databankRoutes(): Router {
  const databank = databankController();

  return Router().get('/', databank.view);
}
