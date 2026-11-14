import { z } from 'zod';
import { parse } from '../lib/validate.js';
/* A server's raids against a boss, for Find Raid. Runs after middleware/auth.ts's member. */
const Query = z.object({ game: z.enum(['technomagic', 'dragon']), boss: z.string().min(1).max(64) });
export function raidRoomController(rooms) {
    return {
        list(req, res) {
            const { game, boss } = parse(Query, req.query);
            res.json(rooms.list(res.locals.guildId, game, boss));
        },
    };
}
//# sourceMappingURL=raid-rooms.js.map