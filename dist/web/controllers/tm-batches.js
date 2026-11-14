import { z } from 'zod';
import { parse } from '../lib/validate.js';
/* The background raids' requests (the raid's page). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */
const Start = z.object({
    raid: z.enum(['technomagic', 'dragon']),
    boss: z.string(),
    mode: z.enum(['hard', 'normal']),
    stage: z.number().int(),
    heroes: z.array(z.object({ id: z.string(), sub: z.boolean().optional() })).max(16),
    count: z.number().int(),
});
export function tmBatchController(batches) {
    return {
        async view(_req, res) {
            res.json(await batches.view(res.locals.guildId, res.locals.session.userId));
        },
        async start(req, res) {
            res.json(await batches.start(res.locals.guildId, res.locals.session.userId, parse(Start, req.body)));
        },
        async stop(_req, res) {
            res.json(await batches.stop(res.locals.guildId, res.locals.session.userId));
        },
    };
}
//# sourceMappingURL=tm-batches.js.map