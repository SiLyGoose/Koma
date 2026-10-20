import type { LoadoutNameBlock, RefineBlock } from '../models/gear.js';

/* The site API's errors: a code the site knows, answered as { error: code } with the code's status (middleware/errors.ts). */

export type ErrorCode = 'bad_request' | 'no_login' | 'not_logged_in' | 'not_member' | 'not_admin' | 'invalid_setting' | 'discord_failed' | 'not_found' | 'not_playing' | 'busy' | 'bad_material' | 'nothing_to_sell' | 'owned' | 'not_owned' | 'no_refreshes' | 'closed' | 'wrong_slot' | 'wrong_hero' | 'wrong_class' | 'no_socket' | 'wrong_part' | 'no_rune' | 'no_option' | 'claimed' | 'needs_pick' | 'bad_pick' | 'duplicate' | 'no_main_treasure' | 'too_many_points' | 'perk_locked' | 'no_gems' | 'pending' | 'loadout_locked' | RefineBlock | LoadoutNameBlock;

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  no_login: 404,
  not_logged_in: 401,
  not_member: 403,
  not_admin: 403,
  invalid_setting: 400,
  discord_failed: 502,
  not_found: 404,
  not_playing: 409,
  busy: 409,
  maxed: 409,
  no_duplicate: 409,
  bad_material: 409,
  too_poor: 409,
  nothing_to_sell: 409,
  owned: 409,
  not_owned: 409,
  no_refreshes: 409,
  closed: 409,
  wrong_slot: 409,
  wrong_hero: 409,
  wrong_class: 409,
  no_socket: 409,
  wrong_part: 409,
  no_rune: 409,
  no_option: 409,
  claimed: 409,
  needs_pick: 409,
  bad_pick: 409,
  duplicate: 409,
  no_main_treasure: 409,
  too_many_points: 409,
  perk_locked: 409,
  no_gems: 409,
  pending: 409,
  loadout_locked: 409,
  name_too_long: 409,
  name_bad_characters: 409,
  name_no_letters: 409,
  name_reserved: 409,
  name_taken: 409,
};

/** Thrown by a service, controller or middleware when the site's request can't be done. */
export class ApiError extends Error {
  /** `detail`, if any, is answered beside the code (invalid_setting's `problems`). */
  constructor(
    readonly code: ErrorCode,
    readonly detail?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
  }

  get status(): number {
    return STATUS[this.code];
  }
}
