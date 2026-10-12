import { isAdmin } from '../config.js';
import { NOTIFY_ROLES } from '../constants/index.js';
import { collections } from '../db.js';

/*
 * Each server's notification roles (NOTIFY_ROLES): the role its events ping (`notifyRole`) and the
 * one its raids ping (`raidRole`), which are also the roles the role message hands out
 * (src/newsletter/roles.ts). Kept in the server's `guilds` document, and set like its channels,
 * with `config set`. A server that never chose one uses the role built in for it (which only
 * means something in the server that has that role).
 */

export type NotifyRole = (typeof NOTIFY_ROLES)[number];
export type NotifyRoleKey = NotifyRole['key'];
export type NotifyRoleSetting = NotifyRole['setting'];

/** Where each role is kept in the server's document. */
const FIELD = { general: 'notifyRoleId', raid: 'raidRoleId' } as const satisfies Record<NotifyRoleKey, string>;

/** Every notification role of `guildId`, by key: the one it chose, the built-in one if it never did, or null when it turned it off. */
export async function getNotifyRoleIds(guildId: string): Promise<Record<NotifyRoleKey, string | null>> {
  const doc = await collections().guilds.findOne({ _id: guildId }, { projection: { notifyRoleId: 1, raidRoleId: 1 } });
  const ids = {} as Record<NotifyRoleKey, string | null>;
  for (const role of NOTIFY_ROLES) {
    const chosen = doc?.[FIELD[role.key]];
    ids[role.key] = chosen === undefined ? role.roleId : chosen;
  }
  return ids;
}

export async function getNotifyRoleId(guildId: string, key: NotifyRoleKey): Promise<string | null> {
  return (await getNotifyRoleIds(guildId))[key];
}

export type SetNotifyRoleResult = { ok: true } | { ok: false; reason: 'forbidden' };

/**
 * Chooses one of `guildId`'s notification roles: a role's id, null to turn it off, or undefined
 * to go back to the built-in one. Only the bot admin may.
 */
export async function setNotifyRoleId(actorId: string, guildId: string, key: NotifyRoleKey, roleId: string | null | undefined): Promise<SetNotifyRoleResult> {
  if (!isAdmin(actorId)) return { ok: false, reason: 'forbidden' };
  const { guilds } = collections();
  if (roleId === undefined) await guilds.updateOne({ _id: guildId }, { $unset: { [FIELD[key]]: true } });
  else await guilds.updateOne({ _id: guildId }, { $set: { [FIELD[key]]: roleId } }, { upsert: true });
  return { ok: true };
}
