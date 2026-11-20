import { z } from 'zod';
import { parse } from '../lib/validate.js';
/* The admin page's requests. Each runs after middleware/auth.ts's admin: res.locals.session is the bot admin. */
/** Setting -> value, as typed (the bot reads "40%", "2.5x" and "1,000" itself); no more of them than there are settings, by a lot. */
const Changes = z.object({
    changes: z.record(z.string().max(128), z.string().max(256)).refine((changes) => Object.keys(changes).length <= 1000),
});
export function adminController(admin) {
    return {
        settings(_req, res) {
            res.json(admin.view());
        },
        async change(req, res) {
            const { changes } = parse(Changes, req.body);
            res.json(await admin.change(res.locals.session.userId, changes));
        },
    };
}
//# sourceMappingURL=admin.js.map