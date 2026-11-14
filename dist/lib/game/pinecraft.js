import { blastEvery, oreEnergyExtra } from '../../perks/index.js';
import { raidWeek } from '../events/raid-week.js';
import { PINECRAFT_BREAK_MS, PINECRAFT_ORE_WEIGHTS, PINECRAFT_ORES, PINECRAFT_WORLD } from '../../constants/index.js';
export const DIRECTIONS = ['left', 'up', 'down', 'right'];
const STEP = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
export const NO_GEAR = { breakSpeed: 0, oreEnergy: 1, blastEvery: 0, blastLoss: 0, luckyChance: 0, energyRegen: 0, freeDigChance: 0, oreValueCut: 0 };
/** What gear with these perks does in Pinecraft. */
export function pinecraftGear(totals) {
    return {
        breakSpeed: Math.max(0, totals.pickaxeSpeed ?? 0),
        oreEnergy: 1 + oreEnergyExtra(totals.pickaxeEnergyPenalty ?? 0),
        blastEvery: blastEvery(totals.dynamiteBlast ?? 0),
        blastLoss: Math.min(1, Math.max(0, totals.blastLoss ?? 0)),
        luckyChance: Math.min(1, Math.max(0, totals.luckyOre ?? 0)),
        energyRegen: Math.max(0, totals.energyRegen ?? 0),
        freeDigChance: Math.min(1, Math.max(0, totals.freeDig ?? 0)),
        oreValueCut: Math.min(1, Math.max(0, totals.oreValueCut ?? 0)),
    };
}
/** The rules as they are for someone with this gear: energy comes back faster with energyRegen, and ores (not dirt or stone) pay oreValueCut less. */
export const withGear = (rules, gear) => ({
    ...rules,
    energyMinutes: rules.energyMinutes / (1 + gear.energyRegen),
    value: gear.oreValueCut > 0
        ? { ...rules.value, ...Object.fromEntries(PINECRAFT_ORES.map((ore) => [ore, Math.round(rules.value[ore] * (1 - gear.oreValueCut))])) }
        : rules.value,
});
/** How long a block that takes `ms` to break takes with this gear. */
export const gearBreakMs = (ms, gear) => Math.round(ms / (1 + gear.breakSpeed));
const SIZE = PINECRAFT_WORLD.size;
/** The week `now` (ms) falls in: a world made in an earlier one starts over. The same weeks as the raid's. */
export const pinecraftWeek = (now) => raidWeek(new Date(now));
export const indexOf = (x, y) => y * SIZE + x;
export const inWorld = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
/** Where a new world's miner stands: in the middle of the starting room. */
export const SPAWN = { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) };
/** How far block (x, y) is from the middle of the starting room, diagonals counting as one (the room is up to 1, the dirt around it 2). */
const fromSpawn = (x, y) => Math.max(Math.abs(x - SPAWN.x), Math.abs(y - SPAWN.y));
/** A number from 0 to 1 that is always the same for the same inputs. */
export function hash(seed, x, y, salt) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519) + Math.imul(salt, 3266489917)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth noise from 0 to 1: random values on a grid `scale` blocks apart, blended in between. */
function noise(seed, x, y, scale, salt) {
    const gx = Math.floor(x / scale);
    const gy = Math.floor(y / scale);
    const fx = x / scale - gx;
    const fy = y / scale - gy;
    const ease = (t) => t * t * (3 - 2 * t);
    const sx = ease(fx);
    const sy = ease(fy);
    const top = hash(seed, gx, gy, salt) * (1 - sx) + hash(seed, gx + 1, gy, salt) * sx;
    const bottom = hash(seed, gx, gy + 1, salt) * (1 - sx) + hash(seed, gx + 1, gy + 1, salt) * sx;
    return top * (1 - sy) + bottom * sy;
}
/** What block (x, y) is made of in the world with `seed`, before anything is dug (ores aside, see oreAt). */
export function groundAt(seed, x, y) {
    const near = fromSpawn(x, y);
    if (near <= 1)
        return 'open';
    if (near === 2)
        return 'dirt';
    if (near > 3 && hash(seed, x, y, 6) < PINECRAFT_WORLD.bedrockChance)
        return 'bedrock';
    const n = noise(seed, x, y, 7, 1) * 0.7 + noise(seed, x, y, 3, 2) * 0.3;
    return n > PINECRAFT_WORLD.stoneLevel ? 'stone' : 'dirt';
}
const ORE_TOTAL = PINECRAFT_ORES.reduce((sum, ore) => sum + PINECRAFT_ORE_WEIGHTS[ore], 0);
/** The ore in block (x, y), if any. Ores come in small clumps: blocks close together tend to hold the same one. */
export function oreAt(seed, x, y) {
    if (fromSpawn(x, y) <= 2)
        return null;
    const ground = groundAt(seed, x, y);
    if (ground !== 'dirt' && ground !== 'stone')
        return null;
    if (hash(seed, x, y, 4) >= PINECRAFT_WORLD.oreChance)
        return null;
    let roll = hash(seed, Math.floor(x / 2), Math.floor(y / 2), 5) * ORE_TOTAL;
    for (const ore of PINECRAFT_ORES) {
        roll -= PINECRAFT_ORE_WEIGHTS[ore];
        if (roll < 0)
            return ore;
    }
    return PINECRAFT_ORES[PINECRAFT_ORES.length - 1] ?? null;
}
/** Whether block (x, y) can be walked through: the starting room, or dug. */
export const isOpen = (world, x, y) => world.mined.has(indexOf(x, y)) || groundAt(world.seed, x, y) === 'open';
/**
 * How long block (x, y) takes to break (PINECRAFT_BREAK_MS), or null when it can't be: open ground,
 * bedrock, or past the edge.
 */
export function breakMs(world, x, y) {
    if (!inWorld(x, y) || isOpen(world, x, y))
        return null;
    const ground = groundAt(world.seed, x, y);
    if (ground === 'bedrock')
        return null;
    const ore = oreAt(world.seed, x, y);
    return PINECRAFT_BREAK_MS[ore ?? (ground === 'stone' ? 'stone' : 'dirt')];
}
/** The block one step from the miner in `direction`. */
export function stepFrom(world, direction) {
    const [dx, dy] = STEP[direction];
    return { x: world.x + dx, y: world.y + dy };
}
/** The energy a world has at `now`, and the time the next one comes back from (whole energies only, the rest carries over). */
export function energyNow(world, rules, now) {
    const per = rules.energyMinutes * 60_000;
    if (per <= 0)
        return { energy: Math.max(world.energy, rules.maxEnergy), energyAt: now };
    if (world.energy >= rules.maxEnergy)
        return { energy: world.energy, energyAt: now };
    const gained = Math.floor(Math.max(0, now - world.energyAt) / per);
    const energy = Math.min(rules.maxEnergy, world.energy + gained);
    return { energy, energyAt: energy >= rules.maxEnergy ? now : world.energyAt + gained * per };
}
/** A new world, with full energy and its miner in the starting room. */
export function newWorld(seed, rules, now) {
    return { seed: seed >>> 0, mined: new Set(), x: SPAWN.x, y: SPAWN.y, energy: rules.maxEnergy, energyAt: now, sinceBlast: 0 };
}
/**
 * Moves the miner one block, digging it when it isn't open. With gear: an ore takes gear.oreEnergy,
 * a dig may take no energy at all (it still needs the energy to start), ores may pay less, each ore may pay double, and every gear.blastEvery blocks the one dug also breaks the 8 around it
 * (bedrock aside), the ores among them paying gear.blastLoss less.
 */
export function move(world, direction, rules, now, gear = NO_GEAR, chance = Math.random) {
    const [dx, dy] = STEP[direction];
    const x = world.x + dx;
    const y = world.y + dy;
    if (!inWorld(x, y))
        return { kind: 'edge' };
    if (isOpen(world, x, y)) {
        world.x = x;
        world.y = y;
        return { kind: 'walk' };
    }
    const ground = groundAt(world.seed, x, y);
    if (ground === 'bedrock')
        return { kind: 'bedrock' };
    const geared = withGear(rules, gear);
    const energy = energyNow(world, geared, now);
    world.energy = energy.energy;
    world.energyAt = energy.energyAt;
    const ore = oreAt(world.seed, x, y);
    const cost = ore ? gear.oreEnergy : 1;
    if (world.energy < cost)
        return { kind: 'tired' };
    const free = gear.freeDigChance > 0 && chance() < gear.freeDigChance;
    if (!free)
        world.energy -= cost;
    const index = indexOf(x, y);
    world.mined.add(index);
    world.x = x;
    world.y = y;
    // Dirt and stone pay their (small) value in full, a blast's too; only ores are lucky, or lose some to a blast.
    const pay = (found, share, plain) => {
        if (!found)
            return { points: geared.value[plain] ?? 0, lucky: false };
        const lucky = gear.luckyChance > 0 && chance() < gear.luckyChance;
        return { points: Math.round(geared.value[found] * share) * (lucky ? 2 : 1), lucky };
    };
    const dug = pay(ore, 1, ground);
    const indices = [index];
    let total = dug.points;
    let blast = null;
    if (gear.blastEvery > 0) {
        world.sinceBlast += 1;
        if (world.sinceBlast >= gear.blastEvery) {
            world.sinceBlast = 0;
            blast = [];
            for (let by = y - 1; by <= y + 1; by++) {
                for (let bx = x - 1; bx <= x + 1; bx++) {
                    if (!inWorld(bx, by) || isOpen(world, bx, by))
                        continue;
                    const around = groundAt(world.seed, bx, by);
                    if (around === 'bedrock' || around === 'open')
                        continue;
                    const i = indexOf(bx, by);
                    const found = oreAt(world.seed, bx, by);
                    const got = pay(found, 1 - gear.blastLoss, around);
                    world.mined.add(i);
                    indices.push(i);
                    total += got.points;
                    blast.push({ x: bx, y: by, index: i, ground: around, ore: found, ...got });
                }
            }
        }
    }
    return { kind: 'dig', ground: ground, ore, ...dug, free, index, blast, indices, total };
}
/**
 * The blocks from (left, top) to (right, bottom) as the page is shown them, one string per row, a
 * letter a block:
 *   .  open (the starting room, or dug)
 *   d s b   dirt, stone, bedrock
 *   c i o x e a r   coal, iron, gold, diamond, emerald, amethyst, ruby
 *   ?  not seen yet
 * The miner sees every block next to open ground they can walk to (followed up to `look` blocks away).
 */
export function viewRows(world, left, top, right, bottom, look) {
    const reached = new Set([indexOf(world.x, world.y)]);
    const queue = [[world.x, world.y]];
    while (queue.length > 0) {
        const [x, y] = queue.pop();
        for (const [dx, dy] of Object.values(STEP)) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inWorld(nx, ny) || Math.abs(nx - world.x) > look || Math.abs(ny - world.y) > look)
                continue;
            const i = indexOf(nx, ny);
            if (reached.has(i) || !isOpen(world, nx, ny))
                continue;
            reached.add(i);
            queue.push([nx, ny]);
        }
    }
    const seen = (x, y) => Object.values(STEP).some(([dx, dy]) => inWorld(x + dx, y + dy) && reached.has(indexOf(x + dx, y + dy)));
    return lettersOf(world, left, top, right, bottom, seen);
}
const ORE_LETTER = { coal: 'c', iron: 'i', gold: 'o', diamond: 'x', emerald: 'e', amethyst: 'a', ruby: 'r' };
const GROUND_LETTER = { dirt: 'd', stone: 's', bedrock: 'b' };
/** The letters (see viewRows) of the blocks from (left, top) to (right, bottom), showing the blocks `seen` says the miner can see. */
function lettersOf(world, left, top, right, bottom, seen) {
    const rows = [];
    for (let y = Math.max(0, top); y <= Math.min(SIZE - 1, bottom); y++) {
        let row = '';
        for (let x = Math.max(0, left); x <= Math.min(SIZE - 1, right); x++) {
            if (isOpen(world, x, y))
                row += '.';
            else if (!seen(x, y))
                row += '?';
            else {
                const ore = oreAt(world.seed, x, y);
                row += ore ? ORE_LETTER[ore] : GROUND_LETTER[groundAt(world.seed, x, y)];
            }
        }
        rows.push(row);
    }
    return rows;
}
/**
 * Everything the miner has uncovered, for the map: the smallest box around the ground they have
 * opened up (the starting room and every block dug) and the blocks next to it, with the same
 * letters as viewRows. Every block dug joins up with the room (the miner walked into it), so the
 * blocks next to open ground are the ones they have seen.
 */
export function mapRows(world) {
    let left = SPAWN.x - 1;
    let right = SPAWN.x + 1;
    let top = SPAWN.y - 1;
    let bottom = SPAWN.y + 1;
    for (const i of world.mined) {
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    }
    left = Math.max(0, left - 1);
    top = Math.max(0, top - 1);
    const seen = (x, y) => Object.values(STEP).some(([dx, dy]) => inWorld(x + dx, y + dy) && isOpen(world, x + dx, y + dy));
    return { left, top, rows: lettersOf(world, left, top, right + 1, bottom + 1, seen) };
}
//# sourceMappingURL=pinecraft.js.map