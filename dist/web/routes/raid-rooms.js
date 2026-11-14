import { Router } from 'express';
import { raidRoomController } from '../controllers/raid-rooms.js';
import { member, signedIn } from '../middleware/auth.js';
import { raidRoomService } from '../services/raid-rooms.js';
/* /api/raid-rooms: a server's TechnoMagic Raid and Dragon Raid raids against a boss, for the front page's Find Raid (a logged-in member in it). */
export function raidRoomRoutes(deps) {
    const rooms = raidRoomController(raidRoomService());
    return Router().get('/', signedIn(deps), member(deps), rooms.list);
}
//# sourceMappingURL=raid-rooms.js.map