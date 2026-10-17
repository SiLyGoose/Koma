import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { raidRoomController } from '../controllers/raid-rooms.js';
import { member, signedIn } from '../middleware/auth.js';
import { raidRoomService } from '../services/raid-rooms.js';

/* /api/raid-rooms: a server's TechnoMagic Raid and Dragon Raid raids against a boss, for the front page's Find Raid (a logged-in member in it). */
export function raidRoomRoutes(deps: ApiDeps): Router {
  const rooms = raidRoomController(raidRoomService());

  return Router().get('/', signedIn(deps), member(deps), rooms.list);
}
