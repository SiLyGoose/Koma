// Built from Koma-UI's src/technomagic/sim/ by scripts/build-sim.mjs: don't edit it here.
//#region src/technomagic/assets/bosses/galgoria.ts
/** Galgoria: one mesh on one skeleton (the game's files spell it Gargoria). */
var GALGORIA_ASSETS = {
	name: "Galgoria",
	folder: "bosses/galgoria",
	models: ["Raid_Gargoria_Mesh"]
};
//#endregion
//#region src/technomagic/assets/heroes/clause.ts
var CLAUSE_ASSETS = {
	name: "Clause",
	folder: "heroes/clause",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/14/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Clause",
		portrait: {
			file: "Clause.png",
			from: "https://drive.google.com/uc?export=download&id=1bFANcAEYPRzphZmxGd79xgdvYFda-6ev",
			crop: {
				x: 612,
				y: 62,
				size: 160
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Clause_Vari05_01_Body", "Hero_Clause_Vari05"],
			left: "Hero_Clause_Vari05_Shield",
			right: "Hero_Clause_Vari05_Sword",
			blade: "y",
			movedBy: {
				kind: "rigged",
				folder: "Clause_Mixamo",
				idle: "Clause - Sword And Shield Idle.fbx",
				run: "Clause - Sword And Shield Run.fbx",
				attack: [{
					file: "Clause - Sword And Shield Slash.fbx",
					lands: [.68],
					until: .8
				}],
				skills: { guard: {
					file: "Clause - Sword And Shield Casting.fbx",
					lands: [1.75],
					until: 2.6
				} }
			}
		}
	}]
};
//#endregion
//#region src/technomagic/assets/heroes/fallen-frey.ts
var FALLEN_FREY_ASSETS = {
	name: "Fallen Frey",
	folder: "heroes/fallen-frey",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/89/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Fallen Frey",
		portrait: {
			file: "Fallen_Frey.png",
			crop: {
				x: 528,
				y: 72,
				size: 150
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Frey_Fallen_Vari05_Body", "Hero_Frey_Fallen_Vari05_Hair"],
			left: "Hero_Frey_Fallen_Vari05_Weapon",
			offHand: "held",
			movedBy: {
				kind: "rigged",
				folder: "Fallen_Frey_Mixamo",
				skills: { light: {
					file: "Fallen Frey - Magic Heal.fbx",
					lands: [.95, 1.45],
					until: 2.35
				} }
			}
		}
	}]
};
//#endregion
//#region src/technomagic/assets/heroes/kirze.ts
var KIRZE_ASSETS = {
	name: "Kirze",
	folder: "heroes/kirze",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/79/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Kirze",
		portrait: {
			file: "Kirze.png",
			crop: {
				x: 805,
				y: 4,
				size: 170
			},
			head: {
				x: 808,
				y: 62,
				size: 125
			}
		},
		model: {
			kind: "parts",
			parts: [
				"Hero_Kirze_Vari05_Body",
				"Hero_Kirze_Vari05_Hair",
				"Hero_Kirze_Vari05_Arms_Mesh"
			],
			right: "Hero_Kirze_Vari05_Weapon",
			movedBy: "Kirze_Glory"
		}
	}, {
		name: "Kirze_Glory",
		portrait: {
			file: "Kirze_Glory.png",
			crop: {
				x: 356,
				y: 112,
				size: 135
			},
			head: {
				x: 362,
				y: 140,
				size: 85
			}
		},
		model: {
			kind: "rigged",
			folder: "Kirze_Cos20GloryLeague",
			idle: "Kirze_Cos20GloryLeague - Ninja Idle.fbx",
			run: "Kirze_Cos20GloryLeague - Standing Run Forward.fbx",
			attack: [{
				file: "Kirze_Cos20GloryLeague - Stable Sword Inward Slash.fbx",
				lands: [1.29],
				until: 1.6
			}, {
				file: "Kirze_Cos20GloryLeague - Sword And Shield Slash.fbx",
				lands: [
					.75,
					1.32,
					2.55
				],
				until: 3
			}]
		}
	}]
};
/** A skill's picture, under public/kr/. */
var skillFile = (hero, file) => `${hero.folder}/skills/${file}`;
/** The address of the picture on a hero's skill: `index` counts its skills from 0, its passive last. */
var skillPicture = (hero, index) => `/kr/${skillFile(hero, hero.skills.files[index] ?? "")}`;
//#endregion
//#region src/technomagic/combat/damage.ts
/** Nothing against either kind. */
var NONE = {
	physical: 0,
	magical: 0
};
/** As many points as are 100%. */
var POINTS = 1e3;
/** The share of a stat in points (0 to 1). */
var share = (points) => Math.min(1, Math.max(0, points / POINTS));
/** The attack a skill's numbers are written for. */
var ATK = 1e3;
/** A defence of this much halves what gets through (twice it: a third, and so on). */
var HALVING = 1e3;
/** A blocked blow does this much of what it would have. */
var BLOCKED = .5;
/** The most of a defence penetration sees past, however much there is (in points). */
var PEN_MOST = 500;
/**
* A blow of `amount` of a kind lands on `target`, from one with `pen` points of penetration: dodged (it
* takes nothing), or what it takes once the target's defence against that kind (less what penetration
* sees past) has worn it down, and whether it blocked it (then less again). `roll` is the fight's chances (../sim/random.ts).
*/
function strike(amount, type, target, pen, roll) {
	if (roll() < share(target.dodge[type])) return {
		taken: 0,
		blocked: false,
		dodged: true
	};
	const blocked = roll() < share(target.block[type]);
	return {
		taken: amount * (HALVING / (HALVING + Math.max(0, target[type]) * (1 - share(Math.min(PEN_MOST, pen))))) * (blocked ? BLOCKED : 1),
		blocked,
		dodged: false
	};
}
//#endregion
//#region src/technomagic/engine/track.ts
var smooth = (k) => k * k * (3 - 2 * k);
/** Slow, then all at once: a strike. */
var snap = (k) => k * k * k;
/** All at once, then slowing: coming to a stop. */
var settle = (k) => 1 - (1 - k) ** 3;
/** How long a track runs. */
var lengthOf = (keys) => keys.at(-1)[0];
//#endregion
//#region src/technomagic/bosses/galgoria/attacks.ts
var HEADS = [
	"C",
	"L",
	"R"
];
/** An attack: its track, when in it its venom sprays and lands (`hit`), and what that takes of whoever it lands on, least to most, before their defence. */
var TRACKS = {
	spit: {
		keys: [
			[0, {}],
			[
				.45,
				{
					ahead: -.6,
					up: .4,
					nod: -.25,
					jaw: .3,
					lean: -.03
				},
				smooth
			],
			[
				.6,
				{
					ahead: .9,
					up: -.7,
					inward: .35,
					nod: .35,
					jaw: 1,
					lean: .06
				},
				snap
			],
			[
				1.2,
				{
					ahead: 1,
					up: -.8,
					inward: .35,
					nod: .38,
					jaw: 1,
					lean: .07,
					shake: .5
				},
				smooth
			],
			[
				1.35,
				{
					ahead: .9,
					up: -.7,
					inward: .35,
					nod: .35,
					jaw: .2,
					lean: .06
				},
				settle
			],
			[
				2,
				{},
				smooth
			]
		],
		spray: [.6, 1.2],
		hit: .88,
		hurts: [300, 450]
	},
	roar: {
		keys: [
			[0, {}],
			[
				.4,
				{
					ahead: -.4,
					up: .5,
					nod: -.5,
					jaw: 1,
					lean: -.04,
					shake: 1
				},
				settle
			],
			[
				1.5,
				{
					ahead: -.3,
					up: .55,
					nod: -.46,
					jaw: 1,
					lean: -.04,
					shake: 1
				},
				smooth
			],
			[
				2.1,
				{},
				smooth
			]
		],
		hit: .5,
		hurts: [200, 300]
	},
	slam: {
		keys: [
			[0, {}],
			[
				.55,
				{
					ahead: -.7,
					up: .8,
					nod: -.45,
					jaw: .8,
					lean: -.06
				},
				smooth
			],
			[
				.75,
				{
					ahead: 1.4,
					up: -2.3,
					nod: .95,
					jaw: .3,
					lean: .12
				},
				snap
			],
			[
				1.15,
				{
					ahead: 1.35,
					up: -2.2,
					nod: .9,
					jaw: .2,
					lean: .11,
					shake: .6
				},
				settle
			],
			[
				1.9,
				{},
				smooth
			]
		],
		hit: .75
	}
};
/** The heads' moves in each of its skills, by its name. */
var PLANS = {
	left: [[
		"spit",
		"L",
		0
	]],
	centre: [[
		"spit",
		"C",
		0
	]],
	right: [[
		"spit",
		"R",
		0
	]],
	destroyer: [
		[
			"spit",
			"L",
			0
		],
		[
			"spit",
			"C",
			.38
		],
		[
			"spit",
			"R",
			.76
		],
		[
			"slam",
			"L",
			.76
		],
		[
			"slam",
			"C",
			.38
		],
		[
			"slam",
			"R",
			0
		]
	],
	swamp: HEADS.map((head, i) => [
		"roar",
		head,
		i * .07
	]),
	explosion: [[
		"spit",
		"L",
		0
	], [
		"spit",
		"R",
		.2
	]],
	fatal: [[
		"spit",
		"C",
		0
	]]
};
/** Its attacks, as Boss auto picks them (one head's venom the most often, by itself) and as their buttons say. */
var ATTACKS = [
	{
		name: "left",
		label: "Left head"
	},
	{
		name: "centre",
		label: "Centre head"
	},
	{
		name: "right",
		label: "Right head"
	},
	{
		name: "destroyer",
		label: "Swamp Destroyer"
	},
	{
		name: "swamp",
		label: "Poisonous Swamp"
	},
	{
		name: "explosion",
		label: "Poisonous Explosion"
	},
	{
		name: "fatal",
		label: "Fatal Venom"
	}
];
/** How long each of its heads' moves takes, when its blow lands and what it takes: what the fight goes by. */
var MOVES$1 = Object.fromEntries(Object.entries(TRACKS).map(([name, { keys, hit, hurts }]) => [name, {
	length: lengthOf(keys),
	hit,
	...hurts ? { hurts } : {}
}]));
//#endregion
//#region src/technomagic/combat/status.ts
/** Puts a status on: in place of one of the same name, begun again. */
function put(on, status) {
	const at = on.findIndex((each) => each.name === status.name);
	if (at < 0) on.push(status);
	else on[at] = status;
}
/** Time passes: each has that much less left, and the ones run out are gone. */
function wear(on, dt) {
	for (let i = on.length - 1; i >= 0; i--) {
		const status = on[i];
		status.left -= dt;
		if (status.left <= 0) on.splice(i, 1);
	}
}
/** How many times as much of a kind of damage a bearer of these takes. */
function taking(on, type) {
	let times = 1;
	for (const { takes } of on) times *= typeof takes === "number" ? takes : takes?.[type] ?? 1;
	return times;
}
/** How many times as hard a bearer of these hits. */
function dealing(on) {
	let times = 1;
	for (const { deals } of on) times *= deals ?? 1;
	return times;
}
/** How many times as fast a bearer of these is. */
function pacing(on) {
	let times = 1;
	for (const { pace } of on) times *= pace ?? 1;
	return times;
}
/** How many times as much healing reaches a bearer of these. */
function healing(on) {
	let times = 1;
	for (const { heals } of on) times *= heals ?? 1;
	return times;
}
/** How many times as fast a bearer of these gains mana. */
function filling(on) {
	let times = 1;
	for (const { mana } of on) times *= mana ?? 1;
	return times;
}
/** What these add to how likely a bearer's blows are to be critical. */
function critting(on) {
	let more = 0;
	for (const { crit } of on) more += crit ?? 0;
	return more;
}
/** A bearer of these can do nothing; is out of the fight altogether. */
var bound = (on) => on.some((status) => status.binds || status.away);
var away = (on) => on.some((status) => status.away);
//#endregion
//#region src/technomagic/bosses/galgoria/skills.ts
var IMPRISONMENT = {
	hits: 150,
	lasts: 8
};
var DESTROYER = {
	share: .3,
	down: 1.5
};
var SWAMP = {
	lasts: 12,
	mana: .5,
	deals: 1.3
};
var EXPLOSION = {
	lasts: 10,
	deals: .75,
	crit: -.15
};
var FATAL = {
	heals: .1,
	most: 5,
	deals: .05,
	mostOnIt: 10
};
/** What it gives itself back a second, of its health (little enough that heroes with no gear still wear it down). */
var LIFE_FORCE = 5e-4;
/** From this stage on, each stage over it: how much faster it heals, and how much less healing reaches the heroes and how much weaker their shields are (never under `least`). */
var STAGES = {
	from: 4,
	mends: .25,
	heals: .1,
	shields: .1,
	least: .3
};
var IMPRISONED = {
	name: "Swamp Imprisonment",
	about: "Shut away in the swamp: it can do nothing, and the boss can’t reach it.",
	icon: "🪤",
	harmful: true
};
var POISONED = {
	name: "Poisonous Swamp",
	about: "Mana fills half as fast, and the boss hits 30% harder.",
	icon: "🫧",
	harmful: true
};
var WEAKENED = {
	name: "Poisonous Explosion",
	about: "Hits 25% softer, and is 15% less likely to land a critical blow.",
	icon: "💥",
	harmful: true
};
var FATAL_VENOM = {
	name: "Fatal Venom",
	about: "Less healing reaches it for each (the rest of the fight), and the boss hits harder.",
	icon: "☠️",
	harmful: true
};
/** Stacks one more of a status that stays the rest of the fight, up to `most`: `made` makes it, `count` of them stacked. */
function stack(on, name, most, made) {
	const count = Math.min(most, (on.find((status) => status.name === name)?.count ?? 0) + 1);
	put(on, {
		...made(count),
		name,
		left: Infinity,
		count
	});
}
function galgoriaPart(fight) {
	const { foe } = fight;
	/** Blows the heroes have landed toward the next imprisonment, and what each has dealt since the last. */
	let hits = 0;
	const dealt = /* @__PURE__ */ new Map();
	/** The heroes shut away: a ring where each comes back out. */
	const shut = /* @__PURE__ */ new Set();
	/** How far past stage 4 the fight is (0 before it). */
	const past = () => Math.max(0, fight.stage - STAGES.from + 1);
	/** The heroes the boss can reach. */
	const reachable = () => fight.field.filter((fighter) => fighter.hp > 0 && !fighter.statuses.some((status) => status.away));
	/** The hero that has dealt the most since the last is shut away in the swamp. */
	function imprison() {
		const [top] = reachable().sort((a, b) => (dealt.get(b) ?? 0) - (dealt.get(a) ?? 0));
		dealt.clear();
		if (!top) return;
		fight.stagger(top);
		top.reserved = null;
		put(top.statuses, {
			name: IMPRISONED.name,
			left: IMPRISONMENT.lasts,
			away: true,
			shown: IMPRISONED
		});
		fight.cue(null, "imprison", [top]);
		shut.add(top);
	}
	/** The venom of a blow lands on whoever it is going for: what it takes, and then `then` on it. */
	function venom(amount, then) {
		const target = fight.target();
		if (!target || target.hp <= 0) return;
		fight.hurt(target, amount);
		then?.(target);
	}
	return {
		lands: {
			destroyer(part, amount) {
				if (part < 3) return venom(amount);
				if (part > 3) return;
				const heroes = reachable();
				fight.cue(null, "destroyer", heroes);
				for (const fighter of heroes) {
					fighter.shield = 0;
					fighter.shieldLeft = 0;
					fight.hurt(fighter, fighter.stats.hp * DESTROYER.share, false);
					fight.knock(fighter, DESTROYER.down);
				}
			},
			swamp(part, amount) {
				if (part > 0) return;
				const heroes = reachable();
				if (heroes.length === 0) return;
				fight.cue(null, "swamp", heroes);
				for (const fighter of heroes) fight.hurt(fighter, amount);
				put(fight.party, {
					name: POISONED.name,
					left: SWAMP.lasts,
					mana: SWAMP.mana,
					shown: POISONED
				});
				put(foe.statuses, {
					name: POISONED.name,
					left: SWAMP.lasts,
					deals: SWAMP.deals,
					shown: "venom"
				});
			},
			explosion(_part, amount) {
				venom(amount, (target) => {
					put(target.statuses, {
						name: WEAKENED.name,
						left: EXPLOSION.lasts,
						deals: EXPLOSION.deals,
						crit: EXPLOSION.crit,
						shown: WEAKENED
					});
					fight.cue(null, "explosion", [target]);
				});
			},
			fatal(_part, amount) {
				venom(amount, (target) => {
					stack(target.statuses, FATAL_VENOM.name, FATAL.most, (count) => ({
						heals: 1 - FATAL.heals * count,
						shown: FATAL_VENOM
					}));
					stack(foe.statuses, FATAL_VENOM.name, FATAL.mostOnIt, (count) => ({
						deals: 1 + FATAL.deals * count,
						shown: "venom"
					}));
					fight.cue(null, "fatal", [target]);
				});
			}
		},
		struck(by, amount) {
			dealt.set(by, (dealt.get(by) ?? 0) + amount);
			if (++hits < IMPRISONMENT.hits) return;
			hits = 0;
			imprison();
		},
		beaten() {
			hits = 0;
			dealt.clear();
			for (const on of [foe.statuses, ...fight.fighters.map((fighter) => fighter.statuses)]) {
				const at = on.findIndex((status) => status.name === FATAL_VENOM.name);
				if (at >= 0) on.splice(at, 1);
			}
		},
		tick(dt) {
			fight.mend(foe.maxHp * LIFE_FORCE * (1 + STAGES.mends * past()) * dt);
			for (const fighter of shut) {
				if (fighter.statuses.some((status) => status.name === IMPRISONED.name)) continue;
				shut.delete(fighter);
				fight.cue(null, "free", [fighter]);
			}
		},
		healing: () => Math.max(STAGES.least, 1 - STAGES.heals * past()),
		shielding: () => Math.max(STAGES.least, 1 - STAGES.shields * past()),
		steady: true,
		marks() {
			return [{
				text: "Life Force",
				tone: "venom"
			}, {
				text: `Imprisonment ${hits}/${IMPRISONMENT.hits}`,
				tone: "venom"
			}];
		}
	};
}
//#endregion
//#region src/technomagic/bosses/index.ts
/** The bosses of the TechnoMagic Raid there are so far: the first is the one fought unless another is asked for. */
var BOSSES = [{
	id: "galgoria",
	name: "Galgoria",
	assets: GALGORIA_ASSETS,
	stats: {
		hp: 3e6,
		deals: "magical",
		physical: 600,
		magical: 800,
		block: NONE,
		dodge: NONE
	},
	stands: {
		x: 7,
		turn: -1.1
	},
	reach: {
		hit: [
			-2.2,
			3.4,
			3
		],
		feet: [
			-1,
			0,
			.6
		]
	},
	attacks: ATTACKS,
	plans: PLANS,
	moves: MOVES$1,
	join: galgoriaPart
}];
//#endregion
//#region src/technomagic/sim/rules.ts
/** The fight moves on in steps of this many seconds (thirty a second), whatever the page draws meanwhile. */
var TICK = 1 / 30;
/** Where a hero stands along the field, and how far it is turned from side-on toward the camera. */
var HERO_X = -.5;
var LINES = [
	"front",
	"middle",
	"back"
];
/** The room each hero keeps round it on the floor: no other hero stands within twice this of it. */
var ROOM = 1.5;
/** The more room between one line and the next. */
var GAP = ROOM;
/** Where each line begins along the field, with no one in front of it. */
var LINE_X = {
	front: HERO_X,
	middle: HERO_X - 5 * ROOM,
	back: HERO_X - 10 * ROOM
};
/** The furthest back a hero stands: as far as a full field of one line, or of all three, reaches. A line further back moves up rather than go past it. */
var HINDMOST = HERO_X - 8 * ROOM - 2 * GAP;
/**
* Where each hero on the field stands, [along the field, toward the camera], by its line (`lines`, one
* for each hero, in its order): the frontline first, then the middle, then the backline, each where its
* line begins or behind the one before it, whichever is further back (but never past the hindmost a full
* field reaches). Each hero is a room behind the last, in two rows, the back row in the front row's gaps
* and as far back as keeps it two rooms from the front row too (each three neighbours a triangle with
* sides of two rooms); one line is a room further again from the next.
*/
function formation(lines) {
	const spots = [];
	let placed = 0;
	let last = 0;
	for (const line of LINES) {
		let first = true;
		lines.forEach((own, i) => {
			if (own !== line) return;
			const begins = placed === 0 ? LINE_X[line] : Math.min(last - ROOM - GAP, LINE_X[line]);
			const x = first ? Math.max(HINDMOST + (lines.length - placed - 1) * ROOM, begins) : last - ROOM;
			spots[i] = [x, placed % 2 ? -Math.sqrt(3) * ROOM : 0];
			first = false;
			last = x;
			placed++;
		});
	}
	return spots;
}
/** Running in: how long it takes (a hero can do nothing meanwhile). */
var ENTER = 1.1;
var MAX_MANA = 1200;
/** A raid fought alone: the boss has this share of its health. */
var SOLO_BOSS_HP = .6;
var MOST_RAGE = 1e4;
/** ln 2, written out (so no computer works it out its own way). */
var LN2 = .6931471805599453;
/**
* 2 to the power of `x`, worked out with + * and / alone: its whole part by doubling (or halving), the rest
* by the series for e^(x ln 2), to as many terms as a number holds. Every computer gets the same answer.
*/
function exp2(x) {
	const whole = Math.floor(x);
	const y = (x - whole) * LN2;
	let term = 1;
	let sum = 1;
	for (let n = 1; n <= 18; n++) {
		term = term * y / n;
		sum += term;
	}
	let times = 1;
	for (let k = 0; k < Math.abs(whole); k++) times *= whole < 0 ? .5 : 2;
	return times * sum;
}
/** The power of two MOST_RAGE is (a little over 13): past it the boss is as enraged as it gets. */
var MOST_RAGE_POWER = 13.287712379549449;
/** How many times as hard the boss's blows are, `over` seconds after the raid's time is up (1 before it). */
function rage(over) {
	if (over < 0) return 1;
	if (over >= 20) return MOST_RAGE;
	const power = 60 / (20 - over) - 2;
	return power >= MOST_RAGE_POWER ? MOST_RAGE : exp2(power);
}
/** What a blow of a hero's attack takes of the boss, before the boss's defence; and how much harder a critical blow is (before its gear's crit damage). */
var BLOW = 1100;
//#endregion
//#region src/technomagic/heroes/kit.ts
/** A hero with no passive. */
var NO_PASSIVE = {
	attack: 1,
	crit: 0,
	control: 1
};
/** Where each class usually stands: knights and warriors in the frontline, priests and wizards in the backline, the rest between. */
var CLASS_LINES = {
	knight: "front",
	warrior: "front",
	assassin: "middle",
	archer: "middle",
	mechanic: "middle",
	wizard: "back",
	priest: "back"
};
/** Where a hero stands: its own line, if it has one, or its class's. */
var lineOf = (def) => def.line ?? CLASS_LINES[def.class];
/**
* How each class stands, before what is a hero's own (the kind of damage it deals, and anything else it
* has otherwise): a hero's stats are its class's, with its own over them. Health and attack are as the
* fight measures them (a skill's numbers are written for an ATK of 1000, ../combat/damage.ts); crit,
* attack speed, penetration, CC resist, block and dodge are points (1000: 100%). A first guess at each,
* by what the game says a class is for:
* - knight: the most health and defence, and blocks the most;
* - warrior: as much of everything, standing and hitting, some block and some CC resist;
* - assassin: bursts of damage, the most crits and the quickest, dodging what it can;
* - archer: the hardest hitting, and the most penetration;
* - mechanic: hits again and again from off, a little of everything;
* - wizard: magic, hitting hard and seeing past defence, and standing magic better than blows;
* - priest: heals and shields (by its attack), standing magic well, quick at what it does.
*/
var CLASS_STATS = {
	knight: {
		hp: 1400,
		atk: 750,
		physical: 1e3,
		magical: 700,
		block: {
			physical: 350,
			magical: 250
		},
		dodge: NONE,
		crit: 50,
		speed: 0,
		pen: 0,
		resist: 250
	},
	warrior: {
		hp: 1150,
		atk: 1e3,
		physical: 600,
		magical: 450,
		block: {
			physical: 100,
			magical: 50
		},
		dodge: {
			physical: 50,
			magical: 50
		},
		crit: 100,
		speed: 100,
		pen: 100,
		resist: 150
	},
	assassin: {
		hp: 900,
		atk: 1150,
		physical: 300,
		magical: 250,
		block: NONE,
		dodge: {
			physical: 200,
			magical: 150
		},
		crit: 350,
		speed: 250,
		pen: 150,
		resist: 50
	},
	archer: {
		hp: 850,
		atk: 1250,
		physical: 250,
		magical: 250,
		block: NONE,
		dodge: {
			physical: 100,
			magical: 50
		},
		crit: 200,
		speed: 150,
		pen: 300,
		resist: 0
	},
	mechanic: {
		hp: 900,
		atk: 1050,
		physical: 300,
		magical: 350,
		block: NONE,
		dodge: {
			physical: 50,
			magical: 50
		},
		crit: 150,
		speed: 150,
		pen: 150,
		resist: 50
	},
	wizard: {
		hp: 800,
		atk: 1250,
		physical: 200,
		magical: 450,
		block: {
			physical: 0,
			magical: 50
		},
		dodge: {
			physical: 0,
			magical: 50
		},
		crit: 150,
		speed: 50,
		pen: 200,
		resist: 0
	},
	priest: {
		hp: 900,
		atk: 900,
		physical: 300,
		magical: 500,
		block: {
			physical: 0,
			magical: 100
		},
		dodge: {
			physical: 0,
			magical: 50
		},
		crit: 50,
		speed: 100,
		pen: 0,
		resist: 100
	}
};
//#endregion
//#region src/technomagic/heroes/clause/index.ts
var CUT_GROUND = {
	blow: 7e3,
	stun: 5
};
var SHIELD_STRIKE = {
	blow: 4e3,
	lasts: 20,
	slow: .67,
	exposed: 1.3
};
var GUARDIAN = {
	lasts: 20,
	taken: .75
};
var VOW = {
	weak: .8,
	lasts: 8,
	mana: 300
};
var art$2 = (index) => skillPicture(CLAUSE_ASSETS, index);
var VOW_OF_KNIGHTS = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Vow of Knights",
		about: "Passive. When he blocks he strikes back: the boss hits 20% less hard for 8 seconds, and he gains 300 mana.",
		icon: "🛡️",
		image: art$2(3)
	}
};
/** What Guardian Shield gives every hero for a while: shown on each card, with how long it has left. */
var GUARDED$1 = {
	name: "Guardian Shield",
	about: "Takes 25% less from the boss.",
	icon: "✨",
	image: art$2(2)
};
var CLAUSE = {
	id: "clause",
	name: "Clause",
	class: "knight",
	assets: CLAUSE_ASSETS,
	stats: {
		...CLASS_STATS.knight,
		deals: "physical"
	},
	abilities: [
		{
			name: "Cut Ground",
			icon: "⚔️",
			image: art$2(0),
			move: "slam",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Shield Strike",
			icon: "🛡️",
			image: art$2(1),
			move: "bash",
			cooldown: 8,
			cost: 1
		},
		{
			name: "Guardian Shield",
			icon: "✨",
			image: art$2(2),
			move: "guard",
			cooldown: 12,
			cost: 2
		}
	],
	passive: VOW_OF_KNIGHTS,
	attack: "swing",
	join(fight, self) {
		return {
			lands: {
				swing() {
					fight.hit(self, BLOW);
				},
				slam() {
					fight.hit(self, CUT_GROUND.blow);
					fight.stun(CUT_GROUND.stun, { by: self });
				},
				bash() {
					fight.hit(self, SHIELD_STRIKE.blow);
					put(fight.foe.statuses, {
						name: "Exposed",
						left: SHIELD_STRIKE.lasts,
						takes: SHIELD_STRIKE.exposed,
						shown: "curse"
					});
					fight.slow(SHIELD_STRIKE.slow, SHIELD_STRIKE.lasts);
				},
				guard() {
					put(fight.party, {
						name: GUARDED$1.name,
						left: GUARDIAN.lasts,
						takes: GUARDIAN.taken,
						shown: GUARDED$1
					});
				}
			},
			blocked() {
				fight.cue(self, "vow");
				fight.hit(self, BLOW);
				put(fight.foe.statuses, {
					name: "Weakened",
					left: VOW.lasts,
					deals: VOW.weak,
					shown: "slow"
				});
				self.mana = Math.min(MAX_MANA, self.mana + VOW.mana);
			}
		};
	}
};
//#endregion
//#region src/technomagic/heroes/body/pose.ts
/** Once round. */
var TURN = Math.PI * 2;
/**
* At rest: its weight on its right leg, the left foot out a little; the blade across its back, held low
* in its right hand behind its hip and running up past its left shoulder; its left hand hanging loose
* by its side.
*/
var REST = {
	ahead: 0,
	jump: 0,
	flip: 0,
	spin: 0,
	hipX: 0,
	hipY: 0,
	hipZ: 0,
	hipTurn: 0,
	lean: 0,
	twist: 0,
	tilt: 0,
	nod: 0,
	look: 0,
	lfX: 0,
	lfY: 0,
	lfZ: 0,
	rfX: 0,
	rfY: 0,
	rfZ: 0,
	lfTip: 0,
	rfTip: 0,
	lhX: 0,
	lhY: 0,
	lhZ: 0,
	rhX: 0,
	rhY: 0,
	rhZ: 0,
	bTurn: 0,
	bUp: 0,
	hipX: -.045,
	hipY: -.02,
	hipTurn: -.12,
	lean: .02,
	tilt: .05,
	lfX: .07,
	lfZ: .06,
	rfX: -.01,
	rfZ: -.02,
	lhX: .21,
	lhY: -.1,
	lhZ: .02,
	rhX: -.25,
	rhY: .02,
	rhZ: -.1,
	bTurn: 1.9,
	bUp: .9
};
/** A pose as it is, for a track: tracks hold what is added to standing at rest (`from`: how the hero whose track it is stands, REST unless it has a stance of its own). */
function at(pose, from = REST) {
	const added = {};
	for (const part of Object.keys(pose)) added[part] = pose[part] - from[part];
	return added;
}
//#endregion
//#region src/technomagic/heroes/moves/stances.ts
/** A deep lunge: the left knee bent far ahead, the right leg stretched out straight behind on its toes, the hips low. */
var LUNGE = {
	hipX: 0,
	tilt: 0,
	hipY: -.27,
	hipZ: .13,
	lfX: .05,
	lfZ: .5,
	rfX: -.06,
	rfZ: -.43,
	rfTip: .55
};
/** Low with its feet far apart and its weight between them: the second of two sweeps, its hips swung back. */
var WIDE = {
	hipX: 0,
	tilt: 0,
	hipY: -.3,
	hipZ: -.05,
	lfX: .06,
	lfZ: .43,
	rfX: -.08,
	rfZ: -.48,
	rfTip: .2
};
/** Coiled: its feet under it and its knees bent, about to go. */
var COILED = {
	hipX: 0,
	tilt: 0,
	hipY: -.2,
	lfX: .04,
	lfZ: .12,
	rfX: -.05,
	rfZ: -.1
};
/** Drawn up tall, its feet together and the front one lifted to its toes. */
var TALL = {
	hipX: 0,
	tilt: 0,
	hipY: .01,
	lfX: .03,
	lfY: .04,
	lfZ: .07,
	lfTip: .5,
	rfX: -.03,
	rfZ: -.05
};
/** In the air, its knees pulled up under it. */
var TUCKED = {
	hipX: 0,
	tilt: 0,
	hipY: .03,
	lfX: .04,
	lfY: .3,
	lfZ: .12,
	rfX: -.04,
	rfY: .36,
	rfZ: -.02
};
/** In the air, its legs thrown apart, one ahead and one behind: going over in the flip. */
var SPLIT = {
	hipX: 0,
	tilt: 0,
	hipY: .03,
	lfX: .05,
	lfY: .22,
	lfZ: .52,
	lfTip: .6,
	rfX: -.05,
	rfY: .3,
	rfZ: -.5,
	rfTip: .6
};
/** Landed, down almost to one knee. */
var KNEELING = {
	hipX: 0,
	tilt: 0,
	hipY: -.42,
	hipZ: .05,
	lfX: .05,
	lfZ: .32,
	rfX: -.06,
	rfZ: -.3,
	rfTip: .7
};
/** Low and wide, a foot ahead: how it stands to cut. */
var LOW = {
	hipX: 0,
	hipY: -.1,
	tilt: 0,
	lfX: .04,
	lfZ: .2,
	rfX: -.05,
	rfZ: -.14
};
//#endregion
//#region src/technomagic/heroes/fallen-frey/moves.ts
/** How she stands: upright, her weight on both feet, her weapon held before her at her waist, her right hand loose at her side. */
var STAND = {
	...REST,
	hipX: 0,
	hipY: -.01,
	hipTurn: -.06,
	lean: 0,
	tilt: .02,
	lfX: .05,
	lfZ: .05,
	rfX: -.03,
	rfZ: -.03,
	lhX: .18,
	lhY: .02,
	lhZ: .16,
	rhX: -.21,
	rhY: -.12,
	rhZ: .02,
	bTurn: 0,
	bUp: -1.3
};
/** A pose of hers, for a track: what is added to how she stands. */
var as = (pose) => at(pose, STAND);
/** Off the floor, her feet hanging, toes down. */
var HOVER = {
	hipX: 0,
	tilt: 0,
	hipY: .02,
	lfX: .04,
	lfY: .06,
	lfZ: .04,
	lfTip: .7,
	rfX: -.04,
	rfY: .14,
	rfZ: -.06,
	rfTip: .7
};
var SMITE$1 = {
	keys: [
		[0, {}],
		[.22, as({
			twist: .35,
			lean: -.06,
			nod: -.05,
			lhX: .24,
			lhY: .42,
			lhZ: -.04,
			rhX: -.24,
			rhY: .05,
			rhZ: .1
		})],
		[.38, as({
			...LOW,
			twist: -.4,
			lean: .18,
			lhX: .08,
			lhY: .32,
			lhZ: .5,
			rhX: -.26,
			rhY: -.04,
			rhZ: -.12
		})],
		[.6, as({
			...LOW,
			hipY: -.11,
			twist: -.42,
			lean: .16,
			lhX: .08,
			lhY: .31,
			lhZ: .48,
			rhX: -.26,
			rhY: -.04,
			rhZ: -.12
		})],
		[1, {}]
	],
	lands: [.4]
};
var LIGHT$1 = {
	keys: [
		[0, {}],
		[.25, as({
			...COILED,
			lean: .2,
			nod: .15,
			lhX: .12,
			lhY: .08,
			lhZ: .24,
			rhX: -.12,
			rhY: .08,
			rhZ: .24
		})],
		[.55, as({
			...TALL,
			lean: -.18,
			nod: -.3,
			lhX: .12,
			lhY: .78,
			lhZ: .08,
			rhX: -.2,
			rhY: .62,
			rhZ: .06,
			bUp: 1.4
		})],
		[.8, as({
			...TALL,
			lean: -.2,
			nod: -.32,
			lhX: .12,
			lhY: .8,
			lhZ: .08,
			rhX: -.2,
			rhY: .64,
			rhZ: .06,
			bUp: 1.45
		})],
		[1.05, as({
			...LOW,
			twist: -.3,
			lean: .25,
			lhX: .06,
			lhY: .26,
			lhZ: .5,
			rhX: -.22,
			rhY: .2,
			rhZ: .4,
			bUp: 0
		})],
		[1.25, as({
			...LOW,
			hipY: -.11,
			twist: -.32,
			lean: .23,
			lhX: .06,
			lhY: .25,
			lhZ: .48,
			rhX: -.22,
			rhY: .19,
			rhZ: .38,
			bUp: 0
		})],
		[1.7, {}]
	],
	lands: [.55, 1.05]
};
var BLESSING$1 = {
	keys: [
		[0, {}],
		[.3, as({
			...COILED,
			lean: .25,
			nod: .25,
			lhX: .1,
			lhY: .15,
			lhZ: .2,
			rhX: -.1,
			rhY: .15,
			rhZ: .2,
			bUp: -.4
		})],
		[.6, as({
			...TALL,
			jump: .15,
			lean: -.15,
			nod: -.25,
			lhX: .24,
			lhY: .86,
			lhZ: .08,
			rhX: -.5,
			rhY: .45,
			rhZ: .05,
			bTurn: -1.4,
			bUp: .5
		})],
		[.95, as({
			...TALL,
			jump: .18,
			lean: -.17,
			nod: -.27,
			lhX: .24,
			lhY: .88,
			lhZ: .08,
			rhX: -.51,
			rhY: .47,
			rhZ: .05,
			bTurn: -1.4,
			bUp: .55
		})],
		[1.45, {}]
	],
	lands: [.6]
};
/** Heaven's Vengeance: twenty blows, as the light comes down on the boss again and again while she hangs in the air. */
var BLOWS = 20;
var FIRST = .7;
var EVERY = .12;
var STRETCHED = {
	lhX: .05,
	lhY: .34,
	lhZ: .5,
	rhX: -.05,
	rhY: .28,
	rhZ: .49,
	bTurn: 0,
	bUp: .3
};
var VENGEANCE$1 = {
	keys: [
		[0, {}],
		[.3, as({
			...COILED,
			lean: .2,
			lhX: .16,
			lhY: .1,
			lhZ: .2,
			rhX: -.16,
			rhY: .05,
			rhZ: .1
		})],
		[.65, as({
			...HOVER,
			...STRETCHED,
			jump: .9,
			lean: .04,
			nod: -.05
		})],
		[1.8, as({
			...HOVER,
			...STRETCHED,
			jump: 1.05,
			lean: .05,
			nod: -.06,
			lhY: .35,
			rhY: .29
		})],
		[3.05, as({
			...HOVER,
			...STRETCHED,
			jump: .95,
			lean: .04,
			nod: -.05
		})],
		[3.45, as({
			...COILED,
			lean: .15
		})],
		[3.85, {}]
	],
	lands: Array.from({ length: BLOWS }, (_, i) => FIRST + i * EVERY)
};
//#endregion
//#region src/technomagic/heroes/fallen-frey/index.ts
var SMITE = { blow: BLOW * 1.5 };
var LIGHT = {
	heal: 250,
	near: 3.6,
	blast: 5e3
};
var BLESSING = {
	shield: 300,
	lasts: 10,
	allies: 4,
	speed: 500
};
var VENGEANCE = {
	blow: 1e3,
	pierce: 500,
	exposed: .1,
	most: 5,
	lasts: 20,
	stun: .5
};
var TAINTED = {
	taken: 1.15,
	mana: 80,
	every: 1,
	most: 2
};
var art$1 = (index) => skillPicture(FALLEN_FREY_ASSETS, index);
var TAINTED_ANGEL = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: TAINTED.taken,
	shown: {
		name: "Tainted Angel",
		about: "Passive. She takes 15% more from the boss, but her mana fills far faster; at full mana she gains Darkened Power every second (2 at most).",
		icon: "🌑",
		image: art$1(3)
	}
};
/** What her full mana gives her: shown beside her passive, with how many she has. */
var DARKENED = {
	name: "Darkened Power",
	about: "Her next skill spends one: Heaven’s Vengeance then stuns the boss with every blow.",
	icon: "🖤"
};
/** What Blessing of Doom gives each ally it shields: shown on its card, with how long it has left. */
var BLESSED = {
	name: "Blessing of Doom",
	about: "A shield takes the boss’s blows first, and its attacks are quickened.",
	icon: "🔮",
	image: art$1(1)
};
/** What Heaven's Vengeance leaves on the boss. */
var EXPOSED = "Heaven’s Vengeance";
var FALLEN_FREY = {
	id: "fallen-frey",
	name: "Fallen Frey",
	class: "priest",
	assets: FALLEN_FREY_ASSETS,
	stats: {
		...CLASS_STATS.priest,
		deals: "magical"
	},
	abilities: [
		{
			name: "Light of Doom",
			icon: "✴️",
			image: art$1(0),
			move: "light",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Blessing of Doom",
			icon: "🔮",
			image: art$1(1),
			move: "blessing",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Heaven’s Vengeance",
			icon: "☄️",
			image: art$1(2),
			move: "vengeance",
			cooldown: 22,
			cost: 5
		}
	],
	passive: TAINTED_ANGEL,
	attack: "smite",
	stands: STAND,
	join(fight, self) {
		/** Her Darkened Power, and how long her mana has been full toward the next. */
		let stacks = 0;
		let darkening = 0;
		/** This Heaven's Vengeance was used with Darkened Power; and how many times over it has left the boss easier to hurt. */
		let empowered = false;
		let exposed = 0;
		/** A skill is used: one Darkened Power is spent, if she has any (true if she did). */
		const spend = () => {
			if (stacks <= 0) return false;
			stacks--;
			return true;
		};
		/** The heroes on the field standing, the lowest health (for what it is out of) first. */
		const weakest = () => fight.field.filter((ally) => ally.hp > 0).sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp);
		return {
			lands: {
				smite() {
					fight.hit(self, SMITE.blow);
				},
				light(part) {
					if (part === 0) {
						spend();
						const allies = weakest();
						const [lowest] = allies;
						if (!lowest) return;
						const near = allies.filter((ally) => {
							const x = ally.x - lowest.x;
							const z = ally.z - lowest.z;
							return Math.sqrt(x * x + z * z) <= LIGHT.near;
						});
						fight.cue(self, "light", near);
						for (const ally of near) fight.heal(ally, LIGHT.heal, self);
						return;
					}
					fight.hit(self, LIGHT.blast);
				},
				blessing() {
					spend();
					const allies = weakest().slice(0, BLESSING.allies);
					fight.cue(self, "blessing", allies);
					for (const ally of allies) {
						fight.shield(ally, BLESSING.shield, BLESSING.lasts, self);
						put(ally.statuses, {
							name: BLESSED.name,
							left: BLESSING.lasts,
							pace: 1 + share(BLESSING.speed),
							shown: BLESSED
						});
					}
				},
				vengeance(part) {
					if (part === 0) empowered = spend();
					fight.hit(self, VENGEANCE.blow, true, VENGEANCE.pierce);
					exposed = fight.foe.statuses.some((status) => status.name === EXPOSED) ? Math.min(VENGEANCE.most, exposed + 1) : 1;
					put(fight.foe.statuses, {
						name: EXPOSED,
						left: VENGEANCE.lasts,
						takes: 1 + VENGEANCE.exposed * exposed,
						shown: "curse"
					});
					if (empowered) fight.stun(VENGEANCE.stun, { by: self });
				}
			},
			tick(dt) {
				self.mana = Math.min(MAX_MANA, self.mana + TAINTED.mana * dt);
				if (self.mana >= 1200 && stacks < TAINTED.most) {
					darkening += dt;
					if (darkening >= TAINTED.every) {
						darkening -= TAINTED.every;
						stacks++;
					}
				} else darkening = 0;
			},
			lit: () => stacks > 0,
			buffs: () => stacks > 0 ? [{
				...DARKENED,
				count: stacks
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/heroes/kirze/index.ts
var JUDGMENT$1 = {
	cut: 1500,
	blow: 6e3,
	down: 3
};
var HAZE$1 = {
	burst: 9e3,
	stun: 2,
	lasts: 15,
	quicker: 1.5,
	every: 2,
	wave: 2500,
	waveStun: 1
};
var FLOWER$1 = {
	line: 8e3,
	burst: 12e3,
	slow: .5,
	slowed: 5,
	curse: 10,
	end: 6e3,
	each: 800
};
var art = (index) => skillPicture(KIRZE_ASSETS, index);
/**
* Her passive, the game's End to Evil Deeds!: the game says how much longer the stuns last and how much
* likelier a critical blow is, and leaves how much harder she hits unsaid.
*/
var EVIL_DEEDS = {
	attack: 1.2,
	crit: .2,
	control: 1.3,
	shown: {
		name: "End to Evil Deeds!",
		about: "Passive. Her blows are harder and more often critical, and her stuns on a boss last 30% longer.",
		icon: "⚜️",
		image: art(3)
	}
};
/** What Crystal Haze gives her for a while: shown beside her passive, with how long it has left. */
var AWAKENING = {
	name: "Arcane Crystal Awakening",
	about: "Quickened, and a shockwave goes out from her every 2 seconds.",
	icon: "💠",
	image: art(1)
};
//#endregion
//#region src/technomagic/heroes/index.ts
/** The heroes there are, in the order of their cards. */
var HEROES = [
	{
		id: "kirze",
		name: "Kirze",
		class: "warrior",
		assets: KIRZE_ASSETS,
		stats: {
			...CLASS_STATS.warrior,
			deals: "magical"
		},
		abilities: [
			{
				name: "Slash, Blade of Judgment!",
				icon: "🌀",
				image: art(0),
				move: "judgment",
				cooldown: 9,
				cost: 2
			},
			{
				name: "Disperse, Crystal Haze!",
				icon: "💠",
				image: art(1),
				move: "haze",
				cooldown: 17,
				cost: 3
			},
			{
				name: "Bloom, Crimson Flower!",
				icon: "🌺",
				image: art(2),
				move: "flower",
				cooldown: 20,
				cost: 4
			}
		],
		passive: EVIL_DEEDS,
		join(fight, self) {
			/** How long she is quickened for yet (Crystal Haze), and until her next shockwave. */
			let awake = 0;
			let wave = 0;
			/** Her curse on the boss: how long it has left, and the blows counted against it. */
			let curse = null;
			return {
				lands: {
					judgment(part) {
						if (part < 7) return fight.hit(self, JUDGMENT$1.cut);
						fight.hit(self, JUDGMENT$1.blow);
						fight.stun(JUDGMENT$1.down, {
							down: true,
							by: self
						});
					},
					haze() {
						fight.hit(self, HAZE$1.burst);
						fight.stun(HAZE$1.stun, { by: self });
						awake = HAZE$1.lasts;
						wave = HAZE$1.every;
					},
					flower(part) {
						if (part === 0) return fight.hit(self, FLOWER$1.line);
						fight.hit(self, FLOWER$1.burst);
						curse = {
							left: FLOWER$1.curse,
							blows: 0
						};
						fight.slow(FLOWER$1.slow, FLOWER$1.slowed);
					}
				},
				struck() {
					if (curse) curse.blows++;
				},
				tick(dt) {
					if (awake > 0) {
						awake = Math.max(0, awake - dt);
						wave -= dt;
						if (wave <= 0 && fight.field.includes(self)) {
							wave += HAZE$1.every;
							fight.cue(self, "wave");
							fight.hit(self, HAZE$1.wave);
							fight.stun(HAZE$1.waveStun, { by: self });
						}
					}
					if (curse) {
						curse.left -= dt;
						if (curse.left <= 0) {
							const { blows } = curse;
							curse = null;
							fight.cue(self, "curse");
							fight.hit(self, FLOWER$1.end + FLOWER$1.each * blows, false);
						}
					}
				},
				pace: () => awake > 0 ? HAZE$1.quicker : 1,
				lit: () => awake > 0,
				buffs: () => awake > 0 ? [{
					...AWAKENING,
					left: awake
				}] : [],
				marks: () => curse ? [{
					text: `Curse ${Math.ceil(curse.left)} · ${curse.blows} blows`,
					tone: "curse"
				}] : []
			};
		}
	},
	CLAUSE,
	FALLEN_FREY
];
//#endregion
//#region src/technomagic/sim/gear.ts
/** A hero's stats with what its gear gives it (as ../../heroes/stats.ts shows them). */
function geared(stats, gear = {}) {
	const more = (n, by) => n * (1 + (by ?? 0));
	const plus = (n, by) => n + (by ?? 0);
	return {
		...stats,
		hp: more(stats.hp, gear.hp),
		atk: more(stats.atk, gear.atk),
		physical: more(stats.physical, gear.defense),
		magical: more(stats.magical, gear.defense),
		crit: plus(stats.crit, gear.crit),
		speed: plus(stats.speed, gear.speed),
		pen: plus(stats.pen, gear.pen),
		resist: plus(stats.resist, gear.resist),
		block: {
			physical: plus(stats.block.physical, gear.block),
			magical: plus(stats.block.magical, gear.block)
		},
		dodge: {
			physical: plus(stats.dodge.physical, gear.dodge),
			magical: plus(stats.dodge.magical, gear.dodge)
		}
	};
}
//#endregion
//#region src/technomagic/heroes/clause/moves.ts
/**
* How a knight stands ready, as its moves begin and end (its own animation, when it has one, shows either
* side of them): its sword out to its right and ahead, a little down, its shield before it.
*/
var READY = {
	hipX: 0,
	tilt: 0,
	hipY: -.04,
	lfX: .04,
	lfZ: .14,
	rfX: -.05,
	rfZ: -.1,
	rhX: -.32,
	rhY: .14,
	rhZ: .18,
	bTurn: 5.6,
	bUp: -.15,
	lhX: .12,
	lhY: .28,
	lhZ: .34
};
var SLAM = {
	keys: [
		[0, at(READY)],
		[.25, at({
			...COILED,
			hipY: -.26,
			lean: .22,
			rhX: -.2,
			rhY: .1,
			rhZ: -.1,
			bTurn: 6.28,
			bUp: 1.2,
			lhX: .2,
			lhY: .2,
			lhZ: .3
		})],
		[.55, at({
			...TUCKED,
			ahead: 1.4,
			jump: 2.2,
			lean: -.2,
			rhX: -.12,
			rhY: .78,
			rhZ: -.05,
			bTurn: 6.28,
			bUp: 2,
			lhX: .22,
			lhY: .36,
			lhZ: .2
		})],
		[.78, at({
			...KNEELING,
			ahead: 2.4,
			lean: .5,
			rhX: -.06,
			rhY: .02,
			rhZ: .48,
			bTurn: 6.28,
			bUp: -.9,
			lhX: .2,
			lhY: .1,
			lhZ: .3
		})],
		[1.05, at({
			...KNEELING,
			hipY: -.4,
			ahead: 2.4,
			lean: .46,
			rhX: -.06,
			rhY: .02,
			rhZ: .46,
			bTurn: 6.28,
			bUp: -.86,
			lhX: .2,
			lhY: .1,
			lhZ: .3
		})],
		[1.6, at(READY)]
	],
	lands: [.78]
};
var BASH = {
	keys: [
		[0, at(READY)],
		[.22, at({
			...COILED,
			twist: .5,
			lean: .05,
			lhX: .3,
			lhY: .3,
			lhZ: -.05,
			rhX: -.3,
			rhY: .1,
			rhZ: -.15,
			bTurn: 3.6,
			bUp: .2
		})],
		[.4, at({
			...LUNGE,
			ahead: 2,
			lean: .34,
			twist: -.6,
			lhX: .06,
			lhY: .36,
			lhZ: .56,
			rhX: -.3,
			rhY: .05,
			rhZ: -.2,
			bTurn: 3.4,
			bUp: 0
		})],
		[.6, at({
			...LUNGE,
			hipY: -.29,
			ahead: 2.05,
			lean: .3,
			twist: -.62,
			lhX: .06,
			lhY: .36,
			lhZ: .54,
			rhX: -.3,
			rhY: .05,
			rhZ: -.2,
			bTurn: 3.4,
			bUp: 0
		})],
		[1.1, at(READY)]
	],
	lands: [.4]
};
var GUARD = {
	keys: [
		[0, at(READY)],
		[.3, at({
			...LOW,
			lean: .12,
			twist: -.25,
			lhX: .08,
			lhY: .3,
			lhZ: .42,
			rhX: -.28,
			rhY: .2,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1
		})],
		[.5, at({
			...LOW,
			hipY: -.14,
			lean: .1,
			twist: -.3,
			lhX: .06,
			lhY: .38,
			lhZ: .46,
			rhX: -.24,
			rhY: .7,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1.57
		})],
		[1.05, at({
			...LOW,
			hipY: -.13,
			lean: .1,
			twist: -.3,
			lhX: .06,
			lhY: .39,
			lhZ: .46,
			rhX: -.24,
			rhY: .72,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1.6
		})],
		[1.5, at(READY)]
	],
	lands: [.5]
};
var SWING = {
	keys: [
		[0, at(READY)],
		[.18, at({
			...LOW,
			twist: -.55,
			lean: .06,
			rhX: -.4,
			rhY: .26,
			rhZ: -.08,
			bTurn: 4.4,
			bUp: .2,
			lhX: .1,
			lhY: .3,
			lhZ: .36
		})],
		[.3, at({
			...LOW,
			hipZ: .08,
			twist: .5,
			lean: .2,
			rhX: .28,
			rhY: .2,
			rhZ: .36,
			bTurn: 7.2,
			bUp: 0,
			lhX: .22,
			lhY: .26,
			lhZ: .1
		})],
		[.44, at({
			...LOW,
			hipZ: .06,
			twist: .62,
			lean: .16,
			rhX: .34,
			rhY: .24,
			rhZ: .22,
			bTurn: 7.8,
			bUp: .2,
			lhX: .22,
			lhY: .26,
			lhZ: .08
		})],
		[.6, at({
			...LOW,
			hipZ: .08,
			twist: -.5,
			lean: .2,
			rhX: -.34,
			rhY: .2,
			rhZ: .32,
			bTurn: 5.3,
			bUp: 0,
			lhX: .1,
			lhY: .3,
			lhZ: .36
		})],
		[.74, at({
			...LOW,
			hipZ: .06,
			twist: -.6,
			lean: .14,
			rhX: -.4,
			rhY: .22,
			rhZ: .18,
			bTurn: 4.8,
			bUp: .15,
			lhX: .1,
			lhY: .3,
			lhZ: .36
		})],
		[1.15, at(READY)]
	],
	lands: [.3, .6]
};
//#endregion
//#region src/technomagic/heroes/kirze/moves.ts
/** The blade held out level to its right, to spin with. */
var OUT = {
	rhX: -.42,
	rhY: .24,
	rhZ: .02,
	bTurn: 4.71,
	bUp: .05,
	lhX: .3,
	lhY: .26,
	lhZ: 0
};
var JUDGMENT = {
	keys: [
		[0, {}],
		[.2, at({
			...COILED,
			...OUT,
			ahead: 1.4,
			twist: -.5,
			lean: .12
		})],
		[1.25, at({
			...LOW,
			...OUT,
			ahead: 2.3,
			spin: TURN * 4,
			twist: -.3,
			lean: .12
		})],
		[1.45, at({
			...TALL,
			ahead: 2.3,
			spin: TURN * 4,
			lean: -.18,
			rhX: -.1,
			rhY: .7,
			rhZ: -.04,
			bTurn: 6.28,
			bUp: 1.9,
			lhX: .12,
			lhY: .6,
			lhZ: 0
		})],
		[1.58, at({
			...LUNGE,
			ahead: 2.7,
			spin: TURN * 4,
			lean: .5,
			rhX: -.05,
			rhY: .02,
			rhZ: .48,
			bTurn: 6.28,
			bUp: -.5,
			lhX: .1,
			lhY: .04,
			lhZ: .4
		})],
		[1.78, at({
			...LUNGE,
			hipY: -.3,
			ahead: 2.7,
			spin: TURN * 4,
			lean: .46,
			rhX: -.05,
			rhY: .02,
			rhZ: .46,
			bTurn: 6.28,
			bUp: -.48,
			lhX: .1,
			lhY: .04,
			lhZ: .38
		})],
		[2.4, { spin: TURN * 4 }]
	],
	lands: [
		.3,
		.44,
		.58,
		.72,
		.86,
		1,
		1.14,
		1.6
	]
};
var HAZE = {
	keys: [
		[0, {}],
		[.32, at({
			...COILED,
			hipY: -.26,
			lean: .3,
			nod: .2,
			twist: -.2,
			rhX: -.06,
			rhY: .12,
			rhZ: .26,
			bTurn: 1.2,
			bUp: .2,
			lhX: .1,
			lhY: .14,
			lhZ: .26
		})],
		[.6, at({
			...TALL,
			jump: .5,
			lean: -.2,
			nod: -.3,
			rhX: -.2,
			rhY: .74,
			rhZ: 0,
			bTurn: 0,
			bUp: 1.57,
			lhX: .34,
			lhY: .5,
			lhZ: 0
		})],
		[1, at({
			...TALL,
			jump: .6,
			lean: -.24,
			nod: -.32,
			rhX: -.2,
			rhY: .76,
			rhZ: 0,
			bTurn: 0,
			bUp: 1.6,
			lhX: .36,
			lhY: .52,
			lhZ: 0
		})],
		[1.25, at({
			...COILED,
			lean: .15
		})],
		[1.6, {}]
	],
	lands: [.62]
};
var FLOWER = {
	keys: [
		[0, {}],
		[.28, at({
			...COILED,
			ahead: -.2,
			twist: -.6,
			lean: .05,
			rhX: -.3,
			rhY: 0,
			rhZ: -.25,
			bTurn: 3.4,
			bUp: -.4,
			lhX: .2,
			lhY: .2,
			lhZ: .25
		})],
		[.45, at({
			...LUNGE,
			ahead: .6,
			lean: .5,
			twist: .35,
			rhX: -.04,
			rhY: -.02,
			rhZ: .5,
			bTurn: 0,
			bUp: -.55,
			lhX: .24,
			lhY: .1,
			lhZ: -.2
		})],
		[.95, at({
			...LUNGE,
			hipY: -.3,
			ahead: .6,
			lean: .46,
			twist: .38,
			rhX: -.04,
			rhY: -.02,
			rhZ: .48,
			bTurn: 0,
			bUp: -.55,
			lhX: .24,
			lhY: .1,
			lhZ: -.2
		})],
		[1.1, at({
			...TALL,
			ahead: .4,
			lean: -.2,
			twist: -.3,
			rhX: -.16,
			rhY: .72,
			rhZ: 0,
			bTurn: .4,
			bUp: 1.8,
			lhX: .3,
			lhY: .3,
			lhZ: .1
		})],
		[1.35, at({
			...TALL,
			ahead: .4,
			lean: -.22,
			twist: -.32,
			rhX: -.16,
			rhY: .73,
			rhZ: 0,
			bTurn: .4,
			bUp: 1.85,
			lhX: .3,
			lhY: .3,
			lhZ: .1
		})],
		[1.8, {}]
	],
	lands: [.47, 1.1]
};
//#endregion
//#region src/technomagic/heroes/moves/common.ts
var ATTACK = {
	keys: [
		[0, {}],
		[.16, at({
			...COILED,
			twist: -.6,
			lean: .1,
			rhX: -.36,
			rhY: .2,
			rhZ: -.12,
			bTurn: 4.2,
			bUp: .1,
			lhX: .22,
			lhY: .1,
			lhZ: .16
		})],
		[.29, at({
			...LUNGE,
			ahead: 1.9,
			lean: .32,
			twist: .55,
			rhX: .26,
			rhY: .2,
			rhZ: .34,
			bTurn: 7.3,
			bUp: 0,
			lhX: .26,
			lhY: .1,
			lhZ: -.18
		})],
		[.38, at({
			...LUNGE,
			hipY: -.29,
			ahead: 2,
			lean: .28,
			twist: .68,
			rhX: .32,
			rhY: .22,
			rhZ: .22,
			bTurn: 7.7,
			bUp: .1,
			lhX: .26,
			lhY: .1,
			lhZ: -.2
		})],
		[.5, at({
			...WIDE,
			ahead: 2.1,
			lean: .24,
			twist: -.55,
			rhX: -.34,
			rhY: .2,
			rhZ: .3,
			bTurn: 5.25,
			bUp: 0,
			lhX: .24,
			lhY: .14,
			lhZ: .12
		})],
		[.62, at({
			...COILED,
			ahead: 2.15,
			hipY: -.16,
			lean: .1,
			twist: -.65,
			rhX: -.38,
			rhY: .12,
			rhZ: .16,
			bTurn: 4.9,
			bUp: .15,
			lhX: .24,
			lhY: .06,
			lhZ: .12
		})],
		[.8, at({
			...TUCKED,
			ahead: 2.2,
			jump: 1.2,
			lean: -.15,
			twist: .45,
			rhX: .16,
			rhY: .6,
			rhZ: 0,
			bTurn: 2.1,
			bUp: 1.05,
			lhX: .24,
			lhY: .2,
			lhZ: .1
		})],
		[.92, at({
			...LUNGE,
			hipY: -.3,
			ahead: 2.3,
			lean: .42,
			twist: -.5,
			rhX: -.3,
			rhY: .04,
			rhZ: .36,
			bTurn: -.67,
			bUp: -.47,
			lhX: .24,
			lhY: .1,
			lhZ: -.12
		})],
		[1.06, at({
			...TALL,
			ahead: 2.25,
			hipZ: -.06,
			lean: -.04,
			twist: -.4,
			rhX: -.2,
			rhY: .26,
			rhZ: -.2,
			bTurn: 0,
			bUp: .02,
			lhX: .16,
			lhY: .22,
			lhZ: .28
		})],
		[1.15, at({
			...LUNGE,
			hipY: -.31,
			hipZ: .2,
			lfZ: .58,
			rfZ: -.46,
			ahead: 2.6,
			lean: .5,
			twist: .3,
			rhX: -.04,
			rhY: .34,
			rhZ: .5,
			bTurn: 0,
			bUp: 0,
			lhX: .24,
			lhY: .12,
			lhZ: -.22
		})],
		[1.25, at({
			...LUNGE,
			hipY: -.31,
			hipZ: .19,
			lfZ: .58,
			rfZ: -.46,
			ahead: 2.62,
			lean: .46,
			twist: .34,
			rhX: -.04,
			rhY: .34,
			rhZ: .48,
			bTurn: 0,
			bUp: .03,
			lhX: .24,
			lhY: .12,
			lhZ: -.22
		})],
		[1.4, at({
			...COILED,
			ahead: 2.45,
			hipY: -.24,
			lean: .15,
			twist: -.2,
			rhX: -.22,
			rhY: .24,
			rhZ: -.14,
			bTurn: 0,
			bUp: 2.6,
			lhX: .22,
			lhY: .14,
			lhZ: .1
		})],
		[1.6, at({
			...SPLIT,
			ahead: 2.5,
			jump: 1.5,
			flip: TURN * .6,
			lean: .2,
			rhX: -.08,
			rhY: .6,
			rhZ: -.06,
			bTurn: 0,
			bUp: 2.5,
			lhX: .16,
			lhY: .4,
			lhZ: .1
		})],
		[1.76, at({
			...KNEELING,
			ahead: 2.7,
			flip: TURN,
			lean: .5,
			rhX: -.06,
			rhY: .12,
			rhZ: .46,
			bTurn: 0,
			bUp: -.52,
			lhX: .14,
			lhY: .1,
			lhZ: .36
		})],
		[1.88, at({
			...KNEELING,
			hipY: -.4,
			ahead: 2.7,
			flip: TURN,
			lean: .45,
			rhX: -.06,
			rhY: .12,
			rhZ: .44,
			bTurn: 0,
			bUp: -.48,
			lhX: .14,
			lhY: .1,
			lhZ: .34
		})],
		[2.14, at({
			...TUCKED,
			lfY: .16,
			rfY: .22,
			ahead: 1.3,
			jump: .55,
			flip: TURN,
			lean: -.1,
			rhX: -.26,
			rhY: .12,
			rhZ: -.04,
			bTurn: .6,
			bUp: 2.2,
			lhX: .24,
			lhY: .04,
			lhZ: .1
		})],
		[2.38, at({
			...COILED,
			hipY: -.14,
			ahead: .06,
			flip: TURN,
			lean: .1
		})],
		[2.7, { flip: TURN }]
	],
	lands: [
		.3,
		.51,
		.93,
		1.17,
		1.77
	]
};
var HIT = {
	keys: [
		[0, {}],
		[.08, {
			ahead: -.35,
			hipZ: -.1,
			hipY: -.06,
			lean: -.4,
			nod: -.35,
			twist: .25,
			lfY: .06,
			lfZ: -.05,
			lhX: .12,
			lhY: .36,
			lhZ: -.1,
			rhX: -.1,
			rhY: .3,
			rhZ: .05,
			bTurn: -.5,
			bUp: -.4
		}],
		[.25, {
			ahead: -.55,
			hipZ: -.06,
			hipY: -.1,
			lean: -.2,
			nod: .1,
			twist: .15,
			lhY: .1,
			rhY: .1
		}],
		[.6, {}]
	],
	lands: []
};
//#endregion
//#region src/technomagic/heroes/moves/index.ts
var MOVES = {
	attack: ATTACK,
	cast: {
		keys: [
			[0, {}],
			[.3, at({
				...LOW,
				hipY: -.18,
				lean: .25,
				twist: -.2,
				nod: .15,
				rhX: -.1,
				rhY: .1,
				rhZ: .26,
				bTurn: 1.1,
				bUp: .32,
				lhX: .14,
				lhY: .14,
				lhZ: .28
			})],
			[.6, at({
				hipX: 0,
				tilt: 0,
				hipY: 0,
				lean: -.08,
				twist: -.3,
				nod: -.2,
				rhX: -.14,
				rhY: .7,
				rhZ: .02,
				bTurn: 1.1,
				bUp: 1.6,
				lhX: .22,
				lhY: .05,
				lhZ: .16
			})],
			[.9, at({
				hipX: 0,
				tilt: 0,
				hipY: .01,
				lean: -.12,
				twist: -.35,
				nod: -.22,
				rhX: -.14,
				rhY: .72,
				rhZ: -.02,
				bTurn: 1.1,
				bUp: 1.75,
				lhX: .22,
				lhY: .06,
				lhZ: .16
			})],
			[1, at({
				...LOW,
				ahead: .5,
				hipY: -.16,
				hipZ: .1,
				lean: .38,
				twist: .4,
				nod: .1,
				lfZ: .24,
				rhX: -.02,
				rhY: 0,
				rhZ: .48,
				bTurn: .1,
				bUp: -.46,
				lhX: .22,
				lhY: .02,
				lhZ: -.16
			})],
			[1.15, at({
				...LOW,
				ahead: .5,
				hipY: -.15,
				hipZ: .1,
				lean: .34,
				twist: .42,
				lfZ: .24,
				rhX: -.02,
				rhY: -.02,
				rhZ: .46,
				bTurn: .1,
				bUp: -.44,
				lhX: .22,
				lhY: .02,
				lhZ: -.16
			})],
			[1.6, {}]
		],
		lands: [1]
	},
	judgment: JUDGMENT,
	haze: HAZE,
	flower: FLOWER,
	slam: SLAM,
	bash: BASH,
	guard: GUARD,
	swing: SWING,
	smite: SMITE$1,
	light: LIGHT$1,
	blessing: BLESSING$1,
	vengeance: VENGEANCE$1,
	hit: HIT
};
//#endregion
//#region src/technomagic/sim/motion.ts
/** Its own attack, and a skill of its own: how many times as fast their animations are played. */
var OWN_SPEED = 1.4;
var SKILL_SPEED = 1.2;
var coded = (move) => ({
	speed: 1,
	parts: [{
		lands: MOVES[move].lands,
		until: lengthOf(MOVES[move].keys)
	}],
	fifth: false
});
/** The animations that move a skin: its own, another skin's it names, or a rig read for them alone (null: none, so the moves written in code). */
function animationsOf(skins, skin) {
	const { model } = skin;
	if (model.kind === "rigged") return model;
	if (typeof model.movedBy === "string") {
		const other = skins.find((one) => one.name === model.movedBy)?.model;
		return other?.kind === "rigged" ? other : null;
	}
	return model.movedBy ?? null;
}
/** How `def` moves in its skin `skin` (its index among its skins; the first, for one it hasn't). */
function motionOf(def, skin) {
	const { skins } = def.assets;
	const rigged = animationsOf(skins, skins[skin] ?? skins[0]);
	const own = rigged?.attack ?? [];
	const attack = own.length > 0 ? "attack" : def.attack ?? "attack";
	const moves = Object.fromEntries(Object.keys(MOVES).map((move) => [move, coded(move)]));
	moves.enter = {
		speed: 1,
		parts: [{
			lands: [],
			until: ENTER
		}],
		fifth: false
	};
	if (own.length > 0) moves.attack = {
		speed: OWN_SPEED,
		parts: own.map(({ lands, until }) => ({
			lands,
			until
		})),
		fifth: true
	};
	for (const [move, { lands, until }] of Object.entries(rigged?.skills ?? {})) if (move in MOVES) moves[move] = {
		speed: SKILL_SPEED,
		parts: [{
			lands,
			until
		}],
		fifth: false
	};
	return {
		attack,
		moves
	};
}
//#endregion
//#region src/technomagic/sim/random.ts
/** A generator for `seed` (a whole number; only its low 32 bits count). */
function seeded(seed) {
	let a = 2654435769;
	let b = 608135816;
	let c = 3084996962;
	let d = seed >>> 0;
	const step = () => {
		a >>>= 0;
		b >>>= 0;
		c >>>= 0;
		d >>>= 0;
		const t = (a + b | 0) + d | 0;
		d = d + 1 | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = c << 21 | c >>> 11;
		c = c + t | 0;
		return t >>> 0;
	};
	for (let i = 0; i < 15; i++) step();
	return {
		next: () => step() / 4294967296,
		state: () => [
			a >>> 0,
			b >>> 0,
			c >>> 0,
			d >>> 0
		]
	};
}
//#endregion
//#region src/technomagic/sim/sets.ts
var TM_SETS = [
	"perseverance",
	"hope",
	"authority"
];
/** What each class is, for each set (a class the set does nothing for is left out). */
var ROLES = {
	perseverance: {
		warrior: "dps",
		assassin: "dps",
		archer: "dps",
		mechanic: "dps",
		wizard: "dps",
		priest: "priest",
		knight: "knight"
	},
	hope: {
		priest: "support",
		mechanic: "support",
		knight: "knight"
	},
	authority: {
		warrior: "dps",
		assassin: "dps",
		archer: "dps",
		wizard: "dps",
		priest: "support",
		mechanic: "support",
		knight: "knight"
	}
};
/** A hero's set as it fights: which, and what its class is to it (null: no set, or one that does nothing for its class). */
function setOf(set, heroClass) {
	if (!set || !TM_SETS.includes(set)) return null;
	const role = ROLES[set][heroClass];
	return role ? {
		id: set,
		role
	} : null;
}
var PERSEVERANCE = {
	/** A damage dealer's ATK: so much more at once, and `step` more every `every` seconds, `most` times. */
	atk: .1,
	step: .015,
	every: 10,
	most: 10,
	/** A priest's heals and shields; a knight's max HP. */
	heal: .25,
	hp: .25,
	/** A knight's block: what its blow back takes (at ATK 1000), and the boss's blows the softer for so long. */
	strike: 1500,
	weak: .92,
	weakFor: 5
};
var HOPE = {
	/** What each support wearing it gives every ally. */
	atk: .05,
	defence: .1,
	/** A knight: what it takes, and the share of what the boss deals every other ally that it takes instead. */
	taken: .9,
	covers: .2
};
var AUTHORITY = {
	/** A damage dealer's penetration (points). */
	pen: 500,
	/** A support's mana at the start, and how long the ally with the highest ATK can't be knocked down. */
	mana: 400,
	guardFor: 15,
	/** A knight's CC resist (points). */
	resist: 300
};
/** What Authority's support puts on the ally with the highest ATK. */
var GUARDED = {
	name: "Authority",
	about: "Can’t be knocked down.",
	icon: "⚡"
};
//#endregion
//#region src/technomagic/sim/fight.ts
/** What knocks a hero down: shown on its card, with how long it has left. */
var KNOCKED = {
	name: "Knocked down",
	about: "Can do nothing until it is up.",
	icon: "💫",
	harmful: true
};
/** Steps in a second (a checksum is kept at the end of each). */
var SECOND = Math.round(1 / TICK);
function makeSim({ boss: def, heroes, seed, stage: firstStage, raid, solo = false, first = [] }) {
	const random = seeded(seed);
	const roll = () => random.next();
	const events = [];
	const log = [];
	const sums = [];
	let pending = [];
	const maxHp = def.stats.hp * (solo ? SOLO_BOSS_HP : 1);
	const foe = {
		def,
		part: { lands: {} },
		hp: maxHp,
		maxHp,
		stunned: 0,
		slowed: 0,
		slowRate: 1,
		statuses: []
	};
	let tick = 0;
	let elapsed = 0;
	/** Seconds of the raid's time gone, against this boss. */
	let clock = 0;
	let stage = Math.min(8, Math.max(1, Math.floor(firstStage) || 1));
	let bossAuto = raid;
	let result = null;
	/** The boss's health given back since it was last shown, and how long since then. */
	let mended = 0;
	let mendShown = 0;
	const party = [];
	const fighters = heroes.map(({ def: hero, skin = 0, gear = {}, set: wearing = null }, index) => {
		const set = setOf(wearing, hero.class);
		const stats = geared(hero.stats, gear);
		if (set?.id === "perseverance" && set.role === "knight") stats.hp *= 1 + PERSEVERANCE.hp;
		if (set?.id === "authority" && set.role === "dps") stats.pen += AUTHORITY.pen;
		if (set?.id === "authority" && set.role === "knight") stats.resist += AUTHORITY.resist;
		const motion = motionOf(hero, skin);
		const name = (hero.assets.skins[skin] ?? hero.assets.skins[0])?.name ?? hero.name;
		return {
			index,
			id: hero.id,
			name,
			def: hero,
			stats,
			critTimes: 2 + (gear.critDamage ?? 0),
			healTimes: (1 + (gear.heal ?? 0)) * (set?.id === "perseverance" && set.role === "priest" ? 1 + PERSEVERANCE.heal : 1),
			set,
			controlTimes: 1 + (gear.control ?? 0),
			motion,
			attack: motion.attack,
			part: { lands: {} },
			hp: stats.hp,
			shield: 0,
			shieldLeft: 0,
			statuses: [],
			mana: Math.min(MAX_MANA, MAX_MANA / 2 + (set?.id === "authority" && set.role === "support" ? AUTHORITY.mana : 0)),
			auto: false,
			cooldowns: hero.abilities.map(() => 0),
			reserved: null,
			rested: 0,
			dealt: 0,
			healed: 0,
			doing: null,
			haste: 1,
			x: 0,
			z: 0
		};
	});
	/** Who is on the field, and where each is to stand: it moves there (from where it was, should others have come or gone). */
	let field = [];
	const spots = /* @__PURE__ */ new Map();
	function form() {
		const places = formation(field.map((on) => lineOf(on.def)));
		field.forEach((on, i) => spots.set(on, places[i]));
	}
	/** A hero runs onto the field, at its place in its line (false: the field is full). */
	function stand(fighter) {
		if (field.length >= 9) return false;
		field = [...field, fighter];
		form();
		[fighter.x, fighter.z] = spots.get(fighter);
		fighter.rested = 0;
		fighter.doing = {
			move: "enter",
			t: 0,
			part: 0,
			landed: 0,
			blows: 0
		};
		events.push({
			kind: "enter",
			who: fighter.index
		});
		return true;
	}
	/** How long the boss has been still; what each of its parts (heads) is doing, and will do after; whom it goes for, and whether it was busy last step. */
	let idle = 0;
	const going = /* @__PURE__ */ new Map();
	let aim = null;
	let was = false;
	const bossBusy = () => going.size > 0 || foe.stunned > 0;
	/** The boss begins an attack: not while it is stunned, or while any part of it the attack needs is still at another. */
	function bossUse(attack) {
		const plan = def.plans[attack] ?? [];
		if (foe.stunned > 0 || plan.length === 0 || plan.some(([, by]) => going.has(by))) return;
		plan.forEach(([move, by, after], part) => {
			const moves = going.get(by) ?? [];
			moves.push({
				move,
				attack,
				part,
				t: -after,
				hit: false
			});
			going.set(by, moves);
		});
		events.push({
			kind: "boss-use",
			attack
		});
	}
	/** One of the heroes on the field the boss can go for (not one out of the fight), at random: one standing, if any is (null: there is none). */
	const anyone = () => {
		const there = field.filter((fighter) => !away(fighter.statuses));
		const up = there.filter((fighter) => fighter.hp > 0);
		const from = up.length > 0 ? up : there;
		return from.length > 0 ? from[Math.floor(roll() * from.length)] : null;
	};
	/** Whom the boss is going for: another, should that one have left the field, or the fight. */
	const aimed = () => {
		if (!aim || !field.includes(aim) || away(aim.statuses)) aim = anyone();
		return aim;
	};
	/** Heroes on the field, standing and in the fight, with a set's `role` (each support of Hope's gives every ally more). */
	const wearing = (id, role) => field.filter((on) => on.hp > 0 && !away(on.statuses) && on.set?.id === id && on.set.role === role);
	/** How many times as hard a hero hits for its sets (Perseverance's damage dealer, growing as the fight goes on; every Hope support's on the field). */
	const atkTimes = (by) => {
		return (1 + (by.set?.id === "perseverance" && by.set.role === "dps" ? PERSEVERANCE.atk + PERSEVERANCE.step * Math.min(PERSEVERANCE.most, Math.floor(elapsed / PERSEVERANCE.every)) : 0)) * (1 + HOPE.atk * wearing("hope", "support").length);
	};
	/** How many times as much a heal or a shield gives for the hero whose it is (its attack and its gear; one that is no hero's: as much as it says). */
	const byAttack = (by) => by ? by.stats.atk / ATK * atkTimes(by) * by.healTimes : 1;
	function end(how) {
		if (result) return;
		result = how;
		events.push({
			kind: "end",
			result: how
		});
	}
	function stagger(fighter) {
		if (fighter.doing?.move === "enter") return;
		fighter.doing = {
			move: "hit",
			t: 0,
			part: 0,
			landed: 0,
			blows: 0
		};
		events.push({
			kind: "stagger",
			who: fighter.index
		});
	}
	/** A hero begins a move (it must be free). */
	function begin(fighter, move, skill) {
		fighter.doing = {
			move,
			t: 0,
			part: 0,
			landed: 0,
			blows: 0
		};
		events.push({
			kind: "start",
			who: fighter.index,
			move,
			skill
		});
	}
	/** A hero uses a skill (true if it did: it must be free). */
	function use(fighter, index) {
		const ability = fighter.def.abilities[index];
		if (!ability || fighter.doing || !sim.ready(fighter, index)) return false;
		begin(fighter, ability.move, true);
		if (fighter.set?.id === "authority" && fighter.set.role === "knight") {
			for (let i = foe.statuses.length - 1; i >= 0; i--) if ((foe.statuses[i].deals ?? 1) > 1) foe.statuses.splice(i, 1);
		}
		fighter.cooldowns[index] = ability.cooldown;
		fighter.mana -= ability.cost * 200;
		return true;
	}
	/** What comes of the moves every hero has, as each part lands (unless its own part says otherwise). */
	const common = {
		attack: (fighter, part) => sim.hit(fighter, BLOW * (part === 4 ? 1.6 : 1)),
		cast: (fighter) => sim.hit(fighter, BLOW * 3)
	};
	/** A hero's move goes on by `dt` (of its own time): each blow of it that lands, and on to its next part or done. */
	function advance(fighter, dt) {
		const doing = fighter.doing;
		if (!doing) return;
		const timeline = fighter.motion.moves[doing.move];
		doing.t += dt * timeline.speed;
		const part = timeline.parts[doing.part];
		if (!part) {
			fighter.doing = null;
			return;
		}
		while (doing.landed < part.lands.length && doing.t >= part.lands[doing.landed]) {
			doing.landed++;
			doing.blows++;
			if (doing.move !== "hit" && doing.move !== "enter") {
				const move = doing.move;
				const index = timeline.fifth && doing.part === timeline.parts.length - 1 && doing.landed === part.lands.length ? 4 : doing.blows - 1;
				events.push({
					kind: "land",
					who: fighter.index,
					move,
					part: index
				});
				const own = fighter.part.lands[move];
				if (own) own(index);
				else common[move]?.(fighter, index);
			}
			if (fighter.doing !== doing || result) return;
		}
		if (doing.t >= part.until) fighter.doing = doing.part + 1 < timeline.parts.length ? {
			...doing,
			part: doing.part + 1,
			t: 0,
			landed: 0
		} : null;
	}
	/** The boss's parts go on by `dt`: each blow that lands, on whoever it is going for (or as its part says). */
	function bossAdvance(dt) {
		const rate = foe.slowed > 0 ? foe.slowRate : 1;
		for (const [by, moves] of going) {
			const doing = moves[0];
			if (!doing) {
				going.delete(by);
				continue;
			}
			doing.t += dt * rate;
			const move = def.moves[doing.move];
			if (!move) {
				moves.shift();
				if (moves.length === 0) going.delete(by);
				continue;
			}
			if (move.hit !== null && !doing.hit && doing.t >= move.hit) {
				doing.hit = true;
				const [least, most] = move.hurts ?? [0, 0];
				const amount = least + roll() * (most - least);
				const own = foe.part.lands[doing.attack];
				if (own) own(doing.part, amount);
				else {
					const target = aimed();
					if (target) sim.hurt(target, amount);
				}
				if (result) return;
			}
			if (doing.t >= move.length && going.get(by) === moves) {
				moves.shift();
				if (moves.length === 0) going.delete(by);
			}
		}
	}
	const sim = {
		raid,
		fighters,
		get field() {
			return field;
		},
		foe,
		party,
		get stage() {
			return stage;
		},
		get bossAuto() {
			return bossAuto;
		},
		get tick() {
			return tick;
		},
		get elapsed() {
			return elapsed;
		},
		get left() {
			return 210 - clock;
		},
		get result() {
			return result;
		},
		events,
		log,
		sums,
		roll,
		hit(by, amount, counted = true, pierce = 0) {
			if (foe.hp <= 0 || result) return;
			const { attack, crit } = by.def.passive ?? NO_PASSIVE;
			const { atk, deals: type, crit: points, pen } = by.stats;
			const critical = roll() < share(points) + crit + critting(by.statuses);
			const { taken, blocked, dodged } = strike(amount * (atk / ATK) * atkTimes(by) * attack * dealing(by.statuses) * (critical ? by.critTimes : 1), type, foe.def.stats, pen + pierce, roll);
			if (dodged) {
				events.push({
					kind: "number",
					on: "boss",
					amount: 0,
					type: "dodged"
				});
				return;
			}
			events.push({ kind: "boss-hit" });
			const dealt = Math.min(foe.hp, taken * taking(foe.statuses, type));
			foe.hp -= dealt;
			by.dealt += dealt;
			events.push({
				kind: "number",
				on: "boss",
				amount: dealt,
				type: blocked ? "blocked" : critical ? "crit" : "hit"
			});
			by.mana = Math.min(MAX_MANA, by.mana + 25);
			if (counted) {
				for (const fighter of fighters) fighter.part.struck?.();
				foe.part.struck?.(by, dealt);
			}
			if (foe.hp > 0) return;
			sim.stun(1, { down: true });
			foe.part.beaten?.();
			end("won");
		},
		heal(fighter, amount, by) {
			if (fighter.hp <= 0) return;
			const given = Math.min(amount * byAttack(by) * healing(fighter.statuses) * (foe.part.healing?.() ?? 1), fighter.stats.hp - fighter.hp);
			fighter.hp += given;
			if (by) by.healed += given;
			if (given > 0) events.push({
				kind: "number",
				on: fighter.index,
				amount: given,
				type: "heal"
			});
		},
		shield(fighter, amount, seconds = Infinity, by) {
			if (fighter.hp <= 0) return;
			const given = amount * byAttack(by) * (foe.part.shielding?.() ?? 1);
			fighter.shield += given;
			fighter.shieldLeft = Math.max(fighter.shieldLeft, seconds);
			if (by) by.healed += given;
		},
		target: aimed,
		hurt(target, amount, blockable = true) {
			if (target.hp <= 0 || away(target.statuses) || result) return 0;
			const type = foe.def.stats.deals;
			const guarded = 1 + HOPE.defence * wearing("hope", "support").length;
			const stands = {
				...target.stats,
				physical: target.stats.physical * guarded,
				magical: target.stats.magical * guarded
			};
			const { taken, blocked, dodged } = strike(amount * dealing(foe.statuses) * rage(clock - 210), type, blockable ? stands : {
				...stands,
				block: NONE,
				dodge: NONE
			}, 0, roll);
			if (dodged) {
				events.push({
					kind: "number",
					on: target.index,
					amount: 0,
					type: "dodged"
				});
				return 0;
			}
			events.push({
				kind: "hurt",
				who: target.index,
				blocked
			});
			let dealt = taken * taking(party, type) * taking(target.statuses, type) * (target.def.passive?.taken ?? 1) * (target.set?.id === "hope" && target.set.role === "knight" ? HOPE.taken : 1);
			const cover = target.def.class === "knight" ? void 0 : wearing("hope", "knight").find((knight) => knight !== target);
			if (cover) {
				const covered = dealt * HOPE.covers;
				dealt -= covered;
				const soak = Math.min(cover.shield, covered);
				cover.shield -= soak;
				if (covered > soak) {
					cover.hp = Math.max(0, cover.hp - (covered - soak));
					events.push({
						kind: "number",
						on: cover.index,
						amount: covered - soak,
						type: "hit"
					});
					if (cover.hp <= 0) {
						cover.shield = 0;
						cover.doing = null;
						cover.reserved = null;
					}
				}
			}
			const soaked = Math.min(target.shield, dealt);
			target.shield -= soaked;
			if (soaked > 0) events.push({
				kind: "number",
				on: target.index,
				amount: soaked,
				type: "shield"
			});
			if (dealt > soaked) {
				target.hp = Math.max(0, target.hp - (dealt - soaked));
				events.push({
					kind: "number",
					on: target.index,
					amount: dealt - soaked,
					type: blocked ? "blocked" : "hit"
				});
			}
			if (target.hp <= 0) {
				target.shield = 0;
				target.doing = null;
				target.reserved = null;
			}
			target.mana = Math.min(MAX_MANA, target.mana + 25);
			if (blocked) {
				target.part.blocked?.();
				if (target.set?.id === "perseverance" && target.set.role === "knight" && target.hp > 0) {
					sim.hit(target, PERSEVERANCE.strike, false);
					put(foe.statuses, {
						name: "Perseverance",
						left: PERSEVERANCE.weakFor,
						deals: PERSEVERANCE.weak,
						shown: "slow"
					});
				}
			}
			return dealt;
		},
		revive(fighter, share, by) {
			if (fighter.hp > 0 || result) return;
			fighter.hp = Math.max(1, fighter.stats.hp * share);
			fighter.doing = null;
			fighter.statuses = [];
			fighter.rested = 0;
			if (by) by.healed += fighter.hp;
			events.push({
				kind: "revive",
				who: fighter.index
			});
			events.push({
				kind: "number",
				on: fighter.index,
				amount: fighter.hp,
				type: "heal"
			});
		},
		knock(fighter, seconds) {
			if (fighter.hp <= 0 || away(fighter.statuses) || fighter.statuses.some((status) => status.guards)) return;
			stagger(fighter);
			put(fighter.statuses, {
				name: KNOCKED.name,
				left: seconds * (1 - share(fighter.stats.resist)),
				binds: true,
				shown: KNOCKED
			});
		},
		stagger,
		mend(amount) {
			if (foe.hp <= 0) return;
			const given = Math.min(amount * healing(foe.statuses), foe.maxHp - foe.hp);
			foe.hp += given;
			mended += given;
		},
		stun(seconds, { down = false, by } = {}) {
			const lasts = seconds * (by ? (by.def.passive?.control ?? 1) * by.controlTimes : 1);
			going.clear();
			foe.stunned = Math.max(foe.stunned, lasts);
			events.push({
				kind: "boss-daze",
				seconds: lasts,
				down
			});
		},
		slow(rate, seconds) {
			if (foe.part.steady) return;
			foe.slowRate = rate;
			foe.slowed = seconds;
			events.push({
				kind: "boss-slow",
				rate,
				seconds
			});
		},
		cue(who, name, targets = []) {
			events.push({
				kind: "cue",
				who: who?.index ?? null,
				name,
				targets: targets.map((one) => one.index)
			});
		},
		ready(fighter, index) {
			const ability = fighter.def.abilities[index];
			return ability !== void 0 && field.includes(fighter) && fighter.hp > 0 && !bound(fighter.statuses) && fighter.cooldowns[index] <= 0 && fighter.mana >= ability.cost * 200;
		},
		input(input) {
			pending.push(input);
			log.push({
				...input,
				tick
			});
		},
		marks() {
			const marks = [];
			if (foe.hp <= 0) marks.push({
				text: "Beaten",
				tone: "down"
			});
			else if (foe.stunned > 0) marks.push({
				text: `Stunned ${Math.ceil(foe.stunned)}`,
				tone: "stun"
			});
			if (foe.slowed > 0) marks.push({
				text: `Slowed ${Math.ceil(foe.slowed)}`,
				tone: "slow"
			});
			if (foe.hp > 0 && clock > 210) {
				const times = rage(clock - 210);
				marks.push({
					text: `Enraged ×${times < 10 ? times.toFixed(1) : Math.round(times).toLocaleString("en-US")}`,
					tone: "rage"
				});
			}
			for (const status of foe.statuses) marks.push({
				text: `${status.name} ${Number.isFinite(status.left) ? Math.ceil(status.left) : `×${status.count ?? 1}`}`,
				tone: status.shown
			});
			marks.push(...foe.part.marks?.() ?? []);
			for (const fighter of fighters) marks.push(...fighter.part.marks?.() ?? []);
			return marks;
		},
		checksum() {
			const word = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
			let hash = 2166136261;
			const mix = (n) => {
				word.setFloat64(0, n);
				for (let i = 0; i < 8; i++) hash = Math.imul(hash ^ word.getUint8(i), 16777619);
			};
			mix(tick);
			mix(clock);
			mix(foe.hp);
			mix(foe.stunned);
			mix(foe.slowed);
			mix(foe.statuses.length);
			for (const fighter of fighters) {
				mix(fighter.hp);
				mix(fighter.mana);
				mix(fighter.shield);
				mix(fighter.dealt);
				mix(fighter.statuses.length);
				mix(fighter.doing ? fighter.doing.t : -1);
				for (const left of fighter.cooldowns) mix(left);
			}
			for (const n of random.state()) mix(n);
			return hash >>> 0;
		},
		step() {
			const now = pending;
			pending = [];
			for (const input of now) apply(input);
			if (result) return;
			const dt = TICK;
			elapsed += dt;
			idle = bossBusy() ? 0 : idle + dt;
			if (bossAuto && idle >= 1.1) bossUse((def.attacks[Math.floor(roll() * def.attacks.length)] ?? def.attacks[0])?.name ?? "");
			for (const fighter of fighters) {
				fighter.mana = Math.min(MAX_MANA, fighter.mana + 50 * dt * filling(fighter.statuses) * filling(party));
				fighter.cooldowns = fighter.cooldowns.map((left) => Math.max(0, left - dt));
				wear(fighter.statuses, dt);
				fighter.shieldLeft = Math.max(0, fighter.shieldLeft - dt);
				if (fighter.shieldLeft <= 0) fighter.shield = 0;
				fighter.part.tick?.(dt);
				if (result) return;
			}
			foe.slowed = Math.max(0, foe.slowed - dt);
			foe.stunned = Math.max(0, foe.stunned - dt);
			wear(foe.statuses, dt);
			wear(party, dt);
			clock += dt;
			foe.part.tick?.(dt);
			mendShown += dt;
			if (mendShown >= 1) {
				if (mended >= 1) events.push({
					kind: "number",
					on: "boss",
					amount: mended,
					type: "heal",
					mend: true
				});
				mended = 0;
				mendShown = 0;
			}
			for (const on of field) {
				on.rested = on.doing ? 0 : on.rested + dt;
				if (on.auto && on.reserved === null) {
					for (let index = on.def.abilities.length - 1; index >= 0 && on.reserved === null; index--) if (sim.ready(on, index)) on.reserved = index;
				}
				if (on.reserved !== null && !sim.ready(on, on.reserved) && !bound(on.statuses)) on.reserved = null;
				if (!on.doing && on.hp > 0 && !bound(on.statuses)) {
					if (on.reserved !== null) {
						if (use(on, on.reserved)) on.reserved = null;
					} else if (on.rested >= .45 && foe.hp > 0) begin(on, on.attack, false);
				}
			}
			const busy = bossBusy();
			if (busy && !was) aim = anyone();
			was = busy;
			bossAdvance(dt);
			if (result) return;
			const reform = Math.min(1, dt * 4);
			for (const on of field) {
				on.haste = (1 + share(on.stats.speed)) * (on.part.pace?.() ?? 1) * pacing(on.statuses);
				advance(on, dt * on.haste);
				if (result) return;
				const [x, z] = spots.get(on);
				on.x += (x - on.x) * reform;
				on.z += (z - on.z) * reform;
			}
			if (field.length > 0 && field.every((on) => on.hp <= 0) || clock >= 230) end("lost");
			tick++;
			if (tick % SECOND === 0) sums.push(sim.checksum());
		}
	};
	/** An input, as it counts (one that makes no sense, or only does when trying things out, in a raid: none). */
	function apply(input) {
		const fighter = "fighter" in input ? fighters[input.fighter] : void 0;
		switch (input.kind) {
			case "skill":
				if (!fighter) return;
				if (fighter.reserved === input.skill) fighter.reserved = null;
				else if (sim.ready(fighter, input.skill)) fighter.reserved = input.skill;
				return;
			case "auto":
				if (fighter) fighter.auto = !fighter.auto;
				return;
			case "all-auto": {
				const on = !fighters.every((one) => one.auto);
				for (const one of fighters) one.auto = on;
				return;
			}
			case "leave":
				if (raid) end("lost");
				return;
		}
		if (raid) return;
		switch (input.kind) {
			case "toggle":
				if (!fighter) return;
				if (!field.includes(fighter)) {
					stand(fighter);
					return;
				}
				field = field.filter((on) => on !== fighter);
				spots.delete(fighter);
				form();
				fighter.reserved = null;
				fighter.doing = null;
				events.push({
					kind: "leave",
					who: fighter.index
				});
				return;
			case "boss":
				bossUse(input.attack);
				return;
			case "boss-auto":
				bossAuto = !bossAuto;
				return;
			case "stage":
				stage = Math.min(8, Math.max(1, Math.floor(input.stage) || 1));
				return;
		}
	}
	foe.part = def.join?.(sim) ?? foe.part;
	if (fighters.some((fighter) => fighter.set?.id === "authority" && fighter.set.role === "support")) {
		const strongest = fighters.reduce((best, fighter) => !best || fighter.stats.atk > best.stats.atk ? fighter : best, null);
		if (strongest) put(strongest.statuses, {
			name: GUARDED.name,
			left: AUTHORITY.guardFor,
			guards: true,
			shown: GUARDED
		});
	}
	for (const fighter of fighters) fighter.part = fighter.def.join(sim, fighter);
	for (const fighter of raid ? fighters : first.map((index) => fighters[index])) if (fighter && !field.includes(fighter)) stand(fighter);
	if (field.length === 0 && fighters[0]) stand(fighters[0]);
	return sim;
}
//#endregion
//#region src/technomagic/sim/verify.ts
var SIM_VERSION = 3;
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
var STEP_SECONDS = TICK;
var MOST_TICKS = Math.ceil(230 / TICK) + 1;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
var MOST_INPUTS = 2e4;
var MOST_STAGE = 8;
/** The heroes and bosses there are, by id, and how many skins each hero has. */
var HERO_SKINS = Object.fromEntries(HEROES.map((hero) => [hero.id, hero.assets.skins.length]));
var BOSS_IDS = BOSSES.map((boss) => boss.id);
var RAID_KINDS = /* @__PURE__ */ new Set([
	"skill",
	"auto",
	"all-auto",
	"leave"
]);
var whole = (n, below) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < below;
/** The page's inputs, as they are taken (null: something in them makes no sense). Only what a raid takes. */
function readInputs(raw, heroes) {
	if (!Array.isArray(raw) || raw.length > 2e4) return null;
	const inputs = [];
	let last = 0;
	for (const one of raw) {
		if (typeof one !== "object" || one === null) return null;
		const { tick, kind, fighter, skill } = one;
		if (!whole(tick, MOST_TICKS) || tick < last || typeof kind !== "string" || !RAID_KINDS.has(kind)) return null;
		last = tick;
		if (kind === "skill") {
			if (!whole(fighter, heroes) || !whole(skill, 16)) return null;
			inputs.push({
				tick,
				kind: "skill",
				fighter,
				skill
			});
		} else if (kind === "auto") {
			if (!whole(fighter, heroes)) return null;
			inputs.push({
				tick,
				kind: "auto",
				fighter
			});
		} else inputs.push({
			tick,
			kind
		});
	}
	return inputs;
}
/** A raid ready to be fought (a string: why the run makes no sense). */
function startRaid(run) {
	if (!Number.isInteger(run.seed)) return "seed";
	const boss = BOSSES.find((one) => one.id === run.boss);
	if (!boss) return "boss";
	if (!whole(run.stage - 1, 8)) return "stage";
	if (run.heroes.length === 0 || run.heroes.length > 9) return "heroes";
	const entries = [];
	for (const hero of run.heroes) {
		const def = HEROES.find((one) => one.id === hero.id);
		if (!def || !whole(hero.skin, def.assets.skins.length)) return "hero";
		const gear = {};
		for (const [stat, n] of Object.entries(hero.gear)) if (Number.isFinite(n)) gear[stat] = n;
		entries.push({
			def,
			skin: hero.skin,
			gear,
			set: typeof hero.set === "string" ? hero.set : null
		});
	}
	const sim = makeSim({
		boss,
		heroes: entries,
		seed: run.seed,
		stage: run.stage,
		raid: true,
		solo: run.solo === true
	});
	const heroes = entries.length;
	return {
		get tick() {
			return sim.tick;
		},
		get result() {
			return sim.result;
		},
		get sums() {
			return sim.sums;
		},
		input(input) {
			const read = readInputs([{
				...input,
				tick: 0
			}], heroes);
			if (!read?.[0]) return false;
			const { tick: _tick, ...valid } = read[0];
			sim.input(valid);
			return true;
		},
		step() {
			sim.step();
			sim.events.length = 0;
		},
		autos: () => sim.fighters.map((fighter) => fighter.auto),
		dealt: () => sim.fighters.map((fighter) => fighter.dealt)
	};
}
var invalid = (reason) => ({
	result: "invalid",
	reason,
	ticks: 0,
	sums: [],
	parted: null,
	dealt: []
});
/** Plays a raid over with the page's inputs (and, to say where it parts from the page's, its checksums). */
function replay(run, rawInputs, pageSums = []) {
	const raid = startRaid(run);
	if (typeof raid === "string") return invalid(raid);
	const inputs = readInputs(rawInputs, run.heroes.length);
	if (!inputs) return invalid("inputs");
	let next = 0;
	while (!raid.result && raid.tick < MOST_TICKS) {
		while (next < inputs.length && inputs[next].tick === raid.tick) {
			const { tick: _tick, ...input } = inputs[next];
			raid.input(input);
			next++;
		}
		raid.step();
	}
	const sums = [...raid.sums];
	const at = sums.findIndex((sum, i) => i < pageSums.length && pageSums[i] !== sum);
	return {
		result: raid.result ?? "lost",
		ticks: raid.tick,
		sums,
		parted: at < 0 ? null : at + 1,
		dealt: raid.dealt()
	};
}
//#endregion
export { BOSS_IDS, HERO_SKINS, MOST_INPUTS, MOST_STAGE, MOST_TICKS, SIM_VERSION, STEP_SECONDS, readInputs, replay, startRaid };
