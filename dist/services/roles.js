import { isAdmin } from '../config.js';
import { NOTIFY_ROLES } from '../constants/index.js';
import { collections } from '../db.js';
/** Where each role is kept in the server's document. */
const FIELD = { general: 'notifyRoleId', raid: 'raidRoleId' };
/** Every notification role of `guildId`, by key: the one it chose, the built-in one if it never did, or null when it turned it off. */
export async function getNotifyRoleIds(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId }, { projection: { notifyRoleId: 1, raidRoleId: 1 } });
    const ids = {};
    for (const role of NOTIFY_ROLES) {
        const chosen = doc?.[FIELD[role.key]];
        ids[role.key] = chosen === undefined ? role.roleId : chosen;
    }
    return ids;
}
export async function getNotifyRoleId(guildId, key) {
    return (await getNotifyRoleIds(guildId))[key];
}
/**
 * Chooses one of `guildId`'s notification roles: a role's id, null to turn it off, or undefined
 * to go back to the built-in one. Only the bot admin may.
 */
export async function setNotifyRoleId(actorId, guildId, key, roleId) {
    if (!isAdmin(actorId))
        return { ok: false, reason: 'forbidden' };
    const { guilds } = collections();
    if (roleId === undefined)
        await guilds.updateOne({ _id: guildId }, { $unset: { [FIELD[key]]: true } });
    else
        await guilds.updateOne({ _id: guildId }, { $set: { [FIELD[key]]: roleId } }, { upsert: true });
    return { ok: true };
}
//# sourceMappingURL=roles.js.map