import { readFileSync } from 'node:fs';
import { encodePng } from './render/png.js';
import { mix } from './render/raster.js';
import { blowUp, hash, inside, mapShades, paintParts, SpriteGrid } from './render/sprite.js';
/** The drawing grid, in sprite pixels. */
const W = 96;
const H = 60;
/** How many picture pixels each sprite pixel becomes. */
const SCALE = 5;
/** The parts of the dragon, back to front. The order is also how they overlap. */
const PARTS = ['wing', 'bone', 'tail', 'leg', 'neck', 'body', 'belly', 'arm', 'claw', 'spike', 'head', 'snout', 'horn', 'tooth', 'eye'];
/**
 * Parts in the same group get no outline between them (the belly is painted onto the body, the
 * neck runs into the body). Parts not listed are their own group.
 */
const GROUP = { body: 'skin', belly: 'skin', neck: 'skin', tail: 'skin', wing: 'wing', bone: 'wing' };
/** Small details that are neither outlined nor shaded. */
const FLAT = new Set(['eye', 'tooth', 'bone', 'claw']);
const RED = [
    [236, 98, 76],
    [192, 52, 43],
    [122, 28, 30],
];
const BELLY = [
    [252, 214, 140],
    [233, 178, 98],
    [178, 118, 62],
];
const WING = [
    [170, 56, 72],
    [132, 38, 58],
    [88, 24, 44],
];
const HORN = [
    [246, 238, 214],
    [214, 200, 168],
    [150, 134, 104],
];
function basePalette() {
    return {
        parts: {
            tail: RED,
            leg: RED,
            body: RED,
            belly: BELLY,
            neck: RED,
            head: RED,
            snout: RED,
            horn: HORN,
            spike: HORN,
            wing: WING,
            bone: [RED[0], RED[0], RED[0]],
            arm: RED,
            claw: HORN,
            tooth: [HORN[0], HORN[0], HORN[0]],
            eye: [
                [255, 226, 77],
                [255, 226, 77],
                [255, 226, 77],
            ],
        },
        outline: [34, 10, 14],
        eye: [255, 226, 77],
        skyTop: [16, 10, 20],
        skyBottom: [44, 22, 30],
        gold: [
            [255, 236, 140],
            [236, 180, 60],
            [160, 104, 30],
        ],
    };
}
function paletteFor(mood) {
    const base = basePalette();
    const mapAll = (f) => ({
        ...base,
        parts: Object.fromEntries(PARTS.map((part) => [part, mapShades(base.parts[part], f)])),
        gold: mapShades(base.gold, f),
    });
    switch (mood) {
        case 'calm':
            return base;
        case 'enraged': {
            const hot = mapAll((c) => mix(c, [255, 120, 40], 0.18));
            return { ...hot, eye: [255, 250, 230], skyTop: [36, 8, 10], skyBottom: [96, 26, 16] };
        }
        case 'furious': {
            // Scorched dark, with lava showing through: the wing bones glow like cracks in cooling rock.
            const scorched = mapAll((c) => mix(c, [60, 0, 10], 0.35));
            const lava = [
                [255, 190, 70],
                [255, 150, 50],
                [255, 110, 30],
            ];
            return {
                ...scorched,
                parts: { ...scorched.parts, bone: lava },
                gold: mapShades(base.gold, (c) => mix(c, [255, 90, 20], 0.35)),
                outline: [18, 0, 2],
                eye: [255, 255, 235],
                skyTop: [30, 0, 4],
                skyBottom: [150, 34, 10],
            };
        }
        case 'gloating':
            return { ...base, skyTop: [24, 12, 26], skyBottom: [62, 32, 40] };
        case 'fled':
            return base;
        case 'shielded': {
            const cold = mapAll((c) => mix(c, [90, 170, 255], 0.12));
            return { ...cold, gold: base.gold, outline: [120, 220, 255], eye: [200, 245, 255] };
        }
        case 'defeated': {
            const grey = (c) => {
                const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.7;
                return [l, l, l * 1.05];
            };
            const dull = mapAll(grey);
            return { ...dull, gold: base.gold, outline: [20, 20, 24], eye: [40, 40, 44], skyTop: [10, 10, 14], skyBottom: [26, 24, 30] };
        }
    }
}
// ---------------------------------------------------------------------------
// The dragon
// ---------------------------------------------------------------------------
/** Mirrors a point across the middle of the picture, so each side is drawn once. */
const flip = ([x, y]) => [W - x, y];
const flipAll = (points) => points.map(flip);
/** Both of a pixel and its mirror image. */
const pair = (x, y) => [
    [x, y],
    [W - 1 - x, y],
];
/**
 * Where the dragon's parts go. It faces the viewer, like a wild Pokémon squaring up for a battle:
 * head on, wings spread wide on both sides, standing on its hoard, tail curling out to one side.
 * Everything but the tail is drawn once for the left side and mirrored.
 */
function drawDragon(mood) {
    const g = new SpriteGrid(PARTS, W, H);
    const eyeOpen = mood !== 'defeated' && mood !== 'gloating';
    // Furious, it rears its wings up higher.
    const rearing = mood === 'furious';
    const both = (draw) => {
        draw((points) => points, (n) => n);
        draw(flipAll, (n) => W - n);
    };
    // Wings spread wide behind the body: an arm up to the wrist, three long fingers, membrane between.
    both((m) => {
        const shoulder = [41, 30];
        const wrist = rearing ? [23, 3] : [25, 7];
        const tips = rearing
            ? [
                [8, 0],
                [1, 10],
                [3, 25],
            ]
            : [
                [9, 2],
                [2, 15],
                [6, 29],
            ];
        const scallops = rearing
            ? [
                [12, 6],
                [10, 17],
                [16, 28],
            ]
            : [
                [13, 10],
                [11, 21],
                [18, 30],
            ];
        g.polygon(m([[44, 34], shoulder, wrist, tips[0], scallops[0], tips[1], scallops[1], tips[2], scallops[2], [28, 36]]), 'wing');
        const [s, w] = m([shoulder, wrist]);
        g.line(s, w, 'bone', ['wing']);
        for (const tip of m(tips))
            g.line(w, tip, 'bone', ['wing']);
    });
    // The tail curls out from behind, to the viewer's right, and ends in a spade.
    g.limb([56, 50], [80, 60], [85, 46], 5, 1.6, 'tail');
    g.polygon([
        [85, 48],
        [81, 42],
        [85, 36],
        [89, 42],
    ], 'tail');
    // Hind legs: haunches either side of the body, and big feet planted on the gold.
    both((m, x) => {
        g.ellipse(x(37), 47, 7, 7, 'leg');
        g.polygon(m([[30, 50], [41, 50], [42, 55], [29, 55]]), 'leg');
    });
    // The neck, the round body, and a pale belly running up the chest and throat.
    g.limb([48, 36], [48, 29], [48, 22], 7, 5.5, 'neck');
    g.ellipse(48, 40, 13, 13, 'body');
    g.ellipse(48, 43, 8, 10, 'belly', ['body']);
    g.ellipse(48, 30, 4, 6, 'belly', ['neck', 'body']);
    // Forelegs held at the chest.
    both((m) => g.polygon(m([[37, 35], [42, 37], [42, 45], [39, 49], [34, 48], [35, 41]]), 'arm'));
    // The head, straight on: a broad skull, the snout pointing at the viewer, frills at the cheeks.
    g.ellipse(48, 15, 10, 7.5, 'head');
    both((m) => g.polygon(m([[39, 14], [31, 10], [34, 16], [39, 19]]), 'spike'));
    g.ellipse(48, 21, 6.5, 4.5, 'snout');
    // Horns sweeping up and out, and a spike in the middle of the brow.
    both((m) => g.polygon(m([[40, 11], [45, 9], [38, 3], [33, 1.5]]), 'horn'));
    g.polygon([
        [46, 9],
        [48, 3],
        [50, 9],
    ], 'spike');
    // Claws: three on each foreleg, four on each foot.
    for (const x of [35, 37, 39])
        for (const at of pair(x, 49))
            g.set(at[0], at[1], 'claw');
    for (const x of [30, 33, 36, 39, 42])
        for (const at of pair(x, 55))
            g.set(at[0], at[1], 'claw');
    // Fangs hanging from the upper jaw.
    for (const at of [...pair(45, 24), ...pair(45, 25)])
        g.set(at[0], at[1], 'tooth');
    const eyes = [41, 42, 43].flatMap((x) => [...pair(x, 13), ...pair(x, 14)]);
    if (eyeOpen)
        for (const [x, y] of eyes)
            g.set(x, y, 'eye');
    const face = {
        pupils: [...pair(42, 13), ...pair(42, 14)],
        brows: [...pair(39, 11), ...pair(40, 11), ...pair(41, 12), ...pair(42, 12), ...pair(43, 12), ...pair(44, 13)],
        eyes,
        mouth: [44, 45, 46, 47].flatMap((x) => pair(x, 23)),
        smoke: [...pair(40, 21), ...pair(39, 19), ...pair(40, 17), ...pair(38, 16)],
        fire: [
            ...pair(43, 24).map((at) => ({ at, color: [255, 220, 90] })),
            ...pair(42, 25).map((at) => ({ at, color: [255, 160, 50] })),
            ...pair(42, 26).map((at) => ({ at, color: [255, 120, 40] })),
            ...pair(41, 27).map((at) => ({ at, color: [230, 70, 30] })),
        ],
        roar: [44, 45, 46, 47].flatMap((x) => [...pair(x, 23), ...pair(x, 24)]).concat([45, 46, 47].flatMap((x) => pair(x, 25))),
        roarFangs: [...pair(45, 23), ...pair(46, 25)],
        jets: [
            { from: [43.5, 25], dir: [-0.8, 0.6] },
            { from: [W - 43.5, 25], dir: [0.8, 0.6] },
        ],
        happyEyes: [...pair(40, 14), ...pair(41, 13), ...pair(42, 12), ...pair(43, 13), ...pair(44, 14)],
        grinLine: [...pair(43, 22), ...pair(44, 23), ...[45, 46, 47].flatMap((x) => pair(x, 24))],
        grinTeeth: [45, 46, 47].flatMap((x) => pair(x, 23)),
        blush: [...pair(39, 17), ...pair(40, 17), ...pair(40, 18)],
    };
    return { grid: g, face };
}
// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------
function paintBackground(pixels, palette, mood) {
    for (let y = 0; y < H; y++) {
        const sky = mix(palette.skyTop, palette.skyBottom, y / (H - 1));
        for (let x = 0; x < W; x++)
            pixels[y * W + x] = sky;
    }
    // Stalactites hanging from the cave roof.
    for (const [x, len] of [
        [4, 6],
        [11, 3],
        [40, 4],
        [47, 7],
        [70, 2],
        [93, 5],
    ]) {
        for (let y = 0; y < len; y++) {
            const half = Math.max(0, Math.round((len - y) / 2.5));
            for (let dx = -half; dx <= half; dx++) {
                const at = y * W + x + dx;
                if (x + dx >= 0 && x + dx < W)
                    pixels[at] = mix(palette.skyTop, [0, 0, 0], 0.4);
            }
        }
    }
    // The hoard: a heap of gold along the bottom, dotted with coins that catch the light.
    const [goldLight, goldMid, goldDark] = palette.gold;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const dx = (x - 48) / 52;
            const dy = (y - 62) / 11;
            if (dx * dx + dy * dy > 1)
                continue;
            const depth = y - (62 - 11 * Math.sqrt(Math.max(0, 1 - dx * dx)));
            const roll = hash(x, y, 1);
            pixels[y * W + x] = depth < 1.2 ? goldLight : roll < 0.12 ? goldLight : roll < 0.3 ? goldDark : goldMid;
        }
    }
    if (mood === 'enraged' || mood === 'furious') {
        const count = mood === 'furious' ? 90 : 40;
        for (let i = 0; i < count; i++) {
            const x = Math.floor(hash(i, 3, 7) * W);
            const y = Math.floor(hash(i, 5, 11) * (H - 12));
            pixels[y * W + x] = hash(i, 9, 2) < 0.5 ? [255, 180, 60] : [255, 110, 40];
        }
    }
}
function paintDragon(pixels, { grid, face }, palette, mood) {
    const partAt = (x, y) => grid.partAt(x, y);
    paintParts(pixels, grid, {
        shades: palette.parts,
        outline: palette.outline,
        group: GROUP,
        flat: FLAT,
        flatColor: (part) => (part === 'eye' ? palette.eye : undefined),
    });
    // Belly plates: a seam every few rows across the pale belly, glowing like lava when furious.
    const seam = mood === 'furious' ? [255, 120, 30] : palette.parts.belly[2];
    for (let y = 0; y < H; y++) {
        if (y % 3 !== 0)
            continue;
        for (let x = 0; x < W; x++) {
            if (partAt(x, y) === 'belly' && partAt(x, y - 1) === 'belly')
                pixels[y * W + x] = seam;
        }
    }
    const paint = ([x, y], color) => {
        if (x >= 0 && y >= 0 && x < W && y < H)
            pixels[y * W + x] = color;
    };
    const glow = (x, y, color, amount) => {
        if (x >= 0 && y >= 0 && x < W && y < H)
            pixels[y * W + x] = mix(pixels[y * W + x], color, amount);
    };
    if (mood === 'furious') {
        // Horn tips red-hot.
        for (let y = 0; y < 6; y++)
            for (let x = 0; x < W; x++)
                if (partAt(x, y) === 'horn')
                    glow(x, y, [255, 110, 40], 0.65);
    }
    // The mouth: a hard line, a roar, or a grin.
    if (mood === 'furious') {
        face.roar.forEach((at) => paint(at, [70, 0, 6]));
        face.roarFangs.forEach((at) => paint(at, palette.parts.tooth[1]));
    }
    else if (mood === 'gloating') {
        face.grinTeeth.forEach((at) => paint(at, palette.parts.tooth[1]));
        face.grinLine.forEach((at) => paint(at, palette.outline));
    }
    else {
        face.mouth.forEach((at) => paint(at, palette.outline));
    }
    // The eyes. Defeated: shut. Gloating: squeezed shut into happy arcs, cheeks blushing. Otherwise a
    // hard stare with slit pupils, glowing when enraged, burning white-hot with a red pupil when furious.
    if (mood === 'defeated') {
        face.eyes.filter(([, y]) => y === 14).forEach((at) => paint(at, palette.outline));
    }
    else if (mood === 'gloating') {
        face.happyEyes.forEach((at) => paint(at, palette.outline));
        face.blush.forEach(([x, y]) => glow(x, y, [255, 130, 160], 0.65));
    }
    else {
        face.brows.forEach((at) => paint(at, palette.outline));
        face.pupils.forEach((at) => paint(at, mood === 'furious' ? [210, 0, 0] : palette.outline));
        if (mood === 'enraged' || mood === 'furious') {
            const reach = mood === 'furious' ? 2 : 1;
            const color = mood === 'furious' ? [255, 90, 40] : [255, 200, 120];
            for (const [x, y] of face.eyes) {
                for (let dy = -reach; dy <= reach; dy++) {
                    for (let dx = -reach; dx <= reach; dx++) {
                        if (Math.abs(dx) + Math.abs(dy) > reach || partAt(x + dx, y + dy) === 'eye')
                            continue;
                        glow(x + dx, y + dy, color, mood === 'furious' ? 0.45 : 0.5);
                    }
                }
            }
        }
    }
    // Smoke curling up beside the snout (not when it's beaten or grinning); fire at the corners of the
    // mouth when enraged; two jets of fire roaring out of its jaws when furious.
    if (mood !== 'defeated' && mood !== 'gloating') {
        const smoke = mood === 'shielded' ? [150, 200, 230] : [120, 112, 118];
        face.smoke.forEach((at) => paint(at, mix(pixels[at[1] * W + at[0]], smoke, 0.7)));
    }
    if (mood === 'enraged')
        face.fire.forEach(({ at, color }) => paint(at, color));
    if (mood === 'furious')
        for (const jet of face.jets)
            paintJet(pixels, jet.from, jet.dir);
    // Gloating: coins tossed up in the air, glinting.
    if (mood === 'gloating') {
        const [gl, gm, gd] = palette.gold;
        for (const [x, y] of [
            [9, 38],
            [17, 25],
            [26, 9],
            [69, 8],
            [80, 22],
            [88, 34],
            [13, 50],
            [79, 48],
            [60, 4],
        ]) {
            paint([x, y], gl);
            paint([x + 1, y], gm);
            paint([x, y + 1], gm);
            paint([x + 1, y + 1], gd);
        }
        for (const [x, y] of [
            [21, 17],
            [74, 15],
            [6, 28],
            [91, 44],
        ]) {
            paint([x, y], [255, 255, 230]);
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                glow(x + dx, y + dy, [255, 240, 150], 0.7);
            }
        }
    }
}
/** A jet of fire from `from` heading along `dir`: widening as it goes, white-yellow in the core and red at its ragged edge. */
function paintJet(pixels, from, dir) {
    const length = 24;
    const [dx, dy] = dir;
    const norm = Math.hypot(dx, dy);
    const [ux, uy] = [dx / norm, dy / norm];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const px = x + 0.5 - from[0];
            const py = y + 0.5 - from[1];
            const along = px * ux + py * uy;
            if (along < 0 || along > length)
                continue;
            const across = Math.abs(px * -uy + py * ux);
            const t = along / length;
            const radius = (0.8 + t * 5.5) * (0.75 + 0.35 * hash(x, y, 5));
            if (across > radius)
                continue;
            const core = across / radius;
            const color = core < 0.35 && t < 0.8 ? [255, 250, 200] : core < 0.65 ? [255, 190, 60] : core < 0.85 ? [255, 120, 30] : [220, 50, 20];
            pixels[y * W + x] = t > 0.85 ? mix(pixels[y * W + x], color, 0.6) : color;
        }
    }
}
/** How the flying dragon is turned: nose up by `PITCH`, then toward the right by `YAW` (radians). */
const PITCH = (30 * Math.PI) / 180;
const YAW = (30 * Math.PI) / 180;
/** How many picture pixels one unit of the flying dragon's model is. */
const FLYING_SIZE = 1.3;
/**
 * The dragon flying away across the moon, centred on (cx, cy), seen from behind: a small 3D model
 * (wings raised in a shallow V, body, neck, head and horns ahead, tail trailing back), tipped
 * nose-up by PITCH and turned right by YAW, then flattened onto the picture. From behind, the body
 * is foreshortened and the wings seen at a low angle, which is what makes it look flat and far off. Drawn far parts first, as a silhouette with lighter membranes between darker
 * wing bones, and a rim of moonlight on its top and right edges.
 */
function paintFlyingDragon(pixels, cx, cy) {
    const MEMBRANE = 1;
    const BODY = 2;
    const BONE = 3;
    /** The membrane of the wing turned away from the viewer, in shadow. */
    const FAR_MEMBRANE = 4;
    const mask = new Int8Array(W * H);
    /** Where a model point lands on the picture, and how far away it is (bigger is farther). */
    const project = ([x, y, z]) => {
        const y1 = y * Math.cos(PITCH) + z * Math.sin(PITCH);
        const z1 = -y * Math.sin(PITCH) + z * Math.cos(PITCH);
        const x2 = x * Math.cos(YAW) + z1 * Math.sin(YAW);
        const z2 = -x * Math.sin(YAW) + z1 * Math.cos(YAW);
        return { at: [cx + x2 * FLYING_SIZE, cy - y1 * FLYING_SIZE], depth: z2 };
    };
    // Everything to draw, each with how far away it is, so the far ones can go first.
    const shapes = [];
    const fill = (x, y, kind) => {
        if (x >= 0 && y >= 0 && x < W && y < H)
            mask[y * W + x] = kind;
    };
    const addPolygon = (points, kind) => {
        const flat = points.map(project);
        const depth = flat.reduce((sum, p) => sum + p.depth, 0) / flat.length;
        const outline = flat.map((p) => p.at);
        shapes.push({ depth, draw: () => {
                for (let y = 0; y < H; y++)
                    for (let x = 0; x < W; x++)
                        if (inside(outline, x + 0.5, y + 0.5))
                            fill(x, y, kind);
            } });
    };
    const addBall = (centre, r, kind) => {
        const { at, depth } = project(centre);
        shapes.push({ depth, draw: () => {
                const reach = r * FLYING_SIZE + 1;
                for (let y = Math.floor(at[1] - reach); y <= Math.ceil(at[1] + reach); y++) {
                    for (let x = Math.floor(at[0] - reach); x <= Math.ceil(at[0] + reach); x++) {
                        if (Math.hypot(x + 0.5 - at[0], y + 0.5 - at[1]) <= r * FLYING_SIZE)
                            fill(x, y, kind);
                    }
                }
            } });
    };
    const addLine = (from, to, kind, depthBias = -0.01) => {
        const a = project(from);
        const b = project(to);
        shapes.push({ depth: (a.depth + b.depth) / 2 + depthBias, draw: () => {
                const [x0, y0] = a.at;
                const [x1, y1] = b.at;
                const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1;
                for (let i = 0; i <= steps; i++)
                    fill(Math.floor(x0 + ((x1 - x0) * i) / steps), Math.floor(y0 + ((y1 - y0) * i) / steps), kind);
            } });
    };
    // Wings: raised in a shallow V (mid-wingbeat), so from behind they still show. Shoulder, wrist,
    // three finger tips, and the membrane scalloped between them back to the flank.
    for (const side of [-1, 1]) {
        const at = (x, y, z) => [side * x, y, z];
        const shoulder = at(1.5, 0.5, 1.5);
        const wrist = at(6.5, 5, 3);
        const tips = [at(14, 9, 1), at(16, 6.5, -3.5), at(13, 3, -7)];
        // Turned right, the right wing is the far one.
        const membrane = side === 1 ? FAR_MEMBRANE : MEMBRANE;
        addPolygon([shoulder, wrist, tips[0], at(11.5, 6, -1), tips[1], at(11, 3.5, -5), tips[2], at(6, 1.2, -5.5), at(2, 0.2, -3.5)], membrane);
        addLine(shoulder, wrist, BONE);
        for (const tip of tips)
            addLine(wrist, tip, BONE);
    }
    // Body along the line of flight: rump, chest, neck, head with two swept-back horns, legs tucked up.
    addBall([0, 0, -1], 2.5, BODY);
    addBall([0, 0.2, 1.8], 2.3, BODY);
    addBall([0, 0.6, 4.2], 1.5, BODY);
    addBall([0, 0.9, 6.2], 1.4, BODY);
    addBall([0, 1.1, 8], 1.7, BODY);
    for (const side of [-1, 1]) {
        addLine([side * 0.8, 2.2, 7.6], [side * 1.8, 4.2, 6.2], BODY, -0.2);
        addBall([side * 1.6, -1.2, -2.5], 0.9, BODY);
    }
    // The tail trails back toward the viewer, curling a little, and ends in a spade.
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        addBall([Math.sin(t * 2.2) * 2, -0.4 - t * 1.2, -3 - t * 10], 1.5 - t * 0.9, BODY);
    }
    const end = [Math.sin(2.2) * 2, -1.6, -13];
    addPolygon([
        [end[0], end[1], end[2] + 0.5],
        [end[0] - 1.8, end[1], end[2] - 1],
        [end[0], end[1], end[2] - 2.8],
        [end[0] + 1.8, end[1], end[2] - 1],
    ], BODY);
    shapes.sort((p, q) => q.depth - p.depth).forEach((shape) => shape.draw());
    const colors = { [MEMBRANE]: [92, 28, 46], [FAR_MEMBRANE]: [58, 16, 32], [BODY]: [38, 10, 20], [BONE]: [26, 6, 14] };
    const rim = [156, 74, 84];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const kind = mask[y * W + x];
            if (kind === 0)
                continue;
            // Moonlight catches the top and right edges.
            const open = (dx, dy) => x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || mask[(y + dy) * W + x + dx] === 0;
            pixels[y * W + x] = open(0, -1) || open(1, 0) ? mix(colors[kind], rim, 0.55) : colors[kind];
        }
    }
}
/** A far-off bird, for scale. */
const BIRD = ['#...#', '.#.#.'];
/** A mountain ridge through these (x, top) points, straight lines between. */
function ridgeAt(points, x) {
    for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        if (x <= x1)
            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return points[points.length - 1][1];
}
/** The picture for a dragon that got away: night over the mountains, a big moon, and the dragon flying off across it. */
function paintFlight(pixels) {
    const moon = [68, 16];
    const moonR = 13;
    // Sky: deep blue at the top to dusky violet at the horizon, stars, and the moon with a soft halo.
    for (let y = 0; y < H; y++) {
        const sky = mix([8, 10, 34], [74, 44, 96], y / (H - 1));
        for (let x = 0; x < W; x++) {
            const d = Math.hypot(x + 0.5 - moon[0], y + 0.5 - moon[1]);
            let color = sky;
            if (d < moonR + 5)
                color = mix(sky, [200, 196, 220], 0.25 * (1 - (d - moonR) / 5));
            else if (y < 40 && hash(x, y, 21) < 0.02)
                color = hash(x, y, 22) < 0.3 ? [255, 250, 220] : [180, 180, 220];
            pixels[y * W + x] = color;
        }
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const d = Math.hypot(x + 0.5 - moon[0], y + 0.5 - moon[1]);
            if (d > moonR)
                continue;
            // Lit from the right, a little darker at the left edge, with a few craters.
            const shade = (x + 0.5 - moon[0]) / moonR;
            let color = mix([214, 206, 170], [252, 246, 214], (shade + 1) / 2);
            for (const [cx, cy, r] of [
                [62, 11, 2.4],
                [75, 20, 2],
                [74, 9, 1.4],
                [60, 21, 1.5],
                [70, 25, 1.2],
            ]) {
                if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r)
                    color = mix(color, [170, 160, 130], 0.5);
            }
            pixels[y * W + x] = color;
        }
    }
    // Two mountain ranges: the far one pale with snow on the high peaks, the near one dark. The slopes
    // that face the moon (on the right) catch a little of its light.
    const far = [
        [0, 36],
        [9, 27],
        [17, 33],
        [27, 21],
        [38, 31],
        [48, 25],
        [58, 34],
        [70, 24],
        [82, 32],
        [90, 26],
        [96, 30],
    ];
    const near = [
        [0, 45],
        [13, 37],
        [24, 46],
        [36, 39],
        [50, 49],
        [62, 41],
        [76, 48],
        [87, 39],
        [96, 44],
    ];
    for (const [ridge, color, lit, snow] of [
        [far, [70, 60, 112], [96, 84, 140], true],
        [near, [34, 26, 60], [48, 38, 80], false],
    ]) {
        for (let x = 0; x < W; x++) {
            const top = ridgeAt(ridge, x + 0.5);
            const facesMoon = ridgeAt(ridge, x + 1.5) > ridgeAt(ridge, x - 0.5);
            for (let y = Math.max(0, Math.ceil(top)); y < H; y++) {
                const high = snow && y - top < 2.5 && top < 29;
                pixels[y * W + x] = high ? [226, 226, 244] : facesMoon ? lit : color;
            }
        }
    }
    // Pines along the bottom.
    for (let y = 52; y < H; y++)
        for (let x = 0; x < W; x++)
            pixels[y * W + x] = [16, 12, 30];
    for (let x = 1; x < W; x += 4) {
        const tall = 3 + Math.floor(hash(x, 0, 31) * 4);
        for (let i = 0; i < tall; i++) {
            const half = Math.floor(i / 2);
            for (let dx = -half; dx <= half; dx++) {
                const y = 52 - tall + i;
                if (x + dx >= 0 && x + dx < W)
                    pixels[y * W + x + dx] = [16, 12, 30];
            }
        }
    }
    // The dragon flying off across the moon, a few coins from its hoard dropping behind it, and two
    // birds, much smaller, for scale.
    paintFlyingDragon(pixels, 64, 17);
    for (const [x, y] of [
        [61, 25],
        [64, 30],
        [59, 33],
    ]) {
        pixels[y * W + x] = [255, 214, 90];
    }
    const stamp = (shape, left, top, color) => {
        shape.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && (pixels[(top + dy) * W + left + dx] = color)));
    };
    stamp(BIRD, 22, 14, [14, 10, 30]);
    stamp(BIRD, 29, 18, [14, 10, 30]);
}
/** The picture's size in pixels. */
export const DRAGON_SIZE = { width: W * SCALE, height: H * SCALE };
/** Draws the dragon in the given mood as a PNG. */
export function renderDragon(mood) {
    const pixels = new Array(W * H);
    if (mood === 'fled') {
        paintFlight(pixels);
    }
    else {
        const palette = paletteFor(mood);
        paintBackground(pixels, palette, mood);
        paintDragon(pixels, drawDragon(mood), palette, mood);
    }
    return encodePng(DRAGON_SIZE.width, DRAGON_SIZE.height, blowUp(pixels, W, H, SCALE));
}
/**
 * The moods with a drawn-by-hand picture (assets/raid/ember-wyrm/<mood>.png at the repo's root, from
 * src/ and dist/ alike), used instead of the pixel-art one. The rest are still drawn here.
 */
const ART_MOODS = new Set(['calm', 'enraged', 'furious']);
/** The hand-drawn picture for `mood`, or null when it has none (or its file can't be read: the drawn one stands in). */
function dragonArt(mood) {
    if (!ART_MOODS.has(mood))
        return null;
    try {
        return readFileSync(new URL(`../../../assets/raid/ember-wyrm/${mood}.png`, import.meta.url));
    }
    catch (err) {
        console.error(`Could not read the Wyvern's ${mood} picture, drawing it instead:`, err);
        return null;
    }
}
const cache = new Map();
/** The dragon's picture for `mood`: the hand-drawn one where there is one, else renderDragon's. Each is only made once. */
export function dragonPicture(mood) {
    let png = cache.get(mood);
    if (!png) {
        png = dragonArt(mood) ?? renderDragon(mood);
        cache.set(mood, png);
    }
    return png;
}
//# sourceMappingURL=dragon-image.js.map