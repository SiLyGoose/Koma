import type { ForgeBlock, RefineBlock } from '../models/gear.js';

/* The site API's errors: a code the site knows, answered as { error: code } with the code's status (middleware/errors.ts). */

export type ErrorCode = 'bad_request' | 'no_login' | 'not_logged_in' | 'not_member' | 'discord_failed' | 'not_found' | 'not_playing' | 'busy' | 'bad_material' | 'nothing_to_sell' | RefineBlock | ForgeBlock;

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  no_login: 404,
  not_logged_in: 401,
  not_member: 403,
  discord_failed: 502,
  not_found: 404,
  not_playing: 409,
  busy: 409,
  maxed: 409,
  no_duplicate: 409,
  bad_material: 409,
  too_poor: 409,
  forged: 409,
  too_low: 409,
  nothing_to_sell: 409,
};

/** Thrown by a service, controller or middleware when the site's request can't be done. */
export class ApiError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }

  get status(): number {
    return STATUS[this.code];
  }
}
