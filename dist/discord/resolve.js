import { TEXT } from '../constants/index.js';
import { parseUserArg } from '../lib/parse.js';
/** Turns a mention or user ID argument into a user who is a member of this server, or null. */
export async function resolveUserArg(ctx, arg) {
    const id = parseUserArg(arg);
    if (!id)
        return null;
    try {
        const member = await ctx.guild.members.fetch(id);
        return member.user;
    }
    catch {
        return null;
    }
}
/** `usage` is the command as typed after the prefix, like "rob @user". */
export function memberNotFound(ctx, usage) {
    return TEXT.common.memberNotFound(ctx.prefix, usage);
}
//# sourceMappingURL=resolve.js.map