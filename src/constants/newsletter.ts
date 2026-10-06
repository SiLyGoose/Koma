/*
 * The newsletter (src/newsletter): the weekly digest that goes out when the raid week resets, and
 * patch notes the bot admin sends with `newsletter patch`.
 */

export const NEWSLETTER = {
  /**
   * Whether the weekly digest goes out on its own. While it's off, `newsletter preview` still shows
   * it and patch notes still send. Turned back on, each server gets the digest of the week before.
   */
  weeklyDigest: false,
  /** How often the bot looks for servers whose weekly digest is due, in milliseconds. */
  tickMs: 60_000,
  /** The longest patch notes can be (an embed's description holds 4096 characters). */
  maxPatchLength: 4000,
  /** How long the admin has to confirm sending patch notes, in milliseconds. */
  confirmMs: 120_000,
} as const;
