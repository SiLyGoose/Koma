// Built from Koma-UI's src/technomagic/sim/ by its scripts/sync.mjs: don't edit it here.
//#region src/technomagic/sim/combat/damage.ts
/** Nothing against either kind. */
var NONE = {
	physical: 0,
	magical: 0
};
/** As many points as are 100%. */
var POINTS = 1e3;
/** The share of a stat in points (0 to 1). */
var share = (points) => Math.min(1, Math.max(0, points / POINTS));
/** The attack a skill's numbers are written for: King's Raid's size of ATK, so a unique weapon's flat ATK (the game's own numbers) fits it. */
var ATK = 1e5;
/** A defense of this much halves what gets through (twice it: a third, and so on). */
var HALVING = 1e3;
/** A blocked blow does this much of what it would have. */
var BLOCKED = .5;
/** The most of a defense penetration sees past, however much there is (in points). */
var PEN_MOST = 500;
/**
* A blow of `amount` of a kind lands on `target`, from one with `pen` points of penetration: dodged (it
* takes nothing), or what it takes once the target's defense against that kind (less what penetration
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
//#region src/technomagic/sim/bosses/galgoria/attacks.ts
var HEADS = [
	"C",
	"L",
	"R"
];
/** How long each of its heads' moves takes, when its blow lands, and what that takes of whoever it lands on, least to most, before their defense. */
var MOVES = {
	spit: {
		length: 2,
		hit: .88,
		hurts: [3e4, 45e3]
	},
	roar: {
		length: 2.1,
		hit: .5,
		hurts: [2e4, 3e4]
	},
	slam: {
		length: 1.9,
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
//#endregion
//#region src/technomagic/sim/combat/status.ts
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
/** What these add to how many times as hard a bearer's critical blows are. */
function critDamaging(on) {
	let more = 0;
	for (const { critDamage } of on) more += critDamage ?? 0;
	return more;
}
/** What these add to a bearer's penetration (points). */
function piercing(on) {
	let more = 0;
	for (const { pen } of on) more += pen ?? 0;
	return more;
}
/** What these add to a bearer's CC resist (points). */
function resisting(on) {
	let more = 0;
	for (const { resist } of on) more += resist ?? 0;
	return more;
}
/** What these take off how likely a kind of damage's blows on a bearer are to be critical (points). */
function critResisting(on, type) {
	let more = 0;
	for (const { critResist } of on) more += typeof critResist === "number" ? critResist : critResist?.[type] ?? 0;
	return more;
}
/** How many times as much defense against a kind of damage a bearer of these has. */
function defending(on, type) {
	let times = 1;
	for (const { defends } of on) times *= typeof defends === "number" ? defends : defends?.[type] ?? 1;
	return times;
}
/** What these add to a bearer's chance to block a kind of damage (points). */
function blocking(on, type) {
	let more = 0;
	for (const { blocks } of on) more += blocks?.[type] ?? 0;
	return more;
}
/** A bearer of these can do nothing; is out of the fight altogether. */
var bound = (on) => on.some((status) => status.binds || status.away);
var away = (on) => on.some((status) => status.away);
//#endregion
//#region src/technomagic/sim/bosses/galgoria/skills.ts
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
var POISONED$1 = {
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
					name: POISONED$1.name,
					left: SWAMP.lasts,
					mana: SWAMP.mana,
					shown: POISONED$1
				});
				put(foe.statuses, {
					name: POISONED$1.name,
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
//#region src/technomagic/sim/bosses/index.ts
/** The bosses of the TechnoMagic Raid there are so far: the first is the one fought unless another is asked for. */
var BOSSES = [{
	id: "galgoria",
	name: "Galgoria",
	stats: {
		hp: 3e6,
		deals: "magical",
		physical: 600,
		magical: 800,
		block: NONE,
		dodge: NONE,
		crit: 100,
		resist: 150
	},
	attacks: ATTACKS,
	plans: PLANS,
	moves: MOVES,
	join: galgoriaPart
}];
//#endregion
//#region src/technomagic/sim/gear.ts
/** A hero's stats with what its gear gives it (as ../../heroes/stats.ts shows them). Flat ATK (a unique weapon's) is added before the shares of ATK. */
function geared(stats, gear = {}) {
	const more = (n, by) => n * (1 + (by ?? 0));
	const plus = (n, by) => n + (by ?? 0);
	const both = (by, one) => (by ?? 0) + (one ?? 0);
	return {
		...stats,
		hp: more(stats.hp, gear.hp),
		atk: more(plus(stats.atk, gear.atkFlat), gear.atk),
		physical: more(stats.physical, both(gear.defense, gear.defPhysical)),
		magical: more(stats.magical, both(gear.defense, gear.defMagical)),
		crit: plus(stats.crit, gear.crit),
		speed: plus(stats.speed, gear.speed),
		pen: plus(stats.pen, gear.pen),
		resist: plus(stats.resist, gear.resist),
		block: {
			physical: plus(stats.block.physical, both(gear.block, gear.blockPhysical)),
			magical: plus(stats.block.magical, both(gear.block, gear.blockMagical))
		},
		dodge: {
			physical: plus(stats.dodge.physical, gear.dodge),
			magical: plus(stats.dodge.magical, gear.dodge)
		}
	};
}
//#endregion
//#region src/technomagic/sim/heroes/kit.ts
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
* fight measures them (both the size of King's Raid's: a skill's numbers are written for an ATK of 100,000, ../combat/damage.ts,
* and what the boss's blows take and the heals and shields that are no share of health are sized to health this big); crit,
* attack speed, penetration, CC resist, block and dodge are points (1000: 100%). A first guess at each,
* by what the game says a class is for:
* - knight: the most health and defense, and blocks the most;
* - warrior: as much of everything, standing and hitting, some block and some CC resist;
* - assassin: bursts of damage, the most crits and the quickest, dodging what it can;
* - archer: the hardest hitting, and the most penetration;
* - mechanic: hits again and again from off, a little of everything;
* - wizard: magic, hitting hard and seeing past defense, and standing magic better than blows;
* - priest: heals and shields (by its attack), standing magic well, quick at what it does.
*/
var CLASS_STATS = {
	knight: {
		hp: 14e4,
		atk: 75e3,
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
		hp: 115e3,
		atk: 1e5,
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
		hp: 9e4,
		atk: 115e3,
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
		hp: 85e3,
		atk: 125e3,
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
		hp: 9e4,
		atk: 105e3,
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
		hp: 8e4,
		atk: 125e3,
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
		hp: 9e4,
		atk: 9e4,
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
//#region src/technomagic/sim/heroes/moves.ts
/** `count` blows, the first `first` seconds in and each `every` after the last. */
var every = (count, first, step) => Array.from({ length: count }, (_, i) => first + i * step);
/** Each move written in code: the ones every hero has (its attack, a plain cast, being hit), then each hero's own. */
var CODED = {
	attack: {
		lands: [
			.3,
			.51,
			.93,
			1.17,
			1.77
		],
		until: 2.7
	},
	cast: {
		lands: [1],
		until: 1.6
	},
	hit: {
		lands: [],
		until: .6
	},
	judgment: {
		lands: [
			.3,
			.44,
			.58,
			.72,
			.86,
			1,
			1.14,
			1.6
		],
		until: 2.4
	},
	haze: {
		lands: [.62],
		until: 1.6
	},
	flower: {
		lands: [.47, 1.1],
		until: 1.8
	},
	slam: {
		lands: [.78],
		until: 1.6
	},
	bash: {
		lands: [.4],
		until: 1.1
	},
	guard: {
		lands: [.5],
		until: 1.5
	},
	swing: {
		lands: [.3, .6],
		until: 1.15
	},
	smite: {
		lands: [.4],
		until: 1
	},
	light: {
		lands: [.55, 1.05],
		until: 1.7
	},
	blessing: {
		lands: [.6],
		until: 1.45
	},
	vengeance: {
		lands: every(20, .7, .12),
		until: 3.85
	},
	nudge: {
		lands: [.54],
		until: 1.43
	},
	pochi: {
		lands: every(5, .5, .2),
		until: 1.95
	},
	puchi: {
		lands: [.8],
		until: 1.4
	},
	pippi: {
		lands: every(10, .6, .15),
		until: 2.6
	},
	sleep: {
		lands: [.8],
		until: 3.55
	},
	zap: {
		lands: [.45],
		until: 1
	},
	ray: {
		lands: [.75],
		until: 1.5
	},
	treatment: {
		lands: [.6],
		until: 1.4
	},
	elimination: {
		lands: [1],
		until: 1.8
	},
	cleave: {
		lands: [.3, .6],
		until: 1.15
	},
	burning: {
		lands: [.76],
		until: 1.5
	},
	hellfire: {
		lands: [.55],
		until: 1.5
	},
	eruption: {
		lands: [.84],
		until: 1.75
	},
	splash: {
		lands: [.42],
		until: 1
	},
	droplets: {
		lands: [.6],
		until: 1.3
	},
	bubble: {
		lands: [.62],
		until: 1.3
	},
	festival: {
		lands: [1],
		until: 1.8
	},
	petals: {
		lands: [.33],
		until: .9
	},
	blossom: {
		lands: [.37],
		until: .95
	},
	scatter: {
		lands: [
			.31,
			.49,
			.67
		],
		until: 1.3
	},
	moon: {
		lands: [1.06],
		until: 1.8
	},
	claw: {
		lands: [.4],
		until: 1
	},
	instinct: {
		lands: [.47, 1.07],
		until: 1.85
	},
	despair: {
		lands: [.56],
		until: 1.3
	},
	doom: {
		lands: [1.02],
		until: 1.75
	},
	lash: {
		lands: [.42],
		until: 1
	},
	thornbush: {
		lands: [
			.46,
			.71,
			.96
		],
		until: 1.4
	},
	vine: {
		lands: [.56],
		until: 1.3
	},
	wrath: {
		lands: [.96],
		until: 1.8
	},
	bolt: {
		lands: [.42],
		until: 1
	},
	prototype: {
		lands: [.62],
		until: 1.3
	},
	field: {
		lands: [.68],
		until: 1.45
	},
	cannon: {
		lands: every(10, .8, .15),
		until: 2.6
	}
};
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
var SECTION = 1e3;
var MAX_MANA = 6 * SECTION;
var MANA_PER_HP_LOST = 2500;
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
/** What a blow of a hero's attack takes of the boss, before the boss's defense; and how much harder a critical blow is (before its gear's crit damage). */
var BLOW = 1100;
//#endregion
//#region src/technomagic/sim/motion.ts
/** Its own attack, and a skill of its own: how many times as fast their animations are played. */
var OWN_SPEED = 1.4;
var SKILL_SPEED = 1.2;
var coded = (span) => ({
	speed: 1,
	parts: [span],
	fifth: false
});
/** How `def` moves. */
function motionOf(def) {
	const own = def.timing?.attack ?? [];
	const attack = own.length > 0 ? "attack" : def.attack ?? "attack";
	const moves = Object.fromEntries(Object.entries(CODED).map(([move, span]) => [move, coded(span)]));
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
		parts: own,
		fifth: true
	};
	for (const [move, span] of Object.entries(def.timing?.skills ?? {})) moves[move] = {
		speed: SKILL_SPEED,
		parts: [span],
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
//#region src/technomagic/sim/shown.ts
/** The pictures of `hero`'s skills, by index (its passive last). */
var skillArt = (hero) => (skill) => ({
	hero,
	skill
});
/** A share as a whole percentage (0.25: "25%"). */
var pct = (share) => `${Math.round(share * 100)}%`;
/** To a tenth of a percent (0.048: "4.8%"). */
var fine = (share) => `${Math.round(share * 1e3) / 10}%`;
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
		priest: "support",
		knight: "support"
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
	/** A damage dealer's DMG: so much more at once, and `step` more every `every` seconds, `most` times. */
	dmg: .1,
	step: .015,
	every: 10,
	most: 10,
	/** What each support wearing it gives every ally. */
	atk: .05,
	defense: .1
};
var HOPE = {
	/** What each support wearing it gives every ally. */
	atk: .05,
	defense: .1,
	/** A knight: what it takes, and the share of what the boss deals every other ally that it takes instead. */
	taken: .9,
	covers: .2
};
var AUTHORITY = {
	/** A damage dealer's penetration (points). */
	pen: 500,
	/** A support's mana at the start, and how long the ally with the highest ATK can't be knocked down. */
	mana: 2 * SECTION,
	guardFor: 15,
	/** A knight's CC resist (points). */
	resist: 300
};
var NAMES$1 = {
	perseverance: "Perseverance",
	hope: "Hope",
	authority: "Authority"
};
var ICONS = {
	perseverance: "⚔️",
	hope: "🛡️",
	authority: "⚡"
};
/** What a support of Perseverance's or Hope's gives every ally. */
var ALLIES = (set) => `every ally +${pct(set.atk)} ATK and +${pct(set.defense)} defense (again for every other hero wearing it so)`;
/** What each set does for a hero in each role it has: its card says it, and the bot (its pieces, and the heroes page). */
var ABOUT$1 = {
	perseverance: {
		dps: `+${pct(PERSEVERANCE.dmg)} DMG, and another +${fine(PERSEVERANCE.step)} every ${PERSEVERANCE.every} seconds (up to +${pct(PERSEVERANCE.dmg + PERSEVERANCE.step * PERSEVERANCE.most)} after ${PERSEVERANCE.every * PERSEVERANCE.most} seconds)`,
		support: ALLIES(PERSEVERANCE)
	},
	hope: {
		support: ALLIES(HOPE),
		knight: `takes ${pct(1 - HOPE.taken)} less, and takes ${pct(HOPE.covers)} of what the boss deals every other ally`
	},
	authority: {
		dps: `+${AUTHORITY.pen} penetration`,
		support: `+${AUTHORITY.mana / SECTION} mana sections at the start; the ally with the highest ATK can’t be knocked down for ${AUTHORITY.guardFor} seconds`,
		knight: `+${pct(AUTHORITY.resist / POINTS)} CC resist; its skills strip what helps the boss`
	}
};
/** Each set as the bot has it: its name and icon, and what it does for a hero of each class wearing three of its pieces (a class it does nothing for left out). */
var SET_INFO = TM_SETS.map((id) => ({
	id,
	name: NAMES$1[id],
	icon: ICONS[id],
	effects: Object.fromEntries(Object.entries(ROLES[id]).map(([heroClass, role]) => [heroClass, ABOUT$1[id][role]]))
}));
/** What Authority's support puts on the ally with the highest ATK. */
var GUARDED$1 = {
	name: "Authority",
	about: "Can’t be knocked down.",
	icon: "⚡"
};
//#endregion
//#region src/technomagic/sim/skills.ts
/** Each skill's numbers (shares: 0.25 is 25%; points: 1000 is 100%; seconds). */
var SKILL = {
	vigor: {
		dmg: .25,
		above: .75
	},
	persistence: {
		dmg: .03,
		every: 15,
		most: 12
	},
	"war-cry": { atk: .05 },
	whetstone: { critDamage: .1 },
	champion: {
		dmg: .025,
		lasts: 200
	},
	berserk: {
		defense: -.25,
		atk: .5
	},
	fortress: {
		atk: -.2,
		defense: .5
	},
	aegis: { shield: .25 },
	mirage: {
		dodge: 200,
		heal: .03,
		wait: 3
	},
	fundamentals: { dmg: .25 },
	vitality: { hp: .25 },
	overflow: {
		cooldown: .03,
		wait: 10
	},
	momentum: {
		atk: .02,
		most: 20
	},
	overdrive: {
		speed: 1e3,
		atk: .4
	},
	regeneration: {
		heal: .01,
		every: 1
	},
	steadfast: {
		taken: .03,
		most: 8
	},
	swiftness: { speed: 250 },
	"focus-1": {
		skill: 0,
		cooldown: .1,
		every: 10
	},
	"focus-2": {
		skill: 1,
		cooldown: .1,
		every: 10
	},
	"focus-3": {
		skill: 2,
		cooldown: .1,
		every: 10
	},
	"warm-up": { atk: .05 },
	might: { atk: .25 },
	"physical-ward": {
		type: "physical",
		taken: .2,
		most: .3,
		over: 10
	},
	"magical-ward": {
		type: "magical",
		taken: .2,
		most: .3,
		over: 10
	},
	bastion: { defense: .09 },
	ruthless: { critDamage: .5 },
	piercing: { pen: 250 },
	precision: { crit: 250 },
	guard: { block: 250 },
	parry: {
		mana: 200,
		wait: 1
	},
	"lone-foe": { atk: .35 },
	"lone-guard": { defense: .35 },
	armor: { defense: .25 },
	"mana-spring": {
		mana: 500,
		every: 5
	},
	surge: {
		dmg: .15,
		lasts: 10,
		wait: 15
	},
	desperation: {
		atk: .5,
		below: .3,
		lasts: 10,
		wait: 10
	},
	mending: {
		heal: .25,
		lasts: 5,
		wait: 10
	},
	"iron-wall": {
		block: 150,
		more: 200,
		lasts: 10
	},
	tenacity: { control: .15 }
};
/** Every additional skill, in the tier list's order. */
var SKILLS = [
	{
		id: "vigor",
		name: "Vigor",
		tier: "S",
		about: "Increases DMG dealt by 25% while HP is above 75%."
	},
	{
		id: "persistence",
		name: "Persistence",
		tier: "S",
		about: "Increases DMG dealt by 3% every 15 seconds (up to 12 times)."
	},
	{
		id: "war-cry",
		name: "War Cry",
		tier: "S",
		about: "Increases ATK of all allies by 5%."
	},
	{
		id: "whetstone",
		name: "Whetstone",
		tier: "S",
		about: "Increases crit DMG of all allies by 10%."
	},
	{
		id: "champion",
		name: "Champion",
		tier: "S",
		about: "At the start of the battle, increases DMG of the ally with the highest ATK by 2.5% for 200 seconds."
	},
	{
		id: "berserk",
		name: "Berserk",
		tier: "S",
		about: "Reduces DEF by 25% and increases ATK by 50%."
	},
	{
		id: "fortress",
		name: "Fortress",
		tier: "S",
		about: "Reduces ATK by 20% and increases DEF by 50%."
	},
	{
		id: "aegis",
		name: "Aegis",
		tier: "S",
		about: "Increases the shields it gives by 25%."
	},
	{
		id: "mirage",
		name: "Mirage",
		tier: "S",
		about: "Increases dodge by 20%. On dodging, recovers 3% of max HP (once every 3 seconds)."
	},
	{
		id: "fundamentals",
		name: "Fundamentals",
		tier: "S",
		about: "Increases DMG of normal attacks by 25%."
	},
	{
		id: "vitality",
		name: "Vitality",
		tier: "S",
		about: "Increases max HP by 25%."
	},
	{
		id: "overflow",
		name: "Overflow",
		tier: "A",
		about: "With mana at 100%, reduces every ally’s cooldowns by 3% (once every 10 seconds)."
	},
	{
		id: "momentum",
		name: "Momentum",
		tier: "A",
		about: "Each skill used increases ATK by 2% (up to 20 times)."
	},
	{
		id: "overdrive",
		name: "Overdrive",
		tier: "A",
		about: "Fixes attack speed at 100% and increases ATK by 40%."
	},
	{
		id: "regeneration",
		name: "Regeneration",
		tier: "A",
		about: "Recovers 1% of max HP every second."
	},
	{
		id: "steadfast",
		name: "Steadfast",
		tier: "A",
		about: "Each skill used reduces DMG taken by 3% (up to 8 times)."
	},
	{
		id: "swiftness",
		name: "Swiftness",
		tier: "A",
		about: "Increases attack speed by 25%."
	},
	{
		id: "focus-2",
		name: "Second Focus",
		tier: "A",
		about: "Reduces the second skill’s cooldown by 10% every 10 seconds."
	},
	{
		id: "focus-3",
		name: "Third Focus",
		tier: "A",
		about: "Reduces the third skill’s cooldown by 10% every 10 seconds."
	},
	{
		id: "warm-up",
		name: "Warm-Up",
		tier: "B",
		about: "At the start of the battle, increases ATK by 5%."
	},
	{
		id: "might",
		name: "Might",
		tier: "B",
		about: "Increases ATK by 25%."
	},
	{
		id: "focus-1",
		name: "First Focus",
		tier: "B",
		about: "Reduces the first skill’s cooldown by 10% every 10 seconds."
	},
	{
		id: "physical-ward",
		name: "Physical Ward",
		tier: "B",
		about: "Reduces physical DMG taken by 20%, rising to 30% over the first 10 seconds."
	},
	{
		id: "magical-ward",
		name: "Magical Ward",
		tier: "B",
		about: "Reduces magical DMG taken by 20%, rising to 30% over the first 10 seconds."
	},
	{
		id: "bastion",
		name: "Bastion",
		tier: "B",
		about: "Increases DEF of all allies by 9%."
	},
	{
		id: "ruthless",
		name: "Ruthless",
		tier: "B",
		about: "Increases crit DMG by 50%."
	},
	{
		id: "piercing",
		name: "Piercing",
		tier: "B",
		about: "Increases penetration by 25%."
	},
	{
		id: "precision",
		name: "Precision",
		tier: "B",
		about: "Increases crit chance by 25%."
	},
	{
		id: "guard",
		name: "Guard",
		tier: "B",
		about: "Increases block by 25%."
	},
	{
		id: "parry",
		name: "Parry",
		tier: "B",
		about: "On blocking, recovers 200 mana (once every second)."
	},
	{
		id: "lone-foe",
		name: "Lone Foe",
		tier: "C",
		about: "With one enemy, increases ATK by 35%."
	},
	{
		id: "lone-guard",
		name: "Lone Guard",
		tier: "C",
		about: "With one enemy, increases DEF by 35%."
	},
	{
		id: "armor",
		name: "Armor",
		tier: "C",
		about: "Increases DEF by 25%."
	},
	{
		id: "mana-spring",
		name: "Mana Spring",
		tier: "C",
		about: "Recovers 500 mana every 5 seconds."
	},
	{
		id: "surge",
		name: "Surge",
		tier: "F",
		about: "With mana at 100%, increases DMG dealt by 15% for 10 seconds (once every 15 seconds)."
	},
	{
		id: "desperation",
		name: "Desperation",
		tier: "F",
		about: "With HP below 30%, increases ATK by 50% for 10 seconds (once every 10 seconds)."
	},
	{
		id: "mending",
		name: "Mending",
		tier: "F",
		about: "Using a skill increases the heals and shields it gives by 25% for 5 seconds (once every 10 seconds)."
	},
	{
		id: "iron-wall",
		name: "Iron Wall",
		tier: "F",
		about: "Increases block by 15%, and by 20% more for the first 10 seconds."
	},
	{
		id: "tenacity",
		name: "Tenacity",
		tier: "F",
		about: "Reduces how long it is knocked down by 15%."
	}
];
SKILLS.map((skill) => skill.id);
var BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));
/** How many of each skill a hero has, from those of the pieces it wears (ones this fight doesn't know of are none). */
function skillsOf(list) {
	const counts = {};
	for (const id of (list ?? []).slice(0, 5)) if (typeof id === "string" && BY_ID.has(id)) counts[id] = (counts[id] ?? 0) + 1;
	return counts;
}
/** What some skills leave on a hero for a while (Champion, Surge, Desperation, Mending). */
var CHAMPION_UP = {
	name: "Champion",
	about: "DMG dealt higher.",
	icon: "👑"
};
var SURGE_UP = {
	name: "Surge",
	about: "DMG dealt higher.",
	icon: "⚡"
};
var DESPERATION_UP = {
	name: "Desperation",
	about: "ATK higher.",
	icon: "🔥"
};
var MENDING_UP = {
	name: "Mending",
	about: "Heals and shields stronger.",
	icon: "💚"
};
//#endregion
//#region src/technomagic/sim/unique.ts
/** Each weapon's numbers at tiers 1 to 5 (index 0 is tier 1). */
var EXIAN = {
	name: "The Guardian, Exian",
	every: 3,
	lasts: 15,
	boost: [
		.12,
		.14,
		.17,
		.21,
		.25
	]
};
var ELICIPIRA = {
	name: "Judgment Edge, Elicipira",
	chance: .04,
	boss: 2,
	blow: [
		6e3,
		7200,
		8600,
		1e4,
		12500
	]
};
var ROSMERTA = {
	name: "Angel’s Despair, Rosmerta",
	lasts: 7,
	heal: [
		2e3,
		2400,
		2900,
		3500,
		4200
	],
	pen: [
		240,
		290,
		350,
		420,
		500
	]
};
/** Its attack speed (points), its heal and mana on sleeping (shares of her max HP and max mana, the mana over `over` seconds), and the ATK each Mana Charge adds. */
var PIGRITIA = {
	name: "Gateway to Purgatory, Pigritia",
	speed: [
		240,
		290,
		350,
		420,
		500
	],
	heal: [
		.24,
		.29,
		.35,
		.42,
		.5
	],
	mana: [
		.24,
		.29,
		.35,
		.42,
		.5
	],
	over: 2,
	charge: [
		.048,
		.058,
		.07,
		.084,
		.1
	]
};
/** How often it gives her a Charge and a share of her max mana (seconds), and what every ally deals more and takes less while she is Overcharged (`top` times that for the ally with the highest ATK). */
var RASCAL = {
	name: "Crystallized Technomagic, Rascal",
	every: [
		1.4,
		1.3,
		1.1,
		.9,
		.7
	],
	mana: .01,
	dmg: .02,
	taken: .02,
	top: 2
};
/** The chance a blow of her attack has, how long what it leaves on the boss lasts (seconds), and how much less hard it hits and more magical damage it takes (`full` times that more with her Flame stacked full on it). */
var CARPRAIN = {
	name: "Flame of Victory, Carprain",
	chance: .2,
	lasts: 10,
	weaker: [
		.12,
		.14,
		.17,
		.21,
		.25
	],
	full: 2
};
/** A critical skill blow's blow more (at ATK), what it takes off the boss's heals for `lasts` seconds, and what each of its stacks (up to `most`, for `healed` seconds) adds to hers. */
var ELSION = {
	name: "Executioner of Domains, Elsion",
	blow: [
		600,
		720,
		860,
		1030,
		1250
	],
	unhealed: [
		.29,
		.35,
		.42,
		.5,
		.6
	],
	lasts: 5,
	heals: [
		.05,
		.06,
		.07,
		.09,
		.1
	],
	most: 5,
	healed: 20
};
/** How much more healing reaches every ally, how often (seconds) the ally with the lowest health is healed, and by how much (as a heal at ATK). */
var ELTOIRRE = {
	name: "Flowing Circle, Eltoirre",
	heals: [
		.1,
		.12,
		.14,
		.17,
		.2
	],
	every: 5,
	mend: [
		1200,
		1400,
		1700,
		2100,
		2500
	]
};
/** How many seconds longer his Fury lasts, and what it adds to his crit damage (a share more) and CC resist (points) while it does. */
var BARBATOS = {
	name: "Jailer of Despair, Barbatos",
	longer: [
		3,
		4,
		5,
		6,
		7
	],
	critDamage: [
		.9,
		1,
		1.1,
		1.2,
		1.3
	],
	resist: [
		240,
		290,
		350,
		420,
		500
	]
};
/** How often (seconds) it strikes a poisoned boss, how hard (at ATK), and how much more magical damage the boss takes after, for `lasts` seconds. */
var ROBURU = {
	name: "World Tree’s Will, Roburu",
	every: 7,
	blow: [
		1200,
		1400,
		1700,
		2100,
		2500
	],
	takes: [
		.12,
		.14,
		.17,
		.21,
		.25
	],
	lasts: 10
};
/** What every ally gains by the TechnoMagic gear it wears (the same at every tier): 1 piece, more ATK; 2, more defense; 3, more max HP (here: taking that much less); 4, more DMG. */
var CORBEAU = {
	name: "Wonder of Magos Le’Flamme, Corbeau Rose",
	atk: .06,
	defense: .06,
	hp: .06,
	dmg: .04
};
/** A tier's number from a weapon's list (1 to TIERS; out of range: the nearest). */
var atTier = (list, tier) => list[Math.min(list.length, Math.max(1, Math.floor(tier))) - 1];
/** What each hero's weapon does at a tier, as its card and the heroes page say it. */
var ABOUT = {
	clause: (tier) => `Every ${EXIAN.every}rd skill he uses, his ATK and defense are ${pct(atTier(EXIAN.boost, tier))} higher for ${EXIAN.lasts} seconds.`,
	kirze: (tier) => `Each of her blows has a ${pct(ELICIPIRA.chance)} chance to deal ${pct(atTier(ELICIPIRA.blow, tier) / 1e3)} of her ATK more, doubled against the boss.`,
	"fallen-frey": (tier) => `Each skill she uses heals her by ${pct(atTier(ROSMERTA.heal, tier) / 1e3)} of her ATK, and gives her +${atTier(ROSMERTA.pen, tier)} penetration for ${ROSMERTA.lasts} seconds.`,
	gremory: (tier) => `+${atTier(PIGRITIA.speed, tier)} attack speed. Each time she sleeps she is healed by ${pct(atTier(PIGRITIA.heal, tier))} of her max HP and recovers ${pct(atTier(PIGRITIA.mana, tier))} of her mana over ${PIGRITIA.over} seconds, and each Mana Charge gives her ${fine(atTier(PIGRITIA.charge, tier))} more ATK.`,
	annette: (tier) => `Every ${atTier(RASCAL.every, tier)} seconds she gains a Charge (even while Overcharged) and ${pct(RASCAL.mana)} of her mana. While she is Overcharged, every ally deals ${pct(RASCAL.dmg)} more and takes ${pct(RASCAL.taken)} less (${pct(RASCAL.dmg * RASCAL.top)} for the ally with the highest ATK).`,
	morrah: (tier) => `Each blow of her attack has a ${pct(CARPRAIN.chance)} chance to leave the boss hitting ${pct(atTier(CARPRAIN.weaker, tier))} less hard and taking ${pct(atTier(CARPRAIN.weaker, tier))} more magical damage for ${CARPRAIN.lasts} seconds (${pct(atTier(CARPRAIN.weaker, tier) * CARPRAIN.full)} more with 100 Flame on it).`,
	laias: (tier) => `Healing reaches every ally ${pct(atTier(ELTOIRRE.heals, tier))} more, and every ${ELTOIRRE.every} seconds she heals the ally with the lowest HP by ${pct(atTier(ELTOIRRE.mend, tier) / 1e3)} of her ATK.`,
	seria: (tier) => `Each critical blow of her skills deals ${pct(atTier(ELSION.blow, tier) / 1e3)} of her ATK more, leaves the boss healed ${pct(atTier(ELSION.unhealed, tier))} less for ${ELSION.lasts} seconds, and heals her ${pct(atTier(ELSION.heals, tier))} more for ${ELSION.healed} seconds (up to ${ELSION.most} times).`,
	ezekiel: (tier) => `His Fury lasts ${atTier(BARBATOS.longer, tier)} seconds longer, and while it does his crit damage is ${pct(atTier(BARBATOS.critDamage, tier))} higher and his CC resist +${atTier(BARBATOS.resist, tier)}.`,
	lorraine: (tier) => `Every ${ROBURU.every} seconds, with her Poison on the boss, deals ${pct(atTier(ROBURU.blow, tier) / 1e3)} of her ATK to it, and it takes ${pct(atTier(ROBURU.takes, tier))} more magical damage for ${ROBURU.lasts} seconds.`,
	valance: () => `Every ally gains by the TechnoMagic gear it wears: with 1 piece, +${pct(CORBEAU.atk)} ATK; 2, +${pct(CORBEAU.defense)} defense; 3, +${pct(CORBEAU.hp)} max HP (it takes that much less); 4, +${pct(CORBEAU.dmg)} DMG.`
};
EXIAN.name, ELICIPIRA.name, ROSMERTA.name, PIGRITIA.name, RASCAL.name, CARPRAIN.name, ELTOIRRE.name, ELSION.name, BARBATOS.name, ROBURU.name, CORBEAU.name;
/** The heroes that have a unique weapon, by id. */
var UNIQUE_HEROES = Object.keys(ABOUT);
/** What a hero's unique weapon does at a tier (null: it has none). */
var uniqueAbout = (hero, tier) => ABOUT[hero]?.(tier) ?? null;
/** A hero's unique weapon as it fights: its tier (null: none, or not its own, or one this fight doesn't know). */
function uniqueOf(hero, tier) {
	if (typeof tier !== "number" || !Number.isFinite(tier) || !ABOUT[hero]) return null;
	return Math.min(5, Math.max(1, Math.floor(tier)));
}
/** What Exian gives Clause for a while, what Rosmerta gives Fallen Frey, what Rascal gives every ally while Annette is Overcharged, and what Eltoirre gives every ally while Laias is on the field. */
var EXIAN_UP = {
	name: "The Guardian, Exian",
	about: "ATK and defense higher.",
	icon: "🛡️",
	art: { uw: "clause" }
};
var ROSMERTA_UP = {
	name: "Angel’s Despair, Rosmerta",
	about: "Sees past more of the boss’s defense.",
	icon: "🖤",
	art: { uw: "fallen-frey" }
};
var RASCAL_UP = {
	name: "Crystallized Technomagic, Rascal",
	about: "Deals more to the boss and takes less from it while Annette is [Overcharged].",
	icon: "🤖",
	art: { uw: "annette" }
};
var ELTOIRRE_UP = {
	name: "Flowing Circle, Eltoirre",
	about: "Healing reaches it the more while Laias is on the field.",
	icon: "☥",
	art: { uw: "laias" }
};
var ELSION_UP = {
	name: "Executioner of Domains, Elsion",
	about: "Healing reaches her the more.",
	icon: "⚔️",
	art: { uw: "seria" }
};
var CORBEAU_UP = {
	name: "Wonder of Magos Le’Flamme, Corbeau Rose",
	about: "Gains by the TechnoMagic gear it wears while Valance is on the field.",
	icon: "🌹",
	art: { uw: "valance" }
};
//#endregion
//#region src/technomagic/sim/fight.ts
/** The additional skills that come round again every so many seconds: each first comes once that long has gone. */
var EVERY = [
	"regeneration",
	"mana-spring",
	"focus-1",
	"focus-2",
	"focus-3"
];
/** What knocks a hero down: shown on its card, with how long it has left. */
var KNOCKED = {
	name: "Knocked down",
	about: "Can do nothing until it is up.",
	icon: "💫",
	harmful: true
};
/** Steps in a second (a checksum is kept at the end of each). */
var SECOND = Math.round(1 / TICK);
function makeSim({ boss: def, heroes, seed, stage: firstStage, raid, solo = false, first = [], deathless: noDeaths = false }) {
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
	let deathless = noDeaths && !raid;
	let result = null;
	/** The boss's health given back since it was last shown, and how long since then. */
	let mended = 0;
	let mendShown = 0;
	const party = [];
	const fighters = heroes.map(({ def: hero, skin = 0, gear = {}, set: wearing = null, uw = null, skills: worn = null, sub = false }, index) => {
		const set = setOf(wearing, hero.class);
		const tier = uniqueOf(hero.id, uw);
		const skills = skillsOf(worn);
		const n = (id) => skills[id] ?? 0;
		const stats = geared(hero.stats, gear);
		if (set?.id === "authority" && set.role === "dps") stats.pen += AUTHORITY.pen;
		if (set?.id === "authority" && set.role === "knight") stats.resist += AUTHORITY.resist;
		stats.hp *= 1 + SKILL.vitality.hp * n("vitality");
		stats.atk *= Math.max(0, 1 + SKILL.berserk.atk * n("berserk") + SKILL.fortress.atk * n("fortress") + SKILL.overdrive.atk * n("overdrive") + SKILL["warm-up"].atk * n("warm-up") + SKILL.might.atk * n("might") + SKILL["lone-foe"].atk * n("lone-foe"));
		const sturdier = Math.max(0, 1 + SKILL.berserk.defense * n("berserk") + SKILL.fortress.defense * n("fortress") + SKILL["lone-guard"].defense * n("lone-guard") + SKILL.armor.defense * n("armor"));
		stats.physical *= sturdier;
		stats.magical *= sturdier;
		stats.crit += SKILL.precision.crit * n("precision");
		stats.pen += SKILL.piercing.pen * n("piercing");
		stats.speed = n("overdrive") > 0 ? SKILL.overdrive.speed : stats.speed + SKILL.swiftness.speed * n("swiftness");
		const block = SKILL.guard.block * n("guard") + SKILL["iron-wall"].block * n("iron-wall");
		const dodge = SKILL.mirage.dodge * n("mirage");
		stats.block = {
			physical: stats.block.physical + block,
			magical: stats.block.magical + block
		};
		stats.dodge = {
			physical: stats.dodge.physical + dodge,
			magical: stats.dodge.magical + dodge
		};
		const motion = motionOf(hero);
		const name = hero.skins[skin] ?? hero.skins[0] ?? hero.name;
		return {
			index,
			id: hero.id,
			name,
			def: hero,
			stats,
			critTimes: 2 + (gear.critDamage ?? 0) + SKILL.ruthless.critDamage * n("ruthless"),
			healTimes: 1 + (gear.heal ?? 0),
			set,
			unique: tier === null ? null : {
				tier,
				casts: 0
			},
			skills,
			stacks: {
				momentum: 0,
				steadfast: 0
			},
			waits: Object.fromEntries(EVERY.filter((id) => n(id) > 0).map((id) => [id, SKILL[id].every])),
			controlTimes: 1 + (gear.control ?? 0),
			accuracy: gear.accuracy ?? 0,
			lifesteal: gear.lifesteal ?? 0,
			critResist: {
				physical: (gear.critResist ?? 0) + (gear.critResistPhysical ?? 0),
				magical: (gear.critResist ?? 0) + (gear.critResistMagical ?? 0)
			},
			manaPerAttack: 60 * (1 + (gear.manaAttack ?? 0)),
			manaRegen: 100 * (1 + (gear.manaRegen ?? 0)),
			motion,
			attack: motion.attack,
			part: { lands: {} },
			hp: stats.hp,
			shield: 0,
			shieldLeft: 0,
			statuses: [],
			mana: Math.min(MAX_MANA, MAX_MANA / 2 + (set?.id === "authority" && set.role === "support" ? AUTHORITY.mana : 0)),
			sub,
			auto: sub,
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
	/** The hero whose attack's blow is landing right now (null: none: a skill's, or something else's). */
	let attacking = null;
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
	/** Heroes on the field, standing and in the fight, with a set's `role` (each support of Hope's or Perseverance's gives every ally more). */
	const wearing = (id, role) => field.filter((on) => on.hp > 0 && !away(on.statuses) && on.set?.id === id && on.set.role === role);
	/** How many of an additional skill the heroes on the field, standing and in the fight, have between them (one that gives every ally something). */
	const among = (id) => field.reduce((count, on) => count + (on.hp > 0 && !away(on.statuses) ? on.skills[id] ?? 0 : 0), 0);
	/** How many of an additional skill a hero has. */
	const has = (fighter, id) => fighter.skills[id] ?? 0;
	const bears = (fighter, name) => fighter.statuses.some((status) => status.name === name);
	/**
	* How many times its ATK a hero's blows, heals and shields go by, for now: every Hope and Perseverance support
	* on the field and every War Cry among them; and its own Momentum's stacks and Desperation.
	*/
	const atkTimes = (by) => (1 + HOPE.atk * wearing("hope", "support").length + PERSEVERANCE.atk * wearing("perseverance", "support").length + SKILL["war-cry"].atk * among("war-cry")) * (1 + SKILL.momentum.atk * by.stacks.momentum * has(by, "momentum")) * (bears(by, DESPERATION_UP.name) ? 1 + SKILL.desperation.atk * has(by, "desperation") : 1);
	/**
	* How many times as much DMG a hero's blows deal besides (not its heals): Perseverance's damage dealer, growing as
	* the fight goes on; and its own Vigor while its health is high, Persistence growing, and Fundamentals on its attack.
	*/
	const dmgTimes = (by) => {
		const set = by.set?.id === "perseverance" && by.set.role === "dps" ? PERSEVERANCE.dmg + PERSEVERANCE.step * Math.min(PERSEVERANCE.most, Math.floor(elapsed / PERSEVERANCE.every)) : 0;
		const vigor = by.hp > by.stats.hp * SKILL.vigor.above ? SKILL.vigor.dmg * has(by, "vigor") : 0;
		const persistence = SKILL.persistence.dmg * has(by, "persistence") * Math.min(SKILL.persistence.most, Math.floor(elapsed / SKILL.persistence.every));
		const fundamentals = attacking === by ? SKILL.fundamentals.dmg * has(by, "fundamentals") : 0;
		return (1 + set) * (1 + vigor + persistence + fundamentals);
	};
	/** How many times as much a heal or a shield gives for the hero whose it is (its attack, its gear and its Mending; one that is no hero's: as much as it says). */
	const byAttack = (by) => by ? by.stats.atk / ATK * atkTimes(by) * by.healTimes * (bears(by, MENDING_UP.name) ? 1 + SKILL.mending.heal * has(by, "mending") : 1) : 1;
	/** Deathless: a hero brought down is whole again. */
	function spare(fighter) {
		if (deathless && fighter.hp <= 0) fighter.hp = fighter.stats.hp;
	}
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
		const ability = sim.slot(fighter, index);
		if (!ability || fighter.doing || !sim.ready(fighter, index)) return false;
		begin(fighter, ability.move, true);
		if (fighter.set?.id === "authority" && fighter.set.role === "knight") {
			for (let i = foe.statuses.length - 1; i >= 0; i--) if ((foe.statuses[i].deals ?? 1) > 1) foe.statuses.splice(i, 1);
		}
		fighter.cooldowns[index] = ability.cooldown;
		fighter.mana -= ability.cost * SECTION;
		fighter.part.used?.(index, ability);
		uniqueCast(fighter);
		skillCast(fighter);
		return true;
	}
	/** A hero has used a skill: its additional skills that count them (Momentum, Steadfast) or come of it (Mending). */
	function skillCast(fighter) {
		if (has(fighter, "momentum") > 0) fighter.stacks.momentum = Math.min(SKILL.momentum.most, fighter.stacks.momentum + 1);
		if (has(fighter, "steadfast") > 0) fighter.stacks.steadfast = Math.min(SKILL.steadfast.most, fighter.stacks.steadfast + 1);
		if (due(fighter, "mending", SKILL.mending.wait)) put(fighter.statuses, {
			name: MENDING_UP.name,
			left: SKILL.mending.lasts,
			shown: MENDING_UP
		});
	}
	/** Whether a hero's additional skill that waits between times comes now (it has it, and its wait is over): then it waits again, `again` seconds. */
	function due(fighter, id, again) {
		if (has(fighter, id) === 0 || (fighter.waits[id] ?? 0) > 0) return false;
		fighter.waits[id] = again;
		return true;
	}
	/** A step's time passes for a hero's additional skills: their waits run down, and what comes round again, or comes of how it stands, comes (only on the field, standing and in the fight). */
	function skillTick(fighter, dt) {
		const { waits } = fighter;
		for (const id of Object.keys(waits)) waits[id] = waits[id] - dt;
		if (!field.includes(fighter) || fighter.hp <= 0 || away(fighter.statuses)) return;
		const n = (id) => has(fighter, id);
		const full = fighter.mana >= MAX_MANA;
		if (due(fighter, "regeneration", SKILL.regeneration.every)) sim.heal(fighter, SKILL.regeneration.heal * n("regeneration") * fighter.stats.hp);
		if (due(fighter, "mana-spring", SKILL["mana-spring"].every)) fighter.mana = Math.min(MAX_MANA, fighter.mana + SKILL["mana-spring"].mana * n("mana-spring"));
		for (const id of [
			"focus-1",
			"focus-2",
			"focus-3"
		]) {
			const { skill, cooldown, every } = SKILL[id];
			const ability = fighter.def.abilities[skill];
			if (ability && due(fighter, id, every)) fighter.cooldowns[skill] = Math.max(0, fighter.cooldowns[skill] - ability.cooldown * cooldown * n(id));
		}
		if (full && due(fighter, "overflow", SKILL.overflow.wait)) for (const ally of field) ally.cooldowns = ally.cooldowns.map((left, i) => Math.max(0, left - (ally.def.abilities[i]?.cooldown ?? 0) * SKILL.overflow.cooldown * n("overflow")));
		if (full && due(fighter, "surge", SKILL.surge.wait)) put(fighter.statuses, {
			name: SURGE_UP.name,
			left: SKILL.surge.lasts,
			deals: 1 + SKILL.surge.dmg * n("surge"),
			shown: SURGE_UP
		});
		if (fighter.hp < fighter.stats.hp * SKILL.desperation.below && due(fighter, "desperation", SKILL.desperation.wait)) put(fighter.statuses, {
			name: DESPERATION_UP.name,
			left: SKILL.desperation.lasts,
			shown: DESPERATION_UP
		});
	}
	/** A hero wielding its own unique weapon has used a skill (./unique.ts): Clause's every third, and Fallen Frey's every one. */
	function uniqueCast(fighter) {
		const unique = fighter.unique;
		if (!unique) return;
		unique.casts++;
		if (fighter.id === "clause" && unique.casts % EXIAN.every === 0) {
			const boost = 1 + atTier(EXIAN.boost, unique.tier);
			put(fighter.statuses, {
				name: EXIAN_UP.name,
				left: EXIAN.lasts,
				deals: boost,
				defends: boost,
				shown: EXIAN_UP
			});
		} else if (fighter.id === "fallen-frey") {
			sim.heal(fighter, atTier(ROSMERTA.heal, unique.tier), fighter);
			put(fighter.statuses, {
				name: ROSMERTA_UP.name,
				left: ROSMERTA.lasts,
				pen: atTier(ROSMERTA.pen, unique.tier),
				shown: ROSMERTA_UP
			});
		}
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
				attacking = move === fighter.attack ? fighter : null;
				const own = fighter.part.lands[move];
				if (own) own(index);
				else common[move]?.(fighter, index);
				attacking = null;
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
		get deathless() {
			return deathless;
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
			if (foe.hp <= 0 || result) return false;
			const { attack, crit } = by.def.passive ?? NO_PASSIVE;
			const { atk, deals: type, crit: points, pen } = by.stats;
			const critical = roll() < share(points) + crit + critting(by.statuses);
			const critTimes = by.critTimes + SKILL.whetstone.critDamage * among("whetstone") + critDamaging(by.statuses);
			const { taken, blocked, dodged } = strike(amount * (atk / ATK) * atkTimes(by) * dmgTimes(by) * attack * dealing(by.statuses) * (critical ? critTimes : 1), type, foe.def.stats, pen + pierce + piercing(by.statuses), roll);
			if (dodged) {
				events.push({
					kind: "number",
					on: "boss",
					amount: 0,
					type: "dodged"
				});
				return false;
			}
			events.push({ kind: "boss-hit" });
			const dealt = deathless ? taken * taking(foe.statuses, type) : Math.min(foe.hp, taken * taking(foe.statuses, type));
			foe.hp -= dealt;
			if (deathless && foe.hp <= 0) foe.hp = foe.maxHp;
			by.dealt += dealt;
			events.push({
				kind: "number",
				on: "boss",
				amount: dealt,
				type: blocked ? "blocked" : critical ? "crit" : "hit"
			});
			if (by.lifesteal > 0 && by.hp > 0) {
				const stolen = Math.min(dealt * share(by.lifesteal) * healing(by.statuses) * (foe.part.healing?.() ?? 1), by.stats.hp - by.hp);
				if (stolen > 0) by.hp += stolen;
			}
			if (attacking === by) by.mana = Math.min(MAX_MANA, by.mana + by.manaPerAttack);
			if (counted) {
				for (const fighter of fighters) fighter.part.struck?.();
				foe.part.struck?.(by, dealt);
			}
			if (counted && foe.hp > 0 && by.id === "kirze" && by.unique && roll() < ELICIPIRA.chance) {
				const was = attacking;
				attacking = null;
				sim.hit(by, atTier(ELICIPIRA.blow, by.unique.tier) * ELICIPIRA.boss, false);
				attacking = was;
			}
			if (foe.hp > 0) return critical;
			sim.stun(1, { down: true });
			foe.part.beaten?.();
			end("won");
			return critical;
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
			const given = amount * byAttack(by) * (by ? 1 + SKILL.aegis.shield * has(by, "aegis") : 1) * (foe.part.shielding?.() ?? 1);
			fighter.shield += given;
			fighter.shieldLeft = Math.max(fighter.shieldLeft, seconds);
			if (by) by.healed += given;
		},
		target: aimed,
		hurt(target, amount, blockable = true) {
			if (target.hp <= 0 || away(target.statuses) || result) return 0;
			const type = foe.def.stats.deals;
			const guarded = 1 + HOPE.defense * wearing("hope", "support").length + PERSEVERANCE.defense * wearing("perseverance", "support").length + SKILL.bastion.defense * among("bastion");
			const walled = elapsed < SKILL["iron-wall"].lasts ? SKILL["iron-wall"].more * has(target, "iron-wall") : 0;
			const stands = {
				...target.stats,
				physical: target.stats.physical * guarded * defending(target.statuses, "physical"),
				magical: target.stats.magical * guarded * defending(target.statuses, "magical"),
				block: {
					physical: target.stats.block.physical + walled + blocking(target.statuses, "physical"),
					magical: target.stats.block.magical + walled + blocking(target.statuses, "magical")
				}
			};
			const critical = roll() < share(foe.def.stats.crit - target.critResist[type] - critResisting(target.statuses, type));
			const { taken, blocked, dodged } = strike(amount * dealing(foe.statuses) * rage(clock - 210) * (critical ? 2 : 1), type, blockable ? stands : {
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
				if (due(target, "mirage", SKILL.mirage.wait)) sim.heal(target, SKILL.mirage.heal * has(target, "mirage") * target.stats.hp);
				return 0;
			}
			events.push({
				kind: "hurt",
				who: target.index,
				blocked
			});
			let dealt = taken * taking(party, type) * taking(target.statuses, type) * (target.def.passive?.taken ?? 1) * (target.set?.id === "hope" && target.set.role === "knight" ? HOPE.taken : 1);
			dealt *= 1 - Math.min(.9, SKILL.steadfast.taken * target.stacks.steadfast * has(target, "steadfast"));
			const ward = type === "physical" ? SKILL["physical-ward"] : SKILL["magical-ward"];
			const warded = has(target, type === "physical" ? "physical-ward" : "magical-ward");
			if (warded > 0) dealt *= 1 - Math.min(.9, warded * (ward.taken + (ward.most - ward.taken) * Math.min(1, elapsed / ward.over)));
			const cover = target.def.class === "knight" ? void 0 : wearing("hope", "knight").find((knight) => knight !== target);
			if (cover) {
				const covered = dealt * HOPE.covers;
				dealt -= covered;
				const soak = Math.min(cover.shield, covered);
				cover.shield -= soak;
				if (covered > soak) {
					const lost = Math.min(cover.hp, covered - soak);
					cover.hp -= lost;
					spare(cover);
					cover.mana = Math.min(MAX_MANA, cover.mana + MANA_PER_HP_LOST * lost / cover.stats.hp);
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
			const lost = Math.min(target.hp, Math.max(0, dealt - soaked));
			if (dealt > soaked) {
				target.hp -= lost;
				spare(target);
				events.push({
					kind: "number",
					on: target.index,
					amount: dealt - soaked,
					type: blocked ? "blocked" : critical ? "crit" : "hit"
				});
			}
			if (target.hp <= 0) {
				target.shield = 0;
				target.doing = null;
				target.reserved = null;
			}
			target.mana = Math.min(MAX_MANA, target.mana + MANA_PER_HP_LOST * lost / target.stats.hp);
			if (blocked) {
				target.part.blocked?.();
				if (target.hp > 0 && due(target, "parry", SKILL.parry.wait)) target.mana = Math.min(MAX_MANA, target.mana + SKILL.parry.mana * has(target, "parry"));
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
			const shorter = Math.max(0, 1 - SKILL.tenacity.control * has(fighter, "tenacity"));
			put(fighter.statuses, {
				name: KNOCKED.name,
				left: seconds * (1 - share(fighter.stats.resist + resisting(fighter.statuses))) * shorter,
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
			const lasts = seconds * (by ? (by.def.passive?.control ?? 1) * by.controlTimes * (1 - share(foe.def.stats.resist - by.accuracy)) : 1);
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
			return sim.reservable(fighter, index) && fighter.mana >= sim.slot(fighter, index).cost * 1e3;
		},
		reservable(fighter, index) {
			return sim.slot(fighter, index) !== null && field.includes(fighter) && fighter.hp > 0 && !bound(fighter.statuses) && fighter.cooldowns[index] <= 0;
		},
		slot(fighter, index) {
			if (index < 0 || index >= fighter.def.abilities.length) return null;
			return fighter.part.slot ? fighter.part.slot(index) : fighter.def.abilities[index] ?? null;
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
			for (const status of foe.statuses) {
				const stacked = status.count !== void 0 && Number.isFinite(status.left) ? ` ×${status.count}` : "";
				marks.push({
					text: `${status.name}${stacked} ${Number.isFinite(status.left) ? Math.ceil(status.left) : `×${status.count ?? 1}`}`,
					tone: status.shown
				});
			}
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
				mix(fighter.stacks.momentum + fighter.stacks.steadfast);
				mix(fighter.doing ? fighter.doing.t : -1);
				mix(fighter.reserved ?? -1);
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
				fighter.mana = Math.min(MAX_MANA, fighter.mana + fighter.manaRegen * dt * filling(fighter.statuses) * filling(party));
				fighter.cooldowns = fighter.cooldowns.map((left) => Math.max(0, left - dt));
				wear(fighter.statuses, dt);
				fighter.shieldLeft = Math.max(0, fighter.shieldLeft - dt);
				if (fighter.shieldLeft <= 0) fighter.shield = 0;
				skillTick(fighter, dt);
				fighter.part.tick?.(dt);
				if (result) return;
			}
			foe.slowed = Math.max(0, foe.slowed - dt);
			foe.stunned = Math.max(0, foe.stunned - dt);
			wear(foe.statuses, dt);
			wear(party, dt);
			if (!deathless) clock += dt;
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
				if (on.reserved !== null && !sim.reservable(on, on.reserved) && !bound(on.statuses)) on.reserved = null;
				if (!on.doing && on.hp > 0 && !bound(on.statuses)) {
					if (on.reserved !== null && use(on, on.reserved)) on.reserved = null;
					else if (on.rested >= .45 && foe.hp > 0) begin(on, on.attack, false);
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
			if (!deathless && (field.length > 0 && field.every((on) => on.hp <= 0) || clock >= 230)) end("lost");
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
				else if (sim.reservable(fighter, input.skill)) fighter.reserved = input.skill;
				return;
			case "auto":
				if (fighter && !fighter.sub) fighter.auto = !fighter.auto;
				return;
			case "all-auto": {
				const main = fighters.filter((one) => !one.sub);
				const on = !main.every((one) => one.auto);
				for (const one of main) one.auto = on;
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
			case "deathless":
				deathless = !deathless;
				if (deathless) {
					for (const fighter of fighters) if (fighter.hp <= 0) sim.revive(fighter, 1);
					if (foe.hp <= 0) foe.hp = foe.maxHp;
				}
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
			name: GUARDED$1.name,
			left: AUTHORITY.guardFor,
			guards: true,
			shown: GUARDED$1
		});
	}
	const champions = fighters.reduce((count, fighter) => count + has(fighter, "champion"), 0);
	if (champions > 0) {
		const strongest = fighters.reduce((best, fighter) => !best || fighter.stats.atk > best.stats.atk ? fighter : best, null);
		if (strongest) put(strongest.statuses, {
			name: CHAMPION_UP.name,
			left: SKILL.champion.lasts,
			deals: 1 + SKILL.champion.dmg * champions,
			shown: CHAMPION_UP
		});
	}
	for (const fighter of fighters) fighter.part = fighter.def.join(sim, fighter);
	for (const fighter of raid ? fighters : first.map((index) => fighters[index])) if (fighter && !field.includes(fighter)) stand(fighter);
	if (field.length === 0 && fighters[0]) stand(fighters[0]);
	return sim;
}
//#endregion
//#region src/technomagic/sim/heroes/annette.ts
var ZAP = { blow: BLOW * 1.4 };
var RAY = {
	blow: 4e3,
	extra: 3e3,
	weaker: .15,
	takes: .25,
	lasts: 10
};
var TREATMENT = {
	heal: 4e4,
	lasts: 10,
	resist: 250,
	crit: .25,
	dmg: .1
};
var ELIMINATION = {
	blow: 7e3,
	over: 1e4,
	takes: .25,
	lasts: 10,
	stun: 5
};
var CHARGE$1 = {
	every: .5,
	perCrystal: 10,
	full: 100,
	lasts: 15,
	atk: .3,
	cooldown: .1
};
var art$10 = skillArt("annette");
var CHARGING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Charge",
		about: "Passive. A [Charge] every half second, and 10 for each crystal of mana she spends; at 100 she is [Overcharged] for 15 seconds (ATK higher, and each attack takes 10% off her skills’ cooldowns).",
		icon: "⚡",
		art: art$10(3)
	}
};
/** Her Charge: shown beside her passive, with how many she has. */
var CHARGED$1 = {
	name: "Charge",
	about: "At 100 she is [Overcharged].",
	icon: "⚡"
};
/** Overcharged: shown on her card, with how long it has left. */
var OVERCHARGED = {
	name: "Overcharge",
	about: "30% higher ATK; each attack takes 10% off her skills’ cooldowns; her skills do more.",
	icon: "🔋",
	art: art$10(3)
};
/** What Emergency Treatment gives each ally: shown on its card, with how long it has left. */
var TREATED = {
	name: "Emergency Treatment",
	about: "Healed over time, and knocked down for less long.",
	icon: "🩹",
	art: art$10(1)
};
var TREATED_OVER = {
	name: "Emergency Treatment",
	about: "Healed over time; more likely to land a critical blow, deals 10% more, and can’t be knocked down.",
	icon: "🩹",
	art: art$10(1)
};
/** What Blasting Ray and Process of Elimination leave on the boss. */
var RAYED = "Blasting Ray";
var ELIMINATED = "Process of Elimination";
var ANNETTE = {
	id: "annette",
	name: "Annette",
	class: "mechanic",
	skins: ["Annette", "Annette_Halloween"],
	stats: {
		...CLASS_STATS.mechanic,
		deals: "magical"
	},
	abilities: [
		{
			name: "Blasting Ray",
			about: "Rascal fires a ray into the boss: for 10 seconds it hits 15% softer and takes 25% more magical damage. [Overcharged]: a second ray, and twice that.",
			icon: "🔆",
			art: art$10(0),
			move: "ray",
			cooldown: 11,
			cost: 2
		},
		{
			name: "Emergency Treatment",
			about: "Clears what the boss has left on every ally (not what holds one down or shuts one away) and heals them over 10 seconds, and they stand being knocked down better meanwhile. [Overcharged]: they are also 25% likelier to land a critical blow, deal 10% more, and can’t be knocked down.",
			icon: "🩹",
			art: art$10(1),
			move: "treatment",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Process of Elimination",
			about: "A ball of energy that bursts on the boss. [Overcharged]: it bursts harder, stuns the boss for 5 seconds, and leaves it taking 25% more magical damage for 10.",
			icon: "💣",
			art: art$10(2),
			move: "elimination",
			cooldown: 25,
			cost: 3
		}
	],
	passive: CHARGING,
	attack: "zap",
	join(fight, self) {
		/** Her Charge; how long she is Overcharged for yet; and toward her next Charge, and her unique weapon's. */
		let charge = 0;
		let over = 0;
		let charging = 0;
		let rascal = 0;
		/** Each skill was used while she was Overcharged (as it began: it does more as it lands). */
		const overcharged = {
			ray: false,
			treatment: false,
			elimination: false
		};
		/** How long her Emergency Treatment heals for yet, and toward its next heal (once a second). */
		let treating = 0;
		let treated = 0;
		const tier = self.unique?.tier ?? null;
		/** She is on the field, standing and in the fight. */
		const there = () => fight.field.includes(self) && self.hp > 0 && !away(self.statuses);
		/** Her allies on the field, standing and in the fight (her too). */
		const allies = () => fight.field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
		/** Charge gained: at a hundred, Overcharged (once she isn't already). */
		const gain = (count) => {
			charge = Math.min(CHARGE$1.full, charge + count);
			if (charge < CHARGE$1.full || over > 0) return;
			charge = 0;
			over = CHARGE$1.lasts;
			put(self.statuses, {
				name: OVERCHARGED.name,
				left: over,
				deals: 1 + CHARGE$1.atk,
				shown: OVERCHARGED
			});
		};
		return {
			lands: {
				zap() {
					fight.hit(self, ZAP.blow);
					if (over <= 0) return;
					self.def.abilities.forEach((ability, i) => {
						self.cooldowns[i] = Math.max(0, self.cooldowns[i] - ability.cooldown * CHARGE$1.cooldown);
					});
				},
				ray() {
					const more = overcharged.ray;
					fight.hit(self, RAY.blow);
					if (more) fight.hit(self, RAY.extra);
					const times = more ? 2 : 1;
					put(fight.foe.statuses, {
						name: RAYED,
						left: RAY.lasts,
						deals: 1 - RAY.weaker * times,
						takes: { magical: 1 + RAY.takes * times },
						shown: "curse"
					});
				},
				treatment() {
					const more = overcharged.treatment;
					const on = allies();
					fight.cue(self, "treatment", on);
					const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
					for (let i = fight.party.length - 1; i >= 0; i--) if (harmful(fight.party[i])) fight.party.splice(i, 1);
					for (const ally of on) {
						ally.statuses = ally.statuses.filter((status) => !harmful(status));
						put(ally.statuses, more ? {
							name: TREATED.name,
							left: TREATMENT.lasts,
							resist: TREATMENT.resist,
							crit: TREATMENT.crit,
							deals: 1 + TREATMENT.dmg,
							guards: true,
							shown: TREATED_OVER
						} : {
							name: TREATED.name,
							left: TREATMENT.lasts,
							resist: TREATMENT.resist,
							shown: TREATED
						});
					}
					treating = TREATMENT.lasts;
					treated = 0;
				},
				elimination() {
					const more = overcharged.elimination;
					fight.hit(self, more ? ELIMINATION.over : ELIMINATION.blow);
					if (!more) return;
					put(fight.foe.statuses, {
						name: ELIMINATED,
						left: ELIMINATION.lasts,
						takes: { magical: 1 + ELIMINATION.takes },
						shown: "curse"
					});
					fight.stun(ELIMINATION.stun, { by: self });
				}
			},
			used(_index, ability) {
				if (ability.move === "ray" || ability.move === "treatment" || ability.move === "elimination") overcharged[ability.move] = over > 0;
				gain(ability.cost * CHARGE$1.perCrystal);
			},
			tick(dt) {
				if (treating > 0) {
					treating -= dt;
					treated += dt;
					if (treated >= 1) {
						treated -= 1;
						for (const ally of allies()) fight.heal(ally, TREATMENT.heal / TREATMENT.lasts, self);
					}
				}
				if (over > 0) over = Math.max(0, over - dt);
				if (!there()) return;
				if (over <= 0) {
					charging += dt;
					if (charging >= CHARGE$1.every) {
						charging -= CHARGE$1.every;
						gain(1);
					}
				} else charging = 0;
				if (tier !== null) {
					rascal += dt;
					const every = atTier(RASCAL.every, tier);
					if (rascal >= every) {
						rascal -= every;
						self.mana = Math.min(MAX_MANA, self.mana + MAX_MANA * RASCAL.mana);
						gain(1);
					}
					if (over > 0) {
						const on = allies();
						const top = on.reduce((best, ally) => !best || ally.stats.atk > best.stats.atk ? ally : best, null);
						for (const ally of on) {
							const k = ally === top ? RASCAL.top : 1;
							put(ally.statuses, {
								name: RASCAL_UP.name,
								left: over,
								deals: 1 + RASCAL.dmg * k,
								takes: 1 - RASCAL.taken * k,
								shown: RASCAL_UP
							});
						}
					}
				}
			},
			lit: () => over > 0,
			buffs: () => over > 0 ? [] : [{
				...CHARGED$1,
				count: Math.floor(charge)
			}]
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/clause.ts
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
var art$9 = skillArt("clause");
var VOW_OF_KNIGHTS = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Vow of Knights",
		about: "Passive. When he blocks he strikes back: the boss hits 20% less hard for 8 seconds, and he gains 300 mana.",
		icon: "🛡️",
		art: art$9(3)
	}
};
/** What Guardian Shield gives every hero for a while: shown on each card, with how long it has left. */
var GUARDED = {
	name: "Guardian Shield",
	about: "Takes 25% less from the boss.",
	icon: "✨",
	art: art$9(2)
};
var CLAUSE = {
	id: "clause",
	name: "Clause",
	class: "knight",
	skins: ["Clause"],
	stats: {
		...CLASS_STATS.knight,
		deals: "physical"
	},
	abilities: [
		{
			name: "Cut Ground",
			about: "A leap and a blow down on the boss that stuns it for 5 seconds.",
			icon: "⚔️",
			art: art$9(0),
			move: "slam",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Shield Strike",
			about: "A blow with his shield: for 20 seconds the boss attacks a third slower and takes 30% more.",
			icon: "🛡️",
			art: art$9(1),
			move: "bash",
			cooldown: 8,
			cost: 1
		},
		{
			name: "Guardian Shield",
			about: "For 20 seconds every hero takes 25% less from the boss.",
			icon: "✨",
			art: art$9(2),
			move: "guard",
			cooldown: 12,
			cost: 2
		}
	],
	passive: VOW_OF_KNIGHTS,
	attack: "swing",
	timing: {
		attack: [{
			lands: [.68],
			until: .8
		}],
		skills: { guard: {
			lands: [1.75],
			until: 2.6
		} }
	},
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
						name: GUARDED.name,
						left: GUARDIAN.lasts,
						takes: GUARDIAN.taken,
						shown: GUARDED
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
//#region src/technomagic/sim/heroes/ezekiel.ts
var CLAW = {
	blow: BLOW * 1.2,
	fury: 2
};
var INSTINCT = {
	swipe: 2e3,
	strike: 2500,
	down: 3,
	fury: 1.5,
	cost: .15
};
var DESPAIR = {
	blow: 3500,
	speed: 300,
	slowed: 5,
	stun: 3,
	lasts: 10,
	cost: .1
};
var DOOM = {
	blow: 4500,
	stun: 3,
	fury: 3,
	cost: .2
};
var CURSED = {
	most: 3,
	blow: 5e3,
	down: 3,
	lasts: 10,
	atk: .3
};
var art$8 = skillArt("ezekiel");
var CURSED_BLOOD = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Cursed Blood",
		about: "Passive. A stack of [Cursed Blood] for each skill he uses; at the 3rd, his skills are ready again, a burst knocks the boss down, and he is in [Fury] for 10 seconds: ATK higher, his attack twice as hard, every skill reinforced (each costs a share of his health), fighting by himself.",
		icon: "🩸",
		art: art$8(3)
	}
};
/** His stacks of Cursed Blood: shown beside his passive, with how many he has. */
var STACKED = {
	name: "Cursed Blood",
	about: "At 3, he is in [Fury].",
	icon: "🩸"
};
/** Fury: shown on his card, with how long it has left. */
var FURY = {
	name: "Fury",
	about: "ATK 30% higher, his attack twice as hard, every skill reinforced (each costs a share of his health); he fights by himself.",
	icon: "😈",
	art: art$8(3)
};
/** What Dawning Despair in Fury gives him for a while. */
var QUICKENED = {
	name: "Dawning Despair",
	about: "His attacks quickened.",
	icon: "💨",
	art: art$8(1)
};
var EZEKIEL = {
	id: "ezekiel",
	name: "Ezekiel",
	class: "assassin",
	line: "front",
	skins: ["Ezekiel"],
	stats: {
		...CLASS_STATS.assassin,
		deals: "magical"
	},
	abilities: [
		{
			name: "Destructive Instinct",
			about: "A swipe of his demon arm, then a blow to the ground that knocks the boss down for 3 seconds. In [Fury]: both 50% harder, for 15% of the health he has.",
			icon: "🌀",
			art: art$8(0),
			move: "instinct",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Dawning Despair",
			about: "A dash and a blow: the boss’s attacks 30% slower for 5 seconds. In [Fury]: it is also stunned for 3 seconds, and his attacks are 30% quicker for 10, for 10% of the health he has.",
			icon: "💨",
			art: art$8(1),
			move: "despair",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Strike of Doom",
			about: "A charged blow that stuns the boss for 3 seconds. In [Fury]: three times as hard, for 20% of the health he has.",
			icon: "💥",
			art: art$8(2),
			move: "doom",
			cooldown: 7,
			cost: 2
		}
	],
	passive: CURSED_BLOOD,
	attack: "claw",
	timing: { attack: [{
		lands: [
			.92,
			1.52,
			2.78,
			3.62
		],
		until: 4.3
	}] },
	join(fight, self) {
		/** His Cursed Blood; how long his Fury lasts yet; and whether he was on Auto before it (he is put back so after). */
		let stacks = 0;
		let fury = 0;
		let wasAuto = false;
		/** Each skill was used in Fury (as it began: it lands reinforced). */
		const furious = {
			instinct: false,
			despair: false,
			doom: false
		};
		const tier = self.unique?.tier ?? null;
		/** He spends a share of the health he has (never all of it). */
		const bleed = (cost) => {
			self.hp -= self.hp * cost;
		};
		/** His Cursed Blood is spent: his skills ready again, a burst that knocks the boss down, and Fury. */
		const rage = () => {
			stacks = 0;
			self.cooldowns = self.cooldowns.map(() => 0);
			fight.cue(self, "fury");
			fight.hit(self, CURSED.blow);
			fight.stun(CURSED.down, {
				down: true,
				by: self
			});
			fury = CURSED.lasts + (tier === null ? 0 : atTier(BARBATOS.longer, tier));
			wasAuto = self.auto;
			put(self.statuses, {
				name: FURY.name,
				left: fury,
				deals: 1 + CURSED.atk,
				...tier === null ? {} : {
					critDamage: atTier(BARBATOS.critDamage, tier),
					resist: atTier(BARBATOS.resist, tier)
				},
				shown: FURY
			});
		};
		/** A blow of his attack (twice as hard in Fury). */
		const claw = () => {
			fight.hit(self, CLAW.blow * (fury > 0 ? CLAW.fury : 1));
		};
		return {
			lands: {
				claw,
				attack: claw,
				instinct(part) {
					const times = furious.instinct ? INSTINCT.fury : 1;
					if (part === 0) {
						fight.hit(self, INSTINCT.swipe * times);
						return;
					}
					fight.hit(self, INSTINCT.strike * times);
					fight.stun(INSTINCT.down, {
						down: true,
						by: self
					});
				},
				despair() {
					fight.hit(self, DESPAIR.blow);
					fight.slow(1 - share(DESPAIR.speed), DESPAIR.slowed);
					if (!furious.despair) return;
					fight.stun(DESPAIR.stun, { by: self });
					put(self.statuses, {
						name: QUICKENED.name,
						left: DESPAIR.lasts,
						pace: 1 + share(DESPAIR.speed),
						shown: QUICKENED
					});
				},
				doom() {
					fight.hit(self, DOOM.blow * (furious.doom ? DOOM.fury : 1));
					fight.stun(DOOM.stun, { by: self });
				}
			},
			used(_index, ability) {
				const move = ability.move;
				if (move !== "instinct" && move !== "despair" && move !== "doom") return;
				furious[move] = fury > 0;
				if (fury > 0) {
					bleed(move === "instinct" ? INSTINCT.cost : move === "despair" ? DESPAIR.cost : DOOM.cost);
					return;
				}
				stacks++;
				if (stacks >= CURSED.most) rage();
			},
			tick(dt) {
				if (fury <= 0) return;
				fury = Math.max(0, fury - dt);
				const there = fight.field.includes(self) && self.hp > 0;
				if (fury > 0 && there) self.auto = true;
				else {
					fury = 0;
					self.auto = wasAuto;
					self.statuses = self.statuses.filter((status) => status.name !== FURY.name);
				}
			},
			lit: () => fury > 0,
			buffs: () => fury > 0 || stacks === 0 ? [] : [{
				...STACKED,
				count: stacks
			}]
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/fallen-frey.ts
var SMITE = { blow: BLOW * 1.5 };
var LIGHT = {
	heal: 25e3,
	near: 3.6,
	blast: 5e3
};
var BLESSING$1 = {
	shield: 3e4,
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
	mana: .4 * SECTION,
	every: 1,
	most: 2
};
var art$7 = skillArt("fallen-frey");
var TAINTED_ANGEL = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: TAINTED.taken,
	shown: {
		name: "Tainted Angel",
		about: "Passive. She takes 15% more from the boss, but her mana fills far faster; at full mana she gains [Darkened Power] every second (2 at most).",
		icon: "🌑",
		art: art$7(3)
	}
};
/** What her full mana gives her: shown beside her passive, with how many she has. */
var DARKENED = {
	name: "Darkened Power",
	about: "Her next skill spends one: [Heaven’s Vengeance] then stuns the boss with every blow.",
	icon: "🖤"
};
/** What Blessing of Doom gives each ally it shields: shown on its card, with how long it has left. */
var BLESSED$1 = {
	name: "Blessing of Doom",
	about: "A shield takes the boss’s blows first, and its attacks are quickened.",
	icon: "🔮",
	art: art$7(1)
};
/** What Heaven's Vengeance leaves on the boss. */
var EXPOSED = "Heaven’s Vengeance";
var FALLEN_FREY = {
	id: "fallen-frey",
	name: "Fallen Frey",
	class: "priest",
	skins: ["Fallen Frey"],
	stats: {
		...CLASS_STATS.priest,
		deals: "magical"
	},
	abilities: [
		{
			name: "Light of Doom",
			about: "Heals the ally with the lowest health and those near it, then the light bursts on the boss.",
			icon: "✴️",
			art: art$7(0),
			move: "light",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Blessing of Doom",
			about: "A shield on the 4 allies with the lowest health for 10 seconds, their attacks 50% quicker meanwhile.",
			icon: "🔮",
			art: art$7(1),
			move: "blessing",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Heaven’s Vengeance",
			about: "20 blows of light on the boss, through some of its defense, each leaving it 10% easier to hurt for 20 seconds (up to 5 times over). With [Darkened Power], every blow stuns it for half a second.",
			icon: "☄️",
			art: art$7(2),
			move: "vengeance",
			cooldown: 22,
			cost: 5
		}
	],
	passive: TAINTED_ANGEL,
	attack: "smite",
	timing: { skills: {
		light: {
			lands: [.95, 1.45],
			until: 2.35
		},
		vengeance: {
			lands: Array.from({ length: 20 }, (_, i) => (.7 + i * .12) * SKILL_SPEED),
			until: 3.85 * SKILL_SPEED
		}
	} },
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
					const allies = weakest().slice(0, BLESSING$1.allies);
					fight.cue(self, "blessing", allies);
					for (const ally of allies) {
						fight.shield(ally, BLESSING$1.shield, BLESSING$1.lasts, self);
						put(ally.statuses, {
							name: BLESSED$1.name,
							left: BLESSING$1.lasts,
							pace: 1 + share(BLESSING$1.speed),
							shown: BLESSED$1
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
				if (self.mana >= 6e3 && stacks < TAINTED.most) {
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
//#region src/technomagic/sim/heroes/gremory.ts
var NUDGE = { blow: BLOW * 1.3 };
var POCHI = {
	bite: 1800,
	boss: 1200,
	more: .15,
	bossMore: .3,
	weaker: .06,
	most: 5,
	lasts: 15
};
var PUCHI = {
	blow: 7e3,
	stun: 5
};
var PIPPI = {
	blow: 1500,
	through: 1e3,
	pierce: 500,
	takes: .05,
	most: 10,
	lasts: 12
};
var SLEEP = { taken: .6 };
var CHARGE = {
	most: 5,
	atk: .1,
	dmg: .02
};
var art$6 = skillArt("gremory");
/** What all three of her slots turn into once her skills are sealed (its picture is the game's for it, where a passive's would be). */
var SLEEP_SKILL = {
	name: "Eh, whatever. I’m gonna sleep.",
	about: "She sleeps for 3 seconds, taking 40% less and not to be knocked down; then her skills are unsealed, and she gains a [Mana Charge] (5 at most): +10% ATK and +2% to all she deals for each.",
	icon: "💤",
	art: art$6(3),
	move: "sleep",
	cooldown: 0,
	cost: 0
};
var LAZY = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Eh, whatever. I’m gonna sleep.",
		about: "Each of her skills is sealed once used; once all three are, each turns into this. She sleeps a while (taking 40% less and not to be knocked down), then wakes with her skills unsealed and a [Mana Charge].",
		icon: "💤",
		art: art$6(3)
	}
};
/** Asleep: shown on her card, with how long it has left. */
var SLEEPING = {
	name: "Asleep",
	about: "Takes 40% less from the boss, and can’t be knocked down.",
	icon: "💤",
	art: art$6(3)
};
/** Her Mana Charge: shown on her card, with how many she has. */
var CHARGED = {
	name: "Mana Charge",
	about: "Each: +10% ATK and +2% to all she deals; [Pochi, bite them!] hits harder for each.",
	icon: "🔋"
};
/** What her skills leave on the boss. */
var POCHI_MARK = "Pochi’s Mark";
var PIPPI_MARK = "Pippi’s Mark";
/** One more of a mark on the boss (up to `most`), begun again: how many it now has. */
function mark(on, name, most, lasts, made) {
	const count = Math.min(most, (on.find((status) => status.name === name)?.count ?? 0) + 1);
	put(on, {
		name,
		left: lasts,
		count,
		shown: "curse",
		...made(count)
	});
	return count;
}
var GREMORY = {
	id: "gremory",
	name: "Gremory",
	class: "assassin",
	skins: ["Gremory", "Gremory_DailyLook"],
	stats: {
		...CLASS_STATS.assassin,
		deals: "magical"
	},
	abilities: [
		{
			name: "Pochi, bite them!",
			about: "Five bites, each harder for her [Mana Charge], each leaving [Pochi’s Mark]: the boss hits 6% softer for each, for 15 seconds (up to 5). Sealed once used.",
			icon: "🐶",
			art: art$6(0),
			move: "pochi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Puchi, knock them away!",
			about: "A blow from behind that stuns the boss for 5 seconds. Sealed once used.",
			icon: "💥",
			art: art$6(1),
			move: "puchi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Pippi, wrap them!",
			about: "Ten blows, each leaving [Pippi’s Mark]: the boss takes 5% more magical damage for each, for 12 seconds (up to 10). With all 10 on it, each blow deals more, through its defense. Sealed once used.",
			icon: "🎀",
			art: art$6(2),
			move: "pippi",
			cooldown: 0,
			cost: 4
		}
	],
	passive: LAZY,
	attack: "nudge",
	join(fight, self) {
		/** Which of her skills are sealed; her Mana Charge; and how long her unique weapon is filling her mana for yet. */
		const sealed = self.def.abilities.map(() => false);
		let charges = 0;
		let filling = 0;
		const tier = self.unique?.tier ?? null;
		return {
			lands: {
				nudge() {
					fight.hit(self, NUDGE.blow);
				},
				pochi() {
					fight.hit(self, POCHI.bite * (1 + POCHI.more * charges) + POCHI.boss * (1 + POCHI.bossMore * charges));
					mark(fight.foe.statuses, POCHI_MARK, POCHI.most, POCHI.lasts, (count) => ({ deals: 1 - POCHI.weaker * count }));
				},
				puchi() {
					fight.hit(self, PUCHI.blow);
					fight.stun(PUCHI.stun, { by: self });
				},
				pippi() {
					const count = mark(fight.foe.statuses, PIPPI_MARK, PIPPI.most, PIPPI.lasts, (stacks) => ({ takes: { magical: 1 + PIPPI.takes * stacks } }));
					fight.hit(self, PIPPI.blow);
					if (count >= PIPPI.most) fight.hit(self, PIPPI.through, false, PIPPI.pierce);
				},
				sleep() {}
			},
			slot(index) {
				if (sealed.every(Boolean)) return SLEEP_SKILL;
				return sealed[index] ? null : self.def.abilities[index] ?? null;
			},
			used(index, ability) {
				if (ability !== SLEEP_SKILL) {
					sealed[index] = true;
					return;
				}
				sealed.fill(false);
				charges = Math.min(CHARGE.most, charges + 1);
				put(self.statuses, {
					name: SLEEPING.name,
					left: 3,
					takes: SLEEP.taken,
					guards: true,
					shown: SLEEPING
				});
				const atk = CHARGE.atk + (tier === null ? 0 : atTier(PIGRITIA.charge, tier));
				put(self.statuses, {
					name: CHARGED.name,
					left: Infinity,
					count: charges,
					deals: (1 + atk * charges) * (1 + CHARGE.dmg * charges),
					shown: CHARGED
				});
				if (tier !== null) {
					fight.heal(self, atTier(PIGRITIA.heal, tier) * self.stats.hp);
					filling = PIGRITIA.over;
				}
			},
			tick(dt) {
				if (filling <= 0 || tier === null) return;
				const now = Math.min(dt, filling);
				filling -= now;
				self.mana = Math.min(MAX_MANA, self.mana + MAX_MANA * atTier(PIGRITIA.mana, tier) * now / PIGRITIA.over);
			},
			pace: () => tier === null ? 1 : 1 + share(atTier(PIGRITIA.speed, tier)),
			lit: () => sealed.every(Boolean)
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/kirze.ts
var JUDGMENT = {
	cut: 1500,
	blow: 6e3,
	down: 3
};
var HAZE = {
	burst: 9e3,
	stun: 2,
	lasts: 15,
	quicker: 1.5,
	every: 2,
	wave: 2500,
	waveStun: 1
};
var FLOWER = {
	line: 8e3,
	burst: 12e3,
	slow: .5,
	slowed: 5,
	curse: 10,
	end: 6e3,
	each: 800
};
var art$5 = skillArt("kirze");
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
		art: art$5(3)
	}
};
/** What Crystal Haze gives her for a while: shown beside her passive, with how long it has left. */
var AWAKENING$1 = {
	name: "Arcane Crystal Awakening",
	about: "Quickened, and a shockwave goes out from her every 2 seconds.",
	icon: "💠",
	art: art$5(1)
};
var KIRZE = {
	id: "kirze",
	name: "Kirze",
	class: "warrior",
	skins: ["Kirze", "Kirze_Glory"],
	stats: {
		...CLASS_STATS.warrior,
		deals: "magical"
	},
	abilities: [
		{
			name: "Slash, Blade of Judgment!",
			about: "Seven cuts as she spins, then a blow that knocks the boss down for 3 seconds.",
			icon: "🌀",
			art: art$5(0),
			move: "judgment",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Disperse, Crystal Haze!",
			about: "A burst that stuns the boss for 2 seconds. Then for 15 seconds she is 50% quicker, and a shockwave goes out from her every 2 seconds that stuns it for 1.",
			icon: "💠",
			art: art$5(1),
			move: "haze",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Bloom, Crimson Flower!",
			about: "Crystals in a line to the boss, then they burst: its attacks are 50% slower for 5 seconds, and it is cursed for 10. When the curse ends it bursts, the harder for every blow landed on the boss meanwhile.",
			icon: "🌺",
			art: art$5(2),
			move: "flower",
			cooldown: 20,
			cost: 4
		}
	],
	passive: EVIL_DEEDS,
	timing: { attack: [{
		lands: [1.29],
		until: 1.6
	}, {
		lands: [
			.75,
			1.32,
			2.55
		],
		until: 3
	}] },
	join(fight, self) {
		/** How long she is quickened for yet (Crystal Haze), and until her next shockwave. */
		let awake = 0;
		let wave = 0;
		/** Her curse on the boss: how long it has left, and the blows counted against it. */
		let curse = null;
		return {
			lands: {
				judgment(part) {
					if (part < 7) return fight.hit(self, JUDGMENT.cut);
					fight.hit(self, JUDGMENT.blow);
					fight.stun(JUDGMENT.down, {
						down: true,
						by: self
					});
				},
				haze() {
					fight.hit(self, HAZE.burst);
					fight.stun(HAZE.stun, { by: self });
					awake = HAZE.lasts;
					wave = HAZE.every;
				},
				flower(part) {
					if (part === 0) return fight.hit(self, FLOWER.line);
					fight.hit(self, FLOWER.burst);
					curse = {
						left: FLOWER.curse,
						blows: 0
					};
					fight.slow(FLOWER.slow, FLOWER.slowed);
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
						wave += HAZE.every;
						fight.cue(self, "wave");
						fight.hit(self, HAZE.wave);
						fight.stun(HAZE.waveStun, { by: self });
					}
				}
				if (curse) {
					curse.left -= dt;
					if (curse.left <= 0) {
						const { blows } = curse;
						curse = null;
						fight.cue(self, "curse");
						fight.hit(self, FLOWER.end + FLOWER.each * blows, false);
					}
				}
			},
			pace: () => awake > 0 ? HAZE.quicker : 1,
			lit: () => awake > 0,
			buffs: () => awake > 0 ? [{
				...AWAKENING$1,
				left: awake
			}] : [],
			marks: () => curse ? [{
				text: `Curse ${Math.ceil(curse.left)} · ${curse.blows} blows`,
				tone: "curse"
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/laias.ts
var SPLASH = { blow: BLOW * 1.5 };
var DROPLETS = {
	heal: 15e3,
	lasts: 10,
	heals: .25,
	low: .5,
	lowTimes: 1.5
};
var BUBBLE = {
	shield: 45e3,
	lasts: 15,
	taken: .7,
	dmg: .15,
	atk: .2,
	heal: 1500
};
var FESTIVAL = {
	blow: 2500,
	down: 3,
	heal: .15,
	mana: 2 * SECTION,
	lasts: 12,
	every: 4,
	whirl: 1500,
	whirlDown: 2
};
var WATER_DRAGON = {
	resist: 500,
	defense: 1.1,
	critResist: 250,
	taken: .75,
	lasts: 5
};
var art$4 = skillArt("laias");
var BLESSING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Blessing of the Water Dragon",
		about: "Passive. +500 CC Resist for her; every ally has 10% more M.DEF and 250 M.Crit Resistance, and each skill she uses has every ally take 25% less magical damage for 5 seconds.",
		icon: "🐉",
		art: art$4(3)
	}
};
/** What her passive gives every ally while she is on the field, and each skill she uses for a while. */
var BLESSED = {
	name: "Blessing of the Water Dragon",
	about: "More M.DEF, and the boss’s magic is less likely to land a critical blow.",
	icon: "🐉",
	art: art$4(3)
};
var WARDED = {
	name: "Water Dragon’s Ward",
	about: "Takes 25% less magical damage.",
	icon: "💧",
	art: art$4(3)
};
/** What Healing Droplets gives each ally, shown on its card with how long it has left. */
var DROPLETS_UP = {
	name: "Healing Droplets",
	about: "Healing reaches it the more.",
	icon: "💧",
	art: art$4(0)
};
/** What Bubble Shield gives its ally: for its whole while, and more while the shield holds. */
var BUBBLED = {
	name: "Bubble Shield",
	about: "Takes 30% less from the boss and deals 15% more to it.",
	icon: "🫧",
	art: art$4(1)
};
var BUBBLE_HOLDS = {
	name: "Bubble",
	about: "While the shield holds: can’t be knocked down, hits harder, and is healed every second.",
	icon: "🫧",
	art: art$4(1)
};
var LAIAS = {
	id: "laias",
	name: "Laias",
	class: "priest",
	skins: ["Laias"],
	stats: {
		...CLASS_STATS.priest,
		deals: "magical",
		resist: CLASS_STATS.priest.resist + WATER_DRAGON.resist
	},
	abilities: [
		{
			name: "Healing Droplets",
			about: "Heals every ally, and for 10 seconds healing reaches them 25% more (half as much more again for one at half its health or less).",
			icon: "💧",
			art: art$4(0),
			move: "droplets",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Bubble Shield",
			about: "A shield on the ally with the lowest health: for 15 seconds it takes 30% less from the boss and deals 15% more. While the shield holds it can’t be knocked down, hits 20% harder and is healed every second.",
			icon: "🫧",
			art: art$4(1),
			move: "bubble",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Festival of the Flow",
			about: "Knocks the boss down for 3 seconds, heals every ally 15% of its max HP and gives every other ally 2 mana. Then for 12 seconds a whirlpool every 4 seconds strikes the boss and knocks it down for 2.",
			icon: "🌊",
			art: art$4(2),
			move: "festival",
			cooldown: 20,
			cost: 4
		}
	],
	passive: BLESSING,
	attack: "splash",
	join(fight, self) {
		/** Whom her Bubble Shield is on, and for how long yet; and toward its next heal (once a second). */
		let bubbled = null;
		let bubbleLeft = 0;
		let bubbleHeal = 0;
		/** How long her Festival of the Flow's whirlpools go on for yet, and toward the next. */
		let flowing = 0;
		let whirl = 0;
		/** Toward her unique weapon's next heal. */
		let mending = 0;
		const tier = self.unique?.tier ?? null;
		/** She is on the field, standing and in the fight. */
		const there = () => fight.field.includes(self) && self.hp > 0 && !away(self.statuses);
		/** Her allies on the field, standing and in the fight (her too). */
		const allies = () => fight.field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
		/** The ally with the lowest health, for what it is out of. */
		const weakest = () => allies().sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)[0];
		/** Takes a status of hers off every fighter (she has left the field, or what gave it is over). */
		const lift = (name, from = fight.fighters) => {
			for (const one of from) one.statuses = one.statuses.filter((status) => status.name !== name);
		};
		return {
			lands: {
				splash() {
					fight.hit(self, SPLASH.blow);
				},
				droplets() {
					const on = allies();
					fight.cue(self, "droplets", on);
					for (const ally of on) {
						const low = ally.hp <= ally.stats.hp * DROPLETS.low;
						fight.heal(ally, DROPLETS.heal * (low ? DROPLETS.lowTimes : 1), self);
						put(ally.statuses, {
							name: DROPLETS_UP.name,
							left: DROPLETS.lasts,
							heals: 1 + DROPLETS.heals * (low ? DROPLETS.lowTimes : 1),
							shown: DROPLETS_UP
						});
					}
				},
				bubble() {
					const ally = weakest();
					if (!ally) return;
					fight.cue(self, "bubble", [ally]);
					if (bubbled && bubbled !== ally) lift(BUBBLE_HOLDS.name, [bubbled]);
					fight.shield(ally, BUBBLE.shield, BUBBLE.lasts, self);
					put(ally.statuses, {
						name: BUBBLED.name,
						left: BUBBLE.lasts,
						takes: BUBBLE.taken,
						deals: 1 + BUBBLE.dmg,
						shown: BUBBLED
					});
					bubbled = ally;
					bubbleLeft = BUBBLE.lasts;
					bubbleHeal = 0;
				},
				festival() {
					const on = allies();
					fight.cue(self, "festival", on);
					fight.hit(self, FESTIVAL.blow);
					fight.stun(FESTIVAL.down, {
						down: true,
						by: self
					});
					for (const ally of on) {
						fight.heal(ally, ally.stats.hp * FESTIVAL.heal);
						if (ally !== self) ally.mana = Math.min(MAX_MANA, ally.mana + FESTIVAL.mana);
					}
					flowing = FESTIVAL.lasts;
					whirl = 0;
				}
			},
			used() {
				put(fight.party, {
					name: WARDED.name,
					left: WATER_DRAGON.lasts,
					takes: { magical: WATER_DRAGON.taken },
					shown: WARDED
				});
			},
			tick(dt) {
				if (bubbled) {
					bubbleLeft -= dt;
					if (bubbleLeft > 0 && bubbled.hp > 0 && bubbled.shield > 0) {
						put(bubbled.statuses, {
							name: BUBBLE_HOLDS.name,
							left: bubbleLeft,
							guards: true,
							deals: 1 + BUBBLE.atk,
							shown: BUBBLE_HOLDS
						});
						bubbleHeal += dt;
						if (bubbleHeal >= 1) {
							bubbleHeal -= 1;
							fight.heal(bubbled, BUBBLE.heal, self);
						}
					} else {
						lift(BUBBLE_HOLDS.name, [bubbled]);
						bubbled = null;
					}
				}
				if (!there()) {
					lift(BLESSED.name);
					lift(ELTOIRRE_UP.name);
					flowing = 0;
					return;
				}
				const on = allies();
				for (const ally of on) {
					put(ally.statuses, {
						name: BLESSED.name,
						left: Infinity,
						defends: { magical: WATER_DRAGON.defense },
						critResist: { magical: WATER_DRAGON.critResist },
						shown: BLESSED
					});
					if (tier !== null) put(ally.statuses, {
						name: ELTOIRRE_UP.name,
						left: Infinity,
						heals: 1 + atTier(ELTOIRRE.heals, tier),
						shown: ELTOIRRE_UP
					});
				}
				if (flowing > 0) {
					flowing -= dt;
					whirl += dt;
					if (whirl >= FESTIVAL.every) {
						whirl -= FESTIVAL.every;
						fight.cue(self, "whirlpool");
						fight.hit(self, FESTIVAL.whirl);
						fight.stun(FESTIVAL.whirlDown, {
							down: true,
							by: self
						});
					}
				}
				if (tier !== null) {
					mending += dt;
					if (mending >= ELTOIRRE.every) {
						mending -= ELTOIRRE.every;
						const ally = weakest();
						if (ally) {
							fight.cue(self, "eltoirre", [ally]);
							fight.heal(ally, atTier(ELTOIRRE.mend, tier), self);
						}
					}
				}
			},
			lit: () => flowing > 0
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/lorraine.ts
var LASH = { blow: BLOW * 1.3 };
var THORNS = { blow: 1500 };
var VINE = {
	blow: 3e3,
	poison: 2,
	shackle: 4,
	after: 2,
	each: 1500
};
var WRATH = {
	blow: 6e3,
	down: 3,
	more: .2
};
var LEAF = {
	chance: .3,
	times: 3,
	blow: 600
};
/** The most Poison on the boss, how long it lasts once the last was left, how hard each eats at it every second, and what each takes off the boss's heals. */
var POISON = {
	most: 5,
	lasts: 20,
	each: 100,
	every: 1,
	heals: .1
};
var art$3 = skillArt("lorraine");
var BLADE_LEAF = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Blade Leaf",
		about: "Passive. Her attack has a 30% chance to send three leaves at the boss besides, each leaving a [Poison] on it (up to 5).",
		icon: "🍃",
		art: art$3(3)
	}
};
/** What her skills leave on the boss. */
var POISONED = "Poison";
var LORRAINE = {
	id: "lorraine",
	name: "Lorraine",
	class: "wizard",
	skins: ["Lorraine", "Lorraine_Christmas"],
	stats: {
		...CLASS_STATS.wizard,
		deals: "magical"
	},
	abilities: [
		{
			name: "Thornbush Forest",
			about: "Three blows, each leaving a [Poison] on the boss (up to 5): each eats at it every second and leaves it healed 10% less.",
			icon: "🌿",
			art: art$3(0),
			move: "thornbush",
			cooldown: 7,
			cost: 2
		},
		{
			name: "Tangled Vine",
			about: "A blow that leaves 2 [Poison] and shackles the boss for 4 seconds (it can do nothing); 2 seconds after, a blow the harder for each [Poison] on it.",
			icon: "🪢",
			art: art$3(1),
			move: "vine",
			cooldown: 10,
			cost: 3
		},
		{
			name: "Wrath of the Forest",
			about: "A blow that knocks the boss down for 3 seconds, 20% harder for each [Poison] on it.",
			icon: "🌳",
			art: art$3(2),
			move: "wrath",
			cooldown: 23,
			cost: 3
		}
	],
	passive: BLADE_LEAF,
	attack: "lash",
	join(fight, self) {
		/** How long until Tangled Vine's blow after (0: none coming); toward her Poison's next bite; and toward her unique weapon's next blow. */
		let vine = 0;
		let bitten = 0;
		let roburu = 0;
		const tier = self.unique?.tier ?? null;
		/** How many Poison are on the boss. */
		const poisons = () => fight.foe.statuses.find((status) => status.name === POISONED)?.count ?? 0;
		/** So many more Poison on the boss (up to the most), all of it begun again: what heals it heals it less for each. */
		const poison = (count) => {
			const stacks = Math.min(POISON.most, poisons() + count);
			put(fight.foe.statuses, {
				name: POISONED,
				left: POISON.lasts,
				count: stacks,
				heals: Math.max(0, 1 - POISON.heals * stacks),
				shown: "venom"
			});
		};
		/** The Lorraines in the fight (there may be two: it is the same Poison), and whether any is standing. */
		const lorraines = () => fight.fighters.filter((one) => one.id === self.id);
		return {
			lands: {
				lash() {
					if (fight.roll() >= LEAF.chance) {
						fight.hit(self, LASH.blow);
						return;
					}
					fight.cue(self, "leaf");
					fight.hit(self, LASH.blow + LEAF.blow * LEAF.times);
					poison(LEAF.times);
				},
				thornbush() {
					fight.hit(self, THORNS.blow);
					poison(1);
				},
				vine() {
					fight.hit(self, VINE.blow);
					poison(VINE.poison);
					fight.stun(VINE.shackle, { by: self });
					vine = VINE.after;
				},
				wrath() {
					fight.hit(self, WRATH.blow * (1 + WRATH.more * poisons()));
					fight.stun(WRATH.down, {
						down: true,
						by: self
					});
				}
			},
			tick(dt) {
				if (vine > 0) {
					vine -= dt;
					if (vine <= 0) {
						fight.cue(self, "vine");
						fight.hit(self, VINE.each * poisons(), false);
					}
				}
				const count = poisons();
				if (count > 0 && lorraines().every((one) => one.hp <= 0)) {
					fight.foe.statuses.splice(fight.foe.statuses.findIndex((status) => status.name === POISONED), 1);
					return;
				}
				if (tier !== null && self.hp > 0) {
					roburu += dt;
					if (roburu >= ROBURU.every) {
						roburu -= ROBURU.every;
						if (count > 0) {
							fight.cue(self, "roburu");
							fight.hit(self, atTier(ROBURU.blow, tier), false);
							put(fight.foe.statuses, {
								name: ROBURU.name,
								left: ROBURU.lasts,
								takes: { magical: 1 + atTier(ROBURU.takes, tier) },
								shown: "curse"
							});
						}
					}
				}
				if (count <= 0 || lorraines()[0] !== self) {
					bitten = 0;
					return;
				}
				bitten += dt;
				if (bitten >= POISON.every) {
					bitten -= POISON.every;
					fight.hit(self, POISON.each * count, false);
				}
			},
			lit: () => poisons() >= POISON.most
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/morrah.ts
var CLEAVE = {
	blow: BLOW,
	burning: 150
};
var BURNING = {
	blow: 1500,
	flames: 3,
	down: 1,
	lasts: 15
};
var HELLFIRE = {
	lasts: 20,
	defense: 1.3,
	block: 250,
	every: 1
};
var ERUPTION = {
	blow: 3e3,
	down: 3
};
var SMASH = {
	blow: 1500,
	flames: 3
};
/** The most Flame on the boss, how long it lasts once the last was left, how hard each burns every second, how much harder it makes her skills, and what each takes off the boss's heals. */
var FLAME = {
	most: 100,
	lasts: 10,
	each: 4,
	every: 1,
	more: .02,
	heals: .01
};
var art$2 = skillArt("morrah");
var FIRE_SMASH = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Fire Smash",
		about: "Passive. When she blocks she strikes back, leaving 3 [Flame] on the boss.",
		icon: "🔥",
		art: art$2(3)
	}
};
/** What Burning Power gives her for a while: shown beside her passive, with how long it has left. */
var BURNING_UP = {
	name: "Burning Power",
	about: "Each blow of her attack deals more and leaves a [Flame] on the boss.",
	icon: "🔥",
	art: art$2(0)
};
/** What Hellfire gives every ally for a while: shown on each card, with how long it has left. */
var HELLFIRE_UP = {
	name: "Hellfire",
	about: "30% more M.DEF, and +250 M.Block.",
	icon: "🌋",
	art: art$2(1)
};
/** What her skills, and her unique weapon, leave on the boss. */
var FLAMED = "Flame";
var MORRAH = {
	id: "morrah",
	name: "Morrah",
	class: "knight",
	skins: ["Morrah"],
	stats: {
		...CLASS_STATS.knight,
		deals: "magical"
	},
	abilities: [
		{
			name: "Burning Power",
			about: "A blow that knocks the boss down for a second and leaves 3 [Flame] on it. Then for 15 seconds each blow of her attack deals more and leaves a [Flame]. Both are 2% harder for each [Flame] on the boss.",
			icon: "🔥",
			art: art$2(0),
			move: "burning",
			cooldown: 6,
			cost: 2
		},
		{
			name: "Hellfire",
			about: "For 20 seconds every ally has 30% more M.DEF and +250 M.Block, and a [Flame] is left on the boss every second.",
			icon: "🌋",
			art: art$2(1),
			move: "hellfire",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Lava Eruption",
			about: "A blow that knocks the boss down for 3 seconds, 2% harder for each [Flame] on it.",
			icon: "☄️",
			art: art$2(2),
			move: "eruption",
			cooldown: 20,
			cost: 3
		}
	],
	passive: FIRE_SMASH,
	attack: "cleave",
	timing: { attack: [{
		lands: [.68],
		until: .8
	}] },
	join(fight, self) {
		/** How long Burning Power has her attack burning for yet; how long her Hellfire lasts yet, and toward its next Flame; and toward her Flame's next burn. */
		let burning = 0;
		let hellfire = 0;
		let fanned = 0;
		let burnt = 0;
		const tier = self.unique?.tier ?? null;
		/** How many Flame are on the boss. */
		const flames = () => fight.foe.statuses.find((status) => status.name === FLAMED)?.count ?? 0;
		/** So many more Flame on the boss (up to the most), all of it begun again: what heals it heals it less for each. */
		const burn = (count) => {
			const stacks = Math.min(FLAME.most, flames() + count);
			put(fight.foe.statuses, {
				name: FLAMED,
				left: FLAME.lasts,
				count: stacks,
				heals: Math.max(0, 1 - FLAME.heals * stacks),
				shown: "burn"
			});
		};
		/** How much harder her skills are for the Flame on the boss. */
		const fanning = () => 1 + FLAME.more * flames();
		/** Her allies on the field, standing and in the fight (her too). */
		const allies = () => fight.field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
		/** A cut of her attack. With Burning Power, harder for its Flame, and leaving one more; with her unique weapon, now and then it hits less hard and takes more. */
		const cleave = () => {
			if (burning > 0) {
				fight.hit(self, CLEAVE.blow + CLEAVE.burning * fanning());
				burn(1);
			} else fight.hit(self, CLEAVE.blow);
			if (tier === null || fight.roll() >= CARPRAIN.chance) return;
			const weaker = atTier(CARPRAIN.weaker, tier);
			const takes = weaker * (flames() >= FLAME.most ? CARPRAIN.full : 1);
			put(fight.foe.statuses, {
				name: CARPRAIN.name,
				left: CARPRAIN.lasts,
				deals: 1 - weaker,
				takes: { magical: 1 + takes },
				shown: "curse"
			});
		};
		return {
			lands: {
				cleave,
				attack: cleave,
				burning() {
					fight.hit(self, BURNING.blow * fanning());
					fight.stun(BURNING.down, {
						down: true,
						by: self
					});
					burn(BURNING.flames);
					burning = BURNING.lasts;
				},
				hellfire() {
					const on = allies();
					fight.cue(self, "hellfire", on);
					for (const ally of on) put(ally.statuses, {
						name: HELLFIRE_UP.name,
						left: HELLFIRE.lasts,
						defends: { magical: HELLFIRE.defense },
						blocks: { magical: HELLFIRE.block },
						shown: HELLFIRE_UP
					});
					hellfire = HELLFIRE.lasts;
					fanned = 0;
				},
				eruption() {
					fight.hit(self, ERUPTION.blow * fanning());
					fight.stun(ERUPTION.down, {
						down: true,
						by: self
					});
				}
			},
			blocked() {
				fight.cue(self, "smash");
				fight.hit(self, SMASH.blow);
				burn(SMASH.flames);
			},
			tick(dt) {
				if (burning > 0) burning = Math.max(0, burning - dt);
				if (hellfire > 0) {
					hellfire -= dt;
					fanned += dt;
					if (fanned >= HELLFIRE.every) {
						fanned -= HELLFIRE.every;
						burn(1);
					}
				}
				const count = flames();
				if (count <= 0 || fight.fighters.find((one) => one.id === self.id) !== self) {
					burnt = 0;
					return;
				}
				burnt += dt;
				if (burnt >= FLAME.every) {
					burnt -= FLAME.every;
					fight.cue(self, "flame");
					fight.hit(self, FLAME.each * count, false);
				}
			},
			lit: () => burning > 0,
			buffs: () => burning > 0 ? [{
				...BURNING_UP,
				left: burning
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/seria.ts
var PETALS = {
	blow: 2500,
	window: 5
};
var BLOSSOM = { blow: 2500 };
var SCATTER = {
	rush: 2e3,
	cut: 1200,
	through: 800,
	pierce: 1e3,
	slow: .7,
	lasts: 3
};
var MOON = {
	blow: 6e3,
	boss: 3e3,
	ripe: 4e3,
	every: 6,
	light: 1,
	unhealed: 10
};
var WITCH = {
	atk: 38567,
	critDamage: .05,
	most: 30
};
var art$1 = skillArt("seria");
/** What Falling Petals' slot holds for a while after it is used (its picture is Falling Petals'). */
var BLOSSOM_SKILL = {
	name: "Mysterious Sword - Blossom",
	about: "A cut down on the boss: once, within 5 seconds of [Falling Petals].",
	icon: "🌸",
	art: art$1(0),
	move: "blossom",
	cooldown: 0,
	cost: 1
};
var COLD_BLOODED = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Cold-Blooded Witch",
		about: "Passive. Her ATK is higher, and each critical blow of her skills gives her 5% more crit damage (up to 30 times).",
		icon: "🩸",
		art: art$1(3)
	}
};
/** Her Cold-Blooded Witch's stacks: shown on her card, with how many she has. */
var WITCHED = {
	name: "Cold-Blooded Witch",
	about: "5% more crit damage for each.",
	icon: "🩸",
	art: art$1(3)
};
/** Moonlight: shown on her card for the second it lasts. */
var MOONLIGHT = {
	name: "Moonlight",
	about: "[Red Moon Blade] used now cuts again, and leaves the boss healed not at all for 10 seconds.",
	icon: "🌕",
	art: art$1(2)
};
/** What her skills leave on the boss. */
var SIN = "Original Sin of Blood";
var UNHEALED = "Red Moon";
var SERIA = {
	id: "seria",
	name: "Seria",
	class: "warrior",
	skins: ["Seria", "Seria_Christmas"],
	stats: {
		...CLASS_STATS.warrior,
		atk: CLASS_STATS.warrior.atk + WITCH.atk,
		deals: "magical"
	},
	abilities: [
		{
			name: "Mysterious Sword - Falling Petals",
			about: "A cut across the boss. For 5 seconds after, this slot holds [Mysterious Sword - Blossom], once.",
			icon: "🌸",
			art: art$1(0),
			move: "petals",
			cooldown: 7,
			cost: 1
		},
		{
			name: "Blood Scattering Blade",
			about: "A rush in with a cut that leaves [Original Sin of Blood] (the boss’s attacks 30% slower for 3 seconds); then two more cuts, each with a blow more through its defense.",
			icon: "🩸",
			art: art$1(1),
			move: "scatter",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Red Moon Blade",
			about: "A great cut, harder on a boss. Used in [Moonlight] (a second of it every 6 seconds): it cuts again, and the boss is healed not at all for 10 seconds.",
			icon: "🌙",
			art: art$1(2),
			move: "moon",
			cooldown: 20,
			cost: 4
		}
	],
	passive: COLD_BLOODED,
	timing: { attack: [{
		lands: [.86],
		until: 1.1
	}] },
	join(fight, self) {
		/** How long Blossom can be used for yet, and Falling Petals' own cooldown meanwhile. */
		let blossom = 0;
		let petals = 0;
		/** Toward the moon's ripening, and how long her Moonlight lasts yet; whether Red Moon Blade was used in it (as it began). */
		let waxing = 0;
		let moonlight = 0;
		let ripe = false;
		/** Her Cold-Blooded Witch's stacks, and her unique weapon's. */
		let witch = 0;
		let elsion = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of a skill of hers: a critical one makes her critical blows harder, and (with her unique weapon) deals more, and leaves the boss healed less and her healed more. */
		const cut = (amount, pierce = 0) => {
			if (!fight.hit(self, amount, true, pierce)) return;
			witch = Math.min(WITCH.most, witch + 1);
			put(self.statuses, {
				name: WITCHED.name,
				left: Infinity,
				count: witch,
				critDamage: WITCH.critDamage * witch,
				shown: WITCHED
			});
			if (tier === null) return;
			fight.hit(self, atTier(ELSION.blow, tier), false);
			put(fight.foe.statuses, {
				name: ELSION.name,
				left: ELSION.lasts,
				heals: 1 - atTier(ELSION.unhealed, tier),
				shown: "curse"
			});
			elsion = Math.min(ELSION.most, elsion + 1);
			put(self.statuses, {
				name: ELSION_UP.name,
				left: ELSION.healed,
				count: elsion,
				heals: 1 + atTier(ELSION.heals, tier) * elsion,
				shown: ELSION_UP
			});
		};
		return {
			lands: {
				petals() {
					cut(PETALS.blow);
				},
				blossom() {
					cut(BLOSSOM.blow);
				},
				scatter(part) {
					if (part === 0) {
						cut(SCATTER.rush);
						put(fight.foe.statuses, {
							name: SIN,
							left: SCATTER.lasts,
							shown: "curse"
						});
						fight.slow(SCATTER.slow, SCATTER.lasts);
						return;
					}
					cut(SCATTER.cut);
					cut(SCATTER.through, SCATTER.pierce);
				},
				moon() {
					cut(MOON.blow + MOON.boss);
					if (!ripe) return;
					cut(MOON.ripe);
					put(fight.foe.statuses, {
						name: UNHEALED,
						left: MOON.unhealed,
						heals: 0,
						shown: "curse"
					});
				}
			},
			slot: (index) => index === 0 && blossom > 0 ? BLOSSOM_SKILL : self.def.abilities[index] ?? null,
			used(index, ability) {
				if (index === 0 && ability === BLOSSOM_SKILL) {
					blossom = 0;
					self.cooldowns[0] = petals;
				} else if (index === 0) {
					blossom = PETALS.window;
					petals = ability.cooldown;
					self.cooldowns[0] = 0;
				} else if (ability.move === "moon") ripe = moonlight > 0;
			},
			tick(dt) {
				if (blossom > 0) {
					blossom -= dt;
					petals = Math.max(0, petals - dt);
					self.cooldowns[0] = blossom > 0 ? 0 : petals;
				}
				if (moonlight > 0) moonlight = Math.max(0, moonlight - dt);
				waxing += dt;
				if (waxing >= MOON.every) {
					waxing -= MOON.every;
					moonlight = MOON.light;
				}
			},
			lit: () => moonlight > 0,
			buffs: () => moonlight > 0 ? [{
				...MOONLIGHT,
				left: moonlight
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/valance.ts
var BOLT = { blow: BLOW * 1.4 };
var HOLOGRAM = {
	lasts: 15,
	atk: .2,
	crit: .2,
	heal: 2e3,
	cooldown: .2
};
var FIELD = {
	lasts: 5,
	defense: 1.15,
	heal: 4e3,
	mana: .3 * SECTION
};
var CANNON = {
	blow: 4e3,
	stun: 3,
	lasers: 9,
	laser: 700,
	laserStun: 1.5,
	lasts: 15,
	takes: .07,
	heals: .05,
	most: 7
};
var AWAKENING = {
	defense: 1.2,
	mana: 1.3,
	atk: .1,
	boss: .15
};
var art = skillArt("valance");
var AWAKENED = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Technomagic Awakening",
		about: "Passive. Her defense 20% higher and her mana filling 30% faster; every ally’s ATK 10% higher, and (in the Technomagic Kingdom) every ally deals 15% more to the boss.",
		icon: "⚙️",
		art: art(3)
	}
};
/** What her passive gives every ally while she is on the field, and her alone. */
var AWAKENING_UP = {
	name: "Technomagic Awakening",
	about: "ATK 10% higher, and 15% more to the boss.",
	icon: "⚙️",
	art: art(3)
};
var AWAKENING_SELF = {
	name: "Technomagic Awakening (Valance)",
	about: "Defense 20% higher, and mana filling 30% faster.",
	icon: "⚙️",
	art: art(3)
};
/** Hologram: on its ally's card, with how long it has left. */
var HOLOGRAPHED = {
	name: "Hologram",
	about: "ATK and crit chance higher, healed every second, skills ready sooner; nothing the boss does holds it.",
	icon: "💠",
	art: art(0)
};
/** The Violet Force Field: on every ally's card while it lasts. */
var FIELDED = {
	name: "Violet Force Field",
	about: "Defense 15% higher, can’t be knocked down, healed and given mana every second.",
	icon: "🟣",
	art: art(1)
};
/** What Ultimate Laser Cannon leaves on the boss. */
var MANIPULATED = "Manipulated";
/** Something the boss has left on a hero that can be cleared (not what holds it down, or shuts it away). */
var harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
//#endregion
//#region src/technomagic/sim/heroes/index.ts
/** The heroes there are, in the order of their cards. */
var HEROES = [
	KIRZE,
	CLAUSE,
	FALLEN_FREY,
	GREMORY,
	ANNETTE,
	MORRAH,
	LAIAS,
	SERIA,
	EZEKIEL,
	LORRAINE,
	{
		id: "valance",
		name: "Valance",
		class: "mechanic",
		skins: ["Valance"],
		stats: {
			...CLASS_STATS.mechanic,
			deals: "physical"
		},
		abilities: [
			{
				name: "Prototype – VA",
				about: "Clears what the boss has left on the ally with the highest ATK, and gives it a [Hologram] for 15 seconds: 20% more ATK and crit chance, healed every second, its skills ready 20% sooner, and nothing the boss does holds it.",
				icon: "💠",
				art: art(0),
				move: "prototype",
				cooldown: 15,
				cost: 3
			},
			{
				name: "Absolute Protection Field – LA",
				about: "A field for 5 seconds that reaches every ally: 15% more defense, can’t be knocked down, and healed and given mana every second.",
				icon: "🟣",
				art: art(1),
				move: "field",
				cooldown: 20,
				cost: 5
			},
			{
				name: "Ultimate Laser Cannon – NCE",
				about: "A laser that stuns the boss for 3 seconds, then 9 more, each stunning it for 1.5; each leaves it [Manipulated] for 15 seconds (up to 7 times over): taking 7% more and healed 5% less.",
				icon: "🔫",
				art: art(2),
				move: "cannon",
				cooldown: 20,
				cost: 4
			}
		],
		passive: AWAKENED,
		attack: "bolt",
		join(fight, self) {
			/** Whom her Hologram is on, and for how long yet; and toward its next heal (once a second). */
			let holo = null;
			let holoLeft = 0;
			let holoHeal = 0;
			/** How long her field lasts yet, and toward its next heal and mana (once a second). */
			let field = 0;
			let fieldTick = 0;
			/** She is on the field, standing and in the fight. */
			const there = () => fight.field.includes(self) && self.hp > 0 && !away(self.statuses);
			/** Her allies on the field, standing and in the fight (her too). */
			const allies = () => fight.field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
			/** Takes a status of hers off every fighter (she has left the field). */
			const lift = (name) => {
				for (const one of fight.fighters) one.statuses = one.statuses.filter((status) => status.name !== name);
			};
			/** One more stack of Manipulated on the boss (up to seven), begun again. */
			const manipulate = () => {
				const stacks = Math.min(CANNON.most, (fight.foe.statuses.find((status) => status.name === MANIPULATED)?.count ?? 0) + 1);
				put(fight.foe.statuses, {
					name: MANIPULATED,
					left: CANNON.lasts,
					count: stacks,
					takes: 1 + CANNON.takes * stacks,
					heals: Math.max(0, 1 - CANNON.heals * stacks),
					shown: "curse"
				});
			};
			/** How many pieces of TechnoMagic gear an ally wears: each comes with one additional skill (../skills.ts). */
			const tmPieces = (ally) => Object.values(ally.skills).reduce((sum, n) => sum + (n ?? 0), 0);
			return {
				lands: {
					bolt() {
						fight.hit(self, BOLT.blow);
					},
					prototype() {
						const top = allies().reduce((best, ally) => !best || ally.stats.atk > best.stats.atk ? ally : best, null);
						if (!top) return;
						fight.cue(self, "prototype", [top]);
						if (holo && holo !== top) holo.statuses = holo.statuses.filter((status) => status.name !== HOLOGRAPHED.name);
						top.statuses = top.statuses.filter((status) => !harmful(status));
						put(top.statuses, {
							name: HOLOGRAPHED.name,
							left: HOLOGRAM.lasts,
							deals: 1 + HOLOGRAM.atk,
							crit: HOLOGRAM.crit,
							guards: true,
							shown: HOLOGRAPHED
						});
						holo = top;
						holoLeft = HOLOGRAM.lasts;
						holoHeal = 0;
					},
					field() {
						const on = allies();
						fight.cue(self, "field", on);
						for (const ally of on) put(ally.statuses, {
							name: FIELDED.name,
							left: FIELD.lasts,
							defends: FIELD.defense,
							guards: true,
							shown: FIELDED
						});
						field = FIELD.lasts;
						fieldTick = 0;
					},
					cannon(part) {
						fight.hit(self, part === 0 ? CANNON.blow : CANNON.laser);
						fight.stun(part === 0 ? CANNON.stun : CANNON.laserStun, { by: self });
						manipulate();
					}
				},
				tick(dt) {
					if (holo) {
						holoLeft -= dt;
						if (holoLeft <= 0 || holo.hp <= 0) holo = null;
						else {
							const on = holo;
							on.statuses = on.statuses.filter((status) => !harmful(status));
							on.cooldowns = on.cooldowns.map((left) => Math.max(0, left - HOLOGRAM.cooldown * dt));
							holoHeal += dt;
							if (holoHeal >= 1) {
								holoHeal -= 1;
								fight.heal(on, HOLOGRAM.heal, self);
							}
						}
					}
					if (field > 0) {
						field -= dt;
						fieldTick += dt;
						if (fieldTick >= 1) {
							fieldTick -= 1;
							for (const ally of allies()) {
								if (!ally.statuses.some((status) => status.name === FIELDED.name)) continue;
								fight.heal(ally, FIELD.heal, self);
								ally.mana = Math.min(MAX_MANA, ally.mana + FIELD.mana);
							}
						}
					}
					if (!there()) {
						lift(AWAKENING_UP.name);
						lift(AWAKENING_SELF.name);
						lift(CORBEAU_UP.name);
						return;
					}
					put(self.statuses, {
						name: AWAKENING_SELF.name,
						left: Infinity,
						defends: AWAKENING.defense,
						mana: AWAKENING.mana,
						shown: AWAKENING_SELF
					});
					for (const ally of allies()) {
						put(ally.statuses, {
							name: AWAKENING_UP.name,
							left: Infinity,
							deals: (1 + AWAKENING.atk) * (1 + AWAKENING.boss),
							shown: AWAKENING_UP
						});
						if (!self.unique) continue;
						const pieces = Math.min(4, tmPieces(ally));
						if (pieces === 0) {
							ally.statuses = ally.statuses.filter((status) => status.name !== CORBEAU_UP.name);
							continue;
						}
						put(ally.statuses, {
							name: CORBEAU_UP.name,
							left: Infinity,
							count: pieces,
							deals: (1 + CORBEAU.atk) * (pieces >= 4 ? 1 + CORBEAU.dmg : 1),
							...pieces >= 2 ? { defends: 1 + CORBEAU.defense } : {},
							...pieces >= 3 ? { takes: 1 / (1 + CORBEAU.hp) } : {},
							shown: CORBEAU_UP
						});
					}
				},
				lit: () => field > 0
			};
		}
	}
];
//#endregion
//#region src/technomagic/sim/bot.ts
/** The sim's version: a hash of it (./version.ts), so any change to it is another (a page whose sim isn't the bot's is told to reload). */
var SIM_VERSION = "c8b50057e81a";
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
var STEP_SECONDS = TICK;
var MOST_TICKS = Math.ceil(230 / TICK) + 1;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
var MOST_INPUTS = 2e4;
var MOST_STAGE = 8;
/** The heroes that have a unique weapon, by id; and what one's does at a tier (1 to 5), as the bot says it: null for a hero with none. */
var UNIQUE_WEAPON_HEROES = UNIQUE_HEROES;
var uniqueWeaponText = (hero, tier) => uniqueAbout(hero, tier);
/** Every additional skill a piece of TechnoMagic gear may come with (one, rolled as it drops: each as likely); and the most a hero has. */
var TM_SKILLS = SKILLS.map(({ id, name, tier, about }) => ({
	id,
	name,
	tier,
	about
}));
var MOST_TM_SKILLS = 5;
/** The heroes there are, in the order of their cards; and the bosses, by id. */
var TM_HEROES = HEROES.map((hero) => ({
	id: hero.id,
	name: hero.name,
	class: hero.class,
	skins: hero.skins.length
}));
var BOSS_IDS = BOSSES.map((boss) => boss.id);
var TM_SET_INFO = SET_INFO;
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
		if (!def || !whole(hero.skin, def.skins.length)) return "hero";
		const gear = {};
		for (const [stat, n] of Object.entries(hero.gear)) if (Number.isFinite(n)) gear[stat] = n;
		const skills = Array.isArray(hero.skills) ? hero.skills.filter((id) => typeof id === "string") : [];
		entries.push({
			def,
			skin: hero.skin,
			gear,
			set: typeof hero.set === "string" ? hero.set : null,
			uw: typeof hero.uw === "number" ? hero.uw : null,
			skills,
			sub: run.solo === true && hero.sub === true
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
export { BOSS_IDS, MOST_INPUTS, MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_HEROES, TM_SET_INFO, TM_SKILLS, UNIQUE_WEAPON_HEROES, readInputs, replay, startRaid, uniqueWeaponText };
