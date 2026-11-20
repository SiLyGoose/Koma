import { z } from 'zod';
import { ApiError } from './errors.js';

/* Reading what a request says (its body, or its query), for the controllers. */

/** `value` as `schema` says, or a bad_request. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('bad_request');
  return result.data;
}

/** One of a member's copies of an item (its id in the database). */
export const CopyId = z.string().max(64);

/** A Discord id. */
export const UserId = z.string().regex(/^\d{1,32}$/);
