import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { PINECRAFT_BREAK_MS, PINECRAFT_ORES, PINECRAFT_ORE_WEIGHTS, PINECRAFT_WEB, PINECRAFT_WORLD } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';
import {
  breakMs,
  energyNow,
  groundAt,
  indexOf,
  isOpen,
  gearBreakMs,
  mapRows,
  move,
  newWorld,
  NO_GEAR,
  pinecraftGear,
  pinecraftWeek,
  oreAt,
  SPAWN,
  viewRows,
  withGear,
  type PinecraftRules,
  type PinecraftWorld,
} from '../src/lib/game/pinecraft.js';
import { handleApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { signSession, verifySession } from '../src/web/login.js';
import { parseClientMessage, type ServerMessage } from '../src/web/pinecraft/protocol.js';
import { leave, sessionFor, type Peer, type PinecraftDeps } from '../src/web/pinecraft/server.js';
import { verifyToken } from '../src/web/token.js';

const RULES: PinecraftRules = { maxEnergy: 10, energyMinutes: 3, value: { dirt: 0, stone: 0, coal: 2, iron: 4, gold: 8, diamond: 15, emerald: 25, amethyst: 40, ruby: 40 } };
const { size: SIZE } = PINECRAFT_WORLD;
const MINUTE = 60_000;

/** The first block in the world with `seed` that `want` says yes to, at least 5 blocks from the start. */
function find(seed: number, want: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) if (Math.max(Math.abs(x - SPAWN.x), Math.abs(y - SPAWN.y)) >= 5 && want(x, y)) return { x, y };
  }
  throw new Error('No such block');
}

/** A world with the miner at (x, y), and that block dug. */
function worldAt(seed: number, x: number, y: number): PinecraftWorld {
  const world = newWorld(seed, RULES, 0);
  world.mined.add(indexOf(x, y));
  world.x = x;
  world.y = y;
  return world;
}

// ---------------------------------------------------------------------------
// The world

test('pinecraft: a world is all underground: an open 3x3 room in the middle, dirt all around it, then dirt, stone and bedrock', () => {
  for (const seed of [1, 5, 99]) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy)) === 2;
        assert.equal(groundAt(seed, SPAWN.x + dx, SPAWN.y + dy), ring ? 'dirt' : 'open', `${dx},${dy}`);
        assert.equal(oreAt(seed, SPAWN.x + dx, SPAWN.y + dy), null);
      }
    }
  }
  assert.deepEqual(SPAWN, { x: (SIZE - 1) / 2, y: (SIZE - 1) / 2 });
  // The same every time for its seed; another seed, another world.
  const cells = (seed: number) => Array.from({ length: 300 }, (_, k) => `${groundAt(seed, 10 + k, 20)}${oreAt(seed, 10 + k, 20)}`).join();
  assert.equal(cells(1), cells(1));
  assert.notEqual(cells(1), cells(2));
});

test('pinecraft: past the room there are dirt, stone, a little bedrock, and every ore anywhere, rarer ones less often', () => {
  const counts: Record<string, number> = {};
  let blocks = 0;
  for (let y = 0; y < SIZE; y += 2) {
    for (let x = 0; x < SIZE; x++) {
      blocks++;
      const kind = oreAt(4, x, y) ?? groundAt(4, x, y);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (oreAt(4, x, y)) assert.ok(['dirt', 'stone'].includes(groundAt(4, x, y)));
    }
  }
  const share = (kind: string): number => (counts[kind] ?? 0) / blocks;
  assert.ok(share('dirt') > 0.3 && share('stone') > 0.2, 'both dirt and stone');
  assert.ok(share('bedrock') > 0.01 && share('bedrock') < 0.06, `bedrock ${share('bedrock')}`);
  const ores = PINECRAFT_ORES.map(share);
  assert.ok(Math.abs(ores.reduce((a, b) => a + b, 0) - PINECRAFT_WORLD.oreChance) < 0.02);
  // Every ore turns up, each a little rarer than the one before, and ruby isn't too rare.
  for (let k = 1; k < ores.length; k++) assert.ok((ores[k] as number) < (ores[k - 1] as number), PINECRAFT_ORES[k]);
  assert.ok(share('ruby') > 0.003, `ruby ${share('ruby')}`);
  assert.ok(PINECRAFT_ORE_WEIGHTS.ruby / PINECRAFT_ORE_WEIGHTS.coal > 0.1);
  // Near the room and far from it alike.
  for (const ore of PINECRAFT_ORES) {
    find(1, (x, y) => oreAt(1, x, y) === ore && Math.abs(y - SPAWN.y) < 30);
    find(1, (x, y) => oreAt(1, x, y) === ore && y < 30);
  }
});

// ---------------------------------------------------------------------------
// Moving, digging and energy

test('pinecraft: walking through the room and dug ground is free; digging a block takes one energy and moves into it', () => {
  const world = newWorld(3, RULES, 0);
  assert.deepEqual({ x: world.x, y: world.y }, SPAWN);
  assert.deepEqual(move(world, 'left', RULES, 0), { kind: 'walk' });
  assert.deepEqual(move(world, 'up', RULES, 0), { kind: 'walk' });
  assert.equal(world.energy, RULES.maxEnergy);
  const dig = move(world, 'up', RULES, 0);
  assert.deepEqual(dig.kind === 'dig' && { ground: dig.ground, ore: dig.ore, points: dig.points }, { ground: 'dirt', ore: null, points: 0 });
  assert.equal(world.energy, RULES.maxEnergy - 1);
  assert.deepEqual({ x: world.x, y: world.y }, { x: SPAWN.x - 1, y: SPAWN.y - 2 });
  assert.ok(isOpen(world, world.x, world.y));
  // Back and forth again: it is dug now, so it's free.
  move(world, 'down', RULES, 0);
  assert.deepEqual(move(world, 'up', RULES, 0), { kind: 'walk' });
  assert.equal(world.energy, RULES.maxEnergy - 1);
});

test('pinecraft: an ore pays its value when dug', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) === 'iron');
  const world = worldAt(8, at.x - 1, at.y);
  const result = move(world, 'right', RULES, 0);
  const index = indexOf(at.x, at.y);
  assert.deepEqual(result, { kind: 'dig', ground: groundAt(8, at.x, at.y), ore: 'iron', points: 4, lucky: false, free: false, index, blast: null, indices: [index], total: 4 });
});

test('pinecraft: the edge and bedrock stop the miner, and with no energy nothing is dug', () => {
  const world = newWorld(3, RULES, 0);
  world.x = 0;
  assert.deepEqual(move(world, 'left', RULES, 0), { kind: 'edge' });
  world.y = 0;
  assert.deepEqual(move(world, 'up', RULES, 0), { kind: 'edge' });

  const rock = find(3, (x, y) => groundAt(3, x, y) === 'bedrock');
  const nextTo = worldAt(3, rock.x, rock.y + 1);
  assert.deepEqual(move(nextTo, 'up', RULES, 0), { kind: 'bedrock' });
  assert.equal(nextTo.energy, RULES.maxEnergy);
  assert.equal(breakMs(nextTo, rock.x, rock.y), null);

  const tired = newWorld(3, RULES, 0);
  tired.energy = 0;
  tired.energyAt = 0;
  tired.y = SPAWN.y + 1;
  assert.deepEqual(move(tired, 'down', RULES, MINUTE), { kind: 'tired' });
  assert.equal(tired.y, SPAWN.y + 1);
  assert.equal(tired.mined.size, 0);
});

test('pinecraft: energy comes back one every energyMinutes, up to the most, and part of one carries over', () => {
  assert.deepEqual(energyNow({ energy: 4, energyAt: 0 }, RULES, 2 * MINUTE), { energy: 4, energyAt: 0 });
  assert.deepEqual(energyNow({ energy: 4, energyAt: 0 }, RULES, 7 * MINUTE), { energy: 6, energyAt: 6 * MINUTE });
  assert.deepEqual(energyNow({ energy: 9, energyAt: 0 }, RULES, 60 * MINUTE), { energy: 10, energyAt: 60 * MINUTE });
  // Digging from full: the next one comes back energyMinutes after that dig.
  const world = newWorld(3, RULES, 0);
  move(world, 'down', RULES, 5 * MINUTE);
  move(world, 'down', RULES, 5 * MINUTE);
  assert.deepEqual({ energy: world.energy, energyAt: world.energyAt }, { energy: 9, energyAt: 5 * MINUTE });
  assert.equal(energyNow(world, RULES, 8 * MINUTE).energy, 10);
});

test('pinecraft: the page is only shown the blocks next to ground the miner can walk to', () => {
  const world = newWorld(11, RULES, 0);
  const view = (w: PinecraftWorld) => viewRows(w, SPAWN.x - 4, SPAWN.y - 4, SPAWN.x + 4, SPAWN.y + 4, 40);
  // At the start: the room, the dirt around it, and nothing further.
  assert.deepEqual(view(world), ['?????????', '?????????', '???ddd???', '??d...d??', '??d...d??', '??d...d??', '???ddd???', '?????????', '?????????']);
  // Tunnel two blocks up: the blocks beside the tunnel show, whatever they hold.
  for (const y of [SPAWN.y - 2, SPAWN.y - 3]) world.mined.add(indexOf(SPAWN.x, y));
  const rows = view(world);
  assert.equal(rows[1]?.[4], '.');
  for (const [row, col] of [[0, 4], [1, 3], [1, 5], [2, 3], [2, 5]] as const) assert.notEqual(rows[row]?.[col], '?', `${row},${col}`);
  assert.equal(rows[0]?.[3], '?');
  // An ore beside a tunnel shows as that ore.
  const ore = find(11, (x, y) => oreAt(11, x, y) !== null);
  const next = worldAt(11, ore.x - 1, ore.y);
  assert.match(viewRows(next, ore.x, ore.y, ore.x, ore.y, 40)[0] ?? '', /^[ciorxe]$/);
});

test('pinecraft: the map is everything uncovered: the room, the tunnels, and the blocks beside them', () => {
  const world = newWorld(11, RULES, 0);
  // Just the room: it and the dirt around it.
  assert.deepEqual(mapRows(world), { left: SPAWN.x - 2, top: SPAWN.y - 2, rows: ['?ddd?', 'd...d', 'd...d', 'd...d', '?ddd?'] });
  // A tunnel three blocks right: the map grows to take it in, and shows what is beside it.
  for (const dx of [2, 3, 4]) world.mined.add(indexOf(SPAWN.x + dx, SPAWN.y));
  const { left, top, rows } = mapRows(world);
  assert.deepEqual({ left, top, width: rows[0]?.length, height: rows.length }, { left: SPAWN.x - 2, top: SPAWN.y - 2, width: 8, height: 5 });
  assert.equal(rows[2], 'd......' + rows[2]?.[7]);
  assert.notEqual(rows[2]?.[7], '?'); // the block past the end of the tunnel
  assert.notEqual(rows[1]?.[6], '?'); // and the ones beside it
  assert.equal(rows[0]?.[6], '?'); // but nothing further off
});

test('pinecraft: blocks take longer to break from dirt to stone to the ores, amethyst and ruby longest, and open ground and bedrock not at all', () => {
  const order = ['dirt', 'stone', 'coal', 'iron', 'gold', 'diamond', 'emerald', 'ruby'] as const;
  for (let k = 1; k < order.length; k++) assert.ok(PINECRAFT_BREAK_MS[order[k] as 'dirt'] > PINECRAFT_BREAK_MS[order[k - 1] as 'dirt'], order[k]);
  assert.equal(PINECRAFT_BREAK_MS.amethyst, PINECRAFT_BREAK_MS.ruby);
  const world = newWorld(9, RULES, 0);
  assert.equal(breakMs(world, SPAWN.x, SPAWN.y), null); // the room
  assert.equal(breakMs(world, SPAWN.x, SPAWN.y + 2), PINECRAFT_BREAK_MS.dirt);
  assert.equal(breakMs(world, -1, 5), null);
  const gold = find(9, (x, y) => oreAt(9, x, y) === 'gold');
  assert.equal(breakMs(world, gold.x, gold.y), PINECRAFT_BREAK_MS.gold);
  const stone = find(9, (x, y) => groundAt(9, x, y) === 'stone' && oreAt(9, x, y) === null);
  assert.equal(breakMs(world, stone.x, stone.y), PINECRAFT_BREAK_MS.stone);
});

// ---------------------------------------------------------------------------
// Gear

/** What a copy of `id` at refine level `level` does in Pinecraft. */
const gearOf = (id: string, level: number) => pinecraftGear(totalEffects([{ item: ITEMS_BY_ID.get(id)!, level }]));

test('pinecraft gear: the four items exist, in their tiers and slots, for everyone', () => {
  const want = { 'golden-pickaxe': [2, 'weapon'], 'dynamite-stick': [4, 'weapon'], 'lucky-rabbits-foot': [3, 'treasure'], 'canary-in-a-cage': [3, 'treasure'] } as const;
  for (const [id, [stars, slot]] of Object.entries(want)) {
    const item = ITEMS_BY_ID.get(id);
    assert.deepEqual(item && { stars: item.stars, slot: item.slot, usableBy: item.usableBy }, { stars, slot, usableBy: undefined }, id);
  }
});

test('pinecraft gear: the Golden Pickaxe breaks 25% faster at R1 and 50% at R5, and its ores take 11 energy at R1 down to 3 at R5', () => {
  const speed = [1, 2, 3, 4, 5].map((level) => Math.round(gearOf('golden-pickaxe', level).breakSpeed * 1000) / 10);
  assert.deepEqual(speed, [25, 30, 35, 40, 50]);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => gearOf('golden-pickaxe', level).oreEnergy), [11, 9, 7, 6, 3]);
  assert.equal(gearBreakMs(PINECRAFT_BREAK_MS.iron, gearOf('golden-pickaxe', 5)), Math.round(PINECRAFT_BREAK_MS.iron / 1.5));
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('golden-pickaxe')!, 1, 1), ['Pinecraft: breaks blocks 25% faster', 'Pinecraft: ores take 11 ⚡ each to dig']);
});

test('pinecraft gear: the Diamond (3-star) and Ruby (4-star) pickaxes, for everyone, with the pickaxe perks at their tiers', () => {
  const diamond = ITEMS_BY_ID.get('diamond-pickaxe')!;
  const ruby = ITEMS_BY_ID.get('ruby-pickaxe')!;
  assert.deepEqual([diamond.stars, diamond.slot, diamond.usableBy], [3, 'weapon', undefined]);
  assert.deepEqual([ruby.stars, ruby.slot, ruby.usableBy], [4, 'weapon', undefined]);
  assert.deepEqual(diamond.effects, ['pickaxeSpeed', 'pickaxeEnergyPenalty']);
  assert.deepEqual(ruby.effects, ['pickaxeSpeed', 'pickaxeEnergyPenalty', 'luckyOre']);
  // Stronger tiers dig faster (by the tier settings), and only the Ruby Pickaxe is lucky.
  assert.ok(gearOf('ruby-pickaxe', 5).breakSpeed > gearOf('diamond-pickaxe', 5).breakSpeed);
  assert.ok(gearOf('diamond-pickaxe', 5).breakSpeed > gearOf('golden-pickaxe', 5).breakSpeed);
  assert.equal(gearOf('diamond-pickaxe', 5).luckyChance, 0);
  assert.equal(gearOf('ruby-pickaxe', 5).luckyChance, 0.1);
});

test('pinecraft gear: the Ruby Pickaxe outgrows its energy penalty at R5, its refine bonus', () => {
  const ruby = ITEMS_BY_ID.get('ruby-pickaxe')!;
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => gearOf('ruby-pickaxe', level).oreEnergy), [6, 5, 4, 3, 1]);
  // The rest of the pickaxe is untouched by the bonus.
  assert.equal(gearOf('ruby-pickaxe', 5).luckyChance, 0.1);
  assert.ok(gearOf('ruby-pickaxe', 5).breakSpeed > 0);
  assert.deepEqual(describeEffects(ruby, 1, 4).slice(1), [
    'Pinecraft: ores take 3 ⚡ each to dig',
    'Pinecraft: 6.67% chance an ore pays double',
  ]);
  assert.deepEqual(describeEffects(ruby, 1, 5).slice(1), [
    'Pinecraft: 10% chance an ore pays double',
    '✨ R5 bonus: Pinecraft: ores take no extra ⚡ to dig',
  ]);
  // The Diamond Pickaxe has no bonus: still 2 energy at R5.
  assert.equal(gearOf('diamond-pickaxe', 5).oreEnergy, 2);
});

test('pinecraft gear: the luck of the Ruby Pickaxe adds to the luck of the Rabbit Foot', () => {
  const both = pinecraftGear(totalEffects([
    { item: ITEMS_BY_ID.get('ruby-pickaxe')!, level: 5 },
    { item: ITEMS_BY_ID.get('lucky-rabbits-foot')!, level: 5 },
  ]));
  assert.equal(Math.round(both.luckyChance * 1000) / 1000, 0.2);
});

test('pinecraft gear: the Dynamite Stick blasts every 20 blocks at R1 down to every 10 at R5, ores in a blast paying half at every level', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => gearOf('dynamite-stick', level).blastEvery), [20, 18, 16, 14, 10]);
  for (const level of [1, 3, 5]) assert.equal(gearOf('dynamite-stick', level).blastLoss, 0.5);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('dynamite-stick')!, 1, 5), [
    'Pinecraft: every 10th block dug blows up the blocks around it',
    'Pinecraft: ores caught in a blast pay 50% less',
  ]);
});

test('pinecraft gear: the rabbit\'s foot and the canary give 10% double ores and twice-as-fast energy at R5', () => {
  assert.equal(gearOf('lucky-rabbits-foot', 5).luckyChance, 0.1);
  assert.equal(gearOf('canary-in-a-cage', 5).energyRegen, 1);
  assert.deepEqual(pinecraftGear({}), NO_GEAR);
});

test('pinecraft gear: an ore takes the pickaxe\'s energy, and not dug without it', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) !== null);
  const gear = { ...NO_GEAR, oreEnergy: 4 };
  const world = worldAt(8, at.x - 1, at.y);
  world.energy = 3;
  assert.deepEqual(move(world, 'right', RULES, 0, gear), { kind: 'tired' });
  world.energy = 4;
  assert.equal(move(world, 'right', RULES, 0, gear).kind, 'dig');
  assert.equal(world.energy, 0);
});

test('pinecraft gear: the Amethyst Pickaxe is a 4-star weapon for everyone, digging faster, with a 20% chance at R5 a dig takes no energy, and ores paying 10% less', () => {
  const amethyst = ITEMS_BY_ID.get('amethyst-pickaxe')!;
  assert.deepEqual([amethyst.stars, amethyst.slot, amethyst.usableBy], [4, 'weapon', undefined]);
  assert.deepEqual(amethyst.effects, ['pickaxeSpeed', 'freeDig', 'oreValueCut']);
  assert.equal(gearOf('amethyst-pickaxe', 5).breakSpeed, gearOf('ruby-pickaxe', 5).breakSpeed);
  assert.equal(gearOf('amethyst-pickaxe', 5).oreEnergy, 1);
  assert.equal(Math.round(gearOf('amethyst-pickaxe', 5).freeDigChance * 1000) / 1000, 0.2);
  for (const level of [1, 3, 5]) assert.equal(Math.round(gearOf('amethyst-pickaxe', level).oreValueCut * 1000) / 1000, 0.1);
  assert.ok(gearOf('amethyst-pickaxe', 1).freeDigChance < gearOf('amethyst-pickaxe', 5).freeDigChance);
  assert.deepEqual(describeEffects(amethyst, 1, 5).slice(1), ['Pinecraft: 20% chance a dig takes no ⚡', 'Pinecraft: ores pay 10% less']);
});

test('pinecraft gear: a free dig takes no energy (an ore included), but still needs the energy to start', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) !== null);
  const gear = { ...NO_GEAR, oreEnergy: 3, freeDigChance: 0.3 };
  const world = worldAt(8, at.x - 1, at.y);
  world.energy = 2;
  assert.deepEqual(move(world, 'right', RULES, 0, gear, () => 0.1), { kind: 'tired' });
  world.energy = 5;
  const free = move(world, 'right', RULES, 0, gear, () => 0.1);
  assert.ok(free.kind === 'dig' && free.free);
  assert.equal(world.energy, 5);
  const paid = move(worldAt(8, at.x - 1, at.y), 'right', RULES, 0, gear, () => 0.9);
  assert.ok(paid.kind === 'dig' && !paid.free);
  const plain = move(worldAt(8, at.x - 1, at.y), 'right', RULES, 0, NO_GEAR);
  assert.ok(plain.kind === 'dig' && !plain.free);
});

test('pinecraft gear: with a value cut, ores pay less (a lucky one double that), and the page is told the lower values', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) === 'gold');
  const gear = { ...NO_GEAR, oreValueCut: 0.1 };
  const cut = move(worldAt(8, at.x - 1, at.y), 'right', { ...RULES, value: { ...RULES.value, gold: 70 } }, 0, gear);
  assert.ok(cut.kind === 'dig' && cut.points === 63);
  const lucky = move(worldAt(8, at.x - 1, at.y), 'right', { ...RULES, value: { ...RULES.value, gold: 70 } }, 0, { ...gear, luckyChance: 1 }, () => 0);
  assert.ok(lucky.kind === 'dig' && lucky.points === 126);
  assert.equal(withGear(RULES, gear).value.ruby, Math.round(RULES.value.ruby * 0.9));
  assert.deepEqual(withGear(RULES, NO_GEAR).value, RULES.value);
});

test('pinecraft: dirt and stone pay their own small values, in full even with an ore value cut or in a blast, and never double', () => {
  const rules = { ...RULES, value: { ...RULES.value, dirt: 1, stone: 5 } };
  for (const ground of ['dirt', 'stone'] as const) {
    const at = find(8, (x, y) => groundAt(8, x, y) === ground && oreAt(8, x, y) === null);
    const dug = move(worldAt(8, at.x - 1, at.y), 'right', rules, 0, { ...NO_GEAR, oreValueCut: 0.5, luckyChance: 1 }, () => 0);
    assert.ok(dug.kind === 'dig' && dug.ore === null && dug.points === rules.value[ground] && !dug.lucky && dug.total === dug.points, ground);
  }
  assert.equal(withGear(rules, { ...NO_GEAR, oreValueCut: 0.5 }).value.stone, 5);
});

test('pinecraft gear: a lucky ore pays double', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) === 'gold');
  const lucky = move(worldAt(8, at.x - 1, at.y), 'right', RULES, 0, { ...NO_GEAR, luckyChance: 0.1 }, () => 0.05);
  assert.ok(lucky.kind === 'dig' && lucky.lucky && lucky.points === 2 * RULES.value.gold && lucky.total === lucky.points);
  const plain = move(worldAt(8, at.x - 1, at.y), 'right', RULES, 0, { ...NO_GEAR, luckyChance: 0.1 }, () => 0.5);
  assert.ok(plain.kind === 'dig' && !plain.lucky && plain.points === RULES.value.gold);
});

test('pinecraft gear: every so many blocks, a blast breaks the 8 around the one dug (not bedrock), its ores paying less', () => {
  const gear = { ...NO_GEAR, blastEvery: 3, blastLoss: 0.5 };
  // A spot with an ore beside it and no bedrock, to dig into from the left.
  const at = find(2, (x, y) => [-1, 0, 1].every((dy) => [-1, 0, 1, 2].every((dx) => !['bedrock', 'open'].includes(groundAt(2, x + dx, y + dy)))) && oreAt(2, x + 1, y) !== null && oreAt(2, x, y) === null);
  const world = worldAt(2, at.x - 1, at.y);
  world.sinceBlast = 2;
  const result = move(world, 'right', RULES, 0, gear);
  assert.ok(result.kind === 'dig');
  assert.equal(world.sinceBlast, 0);
  assert.equal(result.blast?.length, 8 - 1); // the 8 around, less the one the miner came from
  assert.equal(result.indices.length, 8);
  for (const i of result.indices) assert.ok(world.mined.has(i));
  const ore = result.blast?.find((b) => b.x === at.x + 1 && b.y === at.y);
  assert.equal(ore?.points, Math.round(RULES.value[oreAt(2, at.x + 1, at.y)!] * 0.5));
  assert.equal(result.total, (result.blast ?? []).reduce((sum, b) => sum + b.points, result.points));
  // The count starts again: the next dig doesn't blast.
  const next = move(world, 'down', RULES, 0, gear);
  assert.ok(next.kind !== 'dig' || next.blast === null);
});

test('pinecraft gear: energy comes back faster with the canary', () => {
  const tired = { energy: 0, energyAt: 0 };
  const canary = { ...NO_GEAR, energyRegen: 1 };
  const after = (gear: typeof NO_GEAR) => move(Object.assign(newWorld(3, RULES, 0), tired, { y: SPAWN.y + 1 }), 'down', RULES, 3 * MINUTE, gear);
  assert.deepEqual(after(NO_GEAR), { kind: 'dig', ground: 'dirt', ore: null, points: 0, lucky: false, free: false, index: indexOf(SPAWN.x, SPAWN.y + 2), blast: null, indices: [indexOf(SPAWN.x, SPAWN.y + 2)], total: 0 });
  // 1.5 minutes is one energy with the canary, none without.
  assert.equal(move(Object.assign(newWorld(3, RULES, 0), tired, { y: SPAWN.y + 1 }), 'down', RULES, 1.5 * MINUTE, NO_GEAR).kind, 'tired');
  assert.equal(move(Object.assign(newWorld(3, RULES, 0), tired, { y: SPAWN.y + 1 }), 'down', RULES, 1.5 * MINUTE, canary).kind, 'dig');
});

test('pinecraft web: the page is told what the gear does, and a pickaxe breaks blocks sooner', async () => {
  const { deps, saved } = fakeDeps(4, { pickaxeSpeed: 0.5, pickaxeEnergyPenalty: 1, dynamiteBlast: 10 });
  const session = await sessionFor({ guildId: 'g4', userId: 'u4', name: 'Simon' }, deps);
  const peer = fakePeer();
  session.attach(peer);
  const hello = peer.got[0];
  assert.ok(hello?.t === 'state');
  assert.equal(hello.state.breakMs.dirt, Math.round(PINECRAFT_BREAK_MS.dirt / 1.5));
  assert.equal(hello.state.oreEnergy, 2);
  assert.deepEqual(hello.state.blast, { every: 10, left: 10 });
  assert.equal(hello.state.pickaxe, 'wood');
  // Down to the room's edge, then dirt with no start: the whole (faster) break time.
  await session.handle(peer, { t: 'move', dir: 'down', seq: 1 });
  await session.handle(peer, { t: 'move', dir: 'down', seq: 2 });
  assert.deepEqual(saved.waits, [Math.round(PINECRAFT_BREAK_MS.dirt / 1.5) - PINECRAFT_WEB.breakGraceMs]);
  const dug = peer.got.at(-1);
  assert.ok(dug?.t === 'state');
  assert.deepEqual(dug.state.blast, { every: 10, left: 9 });
  await leave(session, peer);
});

test('pinecraft web: the miner is drawn with the pickaxe they have equipped, and a wooden one otherwise', async () => {
  const pickaxeOf = async (weapon: string | null) => {
    const { deps } = fakeDeps(4, {}, weapon);
    const session = await sessionFor({ guildId: 'g5', userId: `u5-${weapon}`, name: 'Simon' }, deps);
    const peer = fakePeer();
    session.attach(peer);
    const hello = peer.got[0];
    await leave(session, peer);
    return hello?.t === 'state' ? hello.state.pickaxe : null;
  };
  assert.equal(await pickaxeOf('golden-pickaxe'), 'gold');
  assert.equal(await pickaxeOf('diamond-pickaxe'), 'diamond');
  assert.equal(await pickaxeOf('ruby-pickaxe'), 'ruby');
  assert.equal(await pickaxeOf('dynamite-stick'), 'wood');
  assert.equal(await pickaxeOf(null), 'wood');
});

// ---------------------------------------------------------------------------
// Settings

test('pinecraft: the settings exist, are in their own group, and start at the tuned values', () => {
  assert.deepEqual(DEFAULTS.pinecraft, { maxEnergy: 100, energyMinutes: 3, value: { dirt: 1, stone: 5, coal: 10, iron: 30, gold: 70, diamond: 150, emerald: 300, amethyst: 500, ruby: 500 } });
  assert.deepEqual(CONFIG.pinecraft, DEFAULTS.pinecraft);
  const keys = SPECS.filter((s) => s.key.startsWith('pinecraft.')).map((s) => s.key);
  assert.deepEqual(keys, ['pinecraft.maxEnergy', 'pinecraft.energyMinutes', 'pinecraft.value.dirt', 'pinecraft.value.stone', ...PINECRAFT_ORES.map((ore) => `pinecraft.value.${ore}`)]);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Pinecraft');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

// ---------------------------------------------------------------------------
// Playing on the web

test('pinecraft web: only well-formed messages from the page are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"a.b"}'), { t: 'hello', token: 'a.b' });
  assert.deepEqual(parseClientMessage('{"t":"move","dir":"down","seq":3}'), { t: 'move', dir: 'down', seq: 3 });
  assert.deepEqual(parseClientMessage('{"t":"mine","dir":"left"}'), { t: 'mine', dir: 'left' });
  assert.deepEqual(parseClientMessage('{"t":"map"}'), { t: 'map' });
  for (const bad of ['', 'null', '{"t":"move","dir":"north","seq":1}', '{"t":"move","dir":"up","seq":0}', '{"t":"move","dir":"up"}', '{"t":"cashout","seq":1}']) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
});

function fakeDeps(seed: number, gear: Partial<ReturnType<typeof totalEffects>> = {}, weapon: string | null = null) {
  const saved = { digs: [] as number[], where: 0, paid: [] as number[], waits: [] as number[], weeks: [] as string[] };
  const clock = { now: 0 };
  let balance = 500;
  const deps: PinecraftDeps = {
    load: async () => ({ world: newWorld(seed, RULES, 0), earned: 0, week: pinecraftWeek(0).key }),
    saveDig: async (_g, _u, _w, indices) => void saved.digs.push(...indices),
    saveWhere: async () => void saved.where++,
    newWeek: async (_g, _u, _w, week) => void saved.weeks.push(week),
    payOre: async (_g, _u, points) => {
      saved.paid.push(points);
      return (balance += points);
    },
    gear: async () => ({ effects: gear, weapon }),
    balance: async () => balance,
    rules: () => RULES,
    now: () => clock.now,
    sleep: async (ms) => {
      saved.waits.push(ms);
      clock.now += ms;
    },
    chance: () => 0.99,
  };
  return { deps, saved, clock };
}

/** How long block (x, y) of the world with `seed` takes to break, before anything is dug. */
const breakTime = (seed: number, x: number, y: number): number => breakMs(newWorld(seed, RULES, 0), x, y) as number;

function fakePeer(): Peer & { got: ServerMessage[]; closed: boolean } {
  const peer = { got: [] as ServerMessage[], closed: false, send: (m: ServerMessage) => void peer.got.push(m), close: () => void (peer.closed = true) };
  return peer;
}

test('pinecraft web: a block is only broken once its break time has passed since the page started on it', async () => {
  const { deps, saved, clock } = fakeDeps(4);
  const session = await sessionFor({ guildId: 'g2', userId: 'u2', name: 'Simon' }, deps);
  const peer = fakePeer();
  session.attach(peer);
  const grace = PINECRAFT_WEB.breakGraceMs;
  // To the edge of the room (a walk), then the dirt below it.
  await session.handle(peer, { t: 'move', dir: 'down', seq: 1 });
  // Started, then finished after the dirt's time: no wait.
  await session.startBreaking(peer, 'down');
  clock.now += PINECRAFT_BREAK_MS.dirt;
  await session.handle(peer, { t: 'move', dir: 'down', seq: 2 });
  assert.deepEqual(saved.waits, []);
  assert.equal(saved.digs.length, 1);
  // Finished too soon: held until the time is up (less the grace).
  await session.startBreaking(peer, 'down');
  clock.now += 100;
  await session.handle(peer, { t: 'move', dir: 'down', seq: 3 });
  assert.deepEqual(saved.waits, [breakTime(4, SPAWN.x, SPAWN.y + 3) - 100 - grace]);
  // Never started: the whole time. Walking through open ground never waits.
  await session.handle(peer, { t: 'move', dir: 'down', seq: 4 });
  assert.equal(saved.waits[1], breakTime(4, SPAWN.x, SPAWN.y + 4) - grace);
  await session.handle(peer, { t: 'move', dir: 'up', seq: 5 });
  assert.equal(saved.waits.length, 2);
  assert.equal(saved.digs.length, 3);
  await leave(session, peer);
});

test('pinecraft web: the page gets the map when it asks, and at most once a second', async () => {
  const { deps, clock } = fakeDeps(6);
  const session = await sessionFor({ guildId: 'g3', userId: 'u3', name: 'Simon' }, deps);
  const peer = fakePeer();
  session.attach(peer);
  const hello = peer.got[0];
  assert.ok(hello?.t === 'state');
  assert.deepEqual(hello.state.spawn, SPAWN);
  await session.sendMap(peer);
  await session.sendMap(peer); // too soon: not sent again
  assert.deepEqual(peer.got.slice(1), [{ t: 'map', map: mapRows(newWorld(6, RULES, 0)) }]);
  clock.now += 1000;
  await session.sendMap(peer);
  assert.equal(peer.got.length, 3);
  await leave(session, peer);
});

test('pinecraft: the weeks are the same as the raid weeks, starting Saturday at midnight Eastern', () => {
  // Thursday 1 January 1970 is in the week that started Saturday 27 December 1969.
  assert.equal(pinecraftWeek(0).key, '1969-12-27');
  assert.equal(pinecraftWeek(0).next.toISOString(), '1970-01-03T05:00:00.000Z');
  assert.equal(pinecraftWeek(Date.UTC(1970, 0, 3, 5)).key, '1970-01-03');
});

test('pinecraft web: in a new week the world being played starts over, energy kept', async () => {
  const { deps, saved, clock } = fakeDeps(4);
  const session = await sessionFor({ guildId: 'g5', userId: 'u5', name: 'Simon' }, deps);
  const peer = fakePeer();
  session.attach(peer);
  // Dig two blocks down, then Saturday comes.
  await session.handle(peer, { t: 'move', dir: 'down', seq: 1 });
  await session.handle(peer, { t: 'move', dir: 'down', seq: 2 });
  const before = peer.got.at(-1);
  assert.ok(before?.t === 'state' && before.state.dug === 1 && before.state.week === '1969-12-27');
  assert.equal(before.state.resetsAt, Date.UTC(1970, 0, 3, 5));
  clock.now = Date.UTC(1970, 0, 3, 6);
  await session.handle(peer, { t: 'move', dir: 'down', seq: 3 });
  const after = peer.got.at(-1);
  assert.ok(after?.t === 'state');
  assert.equal(after.seq, 3);
  assert.deepEqual({ x: after.state.x, y: after.state.y, dug: after.state.dug, week: after.state.week }, { ...SPAWN, dug: 0, week: '1970-01-03' });
  assert.equal(after.state.energy, RULES.maxEnergy); // it had all come back by now anyway
  assert.deepEqual(saved.weeks, ['1970-01-03']);
  // The move that crossed over was dropped; the next is a normal one.
  await session.handle(peer, { t: 'move', dir: 'down', seq: 4 });
  const next = peer.got.at(-1);
  assert.ok(next?.t === 'state' && next.event?.kind === 'walk');
  assert.deepEqual(saved.weeks, ['1970-01-03']);
  await leave(session, peer);
});

test('pinecraft web: a dig is saved before its ore is paid, and a new page takes over the same world', async () => {
  const { deps, saved } = fakeDeps(4);
  const player = { guildId: 'g1', userId: 'u1', name: 'Simon' };
  const session = await sessionFor(player, deps);
  assert.equal(await sessionFor(player, deps), session);
  const first = fakePeer();
  session.attach(first);
  const hello = first.got[0];
  assert.ok(hello?.t === 'state');
  assert.equal(hello.seq, 0);
  assert.equal(hello.state.energy, RULES.maxEnergy);
  assert.equal(hello.state.balance, 500);
  assert.equal(hello.state.rows.length, 2 * PINECRAFT_WEB.viewRows + 1);
  assert.equal(hello.state.rows[0]?.length, 2 * PINECRAFT_WEB.viewCols + 1);
  assert.deepEqual({ x: hello.state.x - hello.state.left, y: hello.state.y - hello.state.top }, { x: PINECRAFT_WEB.viewCols, y: PINECRAFT_WEB.viewRows });
  assert.equal(hello.state.dug, 0);

  await session.handle(first, { t: 'move', dir: 'down', seq: 1 });
  await session.handle(first, { t: 'move', dir: 'down', seq: 2 });
  const dug = first.got[2];
  assert.ok(dug?.t === 'state');
  assert.deepEqual(dug.event, { kind: 'dig', ground: 'dirt', ore: null, points: 0, lucky: false, free: false, blast: null });
  assert.equal(dug.state.energy, RULES.maxEnergy - 1);
  assert.equal(dug.state.dug, 1);
  assert.deepEqual(saved.digs, [indexOf(SPAWN.x, SPAWN.y + 2)]);

  // Another page takes over: the first is no longer listened to.
  const second = fakePeer();
  session.attach(second);
  await session.handle(first, { t: 'move', dir: 'down', seq: 3 });
  assert.equal(first.got.length, 3);
  await leave(session, first); // the old page closing changes nothing
  assert.equal(await sessionFor(player, deps), session);
  await leave(session, second);
  assert.ok(saved.where >= 1);
  assert.notEqual(await sessionFor(player, deps), session); // forgotten once nobody plays it
});

// ---------------------------------------------------------------------------
// Logging in on the site

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('login: a session says who logged in, and a changed or foreign one says nobody', () => {
  const session = { userId: '123', name: 'Simon', avatar: null, guildIds: ['g1'] };
  const token = signSession(session, 'shh', 1000);
  assert.deepEqual(verifySession(token, 'shh', 2000), session);
  assert.equal(verifySession(token, 'other', 2000), null);
  assert.equal(verifySession(token, 'shh', 1000 + 8 * 24 * 60 * MINUTE), null);
  assert.equal(verifySession(`${token}x`, 'shh', 2000), null);
});

async function withApi(deps: ApiDeps, run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((req, res) => void handleApi(req, res, deps).then((handled) => (handled ? undefined : res.writeHead(404).end())));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('login: the site logs in with Discord, sees its servers, and gets a link to play in one', async () => {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: 'Koma Club', icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === '123' ? 'Simon in Koma' : null),
    balance: async () => 1234,
    login: async (code) => {
      if (code !== 'good') throw new Error('bad code');
      return { userId: '123', name: 'Simon', avatar: 'abc', guildIds: ['g1', 'g2'] };
    },
  };
  const site = { Origin: SITE.origin, 'Content-Type': 'application/json' };
  await withApi(deps, async (base) => {
    const go = await fetch(`${base}/api/login?state=abcdefgh1234`, { redirect: 'manual' });
    assert.equal(go.status, 302);
    const to = new URL(go.headers.get('location') ?? '');
    assert.equal(to.origin, 'https://discord.com');
    assert.equal(to.searchParams.get('client_id'), '999');
    assert.equal(to.searchParams.get('redirect_uri'), 'https://koma-ui.vercel.app/');
    assert.equal(to.searchParams.get('state'), 'abcdefgh1234');

    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: site, body: '{"code":"bad"}' })).status, 502);
    // Only the site's own origin is answered.
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"good"}' })).status, 404);

    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: site, body: '{"code":"good"}' });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('access-control-allow-origin'), SITE.origin);
    const { session, me } = (await login.json()) as { session: string; me: { servers: { id: string; balance: number }[]; games: string[] } };
    assert.deepEqual(me.servers, [{ id: 'g1', name: 'Koma Club', icon: null, balance: 1234 }]); // g2 doesn't have the bot
    assert.deepEqual(me.games, ['mines', 'pinecraft', 'baccarat', 'roulette']);

    const auth = { ...site, Authorization: `Bearer ${session}` };
    assert.equal((await fetch(`${base}/api/me`, { headers: site })).status, 401);
    assert.equal((await fetch(`${base}/api/me`, { headers: auth })).status, 200);

    const play = await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g1","game":"pinecraft"}' });
    const { url } = (await play.json()) as { url: string };
    assert.ok(url.startsWith('https://koma-ui.vercel.app/games/pinecraft/#t='));
    const token = decodeURIComponent(new URLSearchParams(new URL(url).hash.slice(1)).get('t') ?? '');
    assert.deepEqual(verifyToken(token), { guildId: 'g1', userId: '123', name: 'Simon in Koma' });
    assert.equal((await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g2","game":"mines"}' })).status, 403);
    assert.equal((await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g1","game":"poker"}' })).status, 400);
  });
});

test('login: without a client secret the site has no login', async () => {
  await withApi({ config: { ...SITE, clientSecret: null }, clientId: () => '999', guild: () => null, memberName: async () => null, balance: async () => 0 }, async (base) => {
    assert.equal((await fetch(`${base}/api/login?state=abcdefgh1234`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(`${base}/api/me`, { headers: { Origin: SITE.origin } })).status, 404);
  });
});
