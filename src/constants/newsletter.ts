/*
 * The newsletter (src/newsletter): the weekly digest that goes out when the raid week resets, and
 * patch notes the bot admin sends with `newsletter patch`.
 */

/**
 * The notification roles: who is pinged when something starts (events/ping.ts), which members give
 * themselves by reacting to the role message (`newsletter roles`, src/newsletter/roles.ts) with
 * `emoji`. Each server chooses its own with `config set <setting>` (services/roles.ts); `roleId`
 * is the one used until it does, which only means something in the server that has that role.
 */
export const NOTIFY_ROLES = [
  // Pinged when an event starts (eventPing).
  { key: 'general', setting: 'notifyRole', emoji: '🔔', roleId: '1553233108780847116' },
  // Pinged when a raid's preparation starts (raidPing).
  { key: 'raid', setting: 'raidRole', emoji: '⚔️', roleId: '1559020080753545307' },
] as const;

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
