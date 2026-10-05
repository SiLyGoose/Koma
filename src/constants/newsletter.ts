/*
 * The newsletter (src/newsletter): the weekly digest that goes out when the raid week resets, and
 * patch notes the bot admin sends with `newsletter patch`.
 */

export const NEWSLETTER = {
  /** How often the bot looks for servers whose weekly digest is due, in milliseconds. */
  tickMs: 60_000,
  /** The longest patch notes can be (an embed's description holds 4096 characters). */
  maxPatchLength: 4000,
  /** The longest note the admin can add to the next weekly digest (it goes in an embed field, 1024 at most). */
  maxNoteLength: 1000,
  /** How long the admin has to confirm sending patch notes, in milliseconds. */
  confirmMs: 120_000,
} as const;
