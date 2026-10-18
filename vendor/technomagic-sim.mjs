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
var share$2 = (points) => Math.min(1, Math.max(0, points / POINTS));
/** As StatAttenuationData.Attenuate. */
function curved(c, x) {
	if (x === 0) return 0;
	const { minK = 0, x3 = 0, a3 = 0, b3 = 0, x4 = 0, a4 = 0, b4 = 0 } = c;
	const toward = (k, a, b) => k - k * 1e6 / (a * x * x + b * x + 1e6);
	if (x > c.x1) return toward(c.maxK, c.a1, c.b1);
	if (x > c.x2) return c.a2 * x / 1e3 + c.b2;
	if (x < x3) return toward(minK, a3, b3);
	if (x < x4) return minK * 1e6 / (a4 * x * x + b4 * x + 1e6);
	return x;
}
/**
* King's Raid's curves (its playtest's), for the stats the fight has: crit chance; a chance against a blow (dodge and
* block) or a crit (crit resist), and lifesteal; block DEF (more off a blocked blow, on top of the game's 500); ACC
* (hit chance); penetration and Tough; CC resist; CC accuracy (the game's HitCcChance); and attack speed (all of it: 1000
* as quick as it comes).
*/
var CURVE = {
	crit: {
		maxK: 2e3,
		x1: 2e3,
		a1: 1,
		b1: 1500,
		x2: 1500,
		a2: 500,
		b2: 750,
		x3: -500
	},
	chance: {
		maxK: 1e3,
		x1: 1e3,
		a1: 3,
		b1: 0,
		x2: 500,
		a2: 500,
		b2: 250,
		x3: -500
	},
	blockDef: {
		maxK: 450,
		x1: 775,
		a1: 3,
		b1: 1500,
		x2: 225,
		a2: 204,
		b2: 179,
		minK: -920,
		x3: -2,
		a3: 3,
		b3: -938,
		x4: -1
	},
	acc: {
		maxK: 2e3,
		x1: 2e3,
		a1: 1,
		b1: 1500,
		x2: 1500,
		a2: 500,
		b2: 750,
		minK: -920,
		x3: -2,
		a3: 3,
		b3: -938,
		x4: -1
	},
	pen: {
		maxK: 900,
		x1: 1e3,
		a1: 2,
		b1: 1e3,
		x2: 450,
		a2: 409,
		b2: 266,
		x3: -500
	},
	resist: {
		maxK: 1e3,
		x1: 1e3,
		a1: 1e6,
		b1: 1e6,
		x2: 500,
		a2: 1e3,
		b2: 0,
		x3: -500
	},
	accuracy: {
		maxK: 900,
		x1: 900,
		a1: 1e6,
		b1: 1e6,
		x2: 450,
		a2: 1e3,
		b2: 0,
		x3: -500
	},
	speed: {
		maxK: 2500,
		x1: 2400,
		a1: 1,
		b1: -733,
		x2: 1600,
		a2: 500,
		b2: 800,
		minK: 250,
		x3: -1e4,
		x4: 500,
		a4: 1,
		b4: -1500
	}
};
/**
* The attack a heal's or a shield's numbers are written for (as much HP as it says, from a hero with this much ATK; so
* many times as much for so many times its ATK): King's Raid's classes' average ATK, an assassin's. A blow's numbers
* are thousandths of its hero's ATK, as the game's shares have them (1000: a blow as hard as its ATK).
*/
var ATK = 19592;
/**
* What a defense takes off a blow, as King's Raid has it (its playtest's StatController.CalculateDamage): DEF_MOST of
* the blow at most, and as much of that as its defense is of the most that counts against its attacker's level (`reach`:
* reachAt). Defense is King's Raid's own size of DEF.
*/
var DEF_MOST = .9;
/**
* The most defense that counts against an attacker of each level from 70 (King's Raid's DefenceLevelTable): straight from
* one of these levels to the next, and on past the last as from the one before.
*/
var REACH$1 = [
	[70, 155459],
	[80, 196561],
	[90, 198457],
	[100, 294062],
	[130, 470477]
];
/** The most defense that counts against an attacker of `level`. */
function reachAt(level) {
	let i = 1;
	while (i < REACH$1.length - 1 && level > REACH$1[i][0]) i++;
	const [l0, m0] = REACH$1[i - 1];
	const [l1, m1] = REACH$1[i];
	return Math.max(1, m0 + (m1 - m0) * (level - l0) / (l1 - l0));
}
/** A blocked blow does this much of what it would have (less its target's block DEF against that kind). */
var BLOCKED = .5;
/**
* A blow of `amount` of a kind lands on `target`, from one with `pen` points of penetration and `acc` of ACC (its hit chance)
* whose level has `reach` (reachAt): dodged (it takes nothing), or what it takes once the target's defense against that kind
* (less what penetration sees past) has worn it down, and whether it blocked it (then less again), and its Tough off what is
* left. `roll` is the fight's chances (../sim/random.ts).
*/
function strike(amount, type, target, pen, reach, roll, acc = 0) {
	if (roll() < share$2(curved(CURVE.chance, target.dodge[type]) - curved(CURVE.acc, acc))) return {
		taken: 0,
		blocked: false,
		dodged: true
	};
	const blocked = roll() < share$2(curved(CURVE.chance, target.block[type]));
	const defense = Math.max(0, target[type]) * (1 - share$2(curved(CURVE.pen, pen)));
	const kept = blocked ? Math.max(0, BLOCKED - curved(CURVE.blockDef, (target.blockDef?.[type] ?? 0) * POINTS) / POINTS) : 1;
	const tough = 1 - share$2(curved(CURVE.pen, target.tough?.[type] ?? 0));
	return {
		taken: amount * (1 - DEF_MOST * Math.min(1, defense / reach)) * kept * tough,
		blocked,
		dodged: false
	};
}
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
/**
* King's Raid's way with what makes something so many times as much (each a share: 1.3 is 30% more, 0.8 20% less): what is
* of one kind adds up, rather than each going on top of the last (two of 30% more: 60% more, not 69%). A stat's (ATK, DEF,
* attack speed, healing, mana): all its shares added, and less than 50% less ever nearer all of it but never there
* (StatController.AttenuateStatUnderMinX), and never below none.
*/
function stacked(times) {
	let sum = 0;
	for (const t of times) sum += t - 1;
	if (sum < -.5) {
		const x = sum * 1e3;
		sum = (-1e3 + 1e9 / (2 * x * x - 1e3 * x + 1e6)) / 1e3;
	}
	return Math.max(0, 1 + sum);
}
/**
* Damage's (StatController.GiveDamage): what makes it more adds up (the dealer's DMG and the bearer's weakness alike), what
* makes it less adds up apart, and the one goes on top of the other; all of it less is none.
*/
function amplified(times) {
	let more = 0;
	let less = 0;
	for (const t of times) if (t > 1) more += t - 1;
	else less += 1 - t;
	return (1 + more) * Math.max(0, 1 - less);
}
/** What each of these makes a kind of damage its bearer takes (so many times as much). */
var takes = (on, type) => on.map(({ takes }) => typeof takes === "number" ? takes : takes?.[type] ?? 1);
/** What each makes its bearer's blows (so many times as hard). */
var deals = (on) => on.map(({ deals }) => deals ?? 1);
/** What each makes its bearer's defense against a kind of damage (so many times as much). */
var defends = (on, type) => on.map(({ defends }) => typeof defends === "number" ? defends : defends?.[type] ?? 1);
/** How many times as hard a bearer of these hits. */
var dealing = (on) => amplified(deals(on));
/** How many times as fast a bearer of these is (`and`: more of the kind, besides). */
var pacing = (on, ...and) => stacked([...on.map(({ pace }) => pace ?? 1), ...and]);
/** How many times as much healing reaches a bearer of these (`and`: more of the kind, besides). */
var healing = (on, ...and) => stacked([...on.map(({ heals }) => heals ?? 1), ...and]);
/** How many times as fast a bearer of these gains mana (`and`: more of the kind, besides). */
var filling = (on, ...and) => stacked([...on.map(({ mana }) => mana ?? 1), ...and]);
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
/** What these add to a bearer's ATK (a share), or to its ATK Spd, Tough, ACC or crit chance (points). */
function adding(on, key) {
	let more = 0;
	for (const status of on) more += status[key] ?? 0;
	return more;
}
/** What these add to a bearer's CC ACC (points). */
function accurate(on) {
	let more = 0;
	for (const { accuracy } of on) more += accuracy ?? 0;
	return more;
}
/** What these add to a bearer's CC resist (points). */
function resisting(on) {
	let more = 0;
	for (const { resist } of on) more += resist ?? 0;
	return more;
}
/** What these add to how likely the blows on a bearer are to be critical (points). */
function critTaking(on, type) {
	let more = 0;
	for (const { critTaken } of on) more += typeof critTaken === "number" ? critTaken : critTaken?.[type] ?? 0;
	return more;
}
/** What these take off how likely a kind of damage's blows on a bearer are to be critical (points). */
function critResisting(on, type) {
	let more = 0;
	for (const { critResist } of on) more += typeof critResist === "number" ? critResist : critResist?.[type] ?? 0;
	return more;
}
/** How many times as much defense against a kind of damage a bearer of these has. */
var defending = (on, type) => stacked(defends(on, type));
/** What these add to a bearer's defense against a kind of damage. */
function bolstering(on, type) {
	let more = 0;
	for (const { bolsters } of on) more += bolsters?.[type] ?? 0;
	return more;
}
/** What these add to a bearer's chance to dodge a kind of damage (points). */
function dodging(on, type) {
	let more = 0;
	for (const { dodges } of on) more += dodges?.[type] ?? 0;
	return more;
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
//#region src/technomagic/sim/bosses/dragon/minions.ts
/** A hatchling: its bite, and every 8 seconds its four blows in front of it (the ice one's slowing whoever they land on). */
var hatchling = (name, leaves) => ({
	name,
	deals: "magical",
	size: .5,
	attack: {
		length: 1.8,
		lands: [.7],
		share: 1,
		reach: 0
	},
	rest: .2,
	skill: {
		cooldown: 8,
		first: 8,
		length: 3.4,
		lands: [
			2,
			2.3,
			2.6,
			2.9
		],
		share: .8,
		reach: 1.5,
		...leaves && { leaves }
	}
});
var MINIONS = {
	"hatchling-fire": hatchling("Fire Hatchling"),
	"hatchling-ice": hatchling("Ice Hatchling", { slow: {
		name: "Dragon Snow",
		about: "Attack speed down.",
		icon: "❄️",
		harmful: true,
		pace: .98,
		lasts: 15
	} }),
	"hatchling-poison": hatchling("Poison Hatchling"),
	"hatchling-black": hatchling("Black Hatchling"),
	"ice-pillar": {
		name: "Ice Pillar",
		deals: "magical",
		size: 1,
		steady: true,
		attack: {
			length: 4,
			lands: [4],
			share: .1,
			reach: 0,
			random: true,
			leaves: { freeze: 1.5 }
		},
		rest: 0,
		fuse: {
			after: 20,
			share: 10
		}
	},
	wyrm: {
		name: "Poison Wyrm",
		deals: "physical",
		size: .6,
		steady: true,
		attack: {
			length: 1.3,
			lands: [.8],
			share: .5,
			reach: 0
		},
		rest: 0,
		skill: {
			cooldown: 3.5,
			first: 1.3,
			length: 3.5,
			lands: [
				.9,
				1.3,
				1.8,
				2.2
			],
			share: .1,
			reach: Infinity,
			leaves: { weaken: {
				name: "Wyrm Venom",
				about: "Deals less damage for the rest of the fight.",
				icon: "🐍",
				harmful: true,
				each: .01,
				most: 100
			} }
		}
	},
	wyrmling: {
		name: "Poison Wyrm",
		deals: "physical",
		size: .6,
		steady: true,
		attack: {
			length: 1.3,
			lands: [.8],
			share: .5,
			reach: 0
		},
		rest: 1,
		skill: {
			cooldown: 12,
			first: 8,
			length: 3.5,
			lands: [
				.9,
				1.3,
				1.8,
				2.2,
				2.6
			],
			share: .5,
			reach: 2,
			deals: "magical"
		}
	}
};
//#endregion
//#region src/technomagic/sim/bosses/dragon/waves.ts
var WAVES = {
	temeraire: [
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 45957740,
				atk: 683604,
				def: [51224, 51224]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 55288287,
				atk: 822324,
				def: [61628, 61628]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 66513466,
				atk: 989400,
				def: [74174, 74174]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 96262605,
				atk: 1431876,
				def: [107345, 107345]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 192525758,
				atk: 2863956,
				def: [214751, 214751]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 223589414,
				atk: 3325968,
				def: [249415, 249415]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 236010792,
				atk: 3510744,
				def: [263272, 263272]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 393780494,
				atk: 6254882,
				def: [453960, 453960]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 545235165,
				atk: 8660606,
				def: [628560, 628560]
			}
		]],
		[[
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 0,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			}
		], [
			{
				kind: "hatchling-fire",
				x: 1,
				z: 8,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: 6,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: 4,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: 2,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 6,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 5,
				z: -2,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 4,
				z: -4,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 3,
				z: -6,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: -8,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-fire",
				x: 1,
				z: 0,
				hp: 725116665,
				atk: 11517542,
				def: [835848, 835848]
			}
		]]
	],
	scalaxia: [
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 16109122,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 16109122,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 53696940,
				atk: 683604,
				def: [41004, 41004]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 53696940,
			atk: 683604,
			def: [41004, 41004]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 53696940,
			atk: 683604,
			def: [41004, 41004]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 19379335,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 19379335,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 64598717,
				atk: 822324,
				def: [49327, 49327]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 64598717,
			atk: 822324,
			def: [49327, 49327]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 64598717,
			atk: 822324,
			def: [49327, 49327]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 23314085,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 23314085,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 77714016,
				atk: 989400,
				def: [59364, 59364]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 77714016,
			atk: 989400,
			def: [59364, 59364]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 77714016,
			atk: 989400,
			def: [59364, 59364]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 33741993,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 33741993,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 112473445,
				atk: 1431876,
				def: [85864, 85864]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 112473445,
			atk: 1431876,
			def: [85864, 85864]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 112473445,
			atk: 1431876,
			def: [85864, 85864]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 67483987,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 67483987,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 224946889,
				atk: 2863956,
				def: [171788, 171788]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 224946889,
			atk: 2863956,
			def: [171788, 171788]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 224946889,
			atk: 2863956,
			def: [171788, 171788]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 78372068,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 78372068,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 261240793,
				atk: 3325968,
				def: [199519, 199519]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 261240793,
			atk: 3325968,
			def: [199519, 199519]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 261240793,
			atk: 3325968,
			def: [199519, 199519]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 82725949,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 82725949,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 275753760,
				atk: 3510744,
				def: [210604, 210604]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 275753760,
			atk: 3510744,
			def: [210604, 210604]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 275753760,
			atk: 3510744,
			def: [210604, 210604]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 138027738,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 138027738,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 460092064,
				atk: 6254882,
				def: [363168, 363168]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 460092064,
			atk: 6254882,
			def: [363168, 363168]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 460092064,
			atk: 6254882,
			def: [363168, 363168]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 191115150,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 191115150,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 637049953,
				atk: 8660606,
				def: [502848, 502848]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 637049953,
			atk: 8660606,
			def: [502848, 502848]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 637049953,
			atk: 8660606,
			def: [502848, 502848]
		}]],
		[[
			{
				kind: "hatchling-ice",
				x: 1,
				z: -3,
				hp: 254167259,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-ice",
				x: 1,
				z: 3,
				hp: 254167259,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "ice-pillar",
				x: 6,
				z: 0,
				hp: 847224485,
				atk: 11517542,
				def: [668678, 668678]
			}
		], [{
			kind: "ice-pillar",
			x: 0,
			z: 4,
			hp: 847224485,
			atk: 11517542,
			def: [668678, 668678]
		}, {
			kind: "ice-pillar",
			x: 0,
			z: -4,
			hp: 847224485,
			atk: 11517542,
			def: [668678, 668678]
		}]]
	],
	zyrrkinoth: [
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 73532494,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 73532494,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 73532494,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 73532494,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 73532494,
				atk: 683604,
				def: [51224, 51224]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 55149508,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 55149508,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 55149508,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 55149508,
				atk: 683604,
				def: [51224, 51224]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 55149508,
				atk: 683604,
				def: [51224, 51224]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 88461368,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 88461368,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 88461368,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 88461368,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 88461368,
				atk: 822324,
				def: [61628, 61628]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 66346163,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 66346163,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 66346163,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 66346163,
				atk: 822324,
				def: [61628, 61628]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 66346163,
				atk: 822324,
				def: [61628, 61628]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 106421436,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 106421436,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 106421436,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 106421436,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 106421436,
				atk: 989400,
				def: [74174, 74174]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 79815940,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 79815940,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 79815940,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 79815940,
				atk: 989400,
				def: [74174, 74174]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 79815940,
				atk: 989400,
				def: [74174, 74174]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 154020935,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 154020935,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 154020935,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 154020935,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 154020935,
				atk: 1431876,
				def: [107345, 107345]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 115515564,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 115515564,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 115515564,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 115515564,
				atk: 1431876,
				def: [107345, 107345]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 115515564,
				atk: 1431876,
				def: [107345, 107345]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 308041871,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 308041871,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 308041871,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 308041871,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 308041871,
				atk: 2863956,
				def: [214751, 214751]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 231031129,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 231031129,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 231031129,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 231031129,
				atk: 2863956,
				def: [214751, 214751]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 231031129,
				atk: 2863956,
				def: [214751, 214751]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 357742598,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 357742598,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 357742598,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 357742598,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 357742598,
				atk: 3325968,
				def: [249415, 249415]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 268306949,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 268306949,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 268306949,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 268306949,
				atk: 3325968,
				def: [249415, 249415]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 268306949,
				atk: 3325968,
				def: [249415, 249415]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 377616777,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 377616777,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 377616777,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 377616777,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 377616777,
				atk: 3510744,
				def: [263272, 263272]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 283212582,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 283212582,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 283212582,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 283212582,
				atk: 3510744,
				def: [263272, 263272]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 283212582,
				atk: 3510744,
				def: [263272, 263272]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 630048466,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 630048466,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 630048466,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 630048466,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 630048466,
				atk: 6254882,
				def: [453960, 453960]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 472536755,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 472536755,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 472536755,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 472536755,
				atk: 6254882,
				def: [453960, 453960]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 472536755,
				atk: 6254882,
				def: [453960, 453960]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 872375814,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 872375814,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 872375814,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 872375814,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 872375814,
				atk: 8660606,
				def: [628560, 628560]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 654282423,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 654282423,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 654282423,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 654282423,
				atk: 8660606,
				def: [628560, 628560]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 654282423,
				atk: 8660606,
				def: [628560, 628560]
			}
		]],
		[[
			{
				kind: "wyrm",
				x: 2,
				z: 0,
				hp: 1160186901,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 1,
				hp: 1160186901,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: 2,
				hp: 1160186901,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -1,
				hp: 1160186901,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "wyrmling",
				x: 0,
				z: -2,
				hp: 1160186901,
				atk: 11517542,
				def: [835848, 835848]
			}
		], [
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 870140472,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 870140472,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 1.5,
				hp: 870140472,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: -2,
				hp: 870140472,
				atk: 11517542,
				def: [835848, 835848]
			},
			{
				kind: "hatchling-poison",
				x: -2,
				z: 2,
				hp: 870140472,
				atk: 11517542,
				def: [835848, 835848]
			}
		]]
	],
	armarta: []
};
//#endregion
//#region src/technomagic/sim/bosses/gauge.ts
/** Galgoria's (chapter 10's), and the Hard Dragon Raid's (911 to 914's). */
var GALGORIA_GAUGE = {
	full: 1e5,
	regen: 7e3
};
var DRAGON_GAUGE = {
	full: 3e4,
	regen: 3e3
};
/** What a second of a stun takes from it (a stun's or a knock down's CC power alike: the game's 1000 for each). */
var PER = 1e3;
var REFILL = 1;
var DOWNED = {
	name: "Down",
	shown: "down"
};
/** A boss's part (`own`) with its CC Gauge of `size`. */
function withGauge(fight, own, size) {
	const { foe } = fight;
	let gauge = size.full;
	/** How long it is yet before the gauge fills again; how long it is Down for yet; how long its gauge is filling after it, yet. */
	let still = 0;
	let downed = 0;
	let refill = 0;
	return {
		...own,
		controlled(seconds) {
			if (downed > 0 || refill > 0) return null;
			const took = seconds * PER;
			gauge -= took;
			still = Math.max(still, took / 1e3);
			if (gauge > 0) return null;
			gauge = 0;
			downed = 5;
			put(foe.statuses, {
				name: DOWNED.name,
				left: 5,
				shown: DOWNED.shown
			});
			fight.cue(null, "gauge");
			return {
				seconds: 5,
				down: true
			};
		},
		tick(dt) {
			if (downed > 0) {
				downed = Math.max(0, downed - dt);
				if (downed === 0) refill = REFILL;
			} else if (refill > 0) {
				gauge = Math.min(size.full, gauge + size.full / REFILL * dt);
				refill = Math.max(0, refill - dt);
				if (refill === 0) gauge = size.full;
			} else if (still > 0) still = Math.max(0, still - dt);
			else gauge = Math.min(size.full, gauge + size.regen * dt);
			own.tick?.(dt);
		},
		beaten() {
			gauge = size.full;
			downed = 0;
			refill = 0;
			own.beaten?.();
		},
		gauge: () => gauge / size.full
	};
}
//#endregion
//#region src/technomagic/sim/bosses/playtest.ts
var HEROES_DEAL = .71;
var HEROES_HP = .78;
//#endregion
//#region src/technomagic/sim/bosses/dragon/common.ts
var KR_HP$1 = [
	931159153,
	1120206503,
	1347633837,
	1950395922,
	3900791843,
	4560670244,
	5725394959,
	7635313815,
	9271452032,
	15491771741
];
var KR_ATK$1 = [
	1898512,
	2284691,
	2748592,
	3977565,
	7955939,
	11434363,
	13797120,
	28289856,
	34351968,
	65045376
];
var KR_DEF$1 = [
	92822,
	111751,
	134402,
	194515,
	389110,
	504410,
	620813,
	1026648,
	1246644,
	2217456
];
var KR_LEVEL = [
	77,
	81,
	85,
	93,
	108,
	110,
	110,
	115,
	115,
	120
];
var FIRE_ATK = 1763309 / 1898512;
var HIGH_DEF = 132660 / 92822;
var KR_PARTY$1 = 9;
var SOLO = 7;
/** A dragon's health and defense at stage 1, for its stats: its lower defense, and its higher. */
var FIRST$1 = {
	hp: KR_HP$1[0] * HEROES_DEAL * 8 / KR_PARTY$1,
	def: KR_DEF$1[0],
	high: KR_DEF$1[0] * HIGH_DEF
};
/** A dragon's stages, fought with others and alone (`atk`: its ATK, of the others'). */
function dragonStages({ atk = 1 } = {}) {
	const scales = (times) => KR_HP$1.map((hp, i) => ({
		hp: hp / KR_HP$1[0] * times,
		deals: HEROES_HP * atk * (KR_ATK$1[i] / KR_ATK$1[0]),
		defense: KR_DEF$1[i] / KR_DEF$1[0],
		level: KR_LEVEL[i]
	}));
	return {
		room: scales(1),
		solo: scales(SOLO / 8)
	};
}
/**
* As the playtest's hard dragons are: no block; 150 dodge against both kinds; 400 points of a hero's defense seen past, and
* 250 of its dodge (hit chance); a crit chance of 250; and no CC resist (the gauge stands for it).
*/
var OPEN = {
	block: NONE,
	dodge: {
		physical: 150,
		magical: 150
	},
	pen: 400,
	acc: 250,
	crit: 250,
	resist: 0
};
/** The heroes a dragon can reach: on the field, standing, and in the fight. */
var reachable = (fight) => fight.field.filter((fighter) => fighter.hp > 0 && !fighter.statuses.some((status) => status.away));
/** A blow on whoever it is going for, then `then` on them. */
function single(fight, amount, then) {
	const target = fight.target();
	if (!target || target.hp <= 0) return;
	fight.hurt(target, amount);
	then?.(target);
}
/** A blow on every hero it can reach, then `then` on each; and `cue` drawn for them. Returns them. */
function all$1(fight, amount, then, cue) {
	const heroes = reachable(fight);
	for (const fighter of heroes) {
		fight.hurt(fighter, amount);
		if (fighter.hp > 0) then?.(fighter);
	}
	if (cue) fight.cue(null, cue, heroes);
	return heroes;
}
/** How many of a status a hero bears (0: none). */
var stacksOf = (fighter, name) => fighter.statuses.find((status) => status.name === name)?.count ?? 0;
/** So many more of a status that stacks (up to `most`), begun again for `lasts` seconds: `made` makes it. Returns how many there are now. */
function addStacks(fighter, name, by, most, lasts, made) {
	const count = Math.min(most, stacksOf(fighter, name) + by);
	put(fighter.statuses, {
		...made(count),
		name,
		left: lasts,
		count
	});
	return count;
}
/** Takes a status off a hero. */
function lift(fighter, name) {
	const at = fighter.statuses.findIndex((status) => status.name === name);
	if (at >= 0) fighter.statuses.splice(at, 1);
}
/**
* Something that eats at the heroes bearing a status, every second while they do: `each` says how much (by the hero:
* its stacks, the blow it came of), and it is a blow of the dragon's that nothing blocks.
*/
function dot(fight, name, each) {
	let since = 0;
	return (dt) => {
		since += dt;
		if (since < 1) return;
		since -= 1;
		for (const fighter of reachable(fight)) {
			if (!fighter.statuses.some((status) => status.name === name)) continue;
			const amount = each(fighter);
			if (amount > 0) fight.hurt(fighter, amount, false);
		}
	};
}
/**
* Its skills' cooldowns (seconds), each begun as it is used and run down every step; and, as King's Raid's (InitialCoolTimeMs),
* how long each waits as the fight begins: [cooldown, first], or just its cooldown (ready from the start).
*/
function cooldowns(of) {
	const length = (one) => typeof one === "number" ? one : one[0];
	const left = new Map(Object.entries(of).flatMap(([attack, one]) => typeof one === "number" ? [] : [[attack, one[1]]]));
	return {
		used(attack) {
			const cooldown = of[attack];
			if (cooldown !== void 0) left.set(attack, length(cooldown));
		},
		ready: (attack) => (left.get(attack) ?? 0) <= 0,
		tick(dt) {
			for (const [attack, wait] of left) left.set(attack, Math.max(0, wait - dt));
		}
	};
}
/**
* A blow that takes `share` of what health each of `heroes` has left, as King's Raid's playtest's dragons' do ($ByMEHp4), and
* nothing blocks.
*/
function fraction(fight, heroes, share) {
	for (const fighter of heroes) if (fighter && fighter.hp > 0) fight.hurt(fighter, fighter.hp * share, false);
}
/** A dragon's ultimate is open once it is down to this share of its health (the playtest's OnHpRatio 700). */
var ULTIMATE = .7;
/** Whether a dragon's ultimate is open. */
var opened = (fight) => fight.foe.hp <= fight.foe.maxHp * ULTIMATE;
/** How long a dragon rests after an attack: as long as makes its bite take its plain attack's time, `seconds` (the playtest's). */
var restFor = (seconds) => seconds - 1.7;
/**
* A dragon's raid's waves (./waves.ts: the Hard Dragon Raid's): at 70% of its health it flies off (the playtest's OnHpRatio 700,
* BeginResting), its minions come in two waves on the platforms on, and it comes back for the last, its landing taking half of
* what health every hero has left and knocking them down 1.5 seconds (its OnBeginPlaying(0, 3): $ByMEHp4(500), Knockback).
*/
var dragonWaves = (id) => ({
	at: (stage) => WAVES[id]?.[stage - 1] ?? [],
	leaves: ULTIMATE,
	lands: {
		share: .5,
		knock: 1.5
	}
});
/**
* A minion of a wave (./waves.ts) as the dragons are scaled: its health the game's as much less as the heroes here deal and
* as much more as there are of them (alone, as much less again); its ATK (what its blows are shares of: ./minions.ts) as much
* less as the heroes here have less health; its defenses the game's; and the rest as the hard dragons' (OPEN).
*/
function minionOf(minion, solo) {
	const hp = minion.hp * HEROES_DEAL * 8 / KR_PARTY$1 * (solo ? SOLO / 8 : 1);
	return {
		hp,
		atk: minion.atk * HEROES_HP,
		stats: {
			hp,
			deals: MINIONS[minion.kind].deals,
			magical: minion.def[0],
			physical: minion.def[1],
			...OPEN
		}
	};
}
/** A dragon's part: its own (`own`), with its CC Gauge (../gauge.ts: the Hard Dragon Raid's). */
var withDragonGauge = (fight, own) => withGauge(fight, own, DRAGON_GAUGE);
/** What a blow takes, as a share of a dragon's ATK at stage 1 (King's Raid's playtest's: its skill's damage share). */
var share$1 = (of) => [of * KR_ATK$1[0], of * KR_ATK$1[0]];
/**
* How long each of its moves takes, when its blow lands, and what that takes of whoever it lands on, before their defense: as
* the playtest's dragons' skills have it, of their ATK (a dragon's attack 250%; its quick skill 120%; Tail Strike 100%; a
* tail smash 40%, a blow of its breath 30%, of its storm 25%; its landing 200%. Its share of a hero's health that some add
* is not here).
*/
var MOVES$1 = {
	bite: {
		length: 1.7,
		hit: .8,
		hurts: share$1(2.5)
	},
	claw: {
		length: 1.6,
		hit: .75,
		hurts: share$1(1.2)
	},
	sweep: {
		length: 2.1,
		hit: 1,
		hurts: share$1(1)
	},
	smash: {
		length: 1.1,
		hit: .55,
		hurts: share$1(.4)
	},
	inhale: {
		length: 1.4,
		hit: null
	},
	breath: {
		length: .55,
		hit: .25,
		hurts: share$1(.3)
	},
	roar: {
		length: 2.1,
		hit: .6,
		hurts: share$1(.25)
	},
	rise: {
		length: 1.4,
		hit: null
	},
	storm: {
		length: 1,
		hit: .45,
		hurts: share$1(.25)
	},
	land: {
		length: 1.3,
		hit: .85,
		hurts: share$1(2)
	},
	gaze: {
		length: 1.8,
		hit: 1.1
	}
};
/** Its moves in each of its attacks, by the attack's name: each after the last is done. */
var PLANS$1 = {
	bite: [[
		"bite",
		"D",
		0
	]],
	claw: [[
		"claw",
		"D",
		0
	]],
	sweep: [[
		"sweep",
		"D",
		0
	]],
	smashes: [
		[
			"smash",
			"D",
			0
		],
		[
			"smash",
			"D",
			0
		],
		[
			"smash",
			"D",
			0
		]
	],
	breath: [
		[
			"inhale",
			"D",
			0
		],
		[
			"breath",
			"D",
			0
		],
		[
			"breath",
			"D",
			0
		],
		[
			"breath",
			"D",
			0
		],
		[
			"breath",
			"D",
			0
		]
	],
	roar: [[
		"roar",
		"D",
		0
	]],
	storm: [
		[
			"rise",
			"D",
			0
		],
		[
			"storm",
			"D",
			0
		],
		[
			"storm",
			"D",
			0
		],
		[
			"land",
			"D",
			0
		]
	],
	eclipse: [[
		"rise",
		"D",
		0
	], [
		"land",
		"D",
		0
	]],
	gaze: [[
		"gaze",
		"D",
		0
	]]
};
//#endregion
//#region src/technomagic/sim/bosses/armarta/skills.ts
var FLAMES = {
	lasts: 10,
	burn: .15,
	heals: .5
};
var GAZE = { lasts: 4 };
var ECLIPSE = {
	burning: 1.6,
	deals: .1,
	most: 5,
	health: .73
};
var TAIL$1 = 2 / 3;
var DARK = {
	name: "Dark Flames",
	about: `Black fire eats at it every second, and ${Math.round((1 - FLAMES.heals) * 100)}% less healing reaches it.`,
	icon: "🖤",
	harmful: true
};
var STONE = {
	name: "Petrified",
	about: "Turned to stone by its gaze: it can do nothing.",
	icon: "🗿",
	harmful: true
};
var ASHEN = "Ashen Nox";
function armartaPart(fight) {
	const { foe } = fight;
	const waits = cooldowns({
		claw: [6.5, 2],
		sweep: [15, 10],
		breath: [30, 20],
		gaze: [25, 25],
		eclipse: [60, 40]
	});
	/** How hard each hero's Dark Flames are; and what each has dealt since its last gaze. */
	const flames = /* @__PURE__ */ new Map();
	const dealt = /* @__PURE__ */ new Map();
	const eating = dot(fight, DARK.name, (fighter) => flames.get(fighter) ?? 0);
	const burning = (fighter) => fighter.statuses.some((status) => status.name === DARK.name);
	return withDragonGauge(fight, {
		lands: {
			breath(part, amount) {
				if (part < 1) return;
				all$1(fight, amount, (fighter) => {
					flames.set(fighter, Math.max(burning(fighter) ? flames.get(fighter) ?? 0 : 0, amount * FLAMES.burn));
					put(fighter.statuses, {
						name: DARK.name,
						left: FLAMES.lasts,
						heals: FLAMES.heals,
						shown: DARK
					});
				}, "black");
			},
			gaze() {
				const [top] = reachable(fight).sort((a, b) => (dealt.get(b) ?? 0) - (dealt.get(a) ?? 0));
				dealt.clear();
				if (!top) return;
				fight.stagger(top);
				top.reserved = null;
				put(top.statuses, {
					name: STONE.name,
					left: GAZE.lasts,
					binds: true,
					shown: STONE
				});
				fight.cue(null, "gaze", [top]);
			},
			eclipse(part, amount) {
				if (part !== 1) return;
				const heroes = reachable(fight);
				for (const fighter of heroes) fight.hurt(fighter, amount * (burning(fighter) ? ECLIPSE.burning : 1));
				fraction(fight, heroes, ECLIPSE.health);
				fight.cue(null, "eclipse", heroes);
				const count = Math.min(ECLIPSE.most, (foe.statuses.find((status) => status.name === ASHEN)?.count ?? 0) + 1);
				const status = {
					name: ASHEN,
					left: Infinity,
					deals: 1 + ECLIPSE.deals * count,
					count,
					shown: "curse"
				};
				put(foe.statuses, status);
			},
			bite: (_part, amount) => single(fight, amount),
			claw: (_part, amount) => single(fight, amount),
			sweep(_part, amount) {
				all$1(fight, amount, void 0, "sweep");
				fraction(fight, [fight.target()], TAIL$1);
			}
		},
		struck(by, amount) {
			dealt.set(by, (dealt.get(by) ?? 0) + amount);
		},
		used: waits.used,
		ready: (attack) => waits.ready(attack) && (attack !== "eclipse" || opened(fight)),
		tick(dt) {
			waits.tick(dt);
			eating(dt);
		},
		beaten() {
			dealt.clear();
			const at = foe.statuses.findIndex((status) => status.name === ASHEN);
			if (at >= 0) foe.statuses.splice(at, 1);
			for (const fighter of fight.fighters) {
				lift(fighter, DARK.name);
				lift(fighter, STONE.name);
			}
		},
		marks: () => []
	});
}
//#endregion
//#region src/technomagic/sim/bosses/armarta/index.ts
/**
* Armarta, the ancient black dragon of stone, of Ashen Nox, the Black Sun (the Dragon Raid's Black Dragon). As in King's
* Raid, its Black Flame Breath leaves the Dark Flames, which eat at whoever it lands on; and its gaze turns a hero to
* stone. Its blows are physical (as the playtest's). What its skills do is ./skills.ts; its body is the page's (../../../bosses/dragon/).
*/
var ARMARTA = {
	id: "armarta",
	name: "Armarta",
	stats: {
		hp: FIRST$1.hp,
		deals: "physical",
		physical: FIRST$1.def,
		magical: FIRST$1.def,
		...OPEN
	},
	stages: dragonStages(),
	basic: ["bite"],
	rest: restFor(2.4),
	time: 180,
	attacks: [
		{
			name: "bite",
			label: "Bite"
		},
		{
			name: "claw",
			label: "Claw"
		},
		{
			name: "sweep",
			label: "Tail Sweep"
		},
		{
			name: "breath",
			label: "Black Flame Breath"
		},
		{
			name: "gaze",
			label: "Stone Gaze"
		},
		{
			name: "eclipse",
			label: "Ashen Eclipse"
		}
	],
	plans: {
		bite: PLANS$1.bite,
		claw: PLANS$1.claw,
		sweep: PLANS$1.sweep,
		breath: PLANS$1.breath,
		gaze: PLANS$1.gaze,
		eclipse: PLANS$1.eclipse
	},
	moves: MOVES$1,
	join: armartaPart
};
//#endregion
//#region src/technomagic/sim/bosses/galgoria/attacks.ts
/**
* Its M.ATK at each stage, as King's Raid's playtest builds it (its Galgoria raid, chapter 10's stages 1 to 8: its stats at
* the stage's level, times its MonsterTierTable entry: KR-extracted/scripts/boss-stats.mjs). Its blows are shares of it.
*/
var KR_ATK = [
	4515117,
	5942354,
	8184999,
	9373382,
	13161563,
	19055025,
	23048231,
	39699242
];
/** What a blow takes: `of` its ATK at stage 1 (how much of that each skill's blow takes is ./skills.ts). */
var share = (of) => [of * KR_ATK[0], of * KR_ATK[0]];
var HEADS = [
	"C",
	"L",
	"R"
];
/** How long each of its heads' moves takes, when its blow lands, and what that takes of whoever it lands on, before their defense (its ATK; each skill takes its share of it). */
var MOVES = {
	spit: {
		length: 2,
		hit: .88,
		hurts: share(1)
	},
	roar: {
		length: 2.1,
		hit: .5,
		hurts: share(1.5)
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
//#region src/technomagic/sim/bosses/galgoria/skills.ts
/** Its attack's share of its ATK. */
var HEAD = 3.3;
var IMPRISONMENT = {
	hits: 150,
	lasts: 8,
	deals: 1.7
};
var DESTROYER = {
	venom: .55,
	share: 100 / 110,
	down: 3,
	cooldown: 10
};
var SWAMP = {
	lasts: 5,
	every: 1,
	mana: .6,
	deals: 1.4,
	cooldown: 17
};
var EXPLOSION = {
	blow: 1.1,
	lasts: 10,
	deals: .5,
	crit: -.5,
	cooldown: 18
};
var FATAL = {
	blow: 1.4,
	after: 3,
	heals: .2,
	most: 5,
	deals: .14,
	mostOnIt: 10
};
/** What it gives itself back a second, of its health, and how much more its healing gives it: from stage `from` on, `later`. */
var LIFE_FORCE = {
	share: .00393,
	healing: .7,
	later: 1.2,
	from: 4
};
/** From stage 4 on: how much healing reaches the heroes, and how strong their shields are. */
var STAGES = {
	from: 4,
	heals: .6,
	shields: .4
};
/** How many times as much it takes of each kind of damage. */
var TAKEN = { physical: 1.2 };
var IMPRISONED = {
	name: "Swamp Imprisonment",
	about: "Shut away in the swamp: it can do nothing, and the boss can’t reach it.",
	icon: "🪤",
	harmful: true
};
var UNBOUND = {
	name: "Swamp Imprisonment (free)",
	about: `An ally is shut away: ${Math.round((IMPRISONMENT.deals - 1) * 100)}% more damage dealt meanwhile.`,
	icon: "🗡️"
};
var POISONED$2 = {
	name: "Poisonous Swamp",
	about: `Hurt every second; mana fills ${Math.round((1 - SWAMP.mana) * 100)}% slower, and ATK is ${Math.round((SWAMP.deals - 1) * 100)}% higher.`,
	icon: "🫧",
	harmful: true
};
var WEAKENED$1 = {
	name: "Poisonous Explosion",
	about: `Hits ${Math.round((1 - EXPLOSION.deals) * 100)}% softer.`,
	icon: "💥",
	harmful: true
};
var DULLED = {
	name: "Poisonous Explosion (crit)",
	about: `${Math.round(-EXPLOSION.crit * 1e3)} less crit chance.`,
	icon: "💥",
	harmful: true
};
var FATAL_VENOM = {
	name: "Fatal Venom",
	about: `${Math.round(FATAL.heals * 100)}% less healing reaches it for each (the rest of the fight), and the boss hits harder.`,
	icon: "☠️",
	harmful: true
};
/** Its skills that count toward Fatal Venom, and each one's cooldown; and how long each waits as the fight begins (the playtest's). */
var COOLDOWNS = {
	destroyer: DESTROYER.cooldown,
	swamp: SWAMP.cooldown,
	explosion: EXPLOSION.cooldown
};
var FIRST = {
	destroyer: 5,
	swamp: 8,
	explosion: 12
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
	return withGauge(fight, ownPart(fight), GALGORIA_GAUGE);
}
/** What its skills do, but for its CC Gauge. */
function ownPart(fight) {
	const { foe } = fight;
	/** Blows the heroes have landed toward the next imprisonment, and what each has dealt since the last. */
	let hits = 0;
	const dealt = /* @__PURE__ */ new Map();
	/** The heroes shut away: a ring where each comes back out. */
	const shut = /* @__PURE__ */ new Set();
	/** Its skills' cooldowns, by name; its skills used toward Fatal Venom; and how long its swamp lasts yet, its blow each so often. */
	const cooldowns = new Map(Object.entries(FIRST));
	let used = 0;
	let swamp = 0;
	let swampHurts = 0;
	let swampAmount = 0;
	/** Whether the fight is at stage 4 or past it. */
	const late = () => fight.stage >= STAGES.from;
	/** The heroes the boss can reach. */
	const reachable = () => fight.field.filter((fighter) => fighter.hp > 0 && !fighter.statuses.some((status) => status.away));
	/** The hero that has dealt the most since the last is shut away in the swamp; every other hero deals more meanwhile. */
	function imprison() {
		const [top, ...rest] = reachable().sort((a, b) => (dealt.get(b) ?? 0) - (dealt.get(a) ?? 0));
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
		for (const other of rest) put(other.statuses, {
			name: UNBOUND.name,
			left: IMPRISONMENT.lasts,
			deals: IMPRISONMENT.deals,
			shown: UNBOUND
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
			left: (_part, amount) => venom(amount * HEAD),
			centre: (_part, amount) => venom(amount * HEAD),
			right: (_part, amount) => venom(amount * HEAD),
			destroyer(part, amount) {
				if (part < 3) return venom(amount * DESTROYER.venom);
				if (part > 3) return;
				const heroes = reachable();
				fight.cue(null, "destroyer", heroes);
				for (const fighter of heroes) {
					fight.hurt(fighter, fighter.hp * DESTROYER.share, false);
					fight.knock(fighter, DESTROYER.down);
				}
			},
			swamp(part, amount) {
				if (part > 0) return;
				const heroes = reachable();
				if (heroes.length === 0) return;
				fight.cue(null, "swamp", heroes);
				for (const fighter of heroes) put(fighter.statuses, {
					name: POISONED$2.name,
					left: SWAMP.lasts,
					mana: SWAMP.mana,
					deals: SWAMP.deals,
					shown: POISONED$2
				});
				swamp = SWAMP.lasts;
				swampHurts = 0;
				swampAmount = amount / (SWAMP.lasts / SWAMP.every);
			},
			explosion(part, amount) {
				const heroes = reachable();
				for (const fighter of heroes) {
					fight.hurt(fighter, amount * EXPLOSION.blow);
					if (part === 0) put(fighter.statuses, {
						name: WEAKENED$1.name,
						left: EXPLOSION.lasts,
						deals: EXPLOSION.deals,
						shown: WEAKENED$1
					});
					else put(fighter.statuses, {
						name: DULLED.name,
						left: EXPLOSION.lasts,
						crit: EXPLOSION.crit,
						shown: DULLED
					});
				}
				fight.cue(null, "explosion", heroes);
			},
			fatal(_part, amount) {
				const heroes = reachable();
				for (const fighter of heroes) {
					fight.hurt(fighter, amount * FATAL.blow);
					stack(fighter.statuses, FATAL_VENOM.name, FATAL.most, (count) => ({
						heals: Math.max(0, 1 - FATAL.heals * count),
						shown: FATAL_VENOM
					}));
				}
				stack(foe.statuses, FATAL_VENOM.name, FATAL.mostOnIt, (count) => ({
					deals: 1 + FATAL.deals * count,
					shown: "venom"
				}));
				fight.cue(null, "fatal", heroes);
			}
		},
		struck(by, amount) {
			dealt.set(by, (dealt.get(by) ?? 0) + amount);
			if (++hits < IMPRISONMENT.hits) return;
			hits = 0;
			imprison();
		},
		used(attack) {
			const cooldown = COOLDOWNS[attack];
			if (cooldown !== void 0) {
				cooldowns.set(attack, cooldown);
				used++;
			} else if (attack === "fatal") used = 0;
		},
		next: () => used >= FATAL.after ? "fatal" : null,
		ready: (attack) => attack !== "fatal" && (cooldowns.get(attack) ?? 0) <= 0,
		beaten() {
			hits = 0;
			used = 0;
			dealt.clear();
			for (const on of [foe.statuses, ...fight.fighters.map((fighter) => fighter.statuses)]) {
				const at = on.findIndex((status) => status.name === FATAL_VENOM.name);
				if (at >= 0) on.splice(at, 1);
			}
		},
		tick(dt) {
			for (const [attack, left] of cooldowns) cooldowns.set(attack, Math.max(0, left - dt));
			fight.mend(foe.maxHp * LIFE_FORCE.share * (1 + (fight.stage >= LIFE_FORCE.from ? LIFE_FORCE.later : LIFE_FORCE.healing)) * dt);
			if (swamp > 0) {
				swamp -= dt;
				swampHurts += dt;
				if (swampHurts >= SWAMP.every) {
					swampHurts -= SWAMP.every;
					for (const fighter of reachable()) if (fighter.statuses.some((status) => status.name === POISONED$2.name)) fight.hurt(fighter, swampAmount);
				}
			}
			for (const fighter of shut) {
				if (fighter.statuses.some((status) => status.name === IMPRISONED.name)) continue;
				shut.delete(fighter);
				fight.cue(null, "free", [fighter]);
			}
		},
		healing: () => late() ? STAGES.heals : 1,
		shielding: () => late() ? STAGES.shields : 1,
		taken: TAKEN,
		unstolen: true,
		steady: true,
		marks() {
			return [
				{
					text: "Life Force",
					tone: "venom"
				},
				{
					text: `Imprisonment ${hits}/${IMPRISONMENT.hits}`,
					tone: "venom"
				},
				{
					text: `Fatal Venom ${Math.min(used, FATAL.after)}/${FATAL.after}`,
					tone: "venom"
				}
			];
		}
	};
}
//#endregion
//#region src/technomagic/sim/bosses/galgoria/index.ts
var KR_HP = [
	14184543765,
	19721142351,
	26463862400,
	37178723386,
	49825627800,
	71216166313,
	86139389687,
	158093465948
];
var KR_DEF = [
	53269,
	57090,
	68670,
	82450,
	116318,
	124308,
	164065,
	261750
];
var LIFE_DEF = 6e4;
var LEVEL = [
	88,
	90,
	95,
	100,
	108,
	110,
	116,
	125
];
var KR_PARTY = 7;
var HP = KR_HP.map((hp) => hp * HEROES_DEAL * 8 / KR_PARTY);
var DEF = KR_DEF.map((def) => def + LIFE_DEF);
var scales = (times) => HP.map((hp, i) => ({
	hp: hp / HP[0] * times,
	deals: HEROES_HP * (KR_ATK[i] / KR_ATK[0]),
	defense: DEF[i] / DEF[0],
	level: LEVEL[i]
}));
/**
* Galgoria: a chimera of three heads that spits venom. Its blows are magical. It neither blocks nor dodges, and takes
* 20% more physical damage (./skills.ts). Its health and defenses are the playtest's (HP, DEF), so heroes wear it down
* best with penetration, and with what cuts its healing (it gives itself back its health all the while: ./skills.ts).
* How its attacks go is ./attacks.ts, and what its skills do ./skills.ts; what is drawn for them is
* ../../../bosses/galgoria/fx.ts, and its body ../../../bosses/galgoria/model.ts.
* No stun holds it: stuns wear its CC Gauge down instead (../gauge.ts), and empty, it is Down a while; it has no CC resist,
* as the playtest's. Its blows see past 500 points of a hero's defense (the playtest's PiercePower) and 300 of its dodge
* (its Persistent Life Force's hit chance). Now and then a blow of its is a crit (crit resist tells): a first guess.
*/
var GALGORIA = {
	id: "galgoria",
	name: "Galgoria",
	stats: {
		hp: HP[0],
		deals: "magical",
		physical: DEF[0],
		magical: DEF[0],
		block: NONE,
		dodge: NONE,
		crit: 100,
		resist: 0,
		pen: 500,
		acc: 300
	},
	stages: {
		room: scales(1),
		solo: scales(KR_PARTY / 8)
	},
	basic: [
		"left",
		"centre",
		"right"
	],
	rest: 3.1 - MOVES.spit.length,
	attacks: ATTACKS,
	plans: PLANS,
	moves: MOVES,
	join: galgoriaPart
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
* The frontline stands round the boss: on an arc this far from where the boss stands (Galgoria's middle:
* ../bosses/galgoria/model.ts), through where the frontline begins, each this far from the next (wide enough
* that the arc's ends come round toward the boss as the camera sees it). Its first ring holds this many, a
* second (behind it, in its gaps) the rest.
*/
var AROUND = 7.5;
var APART = 3 * ROOM;
var RING = 5;
/** The first ring's two ends (the furthest round, nearest the boss as the camera sees them) stand this much further back along the field. */
var ENDS_BACK = ROOM;
/**
* The frontline's spots round the boss, in the order its heroes take them: the first straight in front of it,
* then one either side in turn (behind first, then toward the camera), the last two drawn back (ENDS_BACK);
* once the first ring is full, a second behind it in its gaps, two rooms from each of the first's either side of it.
*/
function aroundBoss(count) {
	const middle = 7;
	const sin = APART / 2 / AROUND;
	const cos = Math.sqrt(1 - sin * sin);
	const cos2 = cos * cos - sin * sin;
	const sin2 = 2 * sin * cos;
	const ring = [
		[-.5, 0],
		[middle - AROUND * cos2, AROUND * sin2],
		[middle - AROUND * (cos2 * cos2 - sin2 * sin2) - ENDS_BACK, AROUND * 2 * sin2 * cos2]
	];
	const gap = ([ax, ay], [bx, by]) => {
		const dx = bx - ax;
		const dy = by - ay;
		const apart = Math.sqrt(dx * dx + dy * dy);
		const out = Math.sqrt(4 * ROOM * ROOM - apart * apart / 4) / apart;
		return [(ax + bx) / 2 - dy * out, (ay + by) / 2 + dx * out];
	};
	const gaps = [gap(ring[0], ring[1]), gap(ring[1], ring[2])];
	const spots = [];
	for (let i = 0; i < count; i++) {
		const first = i < RING;
		const k = first ? i : i - RING;
		const [x, y] = first ? ring[k + 1 >> 1] ?? ring[2] : gaps[k >> 1] ?? gaps[1];
		const side = k % 2 === (first ? 1 : 0) ? -1 : 1;
		spots.push([x, side * y]);
	}
	return spots;
}
/**
* Where each hero on the field stands, [along the field, toward the camera], by its line (`lines`, one
* for each hero, in its order). The frontline round the boss, side by side (aroundBoss). Then the middle,
* then the backline, each where its line begins or behind the one before it, whichever is further back
* (but never past the hindmost a full field reaches). Each of those is a room behind the last, in two rows,
* the back row in the front row's gaps and as far back as keeps it two rooms from the front row too (each
* three neighbours a triangle with sides of two rooms); one line is a room further again from the next.
*/
function formation(lines) {
	const spots = [];
	const front = aroundBoss(lines.filter((line) => line === "front").length);
	let placed = 0;
	let last = 0;
	lines.forEach((own, i) => {
		if (own !== "front") return;
		const spot = front[placed];
		spots[i] = spot;
		last = placed === 0 ? spot[0] : Math.min(last, spot[0]);
		placed++;
	});
	for (const line of LINES.slice(1)) {
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
/** The last of the run (of its time) in which they slow to a stop: before it, they run flat out. */
var BRAKE = .3;
/** A raid's run up to the boss, `k` of the way through it (0 to 1): how much of the way (MARCH_FROM) is still to go. */
function marchLeft(k) {
	const t = 1 - k;
	return t < BRAKE ? t * t / (BRAKE * 1.7) : (2 * t - BRAKE) / 1.7;
}
/**
* A hero's Auto (./fight.ts autoSkill): an ally below this share of its max HP is hurt (a heal is wanted); a status
* with less than this many seconds left is as good as gone (a skill that puts it up again is wanted); and over how
* many seconds the mana a hero gains is counted, to know how soon it will have a skill's.
*/
var AUTO = {
	hurt: .7,
	spare: 1,
	income: 8
};
var SECTION = 1e3;
var MAX_MANA = 6 * SECTION;
var MANA_PER_HP_LOST = 2e3;
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
/**
* King's Raid's class buffs, as its playtest has them at their most (every class alike, in every raid): a share more ATK and
* max HP for every hero (added up with the rest of each, as the game's are).
*/
var CLASS_BUFF = {
	atk: .52,
	hp: .52
};
/** What a blow of a hero's attack takes of the boss, before the boss's defense, where King's Raid's playtest doesn't say (./heroes/kr.ts); and how much harder a critical blow is (before its gear's crit damage). */
var BLOW = 1100;
//#endregion
//#region src/technomagic/sim/bosses/scalaxia/skills.ts
var FROST = {
	freezeAt: 10,
	lasts: 10,
	freeze: 3,
	takes: 1.3
};
var SMASH$2 = {
	frost: 2,
	health: 1 / 3
};
var BREATH$3 = { frost: 2 };
var STORM$1 = {
	mana: 1500,
	health: .42
};
var FROSTED = {
	name: "Frost",
	about: `At ${FROST.freezeAt} of it, Frozen.`,
	icon: "❄️",
	harmful: true
};
var FROZEN = {
	name: "Freeze",
	about: `Frozen: it can do nothing, and takes ${Math.round((FROST.takes - 1) * 100)}% more damage.`,
	icon: "🧊",
	harmful: true
};
function scalaxiaPart(fight) {
	const waits = cooldowns({
		claw: [5, 3],
		sweep: [20, 18],
		smashes: [13, 8],
		breath: [25, 15],
		storm: [45, 30]
	});
	/** A hero frozen: it can do nothing for a while, and takes more meanwhile (its Frost gone). */
	function freeze(fighter) {
		lift(fighter, FROSTED.name);
		fight.stagger(fighter);
		fighter.reserved = null;
		put(fighter.statuses, {
			name: FROZEN.name,
			left: FROST.freeze,
			binds: true,
			takes: FROST.takes,
			shown: FROZEN
		});
	}
	/** So much more Frost on a hero (none while it is frozen): at FROST.freezeAt, frozen. */
	function frost(fighter, by) {
		if (fighter.statuses.some((status) => status.name === FROZEN.name)) return;
		if (addStacks(fighter, FROSTED.name, by, FROST.freezeAt, FROST.lasts, () => ({ shown: FROSTED })) >= FROST.freezeAt) freeze(fighter);
	}
	return withDragonGauge(fight, {
		taken: { magical: .4 },
		lands: {
			smashes(part, amount) {
				all$1(fight, amount, (fighter) => frost(fighter, SMASH$2.frost), "smash");
				if (part === 0) fraction(fight, [fight.target()], SMASH$2.health);
			},
			breath(part, amount) {
				if (part >= 1) all$1(fight, amount, (fighter) => frost(fighter, BREATH$3.frost), "frost");
			},
			storm(part, amount) {
				if (part === 0) return;
				if (part < 3) return void fraction(fight, all$1(fight, amount, (fighter) => frost(fighter, 1), "storm"), STORM$1.health);
				all$1(fight, amount, (fighter) => {
					freeze(fighter);
					fighter.mana = Math.max(0, Math.min(MAX_MANA, fighter.mana - STORM$1.mana));
				}, "glacial");
			},
			bite: (_part, amount) => single(fight, amount, (fighter) => frost(fighter, 1)),
			claw: (_part, amount) => single(fight, amount, (fighter) => frost(fighter, 1)),
			sweep: (_part, amount) => void all$1(fight, amount, (fighter) => frost(fighter, 1), "sweep")
		},
		used(attack) {
			waits.used(attack);
			if (attack === "storm") fight.cue(null, "pillars");
		},
		ready: (attack) => waits.ready(attack) && (attack !== "storm" || opened(fight)),
		tick: waits.tick,
		beaten() {
			for (const fighter of fight.fighters) {
				lift(fighter, FROSTED.name);
				lift(fighter, FROZEN.name);
			}
		}
	});
}
//#endregion
//#region src/technomagic/sim/bosses/scalaxia/index.ts
/**
* Scalaxia, the ancient blue dragon of ice, of Turandana (the Dragon Raid's Frost Dragon). As in King's Raid, its blows
* leave Frost, ten of which freeze a hero, and it flies up to freeze them all. Its blows are magical. It stands M.DMG as
* the playtest has it: it blocks it whenever it can (1000 M.Block, 750 on the game's curve), a blocked blow cut the more
* for its 1000 M.Block power (368 more on its curve), 200 M.Tough, and 60% less M.DMG taken (./skills.ts). What its skills do
* is ./skills.ts; its body is the page's (../../../bosses/dragon/), with the ice pillars its storm calls up.
*/
var SCALAXIA = {
	id: "scalaxia",
	name: "Scalaxia",
	stats: {
		hp: FIRST$1.hp,
		deals: "magical",
		physical: FIRST$1.def,
		magical: FIRST$1.high,
		...OPEN,
		block: {
			physical: 0,
			magical: 1e3
		},
		blockDef: {
			physical: 0,
			magical: 1
		},
		tough: {
			physical: 0,
			magical: 200
		}
	},
	stages: dragonStages(),
	basic: ["bite"],
	rest: restFor(2.3),
	time: 180,
	waves: dragonWaves("scalaxia"),
	attacks: [
		{
			name: "bite",
			label: "Bite"
		},
		{
			name: "claw",
			label: "Claw"
		},
		{
			name: "sweep",
			label: "Tail Sweep"
		},
		{
			name: "smashes",
			label: "Tail Smash"
		},
		{
			name: "breath",
			label: "Frost Breath"
		},
		{
			name: "storm",
			label: "Glacial Storm"
		}
	],
	plans: {
		bite: PLANS$1.bite,
		claw: PLANS$1.claw,
		sweep: PLANS$1.sweep,
		smashes: PLANS$1.smashes,
		breath: PLANS$1.breath,
		storm: PLANS$1.storm
	},
	moves: MOVES$1,
	join: scalaxiaPart
};
//#endregion
//#region src/technomagic/sim/bosses/temeraire/skills.ts
var BLESSING$2 = {
	charges: 150,
	deals: 1.5,
	physical: .4,
	cooldown: 30
};
var BREATH$2 = {
	burn: .12,
	lasts: 6
};
var TAIL = 2 / 3;
var RAGE = .73;
var FLAME$1 = "Blessing of the Flame";
var BURN = {
	name: "Burn",
	about: `Fire eats at it every second: ${Math.round(BREATH$2.burn * 100)}% of the breath's blow.`,
	icon: "🔥",
	harmful: true
};
function temerairePart(fight) {
	const { foe } = fight;
	const waits = cooldowns({
		claw: [5, 3],
		sweep: [13, 8],
		breath: [25, 15],
		blessing: BLESSING$2.cooldown,
		eruption: [45, 30]
	});
	/** What of its flame is left (0: none on it), and how hard each hero's burn is. */
	let flame = 0;
	const burns = /* @__PURE__ */ new Map();
	const burning = dot(fight, BURN.name, (fighter) => burns.get(fighter) ?? 0);
	/** Its flame, on it as a status: so much harder, and P.DMG softer on it, with what is left of it. */
	function kindle(left) {
		flame = left;
		if (flame <= 0) {
			const at = foe.statuses.findIndex((status) => status.name === FLAME$1);
			if (at >= 0) foe.statuses.splice(at, 1);
			return;
		}
		put(foe.statuses, {
			name: FLAME$1,
			left: Infinity,
			deals: BLESSING$2.deals,
			takes: { physical: BLESSING$2.physical },
			count: flame,
			shown: "burn"
		});
	}
	return withDragonGauge(fight, {
		lands: {
			blessing(_part, amount) {
				all$1(fight, amount, void 0, "blessing");
				kindle(BLESSING$2.charges);
			},
			breath(part, amount) {
				if (part < 1) return;
				all$1(fight, amount, (fighter) => {
					burns.set(fighter, Math.max(fighter.statuses.some((status) => status.name === BURN.name) ? burns.get(fighter) ?? 0 : 0, amount * BREATH$2.burn));
					put(fighter.statuses, {
						name: BURN.name,
						left: BREATH$2.lasts,
						shown: BURN
					});
				}, "flame");
			},
			eruption(part, amount) {
				if (part === 1) fraction(fight, all$1(fight, amount, void 0, "eruption"), RAGE);
			},
			bite: (_part, amount) => single(fight, amount),
			claw: (_part, amount) => single(fight, amount),
			sweep(_part, amount) {
				all$1(fight, amount, void 0, "sweep");
				fraction(fight, [fight.target()], TAIL);
			}
		},
		struck() {
			if (flame > 0) kindle(flame - 1);
		},
		used: waits.used,
		next: () => flame <= 0 && waits.ready("blessing") ? "blessing" : null,
		ready: (attack) => attack !== "blessing" && waits.ready(attack) && (attack !== "eruption" || opened(fight)),
		tick(dt) {
			waits.tick(dt);
			burning(dt);
		},
		beaten() {
			kindle(0);
			for (const fighter of fight.fighters) lift(fighter, BURN.name);
		},
		marks: () => []
	});
}
//#endregion
//#region src/technomagic/sim/bosses/temeraire/index.ts
/**
* Temeraire, the ancient red dragon of fire, of Dragia (the Dragon Raid's Fire Dragon). As in King's Raid, all its
* attacks deal massive M.DMG, it shrugs off most P.DMG (the playtest's 900 P.Tough, where the game's tip has it blocking it all), and its Blessing of the Flame is worn away by heroes that hit often.
* What its skills do is ./skills.ts; its body is the page's (../../../bosses/dragon/).
*/
var TEMERAIRE = {
	id: "temeraire",
	name: "Temeraire",
	stats: {
		hp: FIRST$1.hp,
		deals: "magical",
		physical: FIRST$1.high,
		magical: FIRST$1.def,
		...OPEN,
		tough: {
			physical: 900,
			magical: 0
		}
	},
	stages: dragonStages({ atk: FIRE_ATK }),
	basic: ["bite"],
	rest: restFor(2.4),
	time: 180,
	waves: dragonWaves("temeraire"),
	attacks: [
		{
			name: "bite",
			label: "Bite"
		},
		{
			name: "claw",
			label: "Claw"
		},
		{
			name: "sweep",
			label: "Tail Sweep"
		},
		{
			name: "breath",
			label: "Flame Breath"
		},
		{
			name: "blessing",
			label: "Blessing of the Flame"
		},
		{
			name: "eruption",
			label: "Eruption"
		}
	],
	plans: {
		bite: PLANS$1.bite,
		claw: PLANS$1.claw,
		sweep: PLANS$1.sweep,
		breath: PLANS$1.breath,
		blessing: PLANS$1.roar,
		eruption: PLANS$1.eclipse
	},
	moves: MOVES$1,
	join: temerairePart
};
//#endregion
//#region src/technomagic/sim/bosses/zyrrkinoth/skills.ts
var SCALES = {
	critResist: 400,
	per: .03,
	most: 30
};
var POISON$1 = {
	petrifyAt: 30,
	lasts: 12,
	petrify: 5,
	hurts: 4e3,
	blow: 2
};
var LASH = {
	stacks: 5,
	knock: .6
};
var BREATH$1 = { stacks: 3 };
var POISONED$1 = {
	name: "Poison",
	about: `Eats at it every second, the more for every stack; at ${POISON$1.petrifyAt}, Petrified.`,
	icon: "🧪",
	harmful: true
};
var PETRIFIED = {
	name: "Petrified",
	about: "Turned to stone: it can do nothing.",
	icon: "🗿",
	harmful: true
};
function zyrrkinothPart(fight) {
	const waits = cooldowns({
		claw: [5, 2.5],
		smashes: [15, 8],
		breath: [25, 12],
		sweep: [20, 10]
	});
	/** The critical blows it has taken (up to SCALES.most): each has it take more. */
	let cracks = 0;
	const taken = {
		physical: 1,
		magical: 1
	};
	const eating = dot(fight, POISONED$1.name, (fighter) => stacksOf(fighter, POISONED$1.name) * POISON$1.hurts);
	/** So much more Poison on a hero (none while it is stone): at POISON.petrifyAt, Petrified. */
	function poison(fighter, by) {
		if (fighter.statuses.some((status) => status.name === PETRIFIED.name)) return;
		if (addStacks(fighter, POISONED$1.name, by, POISON$1.petrifyAt, POISON$1.lasts, () => ({ shown: POISONED$1 })) < POISON$1.petrifyAt) return;
		lift(fighter, POISONED$1.name);
		fight.stagger(fighter);
		fighter.reserved = null;
		put(fighter.statuses, {
			name: PETRIFIED.name,
			left: POISON$1.petrify,
			binds: true,
			shown: PETRIFIED
		});
		fight.cue(null, "petrify", [fighter]);
	}
	return withDragonGauge(fight, {
		lands: {
			smashes: (_part, amount) => void all$1(fight, amount, (fighter) => {
				poison(fighter, LASH.stacks);
				if (fighter.hp > 0) fight.knock(fighter, LASH.knock);
			}, "lash"),
			breath(part, amount) {
				if (part >= 1) all$1(fight, amount, (fighter) => poison(fighter, BREATH$1.stacks), "venom");
			},
			bite: (_part, amount) => single(fight, amount, (fighter) => poison(fighter, POISON$1.blow)),
			claw: (_part, amount) => single(fight, amount, (fighter) => poison(fighter, POISON$1.blow)),
			sweep: (_part, amount) => void all$1(fight, amount, (fighter) => poison(fighter, POISON$1.blow), "sweep")
		},
		struck(_by, _dealt, critical) {
			if (!critical || cracks >= SCALES.most) return;
			cracks++;
			taken.physical = taken.magical = 1 + SCALES.per * cracks;
		},
		critResist: SCALES.critResist,
		taken,
		steady: true,
		used: waits.used,
		ready: waits.ready,
		tick(dt) {
			waits.tick(dt);
			eating(dt);
		},
		beaten() {
			for (const fighter of fight.fighters) {
				lift(fighter, POISONED$1.name);
				lift(fighter, PETRIFIED.name);
			}
		},
		marks: () => [{
			text: `Toxic Scales ${Math.round(taken.physical * 100)}%`,
			tone: "venom"
		}]
	});
}
//#endregion
//#region src/technomagic/sim/bosses/zyrrkinoth/index.ts
/**
* Zyrrkinoth, the ancient green venomous dragon, of Grimvine (the Dragon Raid's Poison Dragon). As in King's Raid, it has
* very high Crit Resistance and DMG Reduction, but takes more damage each time it takes Crit DMG; nothing changes its ATK
* Spd; and its poison, stacked high enough, petrifies. Its blows are physical. What its skills do is ./skills.ts; its body
* is the page's (../../../bosses/dragon/).
*/
var ZYRRKINOTH = {
	id: "zyrrkinoth",
	name: "Zyrrkinoth",
	stats: {
		hp: FIRST$1.hp,
		deals: "physical",
		physical: FIRST$1.def,
		magical: FIRST$1.def,
		...OPEN,
		tough: {
			physical: 900,
			magical: 900
		}
	},
	stages: dragonStages(),
	basic: ["bite"],
	rest: restFor(2.3),
	time: 180,
	waves: dragonWaves("zyrrkinoth"),
	attacks: [
		{
			name: "bite",
			label: "Bite"
		},
		{
			name: "claw",
			label: "Claw"
		},
		{
			name: "sweep",
			label: "Tail Sweep"
		},
		{
			name: "smashes",
			label: "Tail Lash"
		},
		{
			name: "breath",
			label: "Venomous Breath"
		}
	],
	plans: {
		bite: PLANS$1.bite,
		claw: PLANS$1.claw,
		sweep: PLANS$1.sweep,
		smashes: PLANS$1.smashes,
		breath: PLANS$1.breath
	},
	moves: MOVES$1,
	join: zyrrkinothPart
};
//#endregion
//#region src/technomagic/sim/bosses/index.ts
/** The bosses of the TechnoMagic Raid there are so far: the first is the one fought unless another is asked for. */
var TM_BOSSES = [GALGORIA];
/** The Dragon Raid's dragons, as King's Raid has them: Fire, Frost, Poison and Black. */
var DRAGONS = [
	TEMERAIRE,
	SCALAXIA,
	ZYRRKINOTH,
	ARMARTA
];
/** Every boss there is. */
var BOSSES = [...TM_BOSSES, ...DRAGONS];
//#endregion
//#region src/technomagic/sim/bosses/boss.ts
/** How many stages a boss has: the higher, the harder it is on the heroes (as its stages say). */
var stagesOf = (def) => def.stages.room.length;
/** A boss's scale at `stage` (1 to its last; past it, its last), alone or not. */
function scaleAt(def, stage, solo) {
	const row = solo ? def.stages.solo : def.stages.room;
	return row[Math.min(row.length, Math.max(1, Math.floor(stage) || 1)) - 1] ?? {
		hp: 1,
		deals: 1,
		level: 100
	};
}
//#endregion
//#region src/technomagic/sim/gear/kr-data.ts
/** A piece's main stat's base, times its refinement's factor (R1 to R5: thousandths, at max level) for its kind of stat. */
var KR_REFINE$1 = {
	"atk": [
		4730,
		5160,
		5590,
		6020,
		6450
	],
	"hp": [
		4730,
		5160,
		5590,
		6020,
		6450
	],
	"def": [
		4730,
		5375,
		6235,
		7310,
		8600
	]
};
/** Each option pool (by the KR option groups it is), every option in it. */
var KR_POOLS$1 = {
	"18": [
		{
			"stat": "atk",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "hp",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "defPhysical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "defMagical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "crit",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "acc",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "pen",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "critDamage",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "blockPhysical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "dodgePhysical",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "speed",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "lifesteal",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "resist",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "critResistPhysical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "critResistMagical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "manaAttack",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "dodgeMagical",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "blockMagical",
			"min": .24,
			"max": .32,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "accuracy",
			"min": .12,
			"max": .16,
			"steps": 2,
			"weight": 1e3
		},
		{
			"stat": "manaRegen",
			"min": .36,
			"max": .48,
			"steps": 2,
			"weight": 1e3
		}
	],
	"6411": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6421": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6431": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7411": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7421": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7431": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8411": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8421": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8431": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8431+8432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8421+8422": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6431+6432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7411+7412": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7431+7432": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6441+6442": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7421+7422": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8411+8412": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"8441+8442": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6421+6422": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"6411+6412": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	],
	"7441+7442": [
		{
			"stat": "atk",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "speed",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "crit",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "pen",
			"min": .038,
			"max": .075,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "critDamage",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "lifesteal",
			"min": .023,
			"max": .045,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "hp",
			"min": .045,
			"max": .09,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defPhysical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "defMagical",
			"min": .06,
			"max": .12,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockPhysical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		},
		{
			"stat": "blockMagical",
			"min": .075,
			"max": .15,
			"steps": 10,
			"weight": 18
		}
	]
};
var KR_PIECES$1 = [
	{
		"id": "authority-wizard-armor",
		"code": "TECHNOMAGIC_WIZARD_9_1_3",
		"name": "Wisdom of Authority Robe",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_1_3"
	},
	{
		"id": "authority-archer-necklace",
		"code": "TECHNOMAGIC_ARCHER_9_5_3",
		"name": "Wrath of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["archer"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_5_3"
	},
	{
		"id": "hope-assassin-orb",
		"code": "TECHNOMAGIC_ASSASSIN_9_7_2",
		"name": "Coldness of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_7_2"
	},
	{
		"id": "authority-knight-bracelet",
		"code": "TECHNOMAGIC_KNIGHT_9_6_3",
		"name": "Protection of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["knight"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_6_3"
	},
	{
		"id": "authority-mechanic-secondary",
		"code": "TECHNOMAGIC_MECHANIC_9_2_3",
		"name": "Passion of Authority Shoes",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_2_3"
	},
	{
		"id": "authority-wizard-bracelet",
		"code": "TECHNOMAGIC_WIZARD_9_6_3",
		"name": "Wisdom of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["wizard"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_6_3"
	},
	{
		"id": "hope-priest-bracelet",
		"code": "TECHNOMAGIC_PRIEST_9_6_2",
		"name": "Blessing of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["priest"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_6_2"
	},
	{
		"id": "authority-mechanic-armor",
		"code": "TECHNOMAGIC_MECHANIC_9_1_3",
		"name": "Passion of Authority Clothes",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_1_3"
	},
	{
		"id": "hope-assassin-armor",
		"code": "TECHNOMAGIC_ASSASSIN_9_1_2",
		"name": "Coldness of Hope Jacket",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_1_2"
	},
	{
		"id": "perseverance-knight-ring",
		"code": "TECHNOMAGIC_KNIGHT_9_3_1",
		"name": "Protection of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_3_1"
	},
	{
		"id": "authority-wizard-necklace",
		"code": "TECHNOMAGIC_WIZARD_9_5_3",
		"name": "Wisdom of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_5_3"
	},
	{
		"id": "authority-archer-armor",
		"code": "TECHNOMAGIC_ARCHER_9_1_3",
		"name": "Wrath of Authority Pauldron",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_1_3"
	},
	{
		"id": "perseverance-priest-necklace",
		"code": "TECHNOMAGIC_PRIEST_9_5_1",
		"name": "Blessing of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_5_1"
	},
	{
		"id": "authority-assassin-earrings",
		"code": "TECHNOMAGIC_ASSASSIN_9_4_3",
		"name": "Coldness of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["assassin"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_4_3"
	},
	{
		"id": "hope-assassin-secondary",
		"code": "TECHNOMAGIC_ASSASSIN_9_2_2",
		"name": "Coldness of Hope Gloves",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_2_2"
	},
	{
		"id": "perseverance-knight-armor",
		"code": "TECHNOMAGIC_KNIGHT_9_1_1",
		"name": "Protection of Perseverance Heavy Armor",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_1_1"
	},
	{
		"id": "hope-knight-earrings",
		"code": "TECHNOMAGIC_KNIGHT_9_4_2",
		"name": "Protection of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["knight"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_4_2"
	},
	{
		"id": "perseverance-priest-orb",
		"code": "TECHNOMAGIC_PRIEST_9_7_1",
		"name": "Blessing of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_7_1"
	},
	{
		"id": "hope-priest-secondary",
		"code": "TECHNOMAGIC_PRIEST_9_2_2",
		"name": "Blessing of Hope Hood",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_2_2"
	},
	{
		"id": "authority-wizard-ring",
		"code": "TECHNOMAGIC_WIZARD_9_3_3",
		"name": "Wisdom of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_3_3"
	},
	{
		"id": "perseverance-warrior-ring",
		"code": "TECHNOMAGIC_WARRIOR_9_3_1",
		"name": "Courage of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_3_1"
	},
	{
		"id": "authority-warrior-ring",
		"code": "TECHNOMAGIC_WARRIOR_9_3_3",
		"name": "Courage of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_3_3"
	},
	{
		"id": "hope-warrior-ring",
		"code": "TECHNOMAGIC_WARRIOR_9_3_2",
		"name": "Courage of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_3_2"
	},
	{
		"id": "perseverance-knight-orb",
		"code": "TECHNOMAGIC_KNIGHT_9_7_1",
		"name": "Protection of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_7_1"
	},
	{
		"id": "perseverance-warrior-secondary",
		"code": "TECHNOMAGIC_WARRIOR_9_2_1",
		"name": "Courage of Perseverance Helmet",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_2_1"
	},
	{
		"id": "hope-warrior-secondary",
		"code": "TECHNOMAGIC_WARRIOR_9_2_2",
		"name": "Courage of Hope Helmet",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_2_2"
	},
	{
		"id": "authority-warrior-secondary",
		"code": "TECHNOMAGIC_WARRIOR_9_2_3",
		"name": "Courage of Authority Helmet",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_2_3"
	},
	{
		"id": "perseverance-priest-armor",
		"code": "TECHNOMAGIC_PRIEST_9_1_1",
		"name": "Blessing of Perseverance Cape",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_1_1"
	},
	{
		"id": "authority-warrior-armor",
		"code": "TECHNOMAGIC_WARRIOR_9_1_3",
		"name": "Courage of Authority Armor",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_1_3"
	},
	{
		"id": "hope-warrior-armor",
		"code": "TECHNOMAGIC_WARRIOR_9_1_2",
		"name": "Courage of Hope Armor",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_1_2"
	},
	{
		"id": "perseverance-warrior-armor",
		"code": "TECHNOMAGIC_WARRIOR_9_1_1",
		"name": "Courage of Perseverance Armor",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["warrior"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WARRIOR_9_1_1"
	},
	{
		"id": "authority-assassin-ring",
		"code": "TECHNOMAGIC_ASSASSIN_9_3_3",
		"name": "Coldness of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_3_3"
	},
	{
		"id": "hope-knight-secondary",
		"code": "TECHNOMAGIC_KNIGHT_9_2_2",
		"name": "Protection of Hope Shield",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_2_2"
	},
	{
		"id": "perseverance-archer-bracelet",
		"code": "TECHNOMAGIC_ARCHER_9_6_1",
		"name": "Wrath of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_6_1"
	},
	{
		"id": "hope-knight-armor",
		"code": "TECHNOMAGIC_KNIGHT_9_1_2",
		"name": "Protection of Hope Heavy Armor",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_1_2"
	},
	{
		"id": "hope-priest-orb",
		"code": "TECHNOMAGIC_PRIEST_9_7_2",
		"name": "Blessing of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_7_2"
	},
	{
		"id": "perseverance-warrior-orb",
		"code": "TECHNOMAGIC_WARRIOR_9_7_1",
		"name": "Courage of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_7_1"
	},
	{
		"id": "authority-warrior-orb",
		"code": "TECHNOMAGIC_WARRIOR_9_7_3",
		"name": "Courage of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_7_3"
	},
	{
		"id": "hope-warrior-orb",
		"code": "TECHNOMAGIC_WARRIOR_9_7_2",
		"name": "Courage of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["warrior"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_7_2"
	},
	{
		"id": "hope-assassin-bracelet",
		"code": "TECHNOMAGIC_ASSASSIN_9_6_2",
		"name": "Coldness of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_6_2"
	},
	{
		"id": "perseverance-knight-necklace",
		"code": "TECHNOMAGIC_KNIGHT_9_5_1",
		"name": "Protection of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["knight"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_5_1"
	},
	{
		"id": "perseverance-warrior-bracelet",
		"code": "TECHNOMAGIC_WARRIOR_9_6_1",
		"name": "Courage of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["warrior"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_6_1"
	},
	{
		"id": "hope-warrior-bracelet",
		"code": "TECHNOMAGIC_WARRIOR_9_6_2",
		"name": "Courage of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["warrior"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_6_2"
	},
	{
		"id": "authority-warrior-bracelet",
		"code": "TECHNOMAGIC_WARRIOR_9_6_3",
		"name": "Courage of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["warrior"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_6_3"
	},
	{
		"id": "perseverance-priest-ring",
		"code": "TECHNOMAGIC_PRIEST_9_3_1",
		"name": "Blessing of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_3_1"
	},
	{
		"id": "authority-warrior-necklace",
		"code": "TECHNOMAGIC_WARRIOR_9_5_3",
		"name": "Courage of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["warrior"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_5_3"
	},
	{
		"id": "hope-warrior-necklace",
		"code": "TECHNOMAGIC_WARRIOR_9_5_2",
		"name": "Courage of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["warrior"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_5_2"
	},
	{
		"id": "perseverance-warrior-necklace",
		"code": "TECHNOMAGIC_WARRIOR_9_5_1",
		"name": "Courage of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["warrior"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_5_1"
	},
	{
		"id": "authority-wizard-orb",
		"code": "TECHNOMAGIC_WIZARD_9_7_3",
		"name": "Wisdom of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_7_3"
	},
	{
		"id": "perseverance-archer-earrings",
		"code": "TECHNOMAGIC_ARCHER_9_4_1",
		"name": "Wrath of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["archer"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_4_1"
	},
	{
		"id": "hope-warrior-earrings",
		"code": "TECHNOMAGIC_WARRIOR_9_4_2",
		"name": "Courage of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["warrior"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_4_2"
	},
	{
		"id": "authority-warrior-earrings",
		"code": "TECHNOMAGIC_WARRIOR_9_4_3",
		"name": "Courage of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["warrior"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_4_3"
	},
	{
		"id": "perseverance-warrior-earrings",
		"code": "TECHNOMAGIC_WARRIOR_9_4_1",
		"name": "Courage of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["warrior"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WARRIOR_9_4_1"
	},
	{
		"id": "hope-wizard-armor",
		"code": "TECHNOMAGIC_WIZARD_9_1_2",
		"name": "Wisdom of Hope Robe",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_1_2"
	},
	{
		"id": "perseverance-knight-secondary",
		"code": "TECHNOMAGIC_KNIGHT_9_2_1",
		"name": "Protection of Perseverance Shield",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_2_1"
	},
	{
		"id": "perseverance-mechanic-bracelet",
		"code": "TECHNOMAGIC_MECHANIC_9_6_1",
		"name": "Passion of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_6_1"
	},
	{
		"id": "perseverance-priest-earrings",
		"code": "TECHNOMAGIC_PRIEST_9_4_1",
		"name": "Blessing of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["priest"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_4_1"
	},
	{
		"id": "authority-assassin-orb",
		"code": "TECHNOMAGIC_ASSASSIN_9_7_3",
		"name": "Coldness of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_7_3"
	},
	{
		"id": "hope-knight-bracelet",
		"code": "TECHNOMAGIC_KNIGHT_9_6_2",
		"name": "Protection of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["knight"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_6_2"
	},
	{
		"id": "perseverance-archer-secondary",
		"code": "TECHNOMAGIC_ARCHER_9_2_1",
		"name": "Wrath of Perseverance Cloak",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_2_1"
	},
	{
		"id": "hope-knight-necklace",
		"code": "TECHNOMAGIC_KNIGHT_9_5_2",
		"name": "Protection of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["knight"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_5_2"
	},
	{
		"id": "hope-priest-ring",
		"code": "TECHNOMAGIC_PRIEST_9_3_2",
		"name": "Blessing of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_3_2"
	},
	{
		"id": "perseverance-wizard-secondary",
		"code": "TECHNOMAGIC_WIZARD_9_2_1",
		"name": "Wisdom of Perseverance Hat",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_2_1"
	},
	{
		"id": "hope-archer-earrings",
		"code": "TECHNOMAGIC_ARCHER_9_4_2",
		"name": "Wrath of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["archer"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_4_2"
	},
	{
		"id": "perseverance-mechanic-earrings",
		"code": "TECHNOMAGIC_MECHANIC_9_4_1",
		"name": "Passion of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["mechanic"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_4_1"
	},
	{
		"id": "hope-knight-ring",
		"code": "TECHNOMAGIC_KNIGHT_9_3_2",
		"name": "Protection of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_3_2"
	},
	{
		"id": "hope-wizard-necklace",
		"code": "TECHNOMAGIC_WIZARD_9_5_2",
		"name": "Wisdom of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_5_2"
	},
	{
		"id": "perseverance-knight-bracelet",
		"code": "TECHNOMAGIC_KNIGHT_9_6_1",
		"name": "Protection of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["knight"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_6_1"
	},
	{
		"id": "hope-priest-necklace",
		"code": "TECHNOMAGIC_PRIEST_9_5_2",
		"name": "Blessing of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_5_2"
	},
	{
		"id": "perseverance-mechanic-secondary",
		"code": "TECHNOMAGIC_MECHANIC_9_2_1",
		"name": "Passion of Perseverance Shoes",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_2_1"
	},
	{
		"id": "hope-assassin-earrings",
		"code": "TECHNOMAGIC_ASSASSIN_9_4_2",
		"name": "Coldness of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["assassin"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_4_2"
	},
	{
		"id": "authority-mechanic-orb",
		"code": "TECHNOMAGIC_MECHANIC_9_7_3",
		"name": "Passion of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_7_3"
	},
	{
		"id": "hope-mechanic-earrings",
		"code": "TECHNOMAGIC_MECHANIC_9_4_2",
		"name": "Passion of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["mechanic"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_4_2"
	},
	{
		"id": "perseverance-wizard-bracelet",
		"code": "TECHNOMAGIC_WIZARD_9_6_1",
		"name": "Wisdom of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["wizard"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_6_1"
	},
	{
		"id": "perseverance-assassin-secondary",
		"code": "TECHNOMAGIC_ASSASSIN_9_2_1",
		"name": "Coldness of Perseverance Gloves",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_2_1"
	},
	{
		"id": "authority-archer-orb",
		"code": "TECHNOMAGIC_ARCHER_9_7_3",
		"name": "Wrath of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_7_3"
	},
	{
		"id": "perseverance-knight-earrings",
		"code": "TECHNOMAGIC_KNIGHT_9_4_1",
		"name": "Protection of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["knight"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_4_1"
	},
	{
		"id": "hope-assassin-necklace",
		"code": "TECHNOMAGIC_ASSASSIN_9_5_2",
		"name": "Coldness of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["assassin"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_5_2"
	},
	{
		"id": "perseverance-wizard-earrings",
		"code": "TECHNOMAGIC_WIZARD_9_4_1",
		"name": "Wisdom of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["wizard"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_4_1"
	},
	{
		"id": "perseverance-assassin-earrings",
		"code": "TECHNOMAGIC_ASSASSIN_9_4_1",
		"name": "Coldness of Perseverance Earrings",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["assassin"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_4_1"
	},
	{
		"id": "hope-knight-orb",
		"code": "TECHNOMAGIC_KNIGHT_9_7_2",
		"name": "Protection of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_7_2"
	},
	{
		"id": "hope-priest-armor",
		"code": "TECHNOMAGIC_PRIEST_9_1_2",
		"name": "Blessing of Hope Cape",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_1_2"
	},
	{
		"id": "hope-priest-earrings",
		"code": "TECHNOMAGIC_PRIEST_9_4_2",
		"name": "Blessing of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["priest"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_4_2"
	},
	{
		"id": "authority-mechanic-ring",
		"code": "TECHNOMAGIC_MECHANIC_9_3_3",
		"name": "Passion of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_3_3"
	},
	{
		"id": "hope-archer-bracelet",
		"code": "TECHNOMAGIC_ARCHER_9_6_2",
		"name": "Wrath of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_6_2"
	},
	{
		"id": "authority-knight-armor",
		"code": "TECHNOMAGIC_KNIGHT_9_1_3",
		"name": "Protection of Authority Heavy Armor",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defPhysical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_1_3"
	},
	{
		"id": "authority-priest-orb",
		"code": "TECHNOMAGIC_PRIEST_9_7_3",
		"name": "Blessing of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_7_3"
	},
	{
		"id": "perseverance-assassin-bracelet",
		"code": "TECHNOMAGIC_ASSASSIN_9_6_1",
		"name": "Coldness of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_6_1"
	},
	{
		"id": "hope-mechanic-necklace",
		"code": "TECHNOMAGIC_MECHANIC_9_5_2",
		"name": "Passion of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["mechanic"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_5_2"
	},
	{
		"id": "perseverance-wizard-ring",
		"code": "TECHNOMAGIC_WIZARD_9_3_1",
		"name": "Wisdom of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_3_1"
	},
	{
		"id": "authority-archer-ring",
		"code": "TECHNOMAGIC_ARCHER_9_3_3",
		"name": "Wrath of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_3_3"
	},
	{
		"id": "hope-wizard-earrings",
		"code": "TECHNOMAGIC_WIZARD_9_4_2",
		"name": "Wisdom of Hope Earrings",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["wizard"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_4_2"
	},
	{
		"id": "hope-archer-necklace",
		"code": "TECHNOMAGIC_ARCHER_9_5_2",
		"name": "Wrath of Hope Necklace",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["archer"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_5_2"
	},
	{
		"id": "perseverance-wizard-armor",
		"code": "TECHNOMAGIC_WIZARD_9_1_1",
		"name": "Wisdom of Perseverance Robe",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_1_1"
	},
	{
		"id": "hope-archer-secondary",
		"code": "TECHNOMAGIC_ARCHER_9_2_2",
		"name": "Wrath of Hope Cloak",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_2_2"
	},
	{
		"id": "authority-knight-necklace",
		"code": "TECHNOMAGIC_KNIGHT_9_5_3",
		"name": "Protection of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["knight"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_5_3"
	},
	{
		"id": "authority-priest-ring",
		"code": "TECHNOMAGIC_PRIEST_9_3_3",
		"name": "Blessing of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["priest"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_3_3"
	},
	{
		"id": "hope-wizard-secondary",
		"code": "TECHNOMAGIC_WIZARD_9_2_2",
		"name": "Wisdom of Hope Hat",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_2_2"
	},
	{
		"id": "perseverance-priest-bracelet",
		"code": "TECHNOMAGIC_PRIEST_9_6_1",
		"name": "Blessing of Perseverance Bracelet",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["priest"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_6_1"
	},
	{
		"id": "hope-mechanic-armor",
		"code": "TECHNOMAGIC_MECHANIC_9_1_2",
		"name": "Passion of Hope Clothes",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_1_2"
	},
	{
		"id": "authority-archer-earrings",
		"code": "TECHNOMAGIC_ARCHER_9_4_3",
		"name": "Wrath of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["archer"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_4_3"
	},
	{
		"id": "authority-assassin-armor",
		"code": "TECHNOMAGIC_ASSASSIN_9_1_3",
		"name": "Coldness of Authority Jacket",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_1_3"
	},
	{
		"id": "hope-archer-armor",
		"code": "TECHNOMAGIC_ARCHER_9_1_2",
		"name": "Wrath of Hope Pauldron",
		"set": "hope",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_1_2"
	},
	{
		"id": "authority-knight-ring",
		"code": "TECHNOMAGIC_KNIGHT_9_3_3",
		"name": "Protection of Authority Ring",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_3_3"
	},
	{
		"id": "hope-mechanic-orb",
		"code": "TECHNOMAGIC_MECHANIC_9_7_2",
		"name": "Passion of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_7_2"
	},
	{
		"id": "hope-wizard-bracelet",
		"code": "TECHNOMAGIC_WIZARD_9_6_2",
		"name": "Wisdom of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["wizard"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_6_2"
	},
	{
		"id": "perseverance-priest-secondary",
		"code": "TECHNOMAGIC_PRIEST_9_2_1",
		"name": "Blessing of Perseverance Hood",
		"set": "perseverance",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_2_1"
	},
	{
		"id": "hope-wizard-ring",
		"code": "TECHNOMAGIC_WIZARD_9_3_2",
		"name": "Wisdom of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_3_2"
	},
	{
		"id": "hope-archer-orb",
		"code": "TECHNOMAGIC_ARCHER_9_7_2",
		"name": "Wrath of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_7_2"
	},
	{
		"id": "authority-assassin-necklace",
		"code": "TECHNOMAGIC_ASSASSIN_9_5_3",
		"name": "Coldness of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["assassin"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_5_3"
	},
	{
		"id": "perseverance-mechanic-orb",
		"code": "TECHNOMAGIC_MECHANIC_9_7_1",
		"name": "Passion of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_7_1"
	},
	{
		"id": "authority-knight-orb",
		"code": "TECHNOMAGIC_KNIGHT_9_7_3",
		"name": "Protection of Authority Orb",
		"set": "authority",
		"tier": 9,
		"part": "orb",
		"classes": ["knight"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_7_3"
	},
	{
		"id": "hope-mechanic-ring",
		"code": "TECHNOMAGIC_MECHANIC_9_3_2",
		"name": "Passion of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_3_2"
	},
	{
		"id": "authority-assassin-secondary",
		"code": "TECHNOMAGIC_ASSASSIN_9_2_3",
		"name": "Coldness of Authority Gloves",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_2_3"
	},
	{
		"id": "perseverance-archer-orb",
		"code": "TECHNOMAGIC_ARCHER_9_7_1",
		"name": "Wrath of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_7_1"
	},
	{
		"id": "perseverance-mechanic-necklace",
		"code": "TECHNOMAGIC_MECHANIC_9_5_1",
		"name": "Passion of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["mechanic"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_5_1"
	},
	{
		"id": "hope-wizard-orb",
		"code": "TECHNOMAGIC_WIZARD_9_7_2",
		"name": "Wisdom of Hope Orb",
		"set": "hope",
		"tier": 9,
		"part": "orb",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_7_2"
	},
	{
		"id": "hope-archer-ring",
		"code": "TECHNOMAGIC_ARCHER_9_3_2",
		"name": "Wrath of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_3_2"
	},
	{
		"id": "authority-wizard-earrings",
		"code": "TECHNOMAGIC_WIZARD_9_4_3",
		"name": "Wisdom of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["wizard"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_4_3"
	},
	{
		"id": "perseverance-archer-necklace",
		"code": "TECHNOMAGIC_ARCHER_9_5_1",
		"name": "Wrath of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["archer"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_5_1"
	},
	{
		"id": "hope-mechanic-bracelet",
		"code": "TECHNOMAGIC_MECHANIC_9_6_2",
		"name": "Passion of Hope Bracelet",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_6_2"
	},
	{
		"id": "perseverance-mechanic-ring",
		"code": "TECHNOMAGIC_MECHANIC_9_3_1",
		"name": "Passion of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["mechanic"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_3_1"
	},
	{
		"id": "authority-assassin-bracelet",
		"code": "TECHNOMAGIC_ASSASSIN_9_6_3",
		"name": "Coldness of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_6_3"
	},
	{
		"id": "perseverance-wizard-orb",
		"code": "TECHNOMAGIC_WIZARD_9_7_1",
		"name": "Wisdom of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["wizard"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_7_1"
	},
	{
		"id": "perseverance-archer-ring",
		"code": "TECHNOMAGIC_ARCHER_9_3_1",
		"name": "Wrath of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["archer"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_3_1"
	},
	{
		"id": "perseverance-mechanic-armor",
		"code": "TECHNOMAGIC_MECHANIC_9_1_1",
		"name": "Passion of Perseverance Clothes",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_1_1"
	},
	{
		"id": "perseverance-wizard-necklace",
		"code": "TECHNOMAGIC_WIZARD_9_5_1",
		"name": "Wisdom of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_WIZARD_9_5_1"
	},
	{
		"id": "perseverance-archer-armor",
		"code": "TECHNOMAGIC_ARCHER_9_1_1",
		"name": "Wrath of Perseverance Pauldron",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_1_1"
	},
	{
		"id": "authority-priest-necklace",
		"code": "TECHNOMAGIC_PRIEST_9_5_3",
		"name": "Blessing of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_5_3"
	},
	{
		"id": "hope-mechanic-secondary",
		"code": "TECHNOMAGIC_MECHANIC_9_2_2",
		"name": "Passion of Hope Shoes",
		"set": "hope",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["mechanic"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_MECHANIC_9_2_2"
	},
	{
		"id": "authority-mechanic-earrings",
		"code": "TECHNOMAGIC_MECHANIC_9_4_3",
		"name": "Passion of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["mechanic"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_4_3"
	},
	{
		"id": "authority-priest-bracelet",
		"code": "TECHNOMAGIC_PRIEST_9_6_3",
		"name": "Blessing of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["priest"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_6_3"
	},
	{
		"id": "perseverance-assassin-armor",
		"code": "TECHNOMAGIC_ASSASSIN_9_1_1",
		"name": "Coldness of Perseverance Jacket",
		"set": "perseverance",
		"tier": 9,
		"part": "armor",
		"kind": "medium",
		"classes": ["assassin"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ASSASSIN_9_1_1"
	},
	{
		"id": "authority-priest-armor",
		"code": "TECHNOMAGIC_PRIEST_9_1_3",
		"name": "Blessing of Authority Cape",
		"set": "authority",
		"tier": 9,
		"part": "armor",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defPhysical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_1_3"
	},
	{
		"id": "perseverance-assassin-ring",
		"code": "TECHNOMAGIC_ASSASSIN_9_3_1",
		"name": "Coldness of Perseverance Ring",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_3_1"
	},
	{
		"id": "authority-archer-bracelet",
		"code": "TECHNOMAGIC_ARCHER_9_6_3",
		"name": "Wrath of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["archer"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ARCHER_9_6_3"
	},
	{
		"id": "authority-knight-earrings",
		"code": "TECHNOMAGIC_KNIGHT_9_4_3",
		"name": "Protection of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["knight"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_KNIGHT_9_4_3"
	},
	{
		"id": "authority-priest-secondary",
		"code": "TECHNOMAGIC_PRIEST_9_2_3",
		"name": "Blessing of Authority Hood",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["priest"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_PRIEST_9_2_3"
	},
	{
		"id": "perseverance-assassin-necklace",
		"code": "TECHNOMAGIC_ASSASSIN_9_5_1",
		"name": "Coldness of Perseverance Necklace",
		"set": "perseverance",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["assassin"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_5_1"
	},
	{
		"id": "hope-assassin-ring",
		"code": "TECHNOMAGIC_ASSASSIN_9_3_2",
		"name": "Coldness of Hope Ring",
		"set": "hope",
		"tier": 9,
		"part": "accessory",
		"kind": "ring",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_3_2"
	},
	{
		"id": "authority-knight-secondary",
		"code": "TECHNOMAGIC_KNIGHT_9_2_3",
		"name": "Protection of Authority Shield",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight"],
		"main": ["defMagical", 6395],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_KNIGHT_9_2_3"
	},
	{
		"id": "authority-mechanic-bracelet",
		"code": "TECHNOMAGIC_MECHANIC_9_6_3",
		"name": "Passion of Authority Bracelet",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "bracelet",
		"classes": ["mechanic"],
		"main": ["defPhysical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_6_3"
	},
	{
		"id": "authority-priest-earrings",
		"code": "TECHNOMAGIC_PRIEST_9_4_3",
		"name": "Blessing of Authority Earrings",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "earrings",
		"classes": ["priest"],
		"main": ["atk", 5925],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_PRIEST_9_4_3"
	},
	{
		"id": "perseverance-assassin-orb",
		"code": "TECHNOMAGIC_ASSASSIN_9_7_1",
		"name": "Coldness of Perseverance Orb",
		"set": "perseverance",
		"tier": 9,
		"part": "orb",
		"classes": ["assassin"],
		"main": ["hp", 272354],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_ASSASSIN_9_7_1"
	},
	{
		"id": "authority-archer-secondary",
		"code": "TECHNOMAGIC_ARCHER_9_2_3",
		"name": "Wrath of Authority Cloak",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "medium",
		"classes": ["archer"],
		"main": ["defMagical", 2132],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_ARCHER_9_2_3"
	},
	{
		"id": "authority-wizard-secondary",
		"code": "TECHNOMAGIC_WIZARD_9_2_3",
		"name": "Wisdom of Authority Hat",
		"set": "authority",
		"tier": 9,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 1,
		"icon": "TECHNOMAGIC_WIZARD_9_2_3"
	},
	{
		"id": "authority-mechanic-necklace",
		"code": "TECHNOMAGIC_MECHANIC_9_5_3",
		"name": "Passion of Authority Necklace",
		"set": "authority",
		"tier": 9,
		"part": "accessory",
		"kind": "necklace",
		"classes": ["mechanic"],
		"main": ["defMagical", 4263],
		"pool": "18",
		"options": 2,
		"unique": true,
		"runes": 0,
		"icon": "TECHNOMAGIC_MECHANIC_9_5_3"
	},
	{
		"id": "gritty-frost-t8-medium-secondary",
		"code": "GEAR_LIGHT_8_6_2",
		"name": "Gritty Frost Leather Cape",
		"set": "gritty-frost",
		"tier": 8,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 1777],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_2"
	},
	{
		"id": "swift-darkness-t8-necklace",
		"code": "ACCESSORY_NECKLACE_8_6_4",
		"name": "Swift Darkness Necklace",
		"set": "swift-darkness",
		"tier": 8,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_4"
	},
	{
		"id": "opportune-fire-t6-archer-weapon",
		"code": "WEAPON_ARCHER_6_5_1",
		"name": "Opportune Fire Bow",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 6037],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_1"
	},
	{
		"id": "gritty-frost-t6-archer-weapon",
		"code": "WEAPON_ARCHER_6_5_2",
		"name": "Gritty Frost Bow",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 6037],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-archer-weapon",
		"code": "WEAPON_ARCHER_6_5_3",
		"name": "Unrelenting Poison Bow",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 6037],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_3"
	},
	{
		"id": "swift-darkness-t6-archer-weapon",
		"code": "WEAPON_ARCHER_6_5_4",
		"name": "Swift Darkness Bow",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 6037],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_4"
	},
	{
		"id": "opportune-fire-t7-archer-weapon",
		"code": "WEAPON_ARCHER_7_5_1",
		"name": "Opportune Fire Bow",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 8987],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_1"
	},
	{
		"id": "unrelenting-poison-t7-archer-weapon",
		"code": "WEAPON_ARCHER_7_5_3",
		"name": "Unrelenting Poison Bow",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 8987],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_3"
	},
	{
		"id": "gritty-frost-t7-archer-weapon",
		"code": "WEAPON_ARCHER_7_5_2",
		"name": "Gritty Frost Bow",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 8987],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_2"
	},
	{
		"id": "swift-darkness-t7-archer-weapon",
		"code": "WEAPON_ARCHER_7_5_4",
		"name": "Swift Darkness Bow",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 8987],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_4"
	},
	{
		"id": "swift-darkness-t8-heavy-secondary",
		"code": "GEAR_HEAVY_8_6_4",
		"name": "Swift Darkness Shield",
		"set": "swift-darkness",
		"tier": 8,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 5329],
		"pool": "8421+8422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_4"
	},
	{
		"id": "gritty-frost-t7-warrior-weapon",
		"code": "WEAPON_WARRIOR_7_5_2",
		"name": "Gritty Frost Greatsword",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 7255],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_2"
	},
	{
		"id": "gritty-frost-t6-necklace",
		"code": "ACCESSORY_NECKLACE_6_5_2",
		"name": "Gritty Frost Necklace",
		"set": "gritty-frost",
		"tier": 6,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-bracelet",
		"code": "ACCESSORY_BRACELET_6_5_3",
		"name": "Unrelenting Poison Bracelet",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_3"
	},
	{
		"id": "gritty-frost-t8-bracelet",
		"code": "ACCESSORY_BRACELET_8_6_2",
		"name": "Gritty Frost Bracelet",
		"set": "gritty-frost",
		"tier": 8,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_2"
	},
	{
		"id": "opportune-fire-t7-warrior-weapon",
		"code": "WEAPON_WARRIOR_7_5_1",
		"name": "Opportune Fire Greatsword",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 7255],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_1"
	},
	{
		"id": "swift-darkness-t6-wizard-weapon",
		"code": "WEAPON_WIZARD_6_5_4",
		"name": "Swift Darkness Staff",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 5613],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_4"
	},
	{
		"id": "opportune-fire-t6-wizard-weapon",
		"code": "WEAPON_WIZARD_6_5_1",
		"name": "Opportune Fire Staff",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 5613],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_1"
	},
	{
		"id": "gritty-frost-t6-wizard-weapon",
		"code": "WEAPON_WIZARD_6_5_2",
		"name": "Gritty Frost Staff",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 5613],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-wizard-weapon",
		"code": "WEAPON_WIZARD_6_5_3",
		"name": "Unrelenting Poison Staff",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 5613],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_3"
	},
	{
		"id": "opportune-fire-t7-heavy-armor",
		"code": "ARMOR_HEAVY_7_5_1",
		"name": "Opportune Fire Plate Armor",
		"set": "opportune-fire",
		"tier": 7,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 4258],
		"pool": "7411+7412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_1"
	},
	{
		"id": "swift-darkness-t8-medium-secondary",
		"code": "GEAR_LIGHT_8_6_4",
		"name": "Swift Darkness Leather Cape",
		"set": "swift-darkness",
		"tier": 8,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 1777],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_4"
	},
	{
		"id": "unrelenting-poison-t7-heavy-armor",
		"code": "ARMOR_HEAVY_7_5_3",
		"name": "Unrelenting Poison Plate Armor",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 4258],
		"pool": "7411+7412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_3"
	},
	{
		"id": "gritty-frost-t7-heavy-armor",
		"code": "ARMOR_HEAVY_7_5_2",
		"name": "Gritty Frost Plate Armor",
		"set": "gritty-frost",
		"tier": 7,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 4258],
		"pool": "7411+7412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_2"
	},
	{
		"id": "swift-darkness-t7-heavy-armor",
		"code": "ARMOR_HEAVY_7_5_4",
		"name": "Swift Darkness Plate Armor",
		"set": "swift-darkness",
		"tier": 7,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 4258],
		"pool": "7411+7412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_4"
	},
	{
		"id": "opportune-fire-t8-bracelet",
		"code": "ACCESSORY_BRACELET_8_6_1",
		"name": "Opportune Fire Bracelet",
		"set": "opportune-fire",
		"tier": 8,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_1"
	},
	{
		"id": "unrelenting-poison-t7-necklace",
		"code": "ACCESSORY_NECKLACE_7_5_3",
		"name": "Unrelenting Poison Necklace",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_3"
	},
	{
		"id": "gritty-frost-t7-medium-secondary",
		"code": "GEAR_LIGHT_7_5_2",
		"name": "Gritty Frost Leather Cape",
		"set": "gritty-frost",
		"tier": 7,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 3194],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-ring",
		"code": "ACCESSORY_RING_8_6_3",
		"name": "Unrelenting Poison Ring",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_3"
	},
	{
		"id": "gritty-frost-t6-light-armor",
		"code": "ARMOR_ROBE_6_5_2",
		"name": "Gritty Frost Robe",
		"set": "gritty-frost",
		"tier": 6,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 2144],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_2"
	},
	{
		"id": "swift-darkness-t6-necklace",
		"code": "ACCESSORY_NECKLACE_6_5_4",
		"name": "Swift Darkness Necklace",
		"set": "swift-darkness",
		"tier": 6,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_4"
	},
	{
		"id": "gritty-frost-t8-assassin-weapon",
		"code": "WEAPON_ASSASSIN_8_6_2",
		"name": "Gritty Frost Dagger",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 9969],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-assassin-weapon",
		"code": "WEAPON_ASSASSIN_8_6_3",
		"name": "Unrelenting Poison Dagger",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 9969],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_3"
	},
	{
		"id": "gritty-frost-t8-heavy-secondary",
		"code": "GEAR_HEAVY_8_6_2",
		"name": "Gritty Frost Shield",
		"set": "gritty-frost",
		"tier": 8,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 5329],
		"pool": "8421+8422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_2"
	},
	{
		"id": "opportune-fire-t8-assassin-weapon",
		"code": "WEAPON_ASSASSIN_8_6_1",
		"name": "Opportune Fire Dagger",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 9969],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_1"
	},
	{
		"id": "swift-darkness-t7-warrior-weapon",
		"code": "WEAPON_WARRIOR_7_5_4",
		"name": "Swift Darkness Greatsword",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 7255],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_4"
	},
	{
		"id": "swift-darkness-t8-assassin-weapon",
		"code": "WEAPON_ASSASSIN_8_6_4",
		"name": "Swift Darkness Dagger",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 9969],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_4"
	},
	{
		"id": "swift-darkness-t8-bracelet",
		"code": "ACCESSORY_BRACELET_8_6_4",
		"name": "Swift Darkness Bracelet",
		"set": "swift-darkness",
		"tier": 8,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_4"
	},
	{
		"id": "swift-darkness-t6-light-secondary",
		"code": "GEAR_ROBE_6_5_4",
		"name": "Swift Darkness Hat",
		"set": "swift-darkness",
		"tier": 6,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 2431],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_4"
	},
	{
		"id": "opportune-fire-t6-light-secondary",
		"code": "GEAR_ROBE_6_5_1",
		"name": "Opportune Fire Hat",
		"set": "opportune-fire",
		"tier": 6,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 2431],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_1"
	},
	{
		"id": "unrelenting-poison-t6-light-secondary",
		"code": "GEAR_ROBE_6_5_3",
		"name": "Unrelenting Poison Hat",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 2431],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_3"
	},
	{
		"id": "gritty-frost-t6-light-secondary",
		"code": "GEAR_ROBE_6_5_2",
		"name": "Gritty Frost Hat",
		"set": "gritty-frost",
		"tier": 6,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 2431],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_2"
	},
	{
		"id": "opportune-fire-t6-light-armor",
		"code": "ARMOR_ROBE_6_5_1",
		"name": "Opportune Fire Robe",
		"set": "opportune-fire",
		"tier": 6,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 2144],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_1"
	},
	{
		"id": "unrelenting-poison-t6-orb",
		"code": "ORB_6_5_3",
		"name": "Unrelenting Poison Orb",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 138285],
		"pool": "6441+6442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_3"
	},
	{
		"id": "gritty-frost-t6-orb",
		"code": "ORB_6_5_2",
		"name": "Gritty Frost Orb",
		"set": "gritty-frost",
		"tier": 6,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 138285],
		"pool": "6441+6442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_2"
	},
	{
		"id": "opportune-fire-t6-orb",
		"code": "ORB_6_5_1",
		"name": "Opportune Fire Orb",
		"set": "opportune-fire",
		"tier": 6,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 138285],
		"pool": "6441+6442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_1"
	},
	{
		"id": "swift-darkness-t6-orb",
		"code": "ORB_6_5_4",
		"name": "Swift Darkness Orb",
		"set": "swift-darkness",
		"tier": 6,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 138285],
		"pool": "6441+6442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_4"
	},
	{
		"id": "swift-darkness-t6-medium-secondary",
		"code": "GEAR_LIGHT_6_5_4",
		"name": "Swift Darkness Leather Cape",
		"set": "swift-darkness",
		"tier": 6,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 2145],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_4"
	},
	{
		"id": "gritty-frost-t7-light-armor",
		"code": "ARMOR_ROBE_7_5_2",
		"name": "Gritty Frost Robe",
		"set": "gritty-frost",
		"tier": 7,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 3194],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_2"
	},
	{
		"id": "swift-darkness-t7-assassin-weapon",
		"code": "WEAPON_ASSASSIN_7_5_4",
		"name": "Swift Darkness Dagger",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 7962],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_4"
	},
	{
		"id": "gritty-frost-t7-assassin-weapon",
		"code": "WEAPON_ASSASSIN_7_5_2",
		"name": "Gritty Frost Dagger",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 7962],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-assassin-weapon",
		"code": "WEAPON_ASSASSIN_7_5_3",
		"name": "Unrelenting Poison Dagger",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 7962],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_3"
	},
	{
		"id": "opportune-fire-t7-assassin-weapon",
		"code": "WEAPON_ASSASSIN_7_5_1",
		"name": "Opportune Fire Dagger",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 7962],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_1"
	},
	{
		"id": "swift-darkness-t6-assassin-weapon",
		"code": "WEAPON_ASSASSIN_6_5_4",
		"name": "Swift Darkness Dagger",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 5349],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_4"
	},
	{
		"id": "unrelenting-poison-t6-assassin-weapon",
		"code": "WEAPON_ASSASSIN_6_5_3",
		"name": "Unrelenting Poison Dagger",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 5349],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_3"
	},
	{
		"id": "gritty-frost-t6-assassin-weapon",
		"code": "WEAPON_ASSASSIN_6_5_2",
		"name": "Gritty Frost Dagger",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 5349],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_2"
	},
	{
		"id": "opportune-fire-t6-assassin-weapon",
		"code": "WEAPON_ASSASSIN_6_5_1",
		"name": "Opportune Fire Dagger",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["assassin"],
		"main": ["atk", 5349],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ASSASSIN_6_5_1"
	},
	{
		"id": "swift-darkness-t8-warrior-weapon",
		"code": "WEAPON_WARRIOR_8_6_4",
		"name": "Swift Darkness Greatsword",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 9081],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_4"
	},
	{
		"id": "gritty-frost-t8-medium-armor",
		"code": "ARMOR_LIGHT_8_6_2",
		"name": "Gritty Frost Scale Armor",
		"set": "gritty-frost",
		"tier": 8,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 4530],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-medium-armor",
		"code": "ARMOR_LIGHT_8_6_3",
		"name": "Unrelenting Poison Scale Armor",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 4530],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_3"
	},
	{
		"id": "opportune-fire-t8-medium-armor",
		"code": "ARMOR_LIGHT_8_6_1",
		"name": "Opportune Fire Scale Armor",
		"set": "opportune-fire",
		"tier": 8,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 4530],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_1"
	},
	{
		"id": "swift-darkness-t8-medium-armor",
		"code": "ARMOR_LIGHT_8_6_4",
		"name": "Swift Darkness Scale Armor",
		"set": "swift-darkness",
		"tier": 8,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 4530],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_4"
	},
	{
		"id": "swift-darkness-t8-earrings",
		"code": "ACCESSORY_EARRING_8_6_4",
		"name": "Swift Darkness Earrings",
		"set": "swift-darkness",
		"tier": 8,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 4938],
		"pool": "8431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_4"
	},
	{
		"id": "opportune-fire-t8-earrings",
		"code": "ACCESSORY_EARRING_8_6_1",
		"name": "Opportune Fire Earrings",
		"set": "opportune-fire",
		"tier": 8,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 4938],
		"pool": "8431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_1"
	},
	{
		"id": "unrelenting-poison-t8-earrings",
		"code": "ACCESSORY_EARRING_8_6_3",
		"name": "Unrelenting Poison Earrings",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 4938],
		"pool": "8431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_3"
	},
	{
		"id": "gritty-frost-t8-earrings",
		"code": "ACCESSORY_EARRING_8_6_2",
		"name": "Gritty Frost Earrings",
		"set": "gritty-frost",
		"tier": 8,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 4938],
		"pool": "8431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-medium-secondary",
		"code": "GEAR_LIGHT_6_5_3",
		"name": "Unrelenting Poison Leather Cape",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 2145],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_3"
	},
	{
		"id": "unrelenting-poison-t8-warrior-weapon",
		"code": "WEAPON_WARRIOR_8_6_3",
		"name": "Unrelenting Poison Greatsword",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 9081],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_3"
	},
	{
		"id": "opportune-fire-t8-wizard-weapon",
		"code": "WEAPON_WIZARD_8_6_1",
		"name": "Opportune Fire Staff",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 10462],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_1"
	},
	{
		"id": "unrelenting-poison-t8-wizard-weapon",
		"code": "WEAPON_WIZARD_8_6_3",
		"name": "Unrelenting Poison Staff",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 10462],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_3"
	},
	{
		"id": "gritty-frost-t8-wizard-weapon",
		"code": "WEAPON_WIZARD_8_6_2",
		"name": "Gritty Frost Staff",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 10462],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_2"
	},
	{
		"id": "swift-darkness-t8-wizard-weapon",
		"code": "WEAPON_WIZARD_8_6_4",
		"name": "Swift Darkness Staff",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 10462],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_4"
	},
	{
		"id": "unrelenting-poison-t7-heavy-secondary",
		"code": "GEAR_HEAVY_7_5_3",
		"name": "Unrelenting Poison Shield",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 4258],
		"pool": "7421+7422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_3"
	},
	{
		"id": "unrelenting-poison-t7-medium-secondary",
		"code": "GEAR_LIGHT_7_5_3",
		"name": "Unrelenting Poison Leather Cape",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 3194],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_3"
	},
	{
		"id": "opportune-fire-t8-heavy-secondary",
		"code": "GEAR_HEAVY_8_6_1",
		"name": "Opportune Fire Shield",
		"set": "opportune-fire",
		"tier": 8,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 5329],
		"pool": "8421+8422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_1"
	},
	{
		"id": "gritty-frost-t6-ring",
		"code": "ACCESSORY_RING_6_5_2",
		"name": "Gritty Frost Ring",
		"set": "gritty-frost",
		"tier": 6,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 127282],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_2"
	},
	{
		"id": "opportune-fire-t7-ring",
		"code": "ACCESSORY_RING_7_5_1",
		"name": "Opportune Fire Ring",
		"set": "opportune-fire",
		"tier": 7,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 181282],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_1"
	},
	{
		"id": "swift-darkness-t7-knight-weapon",
		"code": "WEAPON_KNIGHT_7_5_4",
		"name": "Swift Darkness Lance",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 6400],
		"pool": "7432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_4"
	},
	{
		"id": "opportune-fire-t6-warrior-weapon",
		"code": "WEAPON_WARRIOR_6_5_1",
		"name": "Opportune Fire Greatsword",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 4870],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_1"
	},
	{
		"id": "opportune-fire-t7-knight-weapon",
		"code": "WEAPON_KNIGHT_7_5_1",
		"name": "Opportune Fire Lance",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 6400],
		"pool": "7432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_1"
	},
	{
		"id": "gritty-frost-t7-knight-weapon",
		"code": "WEAPON_KNIGHT_7_5_2",
		"name": "Gritty Frost Lance",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 6400],
		"pool": "7432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-knight-weapon",
		"code": "WEAPON_KNIGHT_7_5_3",
		"name": "Unrelenting Poison Lance",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 6400],
		"pool": "7432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_3"
	},
	{
		"id": "unrelenting-poison-t8-medium-secondary",
		"code": "GEAR_LIGHT_8_6_3",
		"name": "Unrelenting Poison Leather Cape",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 1777],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_3"
	},
	{
		"id": "swift-darkness-t7-bracelet",
		"code": "ACCESSORY_BRACELET_7_5_4",
		"name": "Swift Darkness Bracelet",
		"set": "swift-darkness",
		"tier": 7,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_4"
	},
	{
		"id": "swift-darkness-t8-heavy-armor",
		"code": "ARMOR_HEAVY_8_6_4",
		"name": "Swift Darkness Plate Armor",
		"set": "swift-darkness",
		"tier": 8,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 5329],
		"pool": "8411+8412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_4"
	},
	{
		"id": "opportune-fire-t8-heavy-armor",
		"code": "ARMOR_HEAVY_8_6_1",
		"name": "Opportune Fire Plate Armor",
		"set": "opportune-fire",
		"tier": 8,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 5329],
		"pool": "8411+8412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_1"
	},
	{
		"id": "swift-darkness-t7-wizard-weapon",
		"code": "WEAPON_WIZARD_7_5_4",
		"name": "Swift Darkness Staff",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 8356],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_4"
	},
	{
		"id": "unrelenting-poison-t8-heavy-armor",
		"code": "ARMOR_HEAVY_8_6_3",
		"name": "Unrelenting Poison Plate Armor",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 5329],
		"pool": "8411+8412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_3"
	},
	{
		"id": "gritty-frost-t8-heavy-armor",
		"code": "ARMOR_HEAVY_8_6_2",
		"name": "Gritty Frost Plate Armor",
		"set": "gritty-frost",
		"tier": 8,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 5329],
		"pool": "8411+8412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_2"
	},
	{
		"id": "opportune-fire-t7-wizard-weapon",
		"code": "WEAPON_WIZARD_7_5_1",
		"name": "Opportune Fire Staff",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 8356],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_1"
	},
	{
		"id": "unrelenting-poison-t7-wizard-weapon",
		"code": "WEAPON_WIZARD_7_5_3",
		"name": "Unrelenting Poison Staff",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 8356],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_3"
	},
	{
		"id": "gritty-frost-t7-wizard-weapon",
		"code": "WEAPON_WIZARD_7_5_2",
		"name": "Gritty Frost Staff",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["wizard", "priest"],
		"main": ["atk", 8356],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WIZARD_6_5_2"
	},
	{
		"id": "swift-darkness-t6-knight-weapon",
		"code": "WEAPON_KNIGHT_6_5_4",
		"name": "Swift Darkness Lance",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 4299],
		"pool": "6432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_4"
	},
	{
		"id": "opportune-fire-t6-knight-weapon",
		"code": "WEAPON_KNIGHT_6_5_1",
		"name": "Opportune Fire Lance",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 4299],
		"pool": "6432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_1"
	},
	{
		"id": "unrelenting-poison-t6-knight-weapon",
		"code": "WEAPON_KNIGHT_6_5_3",
		"name": "Unrelenting Poison Lance",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 4299],
		"pool": "6432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_3"
	},
	{
		"id": "gritty-frost-t6-knight-weapon",
		"code": "WEAPON_KNIGHT_6_5_2",
		"name": "Gritty Frost Lance",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 4299],
		"pool": "6432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-light-armor",
		"code": "ARMOR_ROBE_7_5_3",
		"name": "Unrelenting Poison Robe",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 3194],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_3"
	},
	{
		"id": "opportune-fire-t8-light-armor",
		"code": "ARMOR_ROBE_8_6_1",
		"name": "Opportune Fire Robe",
		"set": "opportune-fire",
		"tier": 8,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 1777],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_1"
	},
	{
		"id": "gritty-frost-t7-ring",
		"code": "ACCESSORY_RING_7_5_2",
		"name": "Gritty Frost Ring",
		"set": "gritty-frost",
		"tier": 7,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 181282],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-bracelet",
		"code": "ACCESSORY_BRACELET_7_5_3",
		"name": "Unrelenting Poison Bracelet",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_3"
	},
	{
		"id": "opportune-fire-t6-necklace",
		"code": "ACCESSORY_NECKLACE_6_5_1",
		"name": "Opportune Fire Necklace",
		"set": "opportune-fire",
		"tier": 6,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_1"
	},
	{
		"id": "swift-darkness-t6-bracelet",
		"code": "ACCESSORY_BRACELET_6_5_4",
		"name": "Swift Darkness Bracelet",
		"set": "swift-darkness",
		"tier": 6,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_4"
	},
	{
		"id": "gritty-frost-t6-medium-secondary",
		"code": "GEAR_LIGHT_6_5_2",
		"name": "Gritty Frost Leather Cape",
		"set": "gritty-frost",
		"tier": 6,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 2145],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_2"
	},
	{
		"id": "swift-darkness-t7-necklace",
		"code": "ACCESSORY_NECKLACE_7_5_4",
		"name": "Swift Darkness Necklace",
		"set": "swift-darkness",
		"tier": 7,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_4"
	},
	{
		"id": "opportune-fire-t6-earrings",
		"code": "ACCESSORY_EARRING_6_5_1",
		"name": "Opportune Fire Earrings",
		"set": "opportune-fire",
		"tier": 6,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 2769],
		"pool": "6431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_1"
	},
	{
		"id": "gritty-frost-t6-earrings",
		"code": "ACCESSORY_EARRING_6_5_2",
		"name": "Gritty Frost Earrings",
		"set": "gritty-frost",
		"tier": 6,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 2769],
		"pool": "6431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-earrings",
		"code": "ACCESSORY_EARRING_6_5_3",
		"name": "Unrelenting Poison Earrings",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 2769],
		"pool": "6431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_3"
	},
	{
		"id": "swift-darkness-t6-earrings",
		"code": "ACCESSORY_EARRING_6_5_4",
		"name": "Swift Darkness Earrings",
		"set": "swift-darkness",
		"tier": 6,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 2769],
		"pool": "6431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_4"
	},
	{
		"id": "gritty-frost-t8-warrior-weapon",
		"code": "WEAPON_WARRIOR_8_6_2",
		"name": "Gritty Frost Greatsword",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 9081],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_2"
	},
	{
		"id": "swift-darkness-t8-orb",
		"code": "ORB_8_6_4",
		"name": "Swift Darkness Orb",
		"set": "swift-darkness",
		"tier": 8,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8441+8442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_4"
	},
	{
		"id": "gritty-frost-t8-orb",
		"code": "ORB_8_6_2",
		"name": "Gritty Frost Orb",
		"set": "gritty-frost",
		"tier": 8,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8441+8442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-orb",
		"code": "ORB_8_6_3",
		"name": "Unrelenting Poison Orb",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8441+8442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_3"
	},
	{
		"id": "opportune-fire-t8-orb",
		"code": "ORB_8_6_1",
		"name": "Opportune Fire Orb",
		"set": "opportune-fire",
		"tier": 8,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8441+8442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_1"
	},
	{
		"id": "gritty-frost-t7-heavy-secondary",
		"code": "GEAR_HEAVY_7_5_2",
		"name": "Gritty Frost Shield",
		"set": "gritty-frost",
		"tier": 7,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 4258],
		"pool": "7421+7422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_2"
	},
	{
		"id": "opportune-fire-t6-heavy-secondary",
		"code": "GEAR_HEAVY_6_5_1",
		"name": "Opportune Fire Shield",
		"set": "opportune-fire",
		"tier": 6,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 2859],
		"pool": "6421+6422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_1"
	},
	{
		"id": "opportune-fire-t7-earrings",
		"code": "ACCESSORY_EARRING_7_5_1",
		"name": "Opportune Fire Earrings",
		"set": "opportune-fire",
		"tier": 7,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 3943],
		"pool": "7431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_1"
	},
	{
		"id": "unrelenting-poison-t7-earrings",
		"code": "ACCESSORY_EARRING_7_5_3",
		"name": "Unrelenting Poison Earrings",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 3943],
		"pool": "7431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_3"
	},
	{
		"id": "gritty-frost-t7-earrings",
		"code": "ACCESSORY_EARRING_7_5_2",
		"name": "Gritty Frost Earrings",
		"set": "gritty-frost",
		"tier": 7,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 3943],
		"pool": "7431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_2"
	},
	{
		"id": "swift-darkness-t7-earrings",
		"code": "ACCESSORY_EARRING_7_5_4",
		"name": "Swift Darkness Earrings",
		"set": "swift-darkness",
		"tier": 7,
		"part": "accessory",
		"kind": "earrings",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["atk", 3943],
		"pool": "7431",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_EARRING_6_5_4"
	},
	{
		"id": "opportune-fire-t6-bracelet",
		"code": "ACCESSORY_BRACELET_6_5_1",
		"name": "Opportune Fire Bracelet",
		"set": "opportune-fire",
		"tier": 6,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_1"
	},
	{
		"id": "opportune-fire-t6-medium-secondary",
		"code": "GEAR_LIGHT_6_5_1",
		"name": "Opportune Fire Leather Cape",
		"set": "opportune-fire",
		"tier": 6,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 2145],
		"pool": "6421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_1"
	},
	{
		"id": "opportune-fire-t7-necklace",
		"code": "ACCESSORY_NECKLACE_7_5_1",
		"name": "Opportune Fire Necklace",
		"set": "opportune-fire",
		"tier": 7,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_1"
	},
	{
		"id": "opportune-fire-t8-warrior-weapon",
		"code": "WEAPON_WARRIOR_8_6_1",
		"name": "Opportune Fire Greatsword",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 9081],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_1"
	},
	{
		"id": "swift-darkness-t6-light-armor",
		"code": "ARMOR_ROBE_6_5_4",
		"name": "Swift Darkness Robe",
		"set": "swift-darkness",
		"tier": 6,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 2144],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_4"
	},
	{
		"id": "gritty-frost-t6-heavy-secondary",
		"code": "GEAR_HEAVY_6_5_2",
		"name": "Gritty Frost Shield",
		"set": "gritty-frost",
		"tier": 6,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 2859],
		"pool": "6421+6422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_2"
	},
	{
		"id": "opportune-fire-t8-necklace",
		"code": "ACCESSORY_NECKLACE_8_6_1",
		"name": "Opportune Fire Necklace",
		"set": "opportune-fire",
		"tier": 8,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_1"
	},
	{
		"id": "opportune-fire-t6-ring",
		"code": "ACCESSORY_RING_6_5_1",
		"name": "Opportune Fire Ring",
		"set": "opportune-fire",
		"tier": 6,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 127282],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_1"
	},
	{
		"id": "gritty-frost-t6-warrior-weapon",
		"code": "WEAPON_WARRIOR_6_5_2",
		"name": "Gritty Frost Greatsword",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 4870],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_2"
	},
	{
		"id": "gritty-frost-t7-necklace",
		"code": "ACCESSORY_NECKLACE_7_5_2",
		"name": "Gritty Frost Necklace",
		"set": "gritty-frost",
		"tier": 7,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_2"
	},
	{
		"id": "opportune-fire-t8-knight-weapon",
		"code": "WEAPON_KNIGHT_8_6_1",
		"name": "Opportune Fire Lance",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 7994],
		"pool": "8432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_1"
	},
	{
		"id": "gritty-frost-t8-knight-weapon",
		"code": "WEAPON_KNIGHT_8_6_2",
		"name": "Gritty Frost Lance",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 7994],
		"pool": "8432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-knight-weapon",
		"code": "WEAPON_KNIGHT_8_6_3",
		"name": "Unrelenting Poison Lance",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 7994],
		"pool": "8432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_3"
	},
	{
		"id": "swift-darkness-t8-knight-weapon",
		"code": "WEAPON_KNIGHT_8_6_4",
		"name": "Swift Darkness Lance",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["knight"],
		"main": ["atk", 7994],
		"pool": "8432",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_KNIGHT_6_5_4"
	},
	{
		"id": "unrelenting-poison-t6-light-armor",
		"code": "ARMOR_ROBE_6_5_3",
		"name": "Unrelenting Poison Robe",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 2144],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_3"
	},
	{
		"id": "swift-darkness-t7-light-armor",
		"code": "ARMOR_ROBE_7_5_4",
		"name": "Swift Darkness Robe",
		"set": "swift-darkness",
		"tier": 7,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 3194],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_4"
	},
	{
		"id": "gritty-frost-t8-necklace",
		"code": "ACCESSORY_NECKLACE_8_6_2",
		"name": "Gritty Frost Necklace",
		"set": "gritty-frost",
		"tier": 8,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_2"
	},
	{
		"id": "gritty-frost-t8-light-armor",
		"code": "ARMOR_ROBE_8_6_2",
		"name": "Gritty Frost Robe",
		"set": "gritty-frost",
		"tier": 8,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 1777],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_2"
	},
	{
		"id": "swift-darkness-t6-ring",
		"code": "ACCESSORY_RING_6_5_4",
		"name": "Swift Darkness Ring",
		"set": "swift-darkness",
		"tier": 6,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 127282],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_4"
	},
	{
		"id": "swift-darkness-t8-archer-weapon",
		"code": "WEAPON_ARCHER_8_6_4",
		"name": "Swift Darkness Bow",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 11252],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_4"
	},
	{
		"id": "unrelenting-poison-t7-ring",
		"code": "ACCESSORY_RING_7_5_3",
		"name": "Unrelenting Poison Ring",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 181282],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_3"
	},
	{
		"id": "opportune-fire-t8-archer-weapon",
		"code": "WEAPON_ARCHER_8_6_1",
		"name": "Opportune Fire Bow",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 11252],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_1"
	},
	{
		"id": "unrelenting-poison-t8-archer-weapon",
		"code": "WEAPON_ARCHER_8_6_3",
		"name": "Unrelenting Poison Bow",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 11252],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_3"
	},
	{
		"id": "gritty-frost-t8-archer-weapon",
		"code": "WEAPON_ARCHER_8_6_2",
		"name": "Gritty Frost Bow",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["archer"],
		"main": ["atk", 11252],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_ARCHER_6_5_2"
	},
	{
		"id": "opportune-fire-t8-medium-secondary",
		"code": "GEAR_LIGHT_8_6_1",
		"name": "Opportune Fire Leather Cape",
		"set": "opportune-fire",
		"tier": 8,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 1777],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_1"
	},
	{
		"id": "gritty-frost-t7-bracelet",
		"code": "ACCESSORY_BRACELET_7_5_2",
		"name": "Gritty Frost Bracelet",
		"set": "gritty-frost",
		"tier": 7,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_2"
	},
	{
		"id": "opportune-fire-t7-light-armor",
		"code": "ARMOR_ROBE_7_5_1",
		"name": "Opportune Fire Robe",
		"set": "opportune-fire",
		"tier": 7,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 3194],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_1"
	},
	{
		"id": "opportune-fire-t6-heavy-armor",
		"code": "ARMOR_HEAVY_6_5_1",
		"name": "Opportune Fire Plate Armor",
		"set": "opportune-fire",
		"tier": 6,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 2859],
		"pool": "6411+6412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_1"
	},
	{
		"id": "gritty-frost-t6-heavy-armor",
		"code": "ARMOR_HEAVY_6_5_2",
		"name": "Gritty Frost Plate Armor",
		"set": "gritty-frost",
		"tier": 6,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 2859],
		"pool": "6411+6412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-heavy-armor",
		"code": "ARMOR_HEAVY_6_5_3",
		"name": "Unrelenting Poison Plate Armor",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 2859],
		"pool": "6411+6412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_3"
	},
	{
		"id": "swift-darkness-t6-heavy-armor",
		"code": "ARMOR_HEAVY_6_5_4",
		"name": "Swift Darkness Plate Armor",
		"set": "swift-darkness",
		"tier": 6,
		"part": "armor",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defPhysical", 2859],
		"pool": "6411+6412",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_HEAVY_6_5_4"
	},
	{
		"id": "swift-darkness-t8-ring",
		"code": "ACCESSORY_RING_8_6_4",
		"name": "Swift Darkness Ring",
		"set": "swift-darkness",
		"tier": 8,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_4"
	},
	{
		"id": "swift-darkness-t7-ring",
		"code": "ACCESSORY_RING_7_5_4",
		"name": "Swift Darkness Ring",
		"set": "swift-darkness",
		"tier": 7,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 181282],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_4"
	},
	{
		"id": "swift-darkness-t6-warrior-weapon",
		"code": "WEAPON_WARRIOR_6_5_4",
		"name": "Swift Darkness Greatsword",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 4870],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_4"
	},
	{
		"id": "opportune-fire-t8-light-secondary",
		"code": "GEAR_ROBE_8_6_1",
		"name": "Opportune Fire Hat",
		"set": "opportune-fire",
		"tier": 8,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3553],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_1"
	},
	{
		"id": "gritty-frost-t8-light-secondary",
		"code": "GEAR_ROBE_8_6_2",
		"name": "Gritty Frost Hat",
		"set": "gritty-frost",
		"tier": 8,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3553],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-light-secondary",
		"code": "GEAR_ROBE_8_6_3",
		"name": "Unrelenting Poison Hat",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3553],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_3"
	},
	{
		"id": "swift-darkness-t8-light-secondary",
		"code": "GEAR_ROBE_8_6_4",
		"name": "Swift Darkness Hat",
		"set": "swift-darkness",
		"tier": 8,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3553],
		"pool": "8421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_4"
	},
	{
		"id": "opportune-fire-t7-heavy-secondary",
		"code": "GEAR_HEAVY_7_5_1",
		"name": "Opportune Fire Shield",
		"set": "opportune-fire",
		"tier": 7,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 4258],
		"pool": "7421+7422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_1"
	},
	{
		"id": "unrelenting-poison-t7-warrior-weapon",
		"code": "WEAPON_WARRIOR_7_5_3",
		"name": "Unrelenting Poison Greatsword",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 7255],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_3"
	},
	{
		"id": "opportune-fire-t7-bracelet",
		"code": "ACCESSORY_BRACELET_7_5_1",
		"name": "Opportune Fire Bracelet",
		"set": "opportune-fire",
		"tier": 7,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 2841],
		"pool": "7431+7432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_1"
	},
	{
		"id": "unrelenting-poison-t6-necklace",
		"code": "ACCESSORY_NECKLACE_6_5_3",
		"name": "Unrelenting Poison Necklace",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_3"
	},
	{
		"id": "gritty-frost-t6-bracelet",
		"code": "ACCESSORY_BRACELET_6_5_2",
		"name": "Gritty Frost Bracelet",
		"set": "gritty-frost",
		"tier": 6,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 1993],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_2"
	},
	{
		"id": "unrelenting-poison-t8-bracelet",
		"code": "ACCESSORY_BRACELET_8_6_3",
		"name": "Unrelenting Poison Bracelet",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "accessory",
		"kind": "bracelet",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defPhysical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_BRACELET_6_5_3"
	},
	{
		"id": "swift-darkness-t7-medium-secondary",
		"code": "GEAR_LIGHT_7_5_4",
		"name": "Swift Darkness Leather Cape",
		"set": "swift-darkness",
		"tier": 7,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 3194],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_4"
	},
	{
		"id": "swift-darkness-t8-light-armor",
		"code": "ARMOR_ROBE_8_6_4",
		"name": "Swift Darkness Robe",
		"set": "swift-darkness",
		"tier": 8,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 1777],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_4"
	},
	{
		"id": "opportune-fire-t6-mechanic-weapon",
		"code": "WEAPON_MECHANIC_6_5_1",
		"name": "Opportune Fire Gun",
		"set": "opportune-fire",
		"tier": 6,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 5506],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_1"
	},
	{
		"id": "gritty-frost-t6-mechanic-weapon",
		"code": "WEAPON_MECHANIC_6_5_2",
		"name": "Gritty Frost Gun",
		"set": "gritty-frost",
		"tier": 6,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 5506],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_2"
	},
	{
		"id": "unrelenting-poison-t6-mechanic-weapon",
		"code": "WEAPON_MECHANIC_6_5_3",
		"name": "Unrelenting Poison Gun",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 5506],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_3"
	},
	{
		"id": "swift-darkness-t6-mechanic-weapon",
		"code": "WEAPON_MECHANIC_6_5_4",
		"name": "Swift Darkness Gun",
		"set": "swift-darkness",
		"tier": 6,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 5506],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_4"
	},
	{
		"id": "opportune-fire-t8-ring",
		"code": "ACCESSORY_RING_8_6_1",
		"name": "Opportune Fire Ring",
		"set": "opportune-fire",
		"tier": 8,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_1"
	},
	{
		"id": "swift-darkness-t7-light-secondary",
		"code": "GEAR_ROBE_7_5_4",
		"name": "Swift Darkness Hat",
		"set": "swift-darkness",
		"tier": 7,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3620],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_4"
	},
	{
		"id": "opportune-fire-t7-light-secondary",
		"code": "GEAR_ROBE_7_5_1",
		"name": "Opportune Fire Hat",
		"set": "opportune-fire",
		"tier": 7,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3620],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_1"
	},
	{
		"id": "opportune-fire-t7-mechanic-weapon",
		"code": "WEAPON_MECHANIC_7_5_1",
		"name": "Opportune Fire Gun",
		"set": "opportune-fire",
		"tier": 7,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 8200],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_1"
	},
	{
		"id": "gritty-frost-t7-light-secondary",
		"code": "GEAR_ROBE_7_5_2",
		"name": "Gritty Frost Hat",
		"set": "gritty-frost",
		"tier": 7,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3620],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-light-secondary",
		"code": "GEAR_ROBE_7_5_3",
		"name": "Unrelenting Poison Hat",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "secondary",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defMagical", 3620],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_ROBE_6_5_3"
	},
	{
		"id": "unrelenting-poison-t7-mechanic-weapon",
		"code": "WEAPON_MECHANIC_7_5_3",
		"name": "Unrelenting Poison Gun",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 8200],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_3"
	},
	{
		"id": "gritty-frost-t7-mechanic-weapon",
		"code": "WEAPON_MECHANIC_7_5_2",
		"name": "Gritty Frost Gun",
		"set": "gritty-frost",
		"tier": 7,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 8200],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_2"
	},
	{
		"id": "swift-darkness-t7-mechanic-weapon",
		"code": "WEAPON_MECHANIC_7_5_4",
		"name": "Swift Darkness Gun",
		"set": "swift-darkness",
		"tier": 7,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 8200],
		"pool": "7431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_4"
	},
	{
		"id": "swift-darkness-t7-heavy-secondary",
		"code": "GEAR_HEAVY_7_5_4",
		"name": "Swift Darkness Shield",
		"set": "swift-darkness",
		"tier": 7,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 4258],
		"pool": "7421+7422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_4"
	},
	{
		"id": "unrelenting-poison-t6-heavy-secondary",
		"code": "GEAR_HEAVY_6_5_3",
		"name": "Unrelenting Poison Shield",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 2859],
		"pool": "6421+6422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_3"
	},
	{
		"id": "gritty-frost-t7-orb",
		"code": "ORB_7_5_2",
		"name": "Gritty Frost Orb",
		"set": "gritty-frost",
		"tier": 7,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 190116],
		"pool": "7441+7442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-orb",
		"code": "ORB_7_5_3",
		"name": "Unrelenting Poison Orb",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 190116],
		"pool": "7441+7442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_3"
	},
	{
		"id": "opportune-fire-t7-orb",
		"code": "ORB_7_5_1",
		"name": "Opportune Fire Orb",
		"set": "opportune-fire",
		"tier": 7,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 190116],
		"pool": "7441+7442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_1"
	},
	{
		"id": "swift-darkness-t7-orb",
		"code": "ORB_7_5_4",
		"name": "Swift Darkness Orb",
		"set": "swift-darkness",
		"tier": 7,
		"part": "orb",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 190116],
		"pool": "7441+7442",
		"options": 4,
		"runes": 0,
		"icon": "ORB_6_5_4"
	},
	{
		"id": "opportune-fire-t7-medium-secondary",
		"code": "GEAR_LIGHT_7_5_1",
		"name": "Opportune Fire Leather Cape",
		"set": "opportune-fire",
		"tier": 7,
		"part": "secondary",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defMagical", 3194],
		"pool": "7421",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_LIGHT_6_5_1"
	},
	{
		"id": "unrelenting-poison-t6-warrior-weapon",
		"code": "WEAPON_WARRIOR_6_5_3",
		"name": "Unrelenting Poison Greatsword",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "weapon",
		"classes": ["warrior"],
		"main": ["atk", 4870],
		"pool": "6431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_WARRIOR_6_5_3"
	},
	{
		"id": "swift-darkness-t7-medium-armor",
		"code": "ARMOR_LIGHT_7_5_4",
		"name": "Swift Darkness Scale Armor",
		"set": "swift-darkness",
		"tier": 7,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 3620],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_4"
	},
	{
		"id": "gritty-frost-t7-medium-armor",
		"code": "ARMOR_LIGHT_7_5_2",
		"name": "Gritty Frost Scale Armor",
		"set": "gritty-frost",
		"tier": 7,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 3620],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_2"
	},
	{
		"id": "unrelenting-poison-t7-medium-armor",
		"code": "ARMOR_LIGHT_7_5_3",
		"name": "Unrelenting Poison Scale Armor",
		"set": "unrelenting-poison",
		"tier": 7,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 3620],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_3"
	},
	{
		"id": "opportune-fire-t7-medium-armor",
		"code": "ARMOR_LIGHT_7_5_1",
		"name": "Opportune Fire Scale Armor",
		"set": "opportune-fire",
		"tier": 7,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 3620],
		"pool": "7411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_1"
	},
	{
		"id": "gritty-frost-t8-ring",
		"code": "ACCESSORY_RING_8_6_2",
		"name": "Gritty Frost Ring",
		"set": "gritty-frost",
		"tier": 8,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 226962],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_2"
	},
	{
		"id": "swift-darkness-t6-medium-armor",
		"code": "ARMOR_LIGHT_6_5_4",
		"name": "Swift Darkness Scale Armor",
		"set": "swift-darkness",
		"tier": 6,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 2431],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_4"
	},
	{
		"id": "unrelenting-poison-t6-medium-armor",
		"code": "ARMOR_LIGHT_6_5_3",
		"name": "Unrelenting Poison Scale Armor",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 2431],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_3"
	},
	{
		"id": "gritty-frost-t6-medium-armor",
		"code": "ARMOR_LIGHT_6_5_2",
		"name": "Gritty Frost Scale Armor",
		"set": "gritty-frost",
		"tier": 6,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 2431],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_2"
	},
	{
		"id": "opportune-fire-t6-medium-armor",
		"code": "ARMOR_LIGHT_6_5_1",
		"name": "Opportune Fire Scale Armor",
		"set": "opportune-fire",
		"tier": 6,
		"part": "armor",
		"kind": "medium",
		"classes": [
			"assassin",
			"archer",
			"mechanic"
		],
		"main": ["defPhysical", 2431],
		"pool": "6411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_LIGHT_6_5_1"
	},
	{
		"id": "unrelenting-poison-t8-heavy-secondary",
		"code": "GEAR_HEAVY_8_6_3",
		"name": "Unrelenting Poison Shield",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 5329],
		"pool": "8421+8422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_3"
	},
	{
		"id": "swift-darkness-t6-heavy-secondary",
		"code": "GEAR_HEAVY_6_5_4",
		"name": "Swift Darkness Shield",
		"set": "swift-darkness",
		"tier": 6,
		"part": "secondary",
		"kind": "heavy",
		"classes": ["knight", "warrior"],
		"main": ["defMagical", 2859],
		"pool": "6421+6422",
		"options": 4,
		"runes": 1,
		"icon": "GEAR_HEAVY_6_5_4"
	},
	{
		"id": "unrelenting-poison-t8-necklace",
		"code": "ACCESSORY_NECKLACE_8_6_3",
		"name": "Unrelenting Poison Necklace",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "accessory",
		"kind": "necklace",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["defMagical", 3553],
		"pool": "8431+8432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_NECKLACE_6_5_3"
	},
	{
		"id": "unrelenting-poison-t8-light-armor",
		"code": "ARMOR_ROBE_8_6_3",
		"name": "Unrelenting Poison Robe",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "armor",
		"kind": "light",
		"classes": ["wizard", "priest"],
		"main": ["defPhysical", 1777],
		"pool": "8411",
		"options": 4,
		"runes": 1,
		"icon": "ARMOR_ROBE_6_5_3"
	},
	{
		"id": "unrelenting-poison-t6-ring",
		"code": "ACCESSORY_RING_6_5_3",
		"name": "Unrelenting Poison Ring",
		"set": "unrelenting-poison",
		"tier": 6,
		"part": "accessory",
		"kind": "ring",
		"classes": [
			"knight",
			"warrior",
			"archer",
			"assassin",
			"mechanic",
			"wizard",
			"priest"
		],
		"main": ["hp", 127282],
		"pool": "6431+6432",
		"options": 4,
		"runes": 0,
		"icon": "ACCESSORY_RING_6_5_3"
	},
	{
		"id": "swift-darkness-t8-mechanic-weapon",
		"code": "WEAPON_MECHANIC_8_6_4",
		"name": "Swift Darkness Gun",
		"set": "swift-darkness",
		"tier": 8,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 10266],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_4"
	},
	{
		"id": "opportune-fire-t8-mechanic-weapon",
		"code": "WEAPON_MECHANIC_8_6_1",
		"name": "Opportune Fire Gun",
		"set": "opportune-fire",
		"tier": 8,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 10266],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_1"
	},
	{
		"id": "unrelenting-poison-t8-mechanic-weapon",
		"code": "WEAPON_MECHANIC_8_6_3",
		"name": "Unrelenting Poison Gun",
		"set": "unrelenting-poison",
		"tier": 8,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 10266],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_3"
	},
	{
		"id": "gritty-frost-t8-mechanic-weapon",
		"code": "WEAPON_MECHANIC_8_6_2",
		"name": "Gritty Frost Gun",
		"set": "gritty-frost",
		"tier": 8,
		"part": "weapon",
		"classes": ["mechanic"],
		"main": ["atk", 10266],
		"pool": "8431",
		"options": 4,
		"runes": 1,
		"icon": "WEAPON_MECHANIC_6_5_2"
	}
];
var KR_SETS$1 = {
	"opportune-fire": {
		"name": "Opportune Fire",
		"two": { "crit": .18 },
		"four": { "crit": .27 }
	},
	"gritty-frost": {
		"name": "Gritty Frost",
		"two": { "hp": .11 },
		"four": { "hp": .165 }
	},
	"unrelenting-poison": {
		"name": "Unrelenting Poison",
		"two": { "critResist": .09 },
		"four": { "critResist": .135 }
	},
	"swift-darkness": {
		"name": "Swift Darkness",
		"two": { "manaAttack": .11 },
		"four": { "manaAttack": .165 }
	},
	"perseverance": {
		"name": "Perseverance",
		"detail": 9001,
		"four": {
			"knight": {
				"skill": 8100110,
				"text": "Increases DMG dealt to enemies by 10% and takes 10% reduced All DMG. This effect increases up to max 20% over 50 sec."
			},
			"priest": {
				"skill": 8100710,
				"text": "Increases the amount of own Heal Rate effects by 25% and Shield by 25%."
			},
			"warrior": {
				"skill": 8100210,
				"text": "Increases DMG dealt to enemies by 10% and ATK by 10%. This effect increases up to max 25% over 100 sec."
			},
			"wizard": {
				"skill": 8100610,
				"text": "Increases DMG dealt to enemies by 10% and Crit DMG by 20%. This effect increases DMG dealt to enemies up to max 25%, and Crit DMG up to max 50% over 100 sec."
			},
			"mechanic": {
				"skill": 8100510,
				"text": "Increases DMG dealt to enemies by 10% and Crit DMG by 20%. This effect increases DMG dealt to enemies up to max 25%, and Crit DMG up to max 50% over 100 sec."
			},
			"archer": {
				"skill": 8100410,
				"text": "Increases DMG dealt to enemies by 10% and ATK by 10%. This effect increases up to max 25% over 100 sec."
			},
			"assassin": {
				"skill": 8100310,
				"text": "Increases DMG dealt to enemies by 10% and ATK by 10%. This effect increases up to max 25% over 100 sec."
			}
		}
	},
	"hope": {
		"name": "Hope",
		"detail": 9002,
		"four": {
			"assassin": {
				"skill": 8100320,
				"text": "Increases Crit DMG by 40%. Upon Skill use, recovers 300 Mana, and additionally increases Crit DMG by 40% for 3 sec."
			},
			"warrior": {
				"skill": 8100220,
				"text": "Increases ATK Spd of all allies by 100. The effect multiplies by 2 for melee type Heroes."
			},
			"knight": {
				"skill": 8100120,
				"text": "Increases all allies' All DEF by 10% and ATK by 5%."
			},
			"wizard": {
				"skill": 8100620,
				"text": "Increases all allies' DMG dealt to enemies by 2%. After 30 sec, increases the effect of 1 ally who dealt the highest DMG to enemies by 2 times."
			},
			"priest": {
				"skill": 8100730,
				"text": "Increases Heal Rate of all allies by 6%. After 5 sec, increases Mana Recovery of all allies by 6%."
			},
			"mechanic": {
				"skill": 8100520,
				"text": "Recovers all allies' Mana by 500 and reduces Cooldown of all Skills by 0.5 sec every 10 sec."
			},
			"archer": {
				"skill": 8100420,
				"text": "Increases Crit DMG of all allies by 20%. This effect multiplies by 2 for ranged type Heroes."
			}
		}
	},
	"authority": {
		"name": "Authority",
		"detail": 9003,
		"four": {
			"wizard": {
				"skill": 8100630,
				"text": "After fully recovering Mana for the first time, increases Mana Recovery by 20% and ATK by 40%."
			},
			"mechanic": {
				"skill": 8100530,
				"text": "Increases own Crit Chance by 300. If own Crit Chance is over 1400, all hits become a Crit Hit."
			},
			"archer": {
				"skill": 8100430,
				"text": "Increases own ATK by 25%. At the beginning of each battle, this effect multiplies by 2 for 20 sec."
			},
			"warrior": {
				"skill": 8100230,
				"text": "Increases own Max HP by 30%. For 1 time only during the battle, recovers 30% of Max HP and permanently increases ATK Spd by 300 if own HP percentage falls below 50%."
			},
			"knight": {
				"skill": 8100130,
				"text": "Increases own All Block Chance by 300. Upon successful Block, reduces Cooldown of all Skills by 1 sec. This effect activates only once every 2.5 sec."
			},
			"assassin": {
				"skill": 8100330,
				"text": "Increases own DEF Penetration by 250 and DMG that ignores DEF by 12%. By killing an enemy, additionally increases DEF Penetration by 250 and DMG that ignores DEF by 12%."
			},
			"priest": {
				"skill": 8100720,
				"text": "Increases ATK of all allies by 10%."
			}
		}
	}
};
/** TechnoMagic gear's unique options (KR's 47), by number: the fight's additional skill each is (null: none), and KR's words and numbers. */
var KR_UNIQUE$1 = [
	{
		"n": 1,
		"skill": "lone-foe",
		"text": "Increases ATK by 35% when there is 1 enemy.",
		"params": ["1", "35"]
	},
	{
		"n": 2,
		"skill": "lone-guard",
		"text": "Increases DEF by 45% when there is 1 enemy.",
		"params": ["1", "45"]
	},
	{
		"n": 3,
		"skill": null,
		"text": "Increases ATK by 35% when there are 3 enemies.",
		"params": ["3", "35"]
	},
	{
		"n": 4,
		"skill": null,
		"text": "Increases DEF by 45% when there are 3 enemies.",
		"params": ["3", "45"]
	},
	{
		"n": 5,
		"skill": "desperation",
		"text": "Increases ATK by 50% for 10 sec when HP falls below 30%. This effect activates only once every 10 sec.",
		"params": [
			"30",
			"10",
			"50",
			"10"
		]
	},
	{
		"n": 6,
		"skill": "vigor",
		"text": "Increases own DMG dealt to enemies by 25% when HP is above 95%.",
		"params": ["95", "25"]
	},
	{
		"n": 7,
		"skill": "surge",
		"text": "Increases DMG dealt to enemies by 15% for 10 sec when Mana is at 100%. This effect activates only once every 15 sec.",
		"params": [
			"100",
			"10",
			"15",
			"15"
		]
	},
	{
		"n": 8,
		"skill": "overflow",
		"text": "Immediately reduces Cooldown of all allies by 3% when Mana is at 100%. This effect activates only once every 10 sec.",
		"params": [
			"100",
			"3",
			"10"
		]
	},
	{
		"n": 9,
		"skill": "focus-1",
		"text": "Reduces Cooldown of 1st Skill by 10% every 10 sec.",
		"params": [
			"10",
			"1",
			"10"
		]
	},
	{
		"n": 10,
		"skill": "focus-2",
		"text": "Reduces Cooldown of 2nd Skill by 10% every 10 sec.",
		"params": [
			"10",
			"2",
			"10"
		]
	},
	{
		"n": 11,
		"skill": "focus-3",
		"text": "Reduces Cooldown of 3rd Skill by 10% every 10 sec.",
		"params": [
			"10",
			"3",
			"10"
		]
	},
	{
		"n": 12,
		"skill": "momentum",
		"text": "Upon every Skill use, increases ATK by 2%. This effect can be stacked up to max 20 times.",
		"params": ["2", "20"]
	},
	{
		"n": 13,
		"skill": "steadfast",
		"text": "Upon every Skill use, takes 3% reduced DMG. This effect can be stacked up to max 8 times.",
		"params": ["3", "8"]
	},
	{
		"n": 14,
		"skill": null,
		"text": "Upon blocking the enemy’s attack, increases All Block by 20. This effect can be stacked up to max 20 times and activates only once every 2 sec.",
		"params": [
			"20",
			"20",
			"2"
		]
	},
	{
		"n": 15,
		"skill": "physical-ward",
		"text": "Takes 20% reduced P.DMG. This effect can increase up to 30% over 10 sec.",
		"params": [
			"20",
			"10",
			"30"
		]
	},
	{
		"n": 16,
		"skill": "magical-ward",
		"text": "Takes 20% reduced M.DMG. This effect can increase up to 30% over 10 sec.",
		"params": [
			"20",
			"10",
			"30"
		]
	},
	{
		"n": 17,
		"skill": "persistence",
		"text": "Increases DMG dealt to enemies by 3% every 15 sec. This effect can be stacked up to max 12 times.",
		"params": [
			"15",
			"3",
			"12"
		]
	},
	{
		"n": 18,
		"skill": "parry",
		"text": "Upon blocking an enemy attack, recovers 200 Mana. This effect activates only once every 1 sec.",
		"params": ["200", "1"]
	},
	{
		"n": 19,
		"skill": "mending",
		"text": "Upon Skill use, increases Heal Rate by 25% for 5 sec. This effect activates only once every 10 sec.",
		"params": [
			"5",
			"25",
			"10"
		]
	},
	{
		"n": 20,
		"skill": null,
		"text": "Increases DMG of [DMG that ignores DEF] by 25%.",
		"params": ["25"]
	},
	{
		"n": 21,
		"skill": null,
		"text": "Increases DMG of [Continuous DMG] by 20%.",
		"params": ["20"]
	},
	{
		"n": 22,
		"skill": null,
		"text": "Upon killing an enemy, increases ATK by 2%. This effect can be stacked up to max 25 times.",
		"params": ["2", "25"]
	},
	{
		"n": 23,
		"skill": "warm-up",
		"text": "At the beginning of each battle, increases ATK by 5%. This effect can be stacked up to max 15 times.",
		"params": ["5", "15"]
	},
	{
		"n": 24,
		"skill": null,
		"text": "Increases DEF by 7% per 1 enemy.",
		"params": ["1", "7"]
	},
	{
		"n": 25,
		"skill": null,
		"text": "Increases ATK by 6% per 1 enemy.",
		"params": ["1", "6"]
	},
	{
		"n": 26,
		"skill": "war-cry",
		"text": "Increases ATK of all allies by 5%.",
		"params": ["5"]
	},
	{
		"n": 27,
		"skill": "whetstone",
		"text": "Increases Crit DMG of all allies by 10%.",
		"params": ["10"]
	},
	{
		"n": 28,
		"skill": "bastion",
		"text": "Increases All DEF of all allies by 7%.",
		"params": ["7"]
	},
	{
		"n": 29,
		"skill": "champion",
		"text": "At the beginning of each battle, increases DMG dealt to enemies of the ally with the highest ATK by 2.5% for 200 sec.",
		"params": ["200", "2.5"]
	},
	{
		"n": 30,
		"skill": "fundamentals",
		"text": "Increases DMG of normal attacks by 25%.",
		"params": ["25"]
	},
	{
		"n": 31,
		"skill": "iron-wall",
		"text": "Increases All Block by 150. At the beginning of each battle, additionally increases All Block by 200 for 10 sec.",
		"params": [
			"150",
			"10",
			"200"
		]
	},
	{
		"n": 32,
		"skill": "aegis",
		"text": "Increases own Shield by 25%.",
		"params": ["25"]
	},
	{
		"n": 33,
		"skill": "regeneration",
		"text": "Recovers HP equal to 1% of Max HP for 1 sec.",
		"params": ["1"]
	},
	{
		"n": 34,
		"skill": "mana-spring",
		"text": "Recovers own Mana by 500 every 5 sec.",
		"params": ["5", "500"]
	},
	{
		"n": 35,
		"skill": "berserk",
		"text": "Reduces All DEF by 25% and increases ATK by 50%.",
		"params": ["25", "50"]
	},
	{
		"n": 36,
		"skill": "fortress",
		"text": "Reduces ATK by 20% and increases All DEF by 50%.",
		"params": ["20", "50"]
	},
	{
		"n": 37,
		"skill": "tenacity",
		"text": "Reduces the duration of CCs inflicted upon self by 15%.",
		"params": ["15"]
	},
	{
		"n": 38,
		"skill": "mirage",
		"text": "Increases Dodge Change by 200. Upon dodging an enemy attack, heals HP equal to 3% of Max HP. This effect activates only once every 3 sec.",
		"params": [
			"200",
			"3",
			"3"
		]
	},
	{
		"n": 39,
		"skill": "overdrive",
		"text": "Fixes ATK Spd to 1000 and increases ATK by 40%.",
		"params": ["1000", "40"]
	},
	{
		"n": 40,
		"skill": "ruthless",
		"text": "Increases Crit DMG by 50%.",
		"params": ["50"]
	},
	{
		"n": 41,
		"skill": "swiftness",
		"text": "Increases ATK Spd by 250.",
		"params": ["250"]
	},
	{
		"n": 42,
		"skill": "piercing",
		"text": "Increases DEF Penetration by 250.",
		"params": ["250"]
	},
	{
		"n": 43,
		"skill": "vitality",
		"text": "Increases Max HP by 25%.",
		"params": ["25"]
	},
	{
		"n": 44,
		"skill": "guard",
		"text": "Increases All Block by 250.",
		"params": ["250"]
	},
	{
		"n": 45,
		"skill": "armor",
		"text": "Increases All DEF by 25%.",
		"params": ["25"]
	},
	{
		"n": 46,
		"skill": "precision",
		"text": "Increases Crit Chance by 250.",
		"params": ["250"]
	},
	{
		"n": 47,
		"skill": "might",
		"text": "Increases ATK by 25%.",
		"params": ["25"]
	}
];
var KR_RUNES$1 = [
	{
		"id": "fierce-1",
		"code": "RUNE_FIERCE_1",
		"name": "Rune of Fierce Attack: Common",
		"grade": 1,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .038 },
		"icon": "RUNE_FIERCE_1"
	},
	{
		"id": "precision-3",
		"code": "RUNE_PRECISION_3",
		"name": "Rune of Precision: Rare",
		"grade": 3,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .072 },
		"icon": "RUNE_PRECISION_3"
	},
	{
		"id": "steel-1",
		"code": "RUNE_STEEL_1",
		"name": "Rune of Steel: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .063 },
		"icon": "RUNE_STEEL_1"
	},
	{
		"id": "heartless-4",
		"code": "RUNE_HEARTLESS_4",
		"name": "Rune of the Heartless: Heroic",
		"grade": 4,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .133 },
		"icon": "RUNE_HEARTLESS_4"
	},
	{
		"id": "defense-agitation-5",
		"code": "RUNE_DEFENSE_AGITATION_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"manaAttack": .22,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_AGITATION_5"
	},
	{
		"id": "frenzy-mprecovertime-5",
		"code": "RUNE_FRENZY_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"manaRegen": .33
		},
		"icon": "RUNE_FRENZY_MPRECOVERTIME_5"
	},
	{
		"id": "sharpness-1",
		"code": "RUNE_SHARPNESS_1",
		"name": "Rune of Sharpness: Common",
		"grade": 1,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .033 },
		"icon": "RUNE_SHARPNESS_1"
	},
	{
		"id": "heartless-3",
		"code": "RUNE_HEARTLESS_3",
		"name": "Rune of the Heartless: Rare",
		"grade": 3,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .105 },
		"icon": "RUNE_HEARTLESS_3"
	},
	{
		"id": "protection-40",
		"code": "RUNE_PROTECTION_40",
		"name": "Rune of Protection: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .162 },
		"icon": "RUNE_PROTECTION_5",
		"ancient": true
	},
	{
		"id": "swiftness-mprecovertime-5",
		"code": "RUNE_SWIFTNESS_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"manaRegen": .33
		},
		"icon": "RUNE_SWIFTNESS_MPRECOVERTIME_5"
	},
	{
		"id": "sharpness-2",
		"code": "RUNE_SHARPNESS_2",
		"name": "Rune of Sharpness: Uncommon",
		"grade": 2,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .052 },
		"icon": "RUNE_SHARPNESS_2"
	},
	{
		"id": "fierce-precision-5",
		"code": "RUNE_FIERCE_PRECISION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_PRECISION_5"
	},
	{
		"id": "toughness-2",
		"code": "RUNE_TOUGHNESS_2",
		"name": "Rune of Toughness: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .076 },
		"icon": "RUNE_TOUGHNESS_2"
	},
	{
		"id": "exclusion-2",
		"code": "RUNE_EXCLUSION_2",
		"name": "Rune of Exclusion: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .1 },
		"icon": "RUNE_EXCLUSION_2"
	},
	{
		"id": "toughness-1",
		"code": "RUNE_TOUGHNESS_1",
		"name": "Rune of Toughness: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .048 },
		"icon": "RUNE_TOUGHNESS_1"
	},
	{
		"id": "block-swiftness-5",
		"code": "RUNE_BLOCK_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"block": .055
		},
		"icon": "RUNE_BLOCK_SWIFTNESS_5"
	},
	{
		"id": "toughness-4",
		"code": "RUNE_TOUGHNESS_4",
		"name": "Rune of Toughness: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .133 },
		"icon": "RUNE_TOUGHNESS_4"
	},
	{
		"id": "vitality-5",
		"code": "RUNE_VITALITY_5",
		"name": "Rune of Vitality: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaRegen": .38 },
		"icon": "RUNE_VITALITY_5"
	},
	{
		"id": "fierce-sharpness-5",
		"code": "RUNE_FIERCE_SHARPNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_SHARPNESS_5"
	},
	{
		"id": "swiftness-40",
		"code": "RUNE_SWIFTNESS_40",
		"name": "Rune of Swiftness: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .111 },
		"icon": "RUNE_SWIFTNESS_5",
		"ancient": true
	},
	{
		"id": "fierce-mprecovertime-5",
		"code": "RUNE_FIERCE_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"manaRegen": .33
		},
		"icon": "RUNE_FIERCE_MPRECOVERTIME_5"
	},
	{
		"id": "fierce-swiftness-5",
		"code": "RUNE_FIERCE_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_SWIFTNESS_5"
	},
	{
		"id": "fierce-thirst-5",
		"code": "RUNE_FIERCE_THIRST_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"lifesteal": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_THIRST_5"
	},
	{
		"id": "totaldodgecri-resistance-5",
		"code": "RUNE_TOTALDODGECRI_RESISTANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"critResist": .055
		},
		"icon": "RUNE_TOTALDODGECRI_RESISTANCE_5"
	},
	{
		"id": "swiftness-stamina-5",
		"code": "RUNE_SWIFTNESS_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"hp": .11
		},
		"icon": "RUNE_SWIFTNESS_STAMINA_5"
	},
	{
		"id": "protection-reduced-5",
		"code": "RUNE_PROTECTION_REDUCED_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"defMagical": .22,
			"tough": .055
		},
		"icon": "RUNE_PROTECTION_REDUCED_5"
	},
	{
		"id": "agility-5",
		"code": "RUNE_AGILITY_5",
		"name": "Rune of Agility: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .19 },
		"icon": "RUNE_AGILITY_5"
	},
	{
		"id": "avoid-block-5",
		"code": "RUNE_AVOID_BLOCK_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"block": .055,
			"dodge": .055
		},
		"icon": "RUNE_AVOID_BLOCK_5"
	},
	{
		"id": "willpower-1",
		"code": "RUNE_WILLPOWER_1",
		"name": "Rune of Willpower: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .048 },
		"icon": "RUNE_WILLPOWER_1"
	},
	{
		"id": "denial-4",
		"code": "RUNE_DENIAL_4",
		"name": "Rune of Denial: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .105 },
		"icon": "RUNE_DENIAL_4"
	},
	{
		"id": "denial-5",
		"code": "RUNE_DENIAL_5",
		"name": "Rune of Denial: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .15 },
		"icon": "RUNE_DENIAL_5"
	},
	{
		"id": "agility-3",
		"code": "RUNE_AGILITY_3",
		"name": "Rune of Agility: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .105 },
		"icon": "RUNE_AGILITY_3"
	},
	{
		"id": "ccchance-mprecovertime-5",
		"code": "RUNE_CCCHANCE_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"accuracy": .11,
			"manaRegen": .33
		},
		"icon": "RUNE_CCCHANCE_MPRECOVERTIME_5"
	},
	{
		"id": "denial-2",
		"code": "RUNE_DENIAL_2",
		"name": "Rune of Denial: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .06 },
		"icon": "RUNE_DENIAL_2"
	},
	{
		"id": "denial-3",
		"code": "RUNE_DENIAL_3",
		"name": "Rune of Denial: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .083 },
		"icon": "RUNE_DENIAL_3"
	},
	{
		"id": "reduced-mprecovertime-5",
		"code": "RUNE_REDUCED_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"manaRegen": .33,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_MPRECOVERTIME_5"
	},
	{
		"id": "resistance-40",
		"code": "RUNE_RESISTANCE_40",
		"name": "Rune of Resistance: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .111 },
		"icon": "RUNE_RESISTANCE_5",
		"ancient": true
	},
	{
		"id": "denial-1",
		"code": "RUNE_DENIAL_1",
		"name": "Rune of Denial: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .038 },
		"icon": "RUNE_DENIAL_1"
	},
	{
		"id": "stamina-3",
		"code": "RUNE_STAMINA_3",
		"name": "Rune of Stamina: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .083 },
		"icon": "RUNE_STAMINA_3"
	},
	{
		"id": "sharpness-frenzy-5",
		"code": "RUNE_SHARPNESS_FRENZY_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"pen": .11
		},
		"icon": "RUNE_SHARPNESS_FRENZY_5"
	},
	{
		"id": "heartless-swiftness-5",
		"code": "RUNE_HEARTLESS_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"speed": .11
		},
		"icon": "RUNE_HEARTLESS_SWIFTNESS_5"
	},
	{
		"id": "steel-5",
		"code": "RUNE_STEEL_5",
		"name": "Rune of Steel: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .25 },
		"icon": "RUNE_STEEL_5"
	},
	{
		"id": "totaldodgecri-recover-5",
		"code": "RUNE_TOTALDODGECRI_RECOVER_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"critResist": .055
		},
		"icon": "RUNE_TOTALDODGECRI_RECOVER_5"
	},
	{
		"id": "fierce-reduced-5",
		"code": "RUNE_FIERCE_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"tough": .055
		},
		"icon": "RUNE_FIERCE_REDUCED_5"
	},
	{
		"id": "steel-2",
		"code": "RUNE_STEEL_2",
		"name": "Rune of Steel: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .1 },
		"icon": "RUNE_STEEL_2"
	},
	{
		"id": "heartless-thirst-5",
		"code": "RUNE_HEARTLESS_THIRST_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"lifesteal": .11
		},
		"icon": "RUNE_HEARTLESS_THIRST_5"
	},
	{
		"id": "patience-reduced-5",
		"code": "RUNE_PATIENCE_REDUCED_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"defPhysical": .22,
			"tough": .055
		},
		"icon": "RUNE_PATIENCE_REDUCED_5"
	},
	{
		"id": "heartless-2",
		"code": "RUNE_HEARTLESS_2",
		"name": "Rune of the Heartless: Uncommon",
		"grade": 2,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .076 },
		"icon": "RUNE_HEARTLESS_2"
	},
	{
		"id": "frenzy-precision-5",
		"code": "RUNE_FRENZY_PRECISION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"acc": .11
		},
		"icon": "RUNE_FRENZY_PRECISION_5"
	},
	{
		"id": "heartless-1",
		"code": "RUNE_HEARTLESS_1",
		"name": "Rune of the Heartless: Common",
		"grade": 1,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .048 },
		"icon": "RUNE_HEARTLESS_1"
	},
	{
		"id": "reduced-recover-5",
		"code": "RUNE_REDUCED_RECOVER_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_RECOVER_5"
	},
	{
		"id": "fierce-heartless-5",
		"code": "RUNE_FIERCE_HEARTLESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_HEARTLESS_5"
	},
	{
		"id": "frenzy-reduced-5",
		"code": "RUNE_FRENZY_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"tough": .055
		},
		"icon": "RUNE_FRENZY_REDUCED_5"
	},
	{
		"id": "agitation-2",
		"code": "RUNE_AGITATION_2",
		"name": "Rune of Agitation: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .052 },
		"icon": "RUNE_AGITATION_2"
	},
	{
		"id": "heartless-defense-5",
		"code": "RUNE_HEARTLESS_DEFENSE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"defense": .11
		},
		"icon": "RUNE_HEARTLESS_DEFENSE_5"
	},
	{
		"id": "reduced-avoid-5",
		"code": "RUNE_REDUCED_AVOID_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"dodge": .055,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_AVOID_5"
	},
	{
		"id": "sharpness-40",
		"code": "RUNE_SHARPNESS_40",
		"name": "Rune of Sharpness: Ancient",
		"grade": 5,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .111 },
		"icon": "RUNE_SHARPNESS_5",
		"ancient": true
	},
	{
		"id": "willpower-2",
		"code": "RUNE_WILLPOWER_2",
		"name": "Rune of Willpower: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .076 },
		"icon": "RUNE_WILLPOWER_2"
	},
	{
		"id": "life-5",
		"code": "RUNE_LIFE_5",
		"name": "Rune of Life: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "recovery": .19 },
		"icon": "RUNE_LIFE_5"
	},
	{
		"id": "willpower-4",
		"code": "RUNE_WILLPOWER_4",
		"name": "Rune of Willpower: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .133 },
		"icon": "RUNE_WILLPOWER_4"
	},
	{
		"id": "heartless-reduced-5",
		"code": "RUNE_HEARTLESS_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"tough": .055
		},
		"icon": "RUNE_HEARTLESS_REDUCED_5"
	},
	{
		"id": "frenzy-defense-5",
		"code": "RUNE_FRENZY_DEFENSE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"defense": .11
		},
		"icon": "RUNE_FRENZY_DEFENSE_5"
	},
	{
		"id": "sharpness-defense-5",
		"code": "RUNE_SHARPNESS_DEFENSE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"defense": .11
		},
		"icon": "RUNE_SHARPNESS_DEFENSE_5"
	},
	{
		"id": "fierce-defense-5",
		"code": "RUNE_FIERCE_DEFENSE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"defense": .11
		},
		"icon": "RUNE_FIERCE_DEFENSE_5"
	},
	{
		"id": "frenzy-agitation-5",
		"code": "RUNE_FRENZY_AGITATION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"manaAttack": .22
		},
		"icon": "RUNE_FRENZY_AGITATION_5"
	},
	{
		"id": "agitation-swiftness-5",
		"code": "RUNE_AGITATION_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_AGITATION_SWIFTNESS_5"
	},
	{
		"id": "flexibility-4",
		"code": "RUNE_FLEXIBILITY_4",
		"name": "Rune of Flexibility: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .133 },
		"icon": "RUNE_FLEXIBILITY_4"
	},
	{
		"id": "flexibility-3",
		"code": "RUNE_FLEXIBILITY_3",
		"name": "Rune of Flexibility: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .105 },
		"icon": "RUNE_FLEXIBILITY_3"
	},
	{
		"id": "protection-4",
		"code": "RUNE_PROTECTION_4",
		"name": "Rune of Protection: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .133 },
		"icon": "RUNE_PROTECTION_4"
	},
	{
		"id": "protection-5",
		"code": "RUNE_PROTECTION_5",
		"name": "Rune of Protection: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .19 },
		"icon": "RUNE_PROTECTION_5"
	},
	{
		"id": "exclusion-1",
		"code": "RUNE_EXCLUSION_1",
		"name": "Rune of Exclusion: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .063 },
		"icon": "RUNE_EXCLUSION_1"
	},
	{
		"id": "denial-40",
		"code": "RUNE_DENIAL_40",
		"name": "Rune of Denial: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefMagical": .128 },
		"icon": "RUNE_DENIAL_5",
		"ancient": true
	},
	{
		"id": "protection-1",
		"code": "RUNE_PROTECTION_1",
		"name": "Rune of Protection: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .048 },
		"icon": "RUNE_PROTECTION_1"
	},
	{
		"id": "protection-2",
		"code": "RUNE_PROTECTION_2",
		"name": "Rune of Protection: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .076 },
		"icon": "RUNE_PROTECTION_2"
	},
	{
		"id": "fierce-avoid-5",
		"code": "RUNE_FIERCE_AVOID_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"dodge": .055
		},
		"icon": "RUNE_FIERCE_AVOID_5"
	},
	{
		"id": "protection-3",
		"code": "RUNE_PROTECTION_3",
		"name": "Rune of Protection: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defMagical": .105 },
		"icon": "RUNE_PROTECTION_3"
	},
	{
		"id": "swiftness-4",
		"code": "RUNE_SWIFTNESS_4",
		"name": "Rune of Swiftness: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .091 },
		"icon": "RUNE_SWIFTNESS_4"
	},
	{
		"id": "heartless-5",
		"code": "RUNE_HEARTLESS_5",
		"name": "Rune of the Heartless: Legendary",
		"grade": 6,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .19 },
		"icon": "RUNE_HEARTLESS_5"
	},
	{
		"id": "thirst-40",
		"code": "RUNE_THIRST_40",
		"name": "Rune of Thirst: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .051 },
		"icon": "RUNE_THIRST_5",
		"ancient": true
	},
	{
		"id": "thirst-swiftness-5",
		"code": "RUNE_THIRST_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"lifesteal": .11,
			"speed": .11
		},
		"icon": "RUNE_THIRST_SWIFTNESS_5"
	},
	{
		"id": "ccchance-agitation-5",
		"code": "RUNE_CCCHANCE_AGITATION_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"accuracy": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_CCCHANCE_AGITATION_5"
	},
	{
		"id": "swiftness-1",
		"code": "RUNE_SWIFTNESS_1",
		"name": "Rune of Swiftness: Common",
		"grade": 1,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .033 },
		"icon": "RUNE_SWIFTNESS_1"
	},
	{
		"id": "heartless-avoid-5",
		"code": "RUNE_HEARTLESS_AVOID_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"dodge": .055
		},
		"icon": "RUNE_HEARTLESS_AVOID_5"
	},
	{
		"id": "swiftness-2",
		"code": "RUNE_SWIFTNESS_2",
		"name": "Rune of Swiftness: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .052 },
		"icon": "RUNE_SWIFTNESS_2"
	},
	{
		"id": "defense-stamina-5",
		"code": "RUNE_DEFENSE_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_STAMINA_5"
	},
	{
		"id": "potential-3",
		"code": "RUNE_POTENTIAL_3",
		"name": "Rune of Potential: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .138 },
		"icon": "RUNE_POTENTIAL_3"
	},
	{
		"id": "patience-5",
		"code": "RUNE_PATIENCE_5",
		"name": "Rune of Patience: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .19 },
		"icon": "RUNE_PATIENCE_5"
	},
	{
		"id": "patience-4",
		"code": "RUNE_PATIENCE_4",
		"name": "Rune of Patience: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .133 },
		"icon": "RUNE_PATIENCE_4"
	},
	{
		"id": "defense-block-5",
		"code": "RUNE_DEFENSE_BLOCK_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"block": .055,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_BLOCK_5"
	},
	{
		"id": "patience-1",
		"code": "RUNE_PATIENCE_1",
		"name": "Rune of Patience: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .048 },
		"icon": "RUNE_PATIENCE_1"
	},
	{
		"id": "potential-40",
		"code": "RUNE_POTENTIAL_40",
		"name": "Rune of Potential: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .213 },
		"icon": "RUNE_POTENTIAL_5",
		"ancient": true
	},
	{
		"id": "agitation-3",
		"code": "RUNE_AGITATION_3",
		"name": "Rune of the Agitation: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .072 },
		"icon": "RUNE_AGITATION_3"
	},
	{
		"id": "potential-5",
		"code": "RUNE_POTENTIAL_5",
		"name": "Rune of Potential: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .25 },
		"icon": "RUNE_POTENTIAL_5"
	},
	{
		"id": "patience-3",
		"code": "RUNE_PATIENCE_3",
		"name": "Rune of Patience: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .105 },
		"icon": "RUNE_PATIENCE_3"
	},
	{
		"id": "patience-2",
		"code": "RUNE_PATIENCE_2",
		"name": "Rune of Patience: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .076 },
		"icon": "RUNE_PATIENCE_2"
	},
	{
		"id": "agitation-5",
		"code": "RUNE_AGITATION_5",
		"name": "Rune of Agitation: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .13 },
		"icon": "RUNE_AGITATION_5"
	},
	{
		"id": "agitation-stamina-5",
		"code": "RUNE_AGITATION_STAMINA_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_AGITATION_STAMINA_5"
	},
	{
		"id": "resistance-5",
		"code": "RUNE_RESISTANCE_5",
		"name": "Rune of Resistance: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .13 },
		"icon": "RUNE_RESISTANCE_5"
	},
	{
		"id": "resistance-4",
		"code": "RUNE_RESISTANCE_4",
		"name": "Rune of Resistance: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .091 },
		"icon": "RUNE_RESISTANCE_4"
	},
	{
		"id": "block-agitation-5",
		"code": "RUNE_BLOCK_AGITATION_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"manaAttack": .22,
			"block": .055
		},
		"icon": "RUNE_BLOCK_AGITATION_5"
	},
	{
		"id": "willpower-3",
		"code": "RUNE_WILLPOWER_3",
		"name": "Rune of Willpower: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .105 },
		"icon": "RUNE_WILLPOWER_3"
	},
	{
		"id": "resistance-1",
		"code": "RUNE_RESISTANCE_1",
		"name": "Rune of Resistance: Common",
		"grade": 1,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .033 },
		"icon": "RUNE_RESISTANCE_1"
	},
	{
		"id": "heartless-block-5",
		"code": "RUNE_HEARTLESS_BLOCK_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"block": .055
		},
		"icon": "RUNE_HEARTLESS_BLOCK_5"
	},
	{
		"id": "agility-4",
		"code": "RUNE_AGILITY_4",
		"name": "Rune of Agility: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .133 },
		"icon": "RUNE_AGILITY_4"
	},
	{
		"id": "resistance-3",
		"code": "RUNE_RESISTANCE_3",
		"name": "Rune of Resistance: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .072 },
		"icon": "RUNE_RESISTANCE_3"
	},
	{
		"id": "sharpness-stamina-5",
		"code": "RUNE_SHARPNESS_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"hp": .11
		},
		"icon": "RUNE_SHARPNESS_STAMINA_5"
	},
	{
		"id": "resistance-2",
		"code": "RUNE_RESISTANCE_2",
		"name": "Rune of Resistance: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["armor"],
		"stats": { "resist": .052 },
		"icon": "RUNE_RESISTANCE_2"
	},
	{
		"id": "agility-1",
		"code": "RUNE_AGILITY_1",
		"name": "Rune of Agility: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .048 },
		"icon": "RUNE_AGILITY_1"
	},
	{
		"id": "heartless-stamina-5",
		"code": "RUNE_HEARTLESS_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"hp": .11
		},
		"icon": "RUNE_HEARTLESS_STAMINA_5"
	},
	{
		"id": "willpower-5",
		"code": "RUNE_WILLPOWER_5",
		"name": "Rune of Willpower: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .19 },
		"icon": "RUNE_WILLPOWER_5"
	},
	{
		"id": "agility-2",
		"code": "RUNE_AGILITY_2",
		"name": "Rune of Agility: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .076 },
		"icon": "RUNE_AGILITY_2"
	},
	{
		"id": "sharpness-heartless-5",
		"code": "RUNE_SHARPNESS_HEARTLESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"pen": .11
		},
		"icon": "RUNE_SHARPNESS_HEARTLESS_5"
	},
	{
		"id": "frenzy-40",
		"code": "RUNE_FRENZY_40",
		"name": "Rune of Frenzy: Ancient",
		"grade": 5,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .213 },
		"icon": "RUNE_FRENZY_5",
		"ancient": true
	},
	{
		"id": "protection-stamina-5",
		"code": "RUNE_PROTECTION_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"defMagical": .22
		},
		"icon": "RUNE_PROTECTION_STAMINA_5"
	},
	{
		"id": "precision-2",
		"code": "RUNE_PRECISION_2",
		"name": "Rune of Precision: Uncommon",
		"grade": 2,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .052 },
		"icon": "RUNE_PRECISION_2"
	},
	{
		"id": "patience-40",
		"code": "RUNE_PATIENCE_40",
		"name": "Rune of Patience: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "defPhysical": .162 },
		"icon": "RUNE_PATIENCE_5",
		"ancient": true
	},
	{
		"id": "precision-1",
		"code": "RUNE_PRECISION_1",
		"name": "Rune of Precision: Common",
		"grade": 1,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .033 },
		"icon": "RUNE_PRECISION_1"
	},
	{
		"id": "flexibility-2",
		"code": "RUNE_FLEXIBILITY_2",
		"name": "Rune of Flexibility: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .076 },
		"icon": "RUNE_FLEXIBILITY_2"
	},
	{
		"id": "reduced-swiftness-5",
		"code": "RUNE_REDUCED_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"speed": .11,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_SWIFTNESS_5"
	},
	{
		"id": "flexibility-1",
		"code": "RUNE_FLEXIBILITY_1",
		"name": "Rune of Flexibility: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .048 },
		"icon": "RUNE_FLEXIBILITY_1"
	},
	{
		"id": "tenacity-5",
		"code": "RUNE_TENACITY_5",
		"name": "Rune of Tenacity: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["armor"],
		"stats": { "accuracy": .15 },
		"icon": "RUNE_TENACITY_5"
	},
	{
		"id": "sharpness-3",
		"code": "RUNE_SHARPNESS_3",
		"name": "Rune of Sharpness: Rare",
		"grade": 3,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .072 },
		"icon": "RUNE_SHARPNESS_3"
	},
	{
		"id": "ccchance-swiftness-5",
		"code": "RUNE_CCCHANCE_SWIFTNESS_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"accuracy": .11,
			"speed": .11
		},
		"icon": "RUNE_CCCHANCE_SWIFTNESS_5"
	},
	{
		"id": "sharpness-4",
		"code": "RUNE_SHARPNESS_4",
		"name": "Rune of Sharpness: Heroic",
		"grade": 4,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .091 },
		"icon": "RUNE_SHARPNESS_4"
	},
	{
		"id": "frenzy-3",
		"code": "RUNE_FRENZY_3",
		"name": "Rune of Frenzy: Rare",
		"grade": 3,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .138 },
		"icon": "RUNE_FRENZY_3"
	},
	{
		"id": "exclusion-3",
		"code": "RUNE_EXCLUSION_3",
		"name": "Rune of Exclusion: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .138 },
		"icon": "RUNE_EXCLUSION_3"
	},
	{
		"id": "frenzy-2",
		"code": "RUNE_FRENZY_2",
		"name": "Rune of Frenzy: Uncommon",
		"grade": 2,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .1 },
		"icon": "RUNE_FRENZY_2"
	},
	{
		"id": "frenzy-1",
		"code": "RUNE_FRENZY_1",
		"name": "Rune of Frenzy: Common",
		"grade": 1,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .063 },
		"icon": "RUNE_FRENZY_1"
	},
	{
		"id": "swiftness-5",
		"code": "RUNE_SWIFTNESS_5",
		"name": "Rune of Swiftness: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .13 },
		"icon": "RUNE_SWIFTNESS_5"
	},
	{
		"id": "avoid-recover-5",
		"code": "RUNE_AVOID_RECOVER_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"dodge": .055
		},
		"icon": "RUNE_AVOID_RECOVER_5"
	},
	{
		"id": "reduced-totaldodgecri-5",
		"code": "RUNE_REDUCED_TOTALDODGECRI_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"tough": .055,
			"critResist": .055
		},
		"icon": "RUNE_REDUCED_TOTALDODGECRI_5"
	},
	{
		"id": "exclusion-4",
		"code": "RUNE_EXCLUSION_4",
		"name": "Rune of Exclusion: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .175 },
		"icon": "RUNE_EXCLUSION_4"
	},
	{
		"id": "swiftness-recover-5",
		"code": "RUNE_SWIFTNESS_RECOVER_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"speed": .11
		},
		"icon": "RUNE_SWIFTNESS_RECOVER_5"
	},
	{
		"id": "patience-stamina-5",
		"code": "RUNE_PATIENCE_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"defPhysical": .22
		},
		"icon": "RUNE_PATIENCE_STAMINA_5"
	},
	{
		"id": "sharpness-agitation-5",
		"code": "RUNE_SHARPNESS_AGITATION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_SHARPNESS_AGITATION_5"
	},
	{
		"id": "agitation-resistance-5",
		"code": "RUNE_AGITATION_RESISTANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_AGITATION_RESISTANCE_5"
	},
	{
		"id": "frenzy-5",
		"code": "RUNE_FRENZY_5",
		"name": "Rune of Frenzy: Legendary",
		"grade": 6,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .25 },
		"icon": "RUNE_FRENZY_5"
	},
	{
		"id": "frenzy-4",
		"code": "RUNE_FRENZY_4",
		"name": "Rune of Frenzy: Heroic",
		"grade": 4,
		"color": "red",
		"parts": ["armor"],
		"stats": { "critDamage": .175 },
		"icon": "RUNE_FRENZY_4"
	},
	{
		"id": "swiftness-3",
		"code": "RUNE_SWIFTNESS_3",
		"name": "Rune of Swiftness: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "speed": .072 },
		"icon": "RUNE_SWIFTNESS_3"
	},
	{
		"id": "potential-2",
		"code": "RUNE_POTENTIAL_2",
		"name": "Rune of Potential: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .1 },
		"icon": "RUNE_POTENTIAL_2"
	},
	{
		"id": "sharpness-precision-5",
		"code": "RUNE_SHARPNESS_PRECISION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"pen": .11
		},
		"icon": "RUNE_SHARPNESS_PRECISION_5"
	},
	{
		"id": "potential-1",
		"code": "RUNE_POTENTIAL_1",
		"name": "Rune of Potential: Common",
		"grade": 1,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .063 },
		"icon": "RUNE_POTENTIAL_1"
	},
	{
		"id": "precision-40",
		"code": "RUNE_PRECISION_40",
		"name": "Rune of Precision: Ancient",
		"grade": 5,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .111 },
		"icon": "RUNE_PRECISION_5",
		"ancient": true
	},
	{
		"id": "reduced-agitation-5",
		"code": "RUNE_REDUCED_AGITATION_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"manaAttack": .22,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_AGITATION_5"
	},
	{
		"id": "block-stamina-5",
		"code": "RUNE_BLOCK_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"block": .055
		},
		"icon": "RUNE_BLOCK_STAMINA_5"
	},
	{
		"id": "potential-4",
		"code": "RUNE_POTENTIAL_4",
		"name": "Rune of Potential: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["secondary"],
		"stats": { "manaDamage": .175 },
		"icon": "RUNE_POTENTIAL_4"
	},
	{
		"id": "sharpness-avoid-5",
		"code": "RUNE_SHARPNESS_AVOID_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"dodge": .055
		},
		"icon": "RUNE_SHARPNESS_AVOID_5"
	},
	{
		"id": "willpower-40",
		"code": "RUNE_WILLPOWER_40",
		"name": "Rune of Willpower: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughMagical": .162 },
		"icon": "RUNE_WILLPOWER_5",
		"ancient": true
	},
	{
		"id": "avoid-agitation-5",
		"code": "RUNE_AVOID_AGITATION_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"manaAttack": .22,
			"dodge": .055
		},
		"icon": "RUNE_AVOID_AGITATION_5"
	},
	{
		"id": "heartless-40",
		"code": "RUNE_HEARTLESS_40",
		"name": "Rune of the Heartless: Ancient",
		"grade": 5,
		"color": "red",
		"parts": ["secondary"],
		"stats": { "crit": .162 },
		"icon": "RUNE_HEARTLESS_5",
		"ancient": true
	},
	{
		"id": "agitation-1",
		"code": "RUNE_AGITATION_1",
		"name": "Rune of Agitation: Common",
		"grade": 1,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .033 },
		"icon": "RUNE_AGITATION_1"
	},
	{
		"id": "ccchance-resistance-5",
		"code": "RUNE_CCCHANCE_RESISTANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"accuracy": .11
		},
		"icon": "RUNE_CCCHANCE_RESISTANCE_5"
	},
	{
		"id": "reduced-defense-5",
		"code": "RUNE_REDUCED_DEFENSE_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"tough": .055,
			"defense": .11
		},
		"icon": "RUNE_REDUCED_DEFENSE_5"
	},
	{
		"id": "ccchance-reduced-5",
		"code": "RUNE_CCCHANCE_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"accuracy": .11,
			"tough": .055
		},
		"icon": "RUNE_CCCHANCE_REDUCED_5"
	},
	{
		"id": "defense-totaldodgecri-5",
		"code": "RUNE_DEFENSE_TOTALDODGECRI_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critResist": .055,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_TOTALDODGECRI_5"
	},
	{
		"id": "sharpness-block-5",
		"code": "RUNE_SHARPNESS_BLOCK_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"block": .055
		},
		"icon": "RUNE_SHARPNESS_BLOCK_5"
	},
	{
		"id": "stamina-4",
		"code": "RUNE_STAMINA_4",
		"name": "Rune of Stamina: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .105 },
		"icon": "RUNE_STAMINA_4"
	},
	{
		"id": "heartless-frenzy-5",
		"code": "RUNE_HEARTLESS_FRENZY_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"critDamage": .22
		},
		"icon": "RUNE_HEARTLESS_FRENZY_5"
	},
	{
		"id": "reduced-stamina-5",
		"code": "RUNE_REDUCED_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_STAMINA_5"
	},
	{
		"id": "stamina-1",
		"code": "RUNE_STAMINA_1",
		"name": "Rune of Stamina: Common",
		"grade": 1,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .038 },
		"icon": "RUNE_STAMINA_1"
	},
	{
		"id": "steel-40",
		"code": "RUNE_STEEL_40",
		"name": "Rune of Steel: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .213 },
		"icon": "RUNE_STEEL_5",
		"ancient": true
	},
	{
		"id": "agility-40",
		"code": "RUNE_AGILITY_40",
		"name": "Rune of Agility: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgePhysical": .162 },
		"icon": "RUNE_AGILITY_5",
		"ancient": true
	},
	{
		"id": "heartless-precision-5",
		"code": "RUNE_HEARTLESS_PRECISION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"acc": .11
		},
		"icon": "RUNE_HEARTLESS_PRECISION_5"
	},
	{
		"id": "precision-agitation-5",
		"code": "RUNE_PRECISION_AGITATION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_PRECISION_AGITATION_5"
	},
	{
		"id": "stamina-recover-5",
		"code": "RUNE_STAMINA_RECOVER_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"hp": .11
		},
		"icon": "RUNE_STAMINA_RECOVER_5"
	},
	{
		"id": "ironwall-40",
		"code": "RUNE_IRONWALL_40",
		"name": "Rune of Iron Wall: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .128 },
		"icon": "RUNE_IRONWALL_5",
		"ancient": true
	},
	{
		"id": "reduced-block-5",
		"code": "RUNE_REDUCED_BLOCK_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"block": .055,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_BLOCK_5"
	},
	{
		"id": "frenzy-swiftness-5",
		"code": "RUNE_FRENZY_SWIFTNESS_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"speed": .11
		},
		"icon": "RUNE_FRENZY_SWIFTNESS_5"
	},
	{
		"id": "precision-5",
		"code": "RUNE_PRECISION_5",
		"name": "Rune of Precision: Legendary",
		"grade": 6,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .13 },
		"icon": "RUNE_PRECISION_5"
	},
	{
		"id": "heartless-agitation-5",
		"code": "RUNE_HEARTLESS_AGITATION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"crit": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_HEARTLESS_AGITATION_5"
	},
	{
		"id": "fierce-2",
		"code": "RUNE_FIERCE_2",
		"name": "Rune of Fierce Attack: Uncommon",
		"grade": 2,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .06 },
		"icon": "RUNE_FIERCE_2"
	},
	{
		"id": "steel-3",
		"code": "RUNE_STEEL_3",
		"name": "Rune of Steel: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .138 },
		"icon": "RUNE_STEEL_3"
	},
	{
		"id": "fierce-agitation-5",
		"code": "RUNE_FIERCE_AGITATION_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"manaAttack": .22
		},
		"icon": "RUNE_FIERCE_AGITATION_5"
	},
	{
		"id": "precision-reduced-5",
		"code": "RUNE_PRECISION_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"tough": .055
		},
		"icon": "RUNE_PRECISION_REDUCED_5"
	},
	{
		"id": "fierce-3",
		"code": "RUNE_FIERCE_3",
		"name": "Rune of Fierce Attack: Rare",
		"grade": 3,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .083 },
		"icon": "RUNE_FIERCE_3"
	},
	{
		"id": "fierce-4",
		"code": "RUNE_FIERCE_4",
		"name": "Rune of Fierce Attack: Heroic",
		"grade": 4,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .105 },
		"icon": "RUNE_FIERCE_4"
	},
	{
		"id": "flexibility-5",
		"code": "RUNE_FLEXIBILITY_5",
		"name": "Rune of Flexibility: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .19 },
		"icon": "RUNE_FLEXIBILITY_5"
	},
	{
		"id": "fierce-5",
		"code": "RUNE_FIERCE_5",
		"name": "Rune of Fierce Attack: Legendary",
		"grade": 6,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .15 },
		"icon": "RUNE_FIERCE_5"
	},
	{
		"id": "frenzy-block-5",
		"code": "RUNE_FRENZY_BLOCK_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"block": .055
		},
		"icon": "RUNE_FRENZY_BLOCK_5"
	},
	{
		"id": "flexibility-40",
		"code": "RUNE_FLEXIBILITY_40",
		"name": "Rune of Flexibility: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["secondary"],
		"stats": { "dodgeMagical": .162 },
		"icon": "RUNE_FLEXIBILITY_5",
		"ancient": true
	},
	{
		"id": "precision-ccchance-5",
		"code": "RUNE_PRECISION_CCCHANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"accuracy": .11
		},
		"icon": "RUNE_PRECISION_CCCHANCE_5"
	},
	{
		"id": "sharpness-5",
		"code": "RUNE_SHARPNESS_5",
		"name": "Rune of Sharpness: Legendary",
		"grade": 6,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "pen": .13 },
		"icon": "RUNE_SHARPNESS_5"
	},
	{
		"id": "toughness-3",
		"code": "RUNE_TOUGHNESS_3",
		"name": "Rune of Toughness: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .105 },
		"icon": "RUNE_TOUGHNESS_3"
	},
	{
		"id": "exclusion-5",
		"code": "RUNE_EXCLUSION_5",
		"name": "Rune of Exclusion: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .25 },
		"icon": "RUNE_EXCLUSION_5"
	},
	{
		"id": "defense-avoid-5",
		"code": "RUNE_DEFENSE_AVOID_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"dodge": .055,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_AVOID_5"
	},
	{
		"id": "avoid-stamina-5",
		"code": "RUNE_AVOID_STAMINA_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"dodge": .055
		},
		"icon": "RUNE_AVOID_STAMINA_5"
	},
	{
		"id": "precision-avoid-5",
		"code": "RUNE_PRECISION_AVOID_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"dodge": .055
		},
		"icon": "RUNE_PRECISION_AVOID_5"
	},
	{
		"id": "precision-stamina-5",
		"code": "RUNE_PRECISION_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"hp": .11
		},
		"icon": "RUNE_PRECISION_STAMINA_5"
	},
	{
		"id": "defense-recover-5",
		"code": "RUNE_DEFENSE_RECOVER_5",
		"name": "Rune of Immortality: Velkazar",
		"grade": 5,
		"color": "blue",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"defense": .11
		},
		"icon": "RUNE_DEFENSE_RECOVER_5"
	},
	{
		"id": "toughness-5",
		"code": "RUNE_TOUGHNESS_5",
		"name": "Rune of Toughness: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .19 },
		"icon": "RUNE_TOUGHNESS_5"
	},
	{
		"id": "resistance-recover-5",
		"code": "RUNE_RESISTANCE_RECOVER_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"recovery": .11,
			"resist": .11
		},
		"icon": "RUNE_RESISTANCE_RECOVER_5"
	},
	{
		"id": "fierce-frenzy-5",
		"code": "RUNE_FIERCE_FRENZY_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_FRENZY_5"
	},
	{
		"id": "stamina-40",
		"code": "RUNE_STAMINA_40",
		"name": "Rune of Stamina: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .128 },
		"icon": "RUNE_STAMINA_5",
		"ancient": true
	},
	{
		"id": "toughness-40",
		"code": "RUNE_TOUGHNESS_40",
		"name": "Rune of Toughness: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "toughPhysical": .162 },
		"icon": "RUNE_TOUGHNESS_5",
		"ancient": true
	},
	{
		"id": "frenzy-thirst-5",
		"code": "RUNE_FRENZY_THIRST_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"lifesteal": .11
		},
		"icon": "RUNE_FRENZY_THIRST_5"
	},
	{
		"id": "frenzy-avoid-5",
		"code": "RUNE_FRENZY_AVOID_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"dodge": .055
		},
		"icon": "RUNE_FRENZY_AVOID_5"
	},
	{
		"id": "agitation-40",
		"code": "RUNE_AGITATION_40",
		"name": "Rune of Agitation: Ancient",
		"grade": 5,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .111 },
		"icon": "RUNE_AGITATION_5",
		"ancient": true
	},
	{
		"id": "swiftness-resistance-5",
		"code": "RUNE_SWIFTNESS_RESISTANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"speed": .11
		},
		"icon": "RUNE_SWIFTNESS_RESISTANCE_5"
	},
	{
		"id": "precision-block-5",
		"code": "RUNE_PRECISION_BLOCK_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"block": .055
		},
		"icon": "RUNE_PRECISION_BLOCK_5"
	},
	{
		"id": "ironwall-5",
		"code": "RUNE_IRONWALL_5",
		"name": "Rune of Iron Wall: Legendary",
		"grade": 6,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .15 },
		"icon": "RUNE_IRONWALL_5"
	},
	{
		"id": "thirst-1",
		"code": "RUNE_THIRST_1",
		"name": "Rune of Thirst: Common",
		"grade": 1,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .015 },
		"icon": "RUNE_THIRST_1"
	},
	{
		"id": "reduced-resistance-5",
		"code": "RUNE_REDUCED_RESISTANCE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"tough": .055
		},
		"icon": "RUNE_REDUCED_RESISTANCE_5"
	},
	{
		"id": "ironwall-4",
		"code": "RUNE_IRONWALL_4",
		"name": "Rune of Iron Wall: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .105 },
		"icon": "RUNE_IRONWALL_4"
	},
	{
		"id": "thirst-2",
		"code": "RUNE_THIRST_2",
		"name": "Rune of Thirst: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .024 },
		"icon": "RUNE_THIRST_2"
	},
	{
		"id": "ironwall-3",
		"code": "RUNE_IRONWALL_3",
		"name": "Rune of Iron Wall: Rare",
		"grade": 3,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .083 },
		"icon": "RUNE_IRONWALL_3"
	},
	{
		"id": "thirst-3",
		"code": "RUNE_THIRST_3",
		"name": "Rune of Thirst: Rare",
		"grade": 3,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .033 },
		"icon": "RUNE_THIRST_3"
	},
	{
		"id": "resistance-mprecovertime-5",
		"code": "RUNE_RESISTANCE_MPRECOVERTIME_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"resist": .11,
			"manaRegen": .33
		},
		"icon": "RUNE_RESISTANCE_MPRECOVERTIME_5"
	},
	{
		"id": "ironwall-2",
		"code": "RUNE_IRONWALL_2",
		"name": "Rune of Iron Wall: Uncommon",
		"grade": 2,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .06 },
		"icon": "RUNE_IRONWALL_2"
	},
	{
		"id": "thirst-4",
		"code": "RUNE_THIRST_4",
		"name": "Rune of Thirst: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .042 },
		"icon": "RUNE_THIRST_4"
	},
	{
		"id": "agitation-4",
		"code": "RUNE_AGITATION_4",
		"name": "Rune of Agitation: Heroic",
		"grade": 4,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "manaAttack": .091 },
		"icon": "RUNE_AGITATION_4"
	},
	{
		"id": "ironwall-1",
		"code": "RUNE_IRONWALL_1",
		"name": "Rune of Iron Wall: Common",
		"grade": 1,
		"color": "blue",
		"parts": ["weapon"],
		"stats": { "blockDefPhysical": .038 },
		"icon": "RUNE_IRONWALL_1"
	},
	{
		"id": "thirst-5",
		"code": "RUNE_THIRST_5",
		"name": "Rune of Thirst: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["weapon"],
		"stats": { "lifesteal": .06 },
		"icon": "RUNE_THIRST_5"
	},
	{
		"id": "fierce-block-5",
		"code": "RUNE_FIERCE_BLOCK_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"atk": .11,
			"block": .055
		},
		"icon": "RUNE_FIERCE_BLOCK_5"
	},
	{
		"id": "frenzy-stamina-5",
		"code": "RUNE_FRENZY_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"critDamage": .22,
			"hp": .11
		},
		"icon": "RUNE_FRENZY_STAMINA_5"
	},
	{
		"id": "stamina-5",
		"code": "RUNE_STAMINA_5",
		"name": "Rune of Stamina: Legendary",
		"grade": 6,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .15 },
		"icon": "RUNE_STAMINA_5"
	},
	{
		"id": "fierce-40",
		"code": "RUNE_FIERCE_40",
		"name": "Rune of Fierce Attack: Ancient",
		"grade": 5,
		"color": "red",
		"parts": ["weapon"],
		"stats": { "atk": .128 },
		"icon": "RUNE_FIERCE_5",
		"ancient": true
	},
	{
		"id": "stamina-2",
		"code": "RUNE_STAMINA_2",
		"name": "Rune of Stamina: Uncommon",
		"grade": 2,
		"color": "green",
		"parts": ["armor"],
		"stats": { "hp": .06 },
		"icon": "RUNE_STAMINA_2"
	},
	{
		"id": "fierce-stamina-5",
		"code": "RUNE_FIERCE_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"hp": .11,
			"atk": .11
		},
		"icon": "RUNE_FIERCE_STAMINA_5"
	},
	{
		"id": "exclusion-40",
		"code": "RUNE_EXCLUSION_40",
		"name": "Rune of Exclusion: Ancient",
		"grade": 5,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockMagical": .213 },
		"icon": "RUNE_EXCLUSION_5",
		"ancient": true
	},
	{
		"id": "precision-defense-5",
		"code": "RUNE_PRECISION_DEFENSE_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"acc": .11,
			"defense": .11
		},
		"icon": "RUNE_PRECISION_DEFENSE_5"
	},
	{
		"id": "sharpness-reduced-5",
		"code": "RUNE_SHARPNESS_REDUCED_5",
		"name": "Rune of Disaster: Velkazar",
		"grade": 5,
		"color": "green",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"pen": .11,
			"tough": .055
		},
		"icon": "RUNE_SHARPNESS_REDUCED_5"
	},
	{
		"id": "precision-4",
		"code": "RUNE_PRECISION_4",
		"name": "Rune of Precision: Heroic",
		"grade": 4,
		"color": "red",
		"parts": ["armor"],
		"stats": { "acc": .091 },
		"icon": "RUNE_PRECISION_4"
	},
	{
		"id": "steel-4",
		"code": "RUNE_STEEL_4",
		"name": "Rune of Steel: Heroic",
		"grade": 4,
		"color": "blue",
		"parts": ["armor"],
		"stats": { "blockPhysical": .175 },
		"icon": "RUNE_STEEL_4"
	},
	{
		"id": "thirst-stamina-5",
		"code": "RUNE_THIRST_STAMINA_5",
		"name": "Rune of Fear: Velkazar",
		"grade": 5,
		"color": "red",
		"parts": [
			"weapon",
			"armor",
			"secondary"
		],
		"stats": {
			"lifesteal": .11,
			"hp": .11
		},
		"icon": "RUNE_THIRST_STAMINA_5"
	}
];
var KR_ARTIFACTS = [
	{
		"id": "artifact-1001",
		"code": "ARTIFACT_UNIQUE_1001",
		"name": "Apocalypsion's Tear",
		"skills": [
			80010011,
			80010012,
			80010013,
			80010014,
			80010015
		],
		"text": [
			"When there is only 1 enemy or more than 5 enemies, increases ATK and Crit DMG of all allies by 14% and 28% respectively. This effect does not stack with other similar effects cast by allies.",
			"When there is only 1 enemy or more than 5 enemies, increases ATK and Crit DMG of all allies by 17% and 34% respectively. This effect does not stack with other similar effects cast by allies.",
			"When there is only 1 enemy or more than 5 enemies, increases ATK and Crit DMG of all allies by 21% and 42% respectively. This effect does not stack with other similar effects cast by allies.",
			"When there is only 1 enemy or more than 5 enemies, increases ATK and Crit DMG of all allies by 25% and 50% respectively. This effect does not stack with other similar effects cast by allies.",
			"When there is only 1 enemy or more than 5 enemies, increases ATK and Crit DMG of all allies by 30% and 60% respectively. This effect does not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_1001"
	},
	{
		"id": "artifact-14",
		"code": "ARTIFACT_UNIQUE_14",
		"name": "Mask of Harpy",
		"skills": [
			80000141,
			80000142,
			80000143,
			80000144,
			80000145
		],
		"text": [
			"ATK upon Harpies increase by 48 %, and DMG resistance against Harpies increases by 24 %",
			"ATK upon Harpies increase by 57 %, and DMG resistance against Harpies increases by 28 %",
			"ATK upon Harpies increase by 69 %, and DMG resistance against Harpies increases by 34 %",
			"ATK upon Harpies increase by 83 %, and DMG resistance against Harpies increases by 41 %",
			"ATK upon Harpies increase by 100 %, and DMG resistance against Harpies increases by 50 %"
		],
		"icon": "ARTIFACT_UNIQUE_14"
	},
	{
		"id": "artifact-24",
		"code": "ARTIFACT_UNIQUE_24",
		"name": "Earth Protection",
		"skills": [
			80000241,
			80000242,
			80000243,
			80000244,
			80000245
		],
		"text": [
			"At the beginning of battle, gain CC immunity and a 50% boost to P. and M. DEF stats for 10 sec.",
			"At the beginning of battle, gain CC immunity and a 50% boost to P. and M. DEF stats for 12 sec.",
			"At the beginning of battle, gain CC immunity and a 50% boost to P. and M. DEF stats for 14 sec.",
			"At the beginning of battle, gain CC immunity and a 50% boost to P. and M. DEF stats for 17 sec.",
			"At the beginning of battle, gain CC immunity and a 50% boost to P. and M. DEF stats for 20 sec."
		],
		"icon": "ARTIFACT_UNIQUE_24"
	},
	{
		"id": "artifact-34",
		"code": "ARTIFACT_UNIQUE_34",
		"name": "Mask of Draconic",
		"skills": [
			80000341,
			80000342,
			80000343,
			80000344,
			80000345
		],
		"text": [
			"ATK upon Draconics increase by 48 %, and DMG resistance against Draconics increase by 24 %.",
			"ATK upon Draconics increase by 57 %, and DMG resistance against Draconics increase by 28 %.",
			"ATK upon Draconics increase by 69 %, and DMG resistance against Draconics increase by 34 %.",
			"ATK upon Draconics increase by 83 %, and DMG resistance against Draconics increase by 41 %.",
			"ATK upon Draconics increase by 100 %, and DMG resistance against Draconics increase by 50 %."
		],
		"icon": "ARTIFACT_UNIQUE_34"
	},
	{
		"id": "artifact-44",
		"code": "ARTIFACT_UNIQUE_44",
		"name": "Infernal Whip",
		"skills": [
			80000441,
			80000442,
			80000443,
			80000444,
			80000445
		],
		"text": [
			"Every 8 seconds, deals Magic Damage equal to 24% of Attack to all enemies and increases all damage they take by 12% for 5 seconds. Each time this damage-increase effect activates, it is further increased by 0.5%, up to 25 stacks. This damage-increase effect cannot be used simultaneously with the same effect from other allies.",
			"Every 8 seconds, deals Magic Damage equal to 29% of Attack to all enemies and increases all damage they take by 14% for 5 seconds. Each time this damage-increase effect activates, it is further increased by 0.6%, up to 25 stacks. This damage-increase effect cannot be used simultaneously with the same effect from other allies.",
			"Every 8 seconds, deals Magic Damage equal to 35% of Attack to all enemies and increases all damage they take by 17% for 5 seconds. Each time this damage-increase effect activates, it is further increased by 0.7%, up to 25 stacks. This damage-increase effect cannot be used simultaneously with the same effect from other allies.",
			"Every 8 seconds, deals Magic Damage equal to 42% of Attack to all enemies and increases all damage they take by 21% for 5 seconds. Each time this damage-increase effect activates, it is further increased by 0.8%, up to 25 stacks. This damage-increase effect cannot be used simultaneously with the same effect from other allies.",
			"Every 8 seconds, deals Magic Damage equal to 50% of Attack to all enemies and increases all damage they take by 25% for 5 seconds. Each time this damage-increase effect activates, it is further increased by 1%, up to 25 stacks. This damage-increase effect cannot be used simultaneously with the same effect from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_44"
	},
	{
		"id": "artifact-64",
		"code": "ARTIFACT_UNIQUE_64",
		"name": "Perfume of the Queen",
		"skills": [
			80000641,
			80000642,
			80000643,
			80000644,
			80000645
		],
		"text": [
			"When inflicted by CC for 3 times, removes own Negative Effects, and increases ATK Spd by 500 and gains immunity to CC for 4.8 sec.",
			"When inflicted by CC for 3 times, removes own Negative Effects, and increases ATK Spd by 500 and gains immunity to CC for 5.8 sec.",
			"When inflicted by CC for 3 times, removes own Negative Effects, and increases ATK Spd by 500 and gains immunity to CC for 7 sec.",
			"When inflicted by CC for 3 times, removes own Negative Effects, and increases ATK Spd by 500 and gains immunity to CC for 8.4 sec.",
			"When inflicted by CC for 3 times, removes own Negative Effects, and increases ATK Spd by 500 and gains immunity to CC for 10 sec."
		],
		"icon": "ARTIFACT_UNIQUE_64"
	},
	{
		"id": "artifact-1002",
		"code": "ARTIFACT_UNIQUE_1002",
		"name": "Golem's Fuel",
		"skills": [
			80010021,
			80010022,
			80010023,
			80010024,
			80010025
		],
		"text": [
			"Increases DMG dealt to Non-Hero enemies by 12% and reduces DMG taken by 6%. If target is [Holy Golem], the effect is multiplied by 3.",
			"Increases DMG dealt to Non-Hero enemies by 14% and reduces DMG taken by 7%. If target is [Holy Golem], the effect is multiplied by 3.",
			"Increases DMG dealt to Non-Hero enemies by 17% and reduces DMG taken by 8.5%. If target is [Holy Golem], the effect is multiplied by 3.",
			"Increases DMG dealt to Non-Hero enemies by 21% and reduces DMG taken by 10.5%. If target is [Holy Golem], the effect is multiplied by 3.",
			"Increases DMG dealt to Non-Hero enemies by 25% and reduces DMG taken by 12.5%. If target is [Holy Golem], the effect is multiplied by 3."
		],
		"icon": "ARTIFACT_UNIQUE_1002"
	},
	{
		"id": "artifact-11",
		"code": "ARTIFACT_UNIQUE_11",
		"name": "Madame's Bronze Mirrors",
		"skills": [
			80000111,
			80000112,
			80000113,
			80000114,
			80000115
		],
		"text": [
			"Increases own M.Block Chance by 330 and M.DMG Reduction by 110.",
			"Increases own M.Block Chance by 360 and M.DMG Reduction by 120.",
			"Increases own M.Block Chance by 400 and M.DMG Reduction by 140.",
			"Increases own M.Block Chance by 440 and M.DMG Reduction by 160.",
			"Increases own M.Block Chance by 500 and M.DMG Reduction by 200."
		],
		"icon": "ARTIFACT_UNIQUE_11"
	},
	{
		"id": "artifact-21",
		"code": "ARTIFACT_UNIQUE_21",
		"name": "Judgment of Light Bracelet",
		"skills": [
			80000211,
			80000212,
			80000213,
			80000214,
			80000215
		],
		"text": [
			"ACC and CC ACC rise by 360.",
			"ACC and CC ACC rise by 430.",
			"ACC and CC ACC rise by 520.",
			"ACC and CC ACC rise by 630.",
			"ACC and CC ACC rise by 750."
		],
		"icon": "ARTIFACT_UNIQUE_21"
	},
	{
		"id": "artifact-31",
		"code": "ARTIFACT_UNIQUE_31",
		"name": "Solar Stone",
		"skills": [
			80000311,
			80000312,
			80000313,
			80000314,
			80000315
		],
		"text": [
			"Every sec, deals P.DMG equal to 24% of ATK to enemies within a circular area around self and reduces their Recovery by 36% for 5 sec.",
			"Every sec, deals P.DMG equal to 29% of ATK to enemies within a circular area around self and reduces their Recovery by 43% for 5 sec.",
			"Every sec, deals P.DMG equal to 35% of ATK to enemies within a circular area around self and reduces their Recovery by 52% for 5 sec.",
			"Every sec, deals P.DMG equal to 42% of ATK to enemies within a circular area around self and reduces their Recovery by 62% for 5 sec.",
			"Every sec, deals P.DMG equal to 50% of ATK to enemies within a circular area around self and reduces their Recovery by 75% for 5 sec."
		],
		"icon": "ARTIFACT_UNIQUE_31"
	},
	{
		"id": "artifact-41",
		"code": "ARTIFACT_UNIQUE_41",
		"name": "Spellbound Ring of the Deep",
		"skills": [
			80000411,
			80000412,
			80000413,
			80000414,
			80000415
		],
		"text": [
			"Upon the start of a battle for 10 sec, limit 1 enemy's ATK Spd to 1000 and reduce ATK by 24%.",
			"Upon the start of a battle for 12 sec, limit 1 enemy's ATK Spd to 1000 and reduce ATK by 29%.",
			"Upon the start of a battle for 14 sec, limit 1 enemy's ATK Spd to 1000 and reduce ATK by 35%.",
			"Upon the start of a battle for 17 sec, limit 1 enemy's ATK Spd to 1000 and reduce ATK by 42%.",
			"Upon the start of a battle for 20 sec, limit 1 enemy's ATK Spd to 1000 and reduce ATK by 50%."
		],
		"icon": "ARTIFACT_UNIQUE_41"
	},
	{
		"id": "artifact-51",
		"code": "ARTIFACT_UNIQUE_51",
		"name": "Cross Pumpkin Head",
		"skills": [
			80000511,
			80000512,
			80000513,
			80000514,
			80000515
		],
		"text": [
			"Increases Max HP by 24% and deals P.DMG equal to 2% of Max HP to nearby enemies within a small area for 1 sec.",
			"Increases Max HP by 29% and deals P.DMG equal to 2% of Max HP to nearby enemies within a small area for 1 sec.",
			"Increases Max HP by 35% and deals P.DMG equal to 2% of Max HP to nearby enemies within a small area for 1 sec.",
			"Increases Max HP by 42% and deals P.DMG equal to 2% of Max HP to nearby enemies within a small area for 1 sec.",
			"Increases Max HP by 50% and deals P.DMG equal to 2% of Max HP to nearby enemies within a small area for 1 sec."
		],
		"icon": "ARTIFACT_UNIQUE_51"
	},
	{
		"id": "artifact-61",
		"code": "ARTIFACT_UNIQUE_61",
		"name": "Happy Pumpkin Head",
		"skills": [
			80000611,
			80000612,
			80000613,
			80000614,
			80000615
		],
		"text": [
			"Every 7 seconds, Healing is increased by 2.4%, and you recover HP equal to 120% of your Attack. The Healing increase effect can stack up to 15 times and cannot be dispelled.",
			"Every 7 seconds, Healing is increased by 2.8%, and you recover HP equal to 140% of your Attack. The Healing increase effect can stack up to 15 times and cannot be dispelled.",
			"Every 7 seconds, Healing is increased by 3.4%, and you recover HP equal to 170% of your Attack. The Healing increase effect can stack up to 15 times and cannot be dispelled.",
			"Every 7 seconds, Healing is increased by 4.2%, and you recover HP equal to 210% of your Attack. The Healing increase effect can stack up to 15 times and cannot be dispelled.",
			"Every 7 seconds, Healing is increased by 5%, and you recover HP equal to 250% of your Attack. The Healing increase effect can stack up to 15 times and cannot be dispelled."
		],
		"icon": "ARTIFACT_UNIQUE_61"
	},
	{
		"id": "artifact-12",
		"code": "ARTIFACT_UNIQUE_12",
		"name": "Sealed Chain of Ancient God",
		"skills": [
			80000121,
			80000122,
			80000123,
			80000124,
			80000125
		],
		"text": [
			"Every 19 sec, cast Silence to a random enemy for 3.5 sec and remove positive effects.",
			"Every 18 sec, cast Silence to a random enemy for 4 sec and remove positive effects.",
			"Every 17 sec, cast Silence to a random enemy for 4.5 sec and remove positive effects.",
			"Every 16 sec, cast Silence to a random enemy for 5 sec and remove positive effects.",
			"Every 15 sec, cast Silence to a random enemy for 6 sec and remove positive effects."
		],
		"icon": "ARTIFACT_UNIQUE_12"
	},
	{
		"id": "artifact-22",
		"code": "ARTIFACT_UNIQUE_22",
		"name": "Mask of Lizardman",
		"skills": [
			80000221,
			80000222,
			80000223,
			80000224,
			80000225
		],
		"text": [
			"ATK upon Lizardmen increase by 48 %, and DMG resistance against Lizardmen increase by 24 %",
			"ATK upon Lizardmen increase by 57 %, and DMG resistance against Lizardmen increase by 28 %",
			"ATK upon Lizardmen increase by 69 %, and DMG resistance against Lizardmen increase by 34 %",
			"ATK upon Lizardmen increase by 83 %, and DMG resistance against Lizardmen increase by 41 %",
			"ATK upon Lizardmen increase by 100 %, and DMG resistance against Lizardmen increase by 50 %"
		],
		"icon": "ARTIFACT_UNIQUE_22"
	},
	{
		"id": "artifact-32",
		"code": "ARTIFACT_UNIQUE_32",
		"name": "Orbs of Contract",
		"skills": [
			80000321,
			80000322,
			80000323,
			80000324,
			80000325
		],
		"text": [
			"Every 7 seconds, increases your Magic Defense by an amount equal to 1.2% of your Attack. This effect stacks up to 6 times.",
			"Every 7 seconds, increases your Magic Defense by an amount equal to 1.4% of your Attack. This effect stacks up to 6 times.",
			"Every 7 seconds, increases your Magic Defense by an amount equal to 1.7% of your Attack. This effect stacks up to 6 times.",
			"Every 7 seconds, increases your Magic Defense by an amount equal to 2% of your Attack. This effect stacks up to 6 times.",
			"Every 7 seconds, increases your Magic Defense by an amount equal to 2.5% of your Attack. This effect stacks up to 6 times."
		],
		"icon": "ARTIFACT_UNIQUE_32"
	},
	{
		"id": "artifact-42",
		"code": "ARTIFACT_UNIQUE_42",
		"name": "Guardian Crystal of the Deep",
		"skills": [
			80000421,
			80000422,
			80000423,
			80000424,
			80000425
		],
		"text": [
			"When there is 1 enemy, all DEF is increased by 60%.",
			"When there is 1 enemy, all DEF is increased by 72%.",
			"When there is 1 enemy, all DEF is increased by 86%.",
			"When there is 1 enemy, all DEF is increased by 103%.",
			"When there is 1 enemy, all DEF is increased by 125%."
		],
		"icon": "ARTIFACT_UNIQUE_42"
	},
	{
		"id": "artifact-52",
		"code": "ARTIFACT_UNIQUE_52",
		"name": "Angry Pumpkin Head",
		"skills": [
			80000521,
			80000522,
			80000523,
			80000524,
			80000525
		],
		"text": [
			"All DMG taken is reduced by 12% and deal 12% more DMG to enemies.",
			"All DMG taken is reduced by 14% and deal 14% more DMG to enemies.",
			"All DMG taken is reduced by 17% and deal 17% more DMG to enemies.",
			"All DMG taken is reduced by 20% and deal 20% more DMG to enemies.",
			"All DMG taken is reduced by 25% and deal 25% more DMG to enemies."
		],
		"icon": "ARTIFACT_UNIQUE_52"
	},
	{
		"id": "artifact-62",
		"code": "ARTIFACT_UNIQUE_62",
		"name": "Surprised Pumpkin Head",
		"skills": [
			80000621,
			80000622,
			80000623,
			80000624,
			80000625
		],
		"text": [
			"When inflicted by CC, immediately recovers Mana by 14% and increases ATK Spd by 240 for 5 sec. This effect activates once every 30 sec.",
			"When inflicted by CC, immediately recovers Mana by 17% and increases ATK Spd by 290 for 5 sec. This effect activates once every 30 sec.",
			"When inflicted by CC, immediately recovers Mana by 21% and increases ATK Spd by 350 for 5 sec. This effect activates once every 30 sec.",
			"When inflicted by CC, immediately recovers Mana by 25% and increases ATK Spd by 420 for 5 sec. This effect activates once every 30 sec.",
			"When inflicted by CC, immediately recovers Mana by 30% and increases ATK Spd by 500 for 5 sec. This effect activates once every 30 sec."
		],
		"icon": "ARTIFACT_UNIQUE_62"
	},
	{
		"id": "artifact-505",
		"code": "ARTIFACT_UNIQUE_505",
		"name": "Christmas Tree of Holy Night",
		"skills": [
			80005051,
			80005052,
			80005053,
			80005054,
			80005055
		],
		"text": [
			"Increases Crit DMG by 60%.",
			"Increases Crit DMG by 72%.",
			"Increases Crit DMG by 87%.",
			"Increases Crit DMG by 105%.",
			"Increases Crit DMG by 125%."
		],
		"icon": "ARTIFACT_UNIQUE_505"
	},
	{
		"id": "artifact-504",
		"code": "ARTIFACT_UNIQUE_504",
		"name": "Warm Turkey Dish",
		"skills": [
			80005041,
			80005042,
			80005043,
			80005044,
			80005045
		],
		"text": [
			"Increases own Max HP by 12% and All Block Chance by 120.",
			"Increases own Max HP by 14% and All Block Chance by 140.",
			"Increases own Max HP by 17% and All Block Chance by 170.",
			"Increases own Max HP by 21% and All Block Chance by 210.",
			"Increases own Max HP by 25% and All Block Chance by 250."
		],
		"icon": "ARTIFACT_UNIQUE_504"
	},
	{
		"id": "artifact-507",
		"code": "ARTIFACT_UNIQUE_507",
		"name": "Academic Achievement Award",
		"skills": [
			80005071,
			80005072,
			80005073,
			80005074,
			80005075
		],
		"text": [
			"Increases ATK of all allies by 10%, and All DEF of self by 12%. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of all allies by 12%, and All DEF of self by 14%. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of all allies by 14%, and All DEF of self by 17%. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of all allies by 17%, and All DEF of self by 21%. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of all allies by 20%, and All DEF of self by 25%. This effect will not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_507"
	},
	{
		"id": "artifact-506",
		"code": "ARTIFACT_UNIQUE_506",
		"name": "New Year's Fanfare",
		"skills": [
			80005061,
			80005062,
			80005063,
			80005064,
			80005065
		],
		"text": [
			"Increases ATK of 4 allies by 6% for 20 sec at the beginning of every battle. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of 4 allies by 7.2% for 20 sec at the beginning of every battle. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of 4 allies by 8.6% for 20 sec at the beginning of every battle. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of 4 allies by 10.4% for 20 sec at the beginning of every battle. This effect will not stack with other similar effects cast by allies.",
			"Increases ATK of 4 allies by 12.5% for 20 sec at the beginning of every battle. This effect will not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_506"
	},
	{
		"id": "artifact-501",
		"code": "ARTIFACT_UNIQUE_501",
		"name": "Abyssal Eye",
		"skills": [
			80005011,
			80005012,
			80005013,
			80005014,
			80005015
		],
		"text": [
			"When taking damage, deals Magic Damage equal to 60% of Attack to the attacker and reduces their Attack Speed by 480 for 1.5 seconds. When the Attack Speed reduction ends, petrifies them for 2.4 seconds. This effect can only trigger once every 30 seconds.",
			"When taking damage, deals Magic Damage equal to 72% of Attack to the attacker and reduces their Attack Speed by 580 for 1.5 seconds. When the Attack Speed reduction ends, petrifies them for 2.9 seconds. This effect can only trigger once every 30 seconds.",
			"When taking damage, deals Magic Damage equal to 86% of Attack to the attacker and reduces their Attack Speed by 700 for 1.5 seconds. When the Attack Speed reduction ends, petrifies them for 3.5 seconds. This effect can only trigger once every 30 seconds.",
			"When taking damage, deals Magic Damage equal to 105% of Attack to the attacker and reduces their Attack Speed by 840 for 1.5 seconds. When the Attack Speed reduction ends, petrifies them for 4 seconds. This effect can only trigger once every 30 seconds.",
			"When taking damage, deals Magic Damage equal to 125% of Attack to the attacker and reduces their Attack Speed by 1000 for 1.5 seconds. When the Attack Speed reduction ends, petrifies them for 5 seconds. This effect can only trigger once every 30 seconds."
		],
		"icon": "ARTIFACT_UNIQUE_501"
	},
	{
		"id": "artifact-503",
		"code": "ARTIFACT_UNIQUE_503",
		"name": "Abyssal Nail Ornament",
		"skills": [
			80005031,
			80005032,
			80005033,
			80005034,
			80005035
		],
		"text": [
			"On attack, for 10 seconds, deals Defense-ignoring Physical Damage equal to 4.8% of Attack every 0.5 seconds to the enemy. This effect can only trigger once every 20 seconds.",
			"On attack, for 10 seconds, deals Defense-ignoring Physical Damage equal to 5.8% of Attack every 0.5 seconds to the enemy. This effect can only trigger once every 20 seconds.",
			"On attack, for 10 seconds, deals Defense-ignoring Physical Damage equal to 7% of Attack every 0.5 seconds to the enemy. This effect can only trigger once every 20 seconds.",
			"On attack, for 10 seconds, deals Defense-ignoring Physical Damage equal to 8.4% of Attack every 0.5 seconds to the enemy. This effect can only trigger once every 20 seconds.",
			"On attack, for 10 seconds, deals Defense-ignoring Physical Damage equal to 10% of Attack every 0.5 seconds to the enemy. This effect can only trigger once every 20 seconds."
		],
		"icon": "ARTIFACT_UNIQUE_503"
	},
	{
		"id": "artifact-502",
		"code": "ARTIFACT_UNIQUE_502",
		"name": "Abyssal Crown",
		"skills": [
			80005021,
			80005022,
			80005023,
			80005024,
			80005025
		],
		"text": [
			"30 sec after the battle starts, increases ATK of the ally with the highest ATK by 36%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"30 sec after the battle starts, increases ATK of the ally with the highest ATK by 43%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"30 sec after the battle starts, increases ATK of the ally with the highest ATK by 52%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"30 sec after the battle starts, increases ATK of the ally with the highest ATK by 63%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"30 sec after the battle starts, increases ATK of the ally with the highest ATK by 75%. This effect cannot be dispelled, and it does not stack with other effects for allies."
		],
		"icon": "ARTIFACT_UNIQUE_502"
	},
	{
		"id": "artifact-509",
		"code": "ARTIFACT_UNIQUE_509",
		"name": "Ancient God King's Coin",
		"skills": [
			80005091,
			80005092,
			80005093,
			80005094,
			80005095
		],
		"text": [
			"Increases ATK and Crit DMG by 24%.",
			"Increases ATK and Crit DMG by 29%.",
			"Increases ATK and Crit DMG by 35%.",
			"Increases ATK and Crit DMG by 42%.",
			"Increases ATK and Crit DMG by 50%."
		],
		"icon": "ARTIFACT_UNIQUE_509"
	},
	{
		"id": "artifact-508",
		"code": "ARTIFACT_UNIQUE_508",
		"name": "Heart Cotton Candy",
		"skills": [
			80005081,
			80005082,
			80005083,
			80005084,
			80005085
		],
		"text": [
			"When the battle starts, increases ATK of self and the ally with the highest ATK by 12% for 20 sec. This effect will not stack with other similar effects cast by allies.",
			"When the battle starts, increases ATK of self and the ally with the highest ATK by 14% for 20 sec. This effect will not stack with other similar effects cast by allies.",
			"When the battle starts, increases ATK of self and the ally with the highest ATK by 17% for 20 sec. This effect will not stack with other similar effects cast by allies.",
			"When the battle starts, increases ATK of self and the ally with the highest ATK by 21% for 20 sec. This effect will not stack with other similar effects cast by allies.",
			"When the battle starts, increases ATK of self and the ally with the highest ATK by 25% for 20 sec. This effect will not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_508"
	},
	{
		"id": "artifact-901",
		"code": "ARTIFACT_UNIQUE_901",
		"name": "Honorary Medal",
		"skills": [
			80009101,
			80009102,
			80009103,
			80009104,
			80009105
		],
		"text": [
			"Increases ATK, HP, and All DEF of all allies by 9%. This effect does not stack with same effects from other allies.",
			"Increases ATK, HP, and All DEF of all allies by 10.5%. This effect does not stack with same effects from other allies.",
			"Increases ATK, HP, and All DEF of all allies by 12%. This effect does not stack with same effects from other allies.",
			"Increases ATK, HP, and All DEF of all allies by 13.5%. This effect does not stack with same effects from other allies.",
			"Increases ATK, HP, and All DEF of all allies by 15%. This effect does not stack with same effects from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_901"
	},
	{
		"id": "artifact-900",
		"code": "ARTIFACT_UNIQUE_900",
		"name": "Honorary Trophy",
		"skills": [
			80009001,
			80009002,
			80009003,
			80009004,
			80009005
		],
		"text": [
			"Increases ATK by 30% and Crit Chance by 300.",
			"Increases ATK by 35% and Crit Chance by 350.",
			"Increases ATK by 40% and Crit Chance by 400.",
			"Increases ATK by 45% and Crit Chance by 450.",
			"Increases ATK by 50% and Crit Chance by 500."
		],
		"icon": "ARTIFACT_UNIQUE_900"
	},
	{
		"id": "artifact-902",
		"code": "ARTIFACT_UNIQUE_902",
		"name": "Hero's Plaque of Appreciation",
		"skills": [
			80009201,
			80009202,
			80009203,
			80009204,
			80009205
		],
		"text": [
			"Increases Max HP by 30%. 30 sec after the battle starts, increases Crit DMG of the ally with the highest ATK excluding self by 60%. This effect is irremovable and does not stack with same effects from other allies.",
			"Increases Max HP by 35%. 30 sec after the battle starts, increases Crit DMG of the ally with the highest ATK excluding self by 70%. This effect is irremovable and does not stack with same effects from other allies.",
			"Increases Max HP by 40%. 30 sec after the battle starts, increases Crit DMG of the ally with the highest ATK excluding self by 80%. This effect is irremovable and does not stack with same effects from other allies.",
			"Increases Max HP by 45%. 30 sec after the battle starts, increases Crit DMG of the ally with the highest ATK excluding self by 90%. This effect is irremovable and does not stack with same effects from other allies.",
			"Increases Max HP by 50%. 30 sec after the battle starts, increases Crit DMG of the ally with the highest ATK excluding self by 100%. This effect is irremovable and does not stack with same effects from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_902"
	},
	{
		"id": "artifact-1",
		"code": "ARTIFACT_UNIQUE_1",
		"name": "Burning Brazier of Elf",
		"skills": [
			80000011,
			80000012,
			80000013,
			80000014,
			80000015
		],
		"text": [
			"Upon attacking an enemy, there is a 12% chance to recover 1 MP.",
			"Upon attacking an enemy, there is a 14% chance to recover 1 MP.",
			"Upon attacking an enemy, there is a 17% chance to recover 1 MP.",
			"Upon attacking an enemy, there is a 20% chance to recover 1 MP.",
			"Upon attacking an enemy, there is a 25% chance to recover 1 MP."
		],
		"icon": "ARTIFACT_UNIQUE_1"
	},
	{
		"id": "artifact-2",
		"code": "ARTIFACT_UNIQUE_2",
		"name": "Drinking Horn of Ancient Cow",
		"skills": [
			80000021,
			80000022,
			80000023,
			80000024,
			80000025
		],
		"text": [
			"Normal attacks have a 10% chance to increase ATK by 12% and ATK Spd by 120 for 10 sec.",
			"Normal attacks have a 10% chance to increase ATK by 14% and ATK Spd by 140 for 10 sec.",
			"Normal attacks have a 10% chance to increase ATK by 17% and ATK Spd by 170 for 10 sec.",
			"Normal attacks have a 10% chance to increase ATK by 20% and ATK Spd by 200 for 10 sec.",
			"Normal attacks have a 10% chance to increase ATK by 25% and ATK Spd by 250 for 10 sec."
		],
		"icon": "ARTIFACT_UNIQUE_2"
	},
	{
		"id": "artifact-3",
		"code": "ARTIFACT_UNIQUE_3",
		"name": "Dice of Magical Letters",
		"skills": [
			80000031,
			80000032,
			80000033,
			80000034,
			80000035
		],
		"text": [
			"Normal attacks have a 3% chance to deal 480% M.DMG.",
			"Normal attacks have a 3% chance to deal 575% M.DMG.",
			"Normal attacks have a 3% chance to deal 690% M.DMG.",
			"Normal attacks have a 3% chance to deal 830% M.DMG.",
			"Normal attacks have a 3% chance to deal 1,000% M.DMG."
		],
		"icon": "ARTIFACT_UNIQUE_3"
	},
	{
		"id": "artifact-4",
		"code": "ARTIFACT_UNIQUE_4",
		"name": "Golden Cat Statue",
		"skills": [
			80000041,
			80000042,
			80000043,
			80000044,
			80000045
		],
		"text": [
			"At the beginning of each battle, increases ATK Spd by 480 for 15 sec.",
			"At the beginning of each battle, increases ATK Spd by 570 for 15 sec.",
			"At the beginning of each battle, increases ATK Spd by 690 for 15 sec.",
			"At the beginning of each battle, increases ATK Spd by 830 for 15 sec.",
			"At the beginning of each battle, increases ATK Spd by 1,000 for 15 sec."
		],
		"icon": "ARTIFACT_UNIQUE_4"
	},
	{
		"id": "artifact-5",
		"code": "ARTIFACT_UNIQUE_5",
		"name": "Pocket Watch of Ancient Civilization",
		"skills": [
			80000051,
			80000052,
			80000053,
			80000054,
			80000055
		],
		"text": [
			"Reduces Cooldown of self's all Skills by 1.2 sec every 10 sec and increases ATK Spd by 96 for 5 sec.",
			"Reduces Cooldown of self's all Skills by 1.4 sec every 10 sec and increases ATK Spd by 115 for 5 sec.",
			"Reduces Cooldown of self's all Skills by 1.7 sec every 10 sec and increases ATK Spd by 138 for 5 sec.",
			"Reduces Cooldown of self's all Skills by 2 sec every 10 sec and increases ATK Spd by 165 for 5 sec.",
			"Reduces Cooldown of self's all Skills by 2.5 sec every 10 sec and increases ATK Spd by 200 for 5 sec."
		],
		"icon": "ARTIFACT_UNIQUE_5"
	},
	{
		"id": "artifact-6",
		"code": "ARTIFACT_UNIQUE_6",
		"name": "Primer for the Heroes",
		"skills": [
			80000061,
			80000062,
			80000063,
			80000064,
			80000065
		],
		"text": [
			"When HP is 20% or below, increases ATK by 36%, and increases ATK Spd and All DMG Reduction by 360.",
			"When HP is 20% or below, increases ATK by 43%, and increases ATK Spd and All DMG Reduction by 430.",
			"When HP is 20% or below, increases ATK by 51%, and increases ATK Spd and All DMG Reduction by 510.",
			"When HP is 20% or below, increases ATK by 62%, and increases ATK Spd and All DMG Reduction by 620.",
			"When HP is 20% or below, increases ATK by 75%, and increases ATK Spd and All DMG Reduction by 750."
		],
		"icon": "ARTIFACT_UNIQUE_6"
	},
	{
		"id": "artifact-7",
		"code": "ARTIFACT_UNIQUE_7",
		"name": "The Ancient Scope",
		"skills": [
			80000071,
			80000072,
			80000073,
			80000074,
			80000075
		],
		"text": [
			"When MP is at 100%, Crit Chance and ACC rise by 480 for 10 sec. Has a cooldown of 20 sec.",
			"When MP is at 100%, Crit Chance and ACC rise by 570 for 10 sec. Has a cooldown of 20 sec.",
			"When MP is at 100%, Crit Chance and ACC rise by 690 for 10 sec. Has a cooldown of 20 sec.",
			"When MP is at 100%, Crit Chance and ACC rise by 830 for 10 sec. Has a cooldown of 20 sec.",
			"When MP is at 100%, Crit Chance and ACC rise by 1000 for 10 sec. Has a cooldown of 20 sec."
		],
		"icon": "ARTIFACT_UNIQUE_7"
	},
	{
		"id": "artifact-8",
		"code": "ARTIFACT_UNIQUE_8",
		"name": "Roaring Tiger Statue",
		"skills": [
			80000081,
			80000082,
			80000083,
			80000084,
			80000085
		],
		"text": [
			"When your HP falls to 35% or lower, deals Physical Damage equal to 100% of Attack to nearby enemies and knocks them down. Enemies hit have their Attack reduced by 16% and Attack Speed reduced by 160 for 10 seconds. This effect has a 30-second cooldown.",
			"When your HP falls to 35% or lower, deals Physical Damage equal to 100% of Attack to nearby enemies and knocks them down. Enemies hit have their Attack reduced by 20% and Attack Speed reduced by 200 for 10 seconds. This effect has a 30-second cooldown.",
			"When your HP falls to 35% or lower, deals Physical Damage equal to 100% of Attack to nearby enemies and knocks them down. Enemies hit have their Attack reduced by 24% and Attack Speed reduced by 240 for 10 seconds. This effect has a 30-second cooldown.",
			"When your HP falls to 35% or lower, deals Physical Damage equal to 100% of Attack to nearby enemies and knocks them down. Enemies hit have their Attack reduced by 29% and Attack Speed reduced by 290 for 10 seconds. This effect has a 30-second cooldown.",
			"When your HP falls to 35% or lower, deals Physical Damage equal to 100% of Attack to nearby enemies and knocks them down. Enemies hit have their Attack reduced by 35% and Attack Speed reduced by 350 for 10 seconds. This effect has a 30-second cooldown."
		],
		"icon": "ARTIFACT_UNIQUE_8"
	},
	{
		"id": "artifact-9",
		"code": "ARTIFACT_UNIQUE_9",
		"name": "Golden Apple of a Goddess",
		"skills": [
			80000091,
			80000092,
			80000093,
			80000094,
			80000095
		],
		"text": [
			"When the hero's HP falls below 25%, recover 36% of max HP and dispel all negative effects. Activates 1 time only.",
			"When the hero's HP falls below 25%, recover 43% of max HP and dispel all negative effects. Activates 1 time only.",
			"When the hero's HP falls below 25%, recover 51% of max HP and dispel all negative effects. Activates 1 time only.",
			"When the hero's HP falls below 25%, recover 62% of max HP and dispel all negative effects. Activates 1 time only.",
			"When the hero's HP falls below 25%, recover 75% of max HP and dispel all negative effects. Activates 1 time only."
		],
		"icon": "ARTIFACT_UNIQUE_9"
	},
	{
		"id": "artifact-18",
		"code": "ARTIFACT_UNIQUE_18",
		"name": "Undead Mask",
		"skills": [
			80000181,
			80000182,
			80000183,
			80000184,
			80000185
		],
		"text": [
			"Increases DMG to Undead by 48 % and Resistance against Undead by 24%.",
			"Increases DMG to Undead by 57 % and Resistance against Undead by 28%.",
			"Increases DMG to Undead by 69 % and Resistance against Undead by 34%.",
			"Increases DMG to Undead by 83 % and Resistance against Undead by 41%.",
			"Increases DMG to Undead by 100 % and Resistance against Undead by 50%."
		],
		"icon": "ARTIFACT_UNIQUE_18"
	},
	{
		"id": "artifact-28",
		"code": "ARTIFACT_UNIQUE_28",
		"name": "Insignia of Iron Conviction",
		"skills": [
			80000281,
			80000282,
			80000283,
			80000284,
			80000285
		],
		"text": [
			"Every time you take Magic Damage 50 times, removes all harmful effects from yourself and creates a Shield that absorbs damage equal to 580% of Attack for 5 seconds. While the Shield persists, you are immune to status effects and damage stacks are not accumulated.",
			"Every time you take Magic Damage 50 times, removes all harmful effects from yourself and creates a Shield that absorbs damage equal to 690% of Attack for 5 seconds. While the Shield persists, you are immune to status effects and damage stacks are not accumulated.",
			"Every time you take Magic Damage 50 times, removes all harmful effects from yourself and creates a Shield that absorbs damage equal to 830% of Attack for 5 seconds. While the Shield persists, you are immune to status effects and damage stacks are not accumulated.",
			"Every time you take Magic Damage 50 times, removes all harmful effects from yourself and creates a Shield that absorbs damage equal to 1000% of Attack for 5 seconds. While the Shield persists, you are immune to status effects and damage stacks are not accumulated.",
			"Every time you take Magic Damage 50 times, removes all harmful effects from yourself and creates a Shield that absorbs damage equal to 1200% of Attack for 5 seconds. While the Shield persists, you are immune to status effects and damage stacks are not accumulated."
		],
		"icon": "ARTIFACT_UNIQUE_28"
	},
	{
		"id": "artifact-38",
		"code": "ARTIFACT_UNIQUE_38",
		"name": "Assassin's Veil",
		"skills": [
			80000381,
			80000382,
			80000383,
			80000384,
			80000385
		],
		"text": [
			"Increases P.Dodge by 120. Each successful dodge increases ATK by 1.2%, stacking up to max 20 times.",
			"Increases P.Dodge by 140. Each successful dodge increases ATK by 1.4%, stacking up to max 20 times.",
			"Increases P.Dodge by 170. Each successful dodge increases ATK by 1.7%, stacking up to max 20 times.",
			"Increases P.Dodge by 210. Each successful dodge increases ATK by 2.1%, stacking up to max 20 times.",
			"Increases P.Dodge by 250. Each successful dodge increases ATK by 2.5%, stacking up to max 20 times."
		],
		"icon": "ARTIFACT_UNIQUE_38"
	},
	{
		"id": "artifact-48",
		"code": "ARTIFACT_UNIQUE_48",
		"name": "Magical Flute",
		"skills": [
			80000481,
			80000482,
			80000483,
			80000484,
			80000485
		],
		"text": [
			"Every 8 sec, increases ATK Spd of 2 random allies and the caster by 120 for 4 sec.",
			"Every 8 sec, increases ATK Spd of 2 random allies and the caster by 140 for 4 sec.",
			"Every 8 sec, increases ATK Spd of 2 random allies and the caster by 170 for 4 sec.",
			"Every 8 sec, increases ATK Spd of 2 random allies and the caster by 210 for 4 sec.",
			"Every 8 sec, increases ATK Spd of 2 random allies and the caster by 250 for 4 sec."
		],
		"icon": "ARTIFACT_UNIQUE_48"
	},
	{
		"id": "artifact-58",
		"code": "ARTIFACT_UNIQUE_58",
		"name": "Kiddy Chick",
		"skills": [
			80000581,
			80000582,
			80000583,
			80000584,
			80000585
		],
		"text": [
			"ATK Spd is increased by 96",
			"ATK Spd is increased by 115",
			"ATK Spd is increased by 138",
			"ATK Spd is increased by 165",
			"ATK Spd is increased by 200"
		],
		"icon": "ARTIFACT_UNIQUE_58"
	},
	{
		"id": "artifact-68",
		"code": "ARTIFACT_UNIQUE_68",
		"name": "Fragment of an Ancient Kingdom",
		"skills": [
			80000681,
			80000682,
			80000683,
			80000684,
			80000685
		],
		"text": [
			"Increases CC Resist by 240 and CC ACC by 240.",
			"Increases CC Resist by 290 and CC ACC by 290.",
			"Increases CC Resist by 350 and CC ACC by 350.",
			"Increases CC Resist by 420 and CC ACC by 420.",
			"Increases CC Resist by 500 and CC ACC by 500."
		],
		"icon": "ARTIFACT_UNIQUE_68"
	},
	{
		"id": "artifact-515",
		"code": "ARTIFACT_UNIQUE_515",
		"name": "Forge Hammer MK-II",
		"skills": [
			80005151,
			80005152,
			80005153,
			80005154,
			80005155
		],
		"text": [
			"Normal attacks have a 5% chance to increase ATK Spd by 480 for 5 sec.",
			"Normal attacks have a 5% chance to increase ATK Spd by 580 for 5 sec.",
			"Normal attacks have a 5% chance to increase ATK Spd by 700 for 5 sec.",
			"Normal attacks have a 5% chance to increase ATK Spd by 840 for 5 sec.",
			"Normal attacks have a 5% chance to increase ATK Spd by 1000 for 5 sec."
		],
		"icon": "ARTIFACT_UNIQUE_515"
	},
	{
		"id": "artifact-514",
		"code": "ARTIFACT_UNIQUE_514",
		"name": "Pumpkin-Stuck Evil Spirit",
		"skills": [
			80005141,
			80005142,
			80005143,
			80005144,
			80005145
		],
		"text": [
			"Increases own Max HP by 24%. When there is 1 enemy, increases ATK of all allies by 24%. This effect will not stack with other similar effects cast by allies.",
			"Increases own Max HP by 29%. When there is 1 enemy, increases ATK of all allies by 29%. This effect will not stack with other similar effects cast by allies.",
			"Increases own Max HP by 35%. When there is 1 enemy, increases ATK of all allies by 35%. This effect will not stack with other similar effects cast by allies.",
			"Increases own Max HP by 42%. When there is 1 enemy, increases ATK of all allies by 42%. This effect will not stack with other similar effects cast by allies.",
			"Increases own Max HP by 50%. When there is 1 enemy, increases ATK of all allies by 50%. This effect will not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_514"
	},
	{
		"id": "artifact-517",
		"code": "ARTIFACT_UNIQUE_517",
		"name": "Otherworldly Sword",
		"skills": [
			80005171,
			80005172,
			80005173,
			80005174,
			80005175
		],
		"text": [
			"Consumes 4.8% of current HP for 1 sec and disables Lifesteal, but increases DMG dealt by 0.5% and Crit DMG by 0.5% every sec. These effects stack up to 60 times and are automatically deactivated when HP falls below 25%.",
			"Consumes 5.7% of current HP for 1 sec and disables Lifesteal, but increases DMG dealt by 0.5% and Crit DMG by 0.5% every sec. These effects stack up to 70 times and are automatically deactivated when HP falls below 25%.",
			"Consumes 6.9% of current HP for 1 sec and disables Lifesteal, but increases DMG dealt by 0.5% and Crit DMG by 0.5% every sec. These effects stack up to 80 times and are automatically deactivated when HP falls below 25%.",
			"Consumes 8.3% of current HP for 1 sec and disables Lifesteal, but increases DMG dealt by 0.5% and Crit DMG by 0.5% every sec. These effects stack up to 90 times and are automatically deactivated when HP falls below 25%.",
			"Consumes 10% of current HP for 1 sec and disables Lifesteal, but increases DMG dealt by 0.5% and Crit DMG by 0.5% every sec. These effects stack up to 100 times and are automatically deactivated when HP falls below 25%."
		],
		"icon": "ARTIFACT_UNIQUE_517"
	},
	{
		"id": "artifact-516",
		"code": "ARTIFACT_UNIQUE_516",
		"name": "New-Type Thruster",
		"skills": [
			80005161,
			80005162,
			80005163,
			80005164,
			80005165
		],
		"text": [
			"When inflicted by CC, reduces all skill cooldowns by 6 sec and recovers 600 Mana for 1 sec for 3 sec. Has a cooldown of 20 sec.",
			"When inflicted by CC, reduces all skill cooldowns by 7 sec and recovers 700 Mana for 1 sec for 3 sec. Has a cooldown of 20 sec.",
			"When inflicted by CC, reduces all skill cooldowns by 8 sec and recovers 800 Mana for 1 sec for 3 sec. Has a cooldown of 20 sec.",
			"When inflicted by CC, reduces all skill cooldowns by 9 sec and recovers 900 Mana for 1 sec for 3 sec. Has a cooldown of 20 sec.",
			"When inflicted by CC, reduces all skill cooldowns by 10 sec and recovers 1000 Mana for 1 sec for 3 sec. Has a cooldown of 20 sec."
		],
		"icon": "ARTIFACT_UNIQUE_516"
	},
	{
		"id": "artifact-511",
		"code": "ARTIFACT_UNIQUE_511",
		"name": "Master Chef’s Recipe Book",
		"skills": [
			80005111,
			80005112,
			80005113,
			80005114,
			80005115
		],
		"text": [
			"Increases self's All DEF by 12%, and Heal Rate by 12%.",
			"Increases self's All DEF by 14%, and Heal Rate by 14%.",
			"Increases self's All DEF by 17%, and Heal Rate by 17%.",
			"Increases self's All DEF by 21%, and Heal Rate by 21%.",
			"Increases self's All DEF by 25%, and Heal Rate by 25%."
		],
		"icon": "ARTIFACT_UNIQUE_511"
	},
	{
		"id": "artifact-510",
		"code": "ARTIFACT_UNIQUE_510",
		"name": "Pendulum of Fantasy",
		"skills": [
			80005101,
			80005102,
			80005103,
			80005104,
			80005105
		],
		"text": [
			"At the beginning of each battle, permanently increases ATK by 12%. This effect stacks up to max 5 times, and is irremovable.",
			"At the beginning of each battle, permanently increases ATK by 14%. This effect stacks up to max 5 times, and is irremovable.",
			"At the beginning of each battle, permanently increases ATK by 17%. This effect stacks up to max 5 times, and is irremovable.",
			"At the beginning of each battle, permanently increases ATK by 21%. This effect stacks up to max 5 times, and is irremovable.",
			"At the beginning of each battle, permanently increases ATK by 25%. This effect stacks up to max 5 times, and is irremovable."
		],
		"icon": "ARTIFACT_UNIQUE_510"
	},
	{
		"id": "artifact-513",
		"code": "ARTIFACT_UNIQUE_513",
		"name": "Juno's Special Dessert",
		"skills": [
			80005131,
			80005132,
			80005133,
			80005134,
			80005135
		],
		"text": [
			"Upon taking a hit, there is a 20% chance to increase All DMG the target takes by 12% for 5 sec. This effect cannot be used with other similar effects cast by allies.",
			"Upon taking a hit, there is a 20% chance to increase All DMG the target takes by 14% for 5 sec. This effect cannot be used with other similar effects cast by allies.",
			"Upon taking a hit, there is a 20% chance to increase All DMG the target takes by 17% for 5 sec. This effect cannot be used with other similar effects cast by allies.",
			"Upon taking a hit, there is a 20% chance to increase All DMG the target takes by 21% for 5 sec. This effect cannot be used with other similar effects cast by allies.",
			"Upon taking a hit, there is a 20% chance to increase All DMG the target takes by 25% for 5 sec. This effect cannot be used with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_513"
	},
	{
		"id": "artifact-512",
		"code": "ARTIFACT_UNIQUE_512",
		"name": "Juno's Special Vitality Stew",
		"skills": [
			80005121,
			80005122,
			80005123,
			80005124,
			80005125
		],
		"text": [
			"On Normal Attack, inflicts Physical DoT equal to 240% of Attack over 5 seconds. This effect cannot be used simultaneously with the same effect from other allies.",
			"On Normal Attack, inflicts Physical DoT equal to 290% of Attack over 5 seconds. This effect cannot be used simultaneously with the same effect from other allies.",
			"On Normal Attack, inflicts Physical DoT equal to 350% of Attack over 5 seconds. This effect cannot be used simultaneously with the same effect from other allies.",
			"On Normal Attack, inflicts Physical DoT equal to 420% of Attack over 5 seconds. This effect cannot be used simultaneously with the same effect from other allies.",
			"On Normal Attack, inflicts Physical DoT equal to 500% of Attack over 5 seconds. This effect cannot be used simultaneously with the same effect from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_512"
	},
	{
		"id": "artifact-519",
		"code": "ARTIFACT_UNIQUE_519",
		"name": "Otherworldly Radiance",
		"skills": [
			80005191,
			80005192,
			80005193,
			80005194,
			80005195
		],
		"text": [
			"At the beginning of the first battle, and every 15 sec, gains [Otherworldly Radiance] that lasts for 4 sec. If [Otherworldly Radiance] is still active after 4 sec, dispels negative effects from self and reduces All DMG taken by 24% for 4 sec. If [Otherworldly Radiance] is dispelled in 4 sec, dispels positive effects from 2 random enemies, knocks them away for 3 sec, and reduces their Mana by 1000. DMG Reduction effect is irremovable.",
			"At the beginning of the first battle, and every 15 sec, gains [Otherworldly Radiance] that lasts for 4 sec. If [Otherworldly Radiance] is still active after 4 sec, dispels negative effects from self and reduces All DMG taken by 29% for 4 sec. If [Otherworldly Radiance] is dispelled in 4 sec, dispels positive effects from 2 random enemies, knocks them away for 3 sec, and reduces their Mana by 1200. DMG Reduction effect is irremovable.",
			"At the beginning of the first battle, and every 15 sec, gains [Otherworldly Radiance] that lasts for 4 sec. If [Otherworldly Radiance] is still active after 4 sec, dispels negative effects from self and reduces All DMG taken by 35% for 4 sec. If [Otherworldly Radiance] is dispelled in 4 sec, dispels positive effects from 2 random enemies, knocks them away for 3 sec, and reduces their Mana by 1400. DMG Reduction effect is irremovable.",
			"At the beginning of the first battle, and every 15 sec, gains [Otherworldly Radiance] that lasts for 4 sec. If [Otherworldly Radiance] is still active after 4 sec, dispels negative effects from self and reduces All DMG taken by 42% for 4 sec. If [Otherworldly Radiance] is dispelled in 4 sec, dispels positive effects from 2 random enemies, knocks them away for 3 sec, and reduces their Mana by 1700. DMG Reduction effect is irremovable.",
			"At the beginning of the first battle, and every 15 sec, gains [Otherworldly Radiance] that lasts for 4 sec. If [Otherworldly Radiance] is still active after 4 sec, dispels negative effects from self and reduces All DMG taken by 50% for 4 sec. If [Otherworldly Radiance] is dispelled in 4 sec, dispels positive effects from 2 random enemies, knocks them away for 3 sec, and reduces their Mana by 2000. DMG Reduction effect is irremovable."
		],
		"icon": "ARTIFACT_UNIQUE_519"
	},
	{
		"id": "artifact-518",
		"code": "ARTIFACT_UNIQUE_518",
		"name": "Otherworldly Helm",
		"skills": [
			80005181,
			80005182,
			80005183,
			80005184,
			80005185
		],
		"text": [
			"Increases self's Max HP by 24%, and upon taking DMG 3 times, reduces [DMG dealt to Heroes] of self and 2 enemies with the highest ATK by 55% for 5 sec. This effect is irremovable and has a 30 sec Cooldown.",
			"Increases self's Max HP by 29%, and upon taking DMG 3 times, reduces [DMG dealt to Heroes] of self and 2 enemies with the highest ATK by 60% for 5 sec. This effect is irremovable and has a 30 sec Cooldown.",
			"Increases self's Max HP by 35%, and upon taking DMG 3 times, reduces [DMG dealt to Heroes] of self and 2 enemies with the highest ATK by 65% for 5 sec. This effect is irremovable and has a 30 sec Cooldown.",
			"Increases self's Max HP by 42%, and upon taking DMG 3 times, reduces [DMG dealt to Heroes] of self and 2 enemies with the highest ATK by 70% for 5 sec. This effect is irremovable and has a 30 sec Cooldown.",
			"Increases self's Max HP by 50%, and upon taking DMG 3 times, reduces [DMG dealt to Heroes] of self and 2 enemies with the highest ATK by 75% for 5 sec. This effect is irremovable and has a 30 sec Cooldown."
		],
		"icon": "ARTIFACT_UNIQUE_518"
	},
	{
		"id": "artifact-15",
		"code": "ARTIFACT_UNIQUE_15",
		"name": "Mask of Orc",
		"skills": [
			80000151,
			80000152,
			80000153,
			80000154,
			80000155
		],
		"text": [
			"ATK upon Orcs increase by 48 %, and DMG resistance against Orcs increases by 24 %",
			"ATK upon Orcs increase by 57 %, and DMG resistance against Orcs increases by 28 %",
			"ATK upon Orcs increase by 69 %, and DMG resistance against Orcs increases by 34 %",
			"ATK upon Orcs increase by 83 %, and DMG resistance against Orcs increases by 41 %",
			"ATK upon Orcs increase by 100 %, and DMG resistance against Orcs increases by 50 %"
		],
		"icon": "ARTIFACT_UNIQUE_15"
	},
	{
		"id": "artifact-25",
		"code": "ARTIFACT_UNIQUE_25",
		"name": "Blessing of Earth",
		"skills": [
			80000251,
			80000252,
			80000253,
			80000254,
			80000255
		],
		"text": [
			"When there is 1 enemy, ATK is boosted by 48%.",
			"When there is 1 enemy, ATK is boosted by 58%.",
			"When there is 1 enemy, ATK is boosted by 69%.",
			"When there is 1 enemy, ATK is boosted by 83%.",
			"When there is 1 enemy, ATK is boosted by 100%."
		],
		"icon": "ARTIFACT_UNIQUE_25"
	},
	{
		"id": "artifact-35",
		"code": "ARTIFACT_UNIQUE_35",
		"name": "Ring of Spirit Morph",
		"skills": [
			80000351,
			80000352,
			80000353,
			80000354,
			80000355
		],
		"text": [
			"At the beginning of every battle, HP does not fall below 10% for 5 sec. If HP falls below 15% for the duration of Skill, DMG dealt to Heroes will be reduced by 70% for 5 sec. All effects are irremovable.",
			"At the beginning of every battle, HP does not fall below 10% for 6 sec. If HP falls below 15% for the duration of Skill, DMG dealt to Heroes will be reduced by 70% for 5 sec. All effects are irremovable.",
			"At the beginning of every battle, HP does not fall below 10% for 7 sec. If HP falls below 15% for the duration of Skill, DMG dealt to Heroes will be reduced by 70% for 5 sec. All effects are irremovable.",
			"At the beginning of every battle, HP does not fall below 10% for 8 sec. If HP falls below 15% for the duration of Skill, DMG dealt to Heroes will be reduced by 70% for 5 sec. All effects are irremovable.",
			"At the beginning of every battle, HP does not fall below 10% for 9 sec. If HP falls below 15% for the duration of Skill, DMG dealt to Heroes will be reduced by 70% for 5 sec. All effects are irremovable."
		],
		"icon": "ARTIFACT_UNIQUE_35"
	},
	{
		"id": "artifact-45",
		"code": "ARTIFACT_UNIQUE_45",
		"name": "Infernal Bond",
		"skills": [
			80000451,
			80000452,
			80000453,
			80000454,
			80000455
		],
		"text": [
			"At the beginning of each battle, increases a random enemy's Cooldown of all Skills by 3 sec.",
			"At the beginning of each battle, increases a random enemy's Cooldown of all Skills by 3.5 sec.",
			"At the beginning of each battle, increases a random enemy's Cooldown of all Skills by 4 sec.",
			"At the beginning of each battle, increases a random enemy's Cooldown of all Skills by 5 sec.",
			"At the beginning of each battle, increases a random enemy's Cooldown of all Skills by 6 sec."
		],
		"icon": "ARTIFACT_UNIQUE_45"
	},
	{
		"id": "artifact-55",
		"code": "ARTIFACT_UNIQUE_55",
		"name": "Christmas Star Ornament",
		"skills": [
			80000551,
			80000552,
			80000553,
			80000554,
			80000555
		],
		"text": [
			"At the beginning of each battle, for 5 sec, increase Mana Recovery per sec by 310%. Also, Crit Resistance is increased by 120. This effect cannot be dispelled.",
			"At the beginning of each battle, for 5 sec, increase Mana Recovery per sec by 370%. Also, Crit Resistance is increased by 140. This effect cannot be dispelled.",
			"At the beginning of each battle, for 5 sec, increase Mana Recovery per sec by 450%. Also, Crit Resistance is increased by 170. This effect cannot be dispelled.",
			"At the beginning of each battle, for 5 sec, increase Mana Recovery per sec by 540%. Also, Crit Resistance is increased by 210. This effect cannot be dispelled.",
			"At the beginning of each battle, for 5 sec, increase Mana Recovery per sec by 650%. Also, Crit Resistance is increased by 250. This effect cannot be dispelled."
		],
		"icon": "ARTIFACT_UNIQUE_55"
	},
	{
		"id": "artifact-65",
		"code": "ARTIFACT_UNIQUE_65",
		"name": "Crystal Music Box",
		"skills": [
			80000651,
			80000652,
			80000653,
			80000654,
			80000655
		],
		"text": [
			"Increases DMG to Hero by 24 % and takes 12% increased DMG.",
			"Increases DMG to Hero by 29 % and takes 14% increased DMG.",
			"Increases DMG to Hero by 35 % and takes 17% increased DMG.",
			"Increases DMG to Hero by 42 % and takes 21% increased DMG.",
			"Increases DMG to Hero by 50 % and takes 25% increased DMG."
		],
		"icon": "ARTIFACT_UNIQUE_65"
	},
	{
		"id": "artifact-524",
		"code": "ARTIFACT_UNIQUE_524",
		"name": "Abyssal Breath",
		"skills": [
			80005241,
			80005242,
			80005243,
			80005244,
			80005245
		],
		"text": [
			"Increases DMG dealt to Non-Hero enemies of 2 allies with the highest ATK excluding self by 6% and heals HP of all allies equal to 2.5% of Max HP every 9 sec. When there is 1 enemy, increases Heal Rate by x2. This effect does not stack with effects from other allies.",
			"Increases DMG dealt to Non-Hero enemies of 2 allies with the highest ATK excluding self by 7.2% and heals HP of all allies equal to 2.5% of Max HP every 8 sec. When there is 1 enemy, increases Heal Rate by x2. This effect does not stack with effects from other allies.",
			"Increases DMG dealt to Non-Hero enemies of 2 allies with the highest ATK excluding self by 8.6% and heals HP of all allies equal to 2.5% of Max HP every 7 sec. When there is 1 enemy, increases Heal Rate by x2. This effect does not stack with effects from other allies.",
			"Increases DMG dealt to Non-Hero enemies of 2 allies with the highest ATK excluding self by 10.4% and heals HP of all allies equal to 2.5% of Max HP every 6 sec. When there is 1 enemy, increases Heal Rate by x2. This effect does not stack with effects from other allies.",
			"Increases DMG dealt to Non-Hero enemies of 2 allies with the highest ATK excluding self by 12.5% and heals HP of all allies equal to 2.5% of Max HP every 5 sec. When there is 1 enemy, increases Heal Rate by x2. This effect does not stack with effects from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_524"
	},
	{
		"id": "artifact-521",
		"code": "ARTIFACT_UNIQUE_521",
		"name": "Treasure Hunt Capsule",
		"skills": [
			80005211,
			80005212,
			80005213,
			80005214,
			80005215
		],
		"text": [
			"At the beginning of each battle, immediately reduces Cooldown of self's all Skills by 1.2 sec and increases DMG dealt to non-Hero enemies by 1.2%. The DMG Boost against Non-Hero enemies can be stacked up to max 10 times and is irremovable. At 10 stacks, the Cooldown Reduction effect is doubled.",
			"At the beginning of each battle, immediately reduces Cooldown of self's all Skills by 1.4 sec and increases DMG dealt to non-Hero enemies by 1.4%. The DMG Boost against Non-Hero enemies can be stacked up to max 10 times and is irremovable. At 10 stacks, the Cooldown Reduction effect is doubled.",
			"At the beginning of each battle, immediately reduces Cooldown of self's all Skills by 1.7 sec and increases DMG dealt to non-Hero enemies by 1.7%. The DMG Boost against Non-Hero enemies can be stacked up to max 10 times and is irremovable. At 10 stacks, the Cooldown Reduction effect is doubled.",
			"At the beginning of each battle, immediately reduces Cooldown of self's all Skills by 2.1 sec and increases DMG dealt to non-Hero enemies by 2.1%. The DMG Boost against Non-Hero enemies can be stacked up to max 10 times and is irremovable. At 10 stacks, the Cooldown Reduction effect is doubled.",
			"At the beginning of each battle, immediately reduces Cooldown of self's all Skills by 2.5 sec and increases DMG dealt to non-Hero enemies by 2.5%. The DMG Boost against Non-Hero enemies can be stacked up to max 10 times and is irremovable. At 10 stacks, the Cooldown Reduction effect is doubled."
		],
		"icon": "ARTIFACT_UNIQUE_521"
	},
	{
		"id": "artifact-520",
		"code": "ARTIFACT_UNIQUE_520",
		"name": "Heart of the Abyss",
		"skills": [
			80005201,
			80005202,
			80005203,
			80005204,
			80005205
		],
		"text": [
			"At the beginning of every battle, increases ATK of the ally with the highest ATK by 10% and reduces ATK of the enemy with the highest ATK by 15% for 100 sec. The ATK Boost effect can be stacked up to max 5 times, and all effects are irremovable.",
			"At the beginning of every battle, increases ATK of the ally with the highest ATK by 12% and reduces ATK of the enemy with the highest ATK by 15% for 100 sec. The ATK Boost effect can be stacked up to max 5 times, and all effects are irremovable.",
			"At the beginning of every battle, increases ATK of the ally with the highest ATK by 14% and reduces ATK of the enemy with the highest ATK by 15% for 100 sec. The ATK Boost effect can be stacked up to max 5 times, and all effects are irremovable.",
			"At the beginning of every battle, increases ATK of the ally with the highest ATK by 17% and reduces ATK of the enemy with the highest ATK by 15% for 100 sec. The ATK Boost effect can be stacked up to max 5 times, and all effects are irremovable.",
			"At the beginning of every battle, increases ATK of the ally with the highest ATK by 20% and reduces ATK of the enemy with the highest ATK by 15% for 100 sec. The ATK Boost effect can be stacked up to max 5 times, and all effects are irremovable."
		],
		"icon": "ARTIFACT_UNIQUE_520"
	},
	{
		"id": "artifact-523",
		"code": "ARTIFACT_UNIQUE_523",
		"name": "Belt Ornament of the Deep",
		"skills": [
			80005231,
			80005232,
			80005233,
			80005234,
			80005235
		],
		"text": [
			"At the beginning of the first battle, and every 30 sec, reduces DMG all allies take from enemies by 24% for 3 sec. This effect is irremovable and does not stack with effects from other allies. Each time the effect expires, dispels negative effects from all allies.",
			"At the beginning of the first battle, and every 30 sec, reduces DMG all allies take from enemies by 29% for 3 sec. This effect is irremovable and does not stack with effects from other allies. Each time the effect expires, dispels negative effects from all allies.",
			"At the beginning of the first battle, and every 30 sec, reduces DMG all allies take from enemies by 35% for 3 sec. This effect is irremovable and does not stack with effects from other allies. Each time the effect expires, dispels negative effects from all allies.",
			"At the beginning of the first battle, and every 30 sec, reduces DMG all allies take from enemies by 42% for 3 sec. This effect is irremovable and does not stack with effects from other allies. Each time the effect expires, dispels negative effects from all allies.",
			"At the beginning of the first battle, and every 30 sec, reduces DMG all allies take from enemies by 50% for 3 sec. This effect is irremovable and does not stack with effects from other allies. Each time the effect expires, dispels negative effects from all allies."
		],
		"icon": "ARTIFACT_UNIQUE_523"
	},
	{
		"id": "artifact-522",
		"code": "ARTIFACT_UNIQUE_522",
		"name": "Earth Fortress",
		"skills": [
			80005221,
			80005222,
			80005223,
			80005224,
			80005225
		],
		"text": [
			"When there is 1 enemy, reduces the target's Heal Rate by 12% and increases own DMG dealt to Bosses by 12%. This effect does not stack with effects from other allies.",
			"When there is 1 enemy, reduces the target's Heal Rate by 14% and increases own DMG dealt to Bosses by 14%. This effect does not stack with effects from other allies.",
			"When there is 1 enemy, reduces the target's Heal Rate by 17% and increases own DMG dealt to Bosses by 17%. This effect does not stack with effects from other allies.",
			"When there is 1 enemy, reduces the target's Heal Rate by 21% and increases own DMG dealt to Bosses by 21%. This effect does not stack with effects from other allies.",
			"When there is 1 enemy, reduces the target's Heal Rate by 25% and increases own DMG dealt to Bosses by 25%. This effect does not stack with effects from other allies."
		],
		"icon": "ARTIFACT_UNIQUE_522"
	},
	{
		"id": "artifact-1003",
		"code": "ARTIFACT_UNIQUE_1003",
		"name": "Solenis' Engraving",
		"skills": [
			80010031,
			80010032,
			80010033,
			80010034,
			80010035
		],
		"text": [
			"Increases All DEF by 2.4% and Max HP by 1.2% for all allies every 10 sec. This effect can be stacked up to max 12 times and is irremovable. This effect does not stack with other similar effects cast by allies.",
			"Increases All DEF by 2.8% and Max HP by 1.4% for all allies every 10 sec. This effect can be stacked up to max 12 times and is irremovable. This effect does not stack with other similar effects cast by allies.",
			"Increases All DEF by 3.4% and Max HP by 1.7% for all allies every 10 sec. This effect can be stacked up to max 12 times and is irremovable. This effect does not stack with other similar effects cast by allies.",
			"Increases All DEF by 4.2% and Max HP by 2.1% for all allies every 10 sec. This effect can be stacked up to max 12 times and is irremovable. This effect does not stack with other similar effects cast by allies.",
			"Increases All DEF by 5% and Max HP by 2.5% for all allies every 10 sec. This effect can be stacked up to max 12 times and is irremovable. This effect does not stack with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_1003"
	},
	{
		"id": "artifact-16",
		"code": "ARTIFACT_UNIQUE_16",
		"name": "Mask of Dark Elf",
		"skills": [
			80000161,
			80000162,
			80000163,
			80000164,
			80000165
		],
		"text": [
			"ATK upon Dark Elves increase by 48 %, and DMG resistance against Dark Elves increases by 24 %",
			"ATK upon Dark Elves increase by 57 %, and DMG resistance against Dark Elves increases by 28 %",
			"ATK upon Dark Elves increase by 69 %, and DMG resistance against Dark Elves increases by 34 %",
			"ATK upon Dark Elves increase by 83 %, and DMG resistance against Dark Elves increases by 41 %",
			"ATK upon Dark Elves increase by 100 %, and DMG resistance against Dark Elves increases by 50 %"
		],
		"icon": "ARTIFACT_UNIQUE_16"
	},
	{
		"id": "artifact-26",
		"code": "ARTIFACT_UNIQUE_26",
		"name": "Earth Core",
		"skills": [
			80000261,
			80000262,
			80000263,
			80000264,
			80000265
		],
		"text": [
			"ATK, HP and all DEF are increased by 12%.",
			"ATK, HP and all DEF are increased by 14%.",
			"ATK, HP and all DEF are increased by 17%.",
			"ATK, HP and all DEF are increased by 20%.",
			"ATK, HP and all DEF are increased by 25%."
		],
		"icon": "ARTIFACT_UNIQUE_26"
	},
	{
		"id": "artifact-36",
		"code": "ARTIFACT_UNIQUE_36",
		"name": "Feather of Sacrifice",
		"skills": [
			80000361,
			80000362,
			80000363,
			80000364,
			80000365
		],
		"text": [
			"For 120 sec after the battle starts, takes 12% extra DMG and increases all DMG taken by the enemy boss by 12%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"For 120 sec after the battle starts, takes 14% extra DMG and increases all DMG taken by the enemy boss by 14%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"For 120 sec after the battle starts, takes 17% extra DMG and increases all DMG taken by the enemy boss by 17%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"For 120 sec after the battle starts, takes 21% extra DMG and increases all DMG taken by the enemy boss by 21%. This effect cannot be dispelled, and it does not stack with other effects for allies.",
			"For 120 sec after the battle starts, takes 25% extra DMG and increases all DMG taken by the enemy boss by 25%. This effect cannot be dispelled, and it does not stack with other effects for allies."
		],
		"icon": "ARTIFACT_UNIQUE_36"
	},
	{
		"id": "artifact-46",
		"code": "ARTIFACT_UNIQUE_46",
		"name": "Infernal Gate",
		"skills": [
			80000461,
			80000462,
			80000463,
			80000464,
			80000465
		],
		"text": [
			"Increases All DEF by 12%, DMG dealt to enemies by 7.2%, and DMG dealt to Non-Hero enemies by 7.2%.",
			"Increases All DEF by 14%, DMG dealt to enemies by 8.6%, and DMG dealt to Non-Hero enemies by 8.6%.",
			"Increases All DEF by 17%, DMG dealt to enemies by 10.5%, and DMG dealt to Non-Hero enemies by 10.5%.",
			"Increases All DEF by 21%, DMG dealt to enemies by 12.5%, and DMG dealt to Non-Hero enemies by 12.5%.",
			"Increases All DEF by 25%, DMG dealt to enemies by 15%, and DMG dealt to Non-Hero enemies by 15%."
		],
		"icon": "ARTIFACT_UNIQUE_46"
	},
	{
		"id": "artifact-56",
		"code": "ARTIFACT_UNIQUE_56",
		"name": "New Year's Fireworks",
		"skills": [
			80000561,
			80000562,
			80000563,
			80000564,
			80000565
		],
		"text": [
			"ATK is increased by 6% for 60 sec at the start of each battle.",
			"ATK is increased by 7.2% for 60 sec at the start of each battle.",
			"ATK is increased by 8.6% for 60 sec at the start of each battle.",
			"ATK is increased by 10.4% for 60 sec at the start of each battle.",
			"ATK is increased by 12.5% for 60 sec at the start of each battle."
		],
		"icon": "ARTIFACT_UNIQUE_56"
	},
	{
		"id": "artifact-66",
		"code": "ARTIFACT_UNIQUE_66",
		"name": "Amethyst Pendulum",
		"skills": [
			80000661,
			80000662,
			80000663,
			80000664,
			80000665
		],
		"text": [
			"Increases All Crit Resistance by 240 for 7 sec every 10 sec.",
			"Increases All Crit Resistance by 290 for 7 sec every 10 sec.",
			"Increases All Crit Resistance by 350 for 7 sec every 10 sec.",
			"Increases All Crit Resistance by 420 for 7 sec every 10 sec.",
			"Increases All Crit Resistance by 500 for 7 sec every 10 sec."
		],
		"icon": "ARTIFACT_UNIQUE_66"
	},
	{
		"id": "artifact-13",
		"code": "ARTIFACT_UNIQUE_13",
		"name": "Mask of Goblin",
		"skills": [
			80000131,
			80000132,
			80000133,
			80000134,
			80000135
		],
		"text": [
			"ATK upon Goblins increase by 48 %, and DMG resistance against Goblins increases by 24 %",
			"ATK upon Goblins increase by 57 %, and DMG resistance against Goblins increases by 28 %",
			"ATK upon Goblins increase by 69 %, and DMG resistance against Goblins increases by 34 %",
			"ATK upon Goblins increase by 83 %, and DMG resistance against Goblins increases by 41 %",
			"ATK upon Goblins increase by 100 %, and DMG resistance against Goblins increases by 50 %"
		],
		"icon": "ARTIFACT_UNIQUE_13"
	},
	{
		"id": "artifact-23",
		"code": "ARTIFACT_UNIQUE_23",
		"name": "Earth Storm",
		"skills": [
			80000231,
			80000232,
			80000233,
			80000234,
			80000235
		],
		"text": [
			"When inflicted by CC, recovers 700 Mana and gains [Earth Storm] for 10 sec, increasing All DMG taken by nearby enemies by 14% for 1 sec. When activated in the Arena, [Earth Storm] deals P.DMG equal to 3% of the target’s Max HP to nearby enemies for 1 sec. This effect cannot Crit, and [Earth Storm] has a cooldown of 20 sec.",
			"When inflicted by CC, recovers 800 Mana and gains [Earth Storm] for 10 sec, increasing All DMG taken by nearby enemies by 17% for 1 sec. When activated in the Arena, [Earth Storm] deals P.DMG equal to 3% of the target’s Max HP to nearby enemies for 1 sec. This effect cannot Crit, and [Earth Storm] has a cooldown of 20 sec.",
			"When inflicted by CC, recovers 1000 Mana and gains [Earth Storm] for 10 sec, increasing All DMG taken by nearby enemies by 21% for 1 sec. When activated in the Arena, [Earth Storm] deals P.DMG equal to 3% of the target’s Max HP to nearby enemies for 1 sec. This effect cannot Crit, and [Earth Storm] has a cooldown of 20 sec.",
			"When inflicted by CC, recovers 1200 Mana and gains [Earth Storm] for 10 sec, increasing All DMG taken by nearby enemies by 25% for 1 sec. When activated in the Arena, [Earth Storm] deals P.DMG equal to 3% of the target’s Max HP to nearby enemies for 1 sec. This effect cannot Crit, and [Earth Storm] has a cooldown of 20 sec.",
			"When inflicted by CC, recovers 1500 Mana and gains [Earth Storm] for 10 sec, increasing All DMG taken by nearby enemies by 30% for 1 sec. When activated in the Arena, [Earth Storm] deals P.DMG equal to 3% of the target’s Max HP to nearby enemies for 1 sec. This effect cannot Crit, and [Earth Storm] has a cooldown of 20 sec."
		],
		"icon": "ARTIFACT_UNIQUE_23"
	},
	{
		"id": "artifact-33",
		"code": "ARTIFACT_UNIQUE_33",
		"name": "Tome of Black Magic",
		"skills": [
			80000331,
			80000332,
			80000333,
			80000334,
			80000335
		],
		"text": [
			"Every 10 sec, selects a random enemy. For 5 sec, deals DEF-ignoring DMG equal to 2.4% of the target’s current HP for 1 sec and reduces Mana by 240. This effect only applies in the Arena.",
			"Every 10 sec, selects a random enemy. For 5 sec, deals DEF-ignoring DMG equal to 2.9% of the target’s current HP for 1 sec and reduces Mana by 290. This effect only applies in the Arena.",
			"Every 10 sec, selects a random enemy. For 5 sec, deals DEF-ignoring DMG equal to 3.5% of the target’s current HP for 1 sec and reduces Mana by 350. This effect only applies in the Arena.",
			"Every 10 sec, selects a random enemy. For 5 sec, deals DEF-ignoring DMG equal to 4.2% of the target’s current HP for 1 sec and reduces Mana by 420. This effect only applies in the Arena.",
			"Every 10 sec, selects a random enemy. For 5 sec, deals DEF-ignoring DMG equal to 5% of the target’s current HP for 1 sec and reduces Mana by 500. This effect only applies in the Arena."
		],
		"icon": "ARTIFACT_UNIQUE_33"
	},
	{
		"id": "artifact-43",
		"code": "ARTIFACT_UNIQUE_43",
		"name": "Infernal Greatsword",
		"skills": [
			80000431,
			80000432,
			80000433,
			80000434,
			80000435
		],
		"text": [
			"Own heal rate decreases by 30%, while Penetration increases by 360 and Crit DMG increases by 36%",
			"Own heal rate decreases by 30%, while Penetration increases by 430 and Crit DMG increases by 43%",
			"Own heal rate decreases by 30%, while Penetration increases by 520 and Crit DMG increases by 52%",
			"Own heal rate decreases by 30%, while Penetration increases by 630 and Crit DMG increases by 63%",
			"Own heal rate decreases by 30%, while Penetration increases by 750 and Crit DMG increases by 75%"
		],
		"icon": "ARTIFACT_UNIQUE_43"
	},
	{
		"id": "artifact-53",
		"code": "ARTIFACT_UNIQUE_53",
		"name": "Well-Done Turkey Roast",
		"skills": [
			80000531,
			80000532,
			80000533,
			80000534,
			80000535
		],
		"text": [
			"Every 15 sec, recovers HP equal to 1.2% of Max HP every sec for 3 sec.",
			"Every 15 sec, recovers HP equal to 1.4% of Max HP every sec for 3 sec.",
			"Every 15 sec, recovers HP equal to 1.7% of Max HP every sec for 3 sec.",
			"Every 15 sec, recovers HP equal to 2% of Max HP every sec for 3 sec.",
			"Every 15 sec, recovers HP equal to 2.5% of Max HP every sec for 3 sec."
		],
		"icon": "ARTIFACT_UNIQUE_53"
	},
	{
		"id": "artifact-63",
		"code": "ARTIFACT_UNIQUE_63",
		"name": "Fantastic Hybrid Animals",
		"skills": [
			80000631,
			80000632,
			80000633,
			80000634,
			80000635
		],
		"text": [
			"When the battle starts, increases DMG to Non-Hero enemies by 14% and takes 14% reduced DMG for 200 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 17% and takes 17% reduced DMG for 200 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 21% and takes 21% reduced DMG for 200 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 25% and takes 25% reduced DMG for 200 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 30% and takes 30% reduced DMG for 200 sec."
		],
		"icon": "ARTIFACT_UNIQUE_63"
	},
	{
		"id": "artifact-19",
		"code": "ARTIFACT_UNIQUE_19",
		"name": "Soul Spring Water",
		"skills": [
			80000191,
			80000192,
			80000193,
			80000194,
			80000195
		],
		"text": [
			"At the beginning of each battle, heals 28% HP and recovers 14% Mana.",
			"At the beginning of each battle, heals 34% HP and recovers 17% Mana.",
			"At the beginning of each battle, heals 42% HP and recovers 21% Mana.",
			"At the beginning of each battle, heals 50% HP and recovers 25% Mana.",
			"At the beginning of each battle, heals 60% HP and recovers 30% Mana."
		],
		"icon": "ARTIFACT_UNIQUE_19"
	},
	{
		"id": "artifact-29",
		"code": "ARTIFACT_UNIQUE_29",
		"name": "Sorcerous Black Dagger",
		"skills": [
			80000291,
			80000292,
			80000293,
			80000294,
			80000295
		],
		"text": [
			"Upon auto-attacking, there is a 12% chance to reduce the enemy's mana by 700. Has a cooldown of 6 sec.",
			"Upon auto-attacking, there is a 14% chance to reduce the enemy's mana by 800. Has a cooldown of 6 sec.",
			"Upon auto-attacking, there is a 16% chance to reduce the enemy's mana by 1000. Has a cooldown of 6 sec.",
			"Upon auto-attacking, there is a 18% chance to reduce the enemy's mana by 1200. Has a cooldown of 6 sec.",
			"Upon auto-attacking, there is a 20% chance to reduce the enemy's mana by 1500. Has a cooldown of 6 sec."
		],
		"icon": "ARTIFACT_UNIQUE_29"
	},
	{
		"id": "artifact-39",
		"code": "ARTIFACT_UNIQUE_39",
		"name": "Nail Ornament of the Deep",
		"skills": [
			80000391,
			80000392,
			80000393,
			80000394,
			80000395
		],
		"text": [
			"At the beginning of each battle, fixes self's DEF to 0 and increases DMG dealt to bosses by 24% for 200 sec. This effect is irremovable.",
			"At the beginning of each battle, fixes self's DEF to 0 and increases DMG dealt to bosses by 29% for 200 sec. This effect is irremovable.",
			"At the beginning of each battle, fixes self's DEF to 0 and increases DMG dealt to bosses by 35% for 200 sec. This effect is irremovable.",
			"At the beginning of each battle, fixes self's DEF to 0 and increases DMG dealt to bosses by 42% for 200 sec. This effect is irremovable.",
			"At the beginning of each battle, fixes self's DEF to 0 and increases DMG dealt to bosses by 50% for 200 sec. This effect is irremovable."
		],
		"icon": "ARTIFACT_UNIQUE_39"
	},
	{
		"id": "artifact-49",
		"code": "ARTIFACT_UNIQUE_49",
		"name": "Lion of Protection",
		"skills": [
			80000491,
			80000492,
			80000493,
			80000494,
			80000495
		],
		"text": [
			"Increases own P.DEF by 24%, and P.Block by 120.",
			"Increases own P.DEF by 29%, and P.Block by 140.",
			"Increases own P.DEF by 35%, and P.Block by 170.",
			"Increases own P.DEF by 42%, and P.Block by 210.",
			"Increases own P.DEF by 50%, and P.Block by 250."
		],
		"icon": "ARTIFACT_UNIQUE_49"
	},
	{
		"id": "artifact-59",
		"code": "ARTIFACT_UNIQUE_59",
		"name": "Cooling Delicacy in the Summer",
		"skills": [
			80000591,
			80000592,
			80000593,
			80000594,
			80000595
		],
		"text": [
			"When the battle begins, reduces DMG from non-Hero enemies by 24% for 30 second(s), and recovers 120 MP every 2 second(s).",
			"When the battle begins, reduces DMG from non-Hero enemies by 28% for 30 second(s), and recovers 140 MP every 2 second(s).",
			"When the battle begins, reduces DMG from non-Hero enemies by 34% for 30 second(s), and recovers 170 MP every 2 second(s).",
			"When the battle begins, reduces DMG from non-Hero enemies by 42% for 30 second(s), and recovers 210 MP every 2 second(s).",
			"When the battle begins, reduces DMG from non-Hero enemies by 50% for 30 second(s), and recovers 250 MP every 2 second(s)."
		],
		"icon": "ARTIFACT_UNIQUE_59"
	},
	{
		"id": "artifact-1000",
		"code": "ARTIFACT_UNIQUE_1000",
		"name": "Dragon's Doomstone",
		"skills": [
			80010001,
			80010002,
			80010003,
			80010004,
			80010005
		],
		"text": [
			"Increases DMG dealt to Non-Hero enemies by 12% and takes 6% reduced DMG from them. If the target is a [Dragon], the effect is tripled.",
			"Increases DMG dealt to Non-Hero enemies by 14% and takes 7% reduced DMG from them. If the target is a [Dragon], the effect is tripled.",
			"Increases DMG dealt to Non-Hero enemies by 17% and takes 8.5% reduced DMG from them. If the target is a [Dragon], the effect is tripled.",
			"Increases DMG dealt to Non-Hero enemies by 21% and takes 10.5% reduced DMG from them. If the target is a [Dragon], the effect is tripled.",
			"Increases DMG dealt to Non-Hero enemies by 25% and takes 12.5% reduced DMG from them. If the target is a [Dragon], the effect is tripled."
		],
		"icon": "ARTIFACT_UNIQUE_1000"
	},
	{
		"id": "artifact-17",
		"code": "ARTIFACT_UNIQUE_17",
		"name": "Mask of Evil King",
		"skills": [
			80000171,
			80000172,
			80000173,
			80000174,
			80000175
		],
		"text": [
			"Inflict 12% more DMG upon bosses.",
			"Inflict 14% more DMG upon bosses.",
			"Inflict 17% more DMG upon bosses.",
			"Inflict 20% more DMG upon bosses.",
			"Inflict 25% more DMG upon bosses."
		],
		"icon": "ARTIFACT_UNIQUE_17"
	},
	{
		"id": "artifact-27",
		"code": "ARTIFACT_UNIQUE_27",
		"name": "Frost Giant Mask",
		"skills": [
			80000271,
			80000272,
			80000273,
			80000274,
			80000275
		],
		"text": [
			"ATK upon Frost Giants increases by 48 %, and DMG resistance against Frost Giants increases by 24 %.",
			"ATK upon Frost Giants increases by 57 %, and DMG resistance against Frost Giants increases by 28 %.",
			"ATK upon Frost Giants increases by 69 %, and DMG resistance against Frost Giants increases by 34 %.",
			"ATK upon Frost Giants increases by 83 %, and DMG resistance against Frost Giants increases by 41 %.",
			"ATK upon Frost Giants increases by 100 %, and DMG resistance against Frost Giants increases by 50 %."
		],
		"icon": "ARTIFACT_UNIQUE_27"
	},
	{
		"id": "artifact-37",
		"code": "ARTIFACT_UNIQUE_37",
		"name": "Vase of Sacrifice",
		"skills": [
			80000371,
			80000372,
			80000373,
			80000374,
			80000375
		],
		"text": [
			"When you take damage 50 times, heals a random ally’s HP by 240% of your Attack and increases that ally’s Attack by 36% for 10 seconds.",
			"When you take damage 50 times, heals a random ally’s HP by 290% of your Attack and increases that ally’s Attack by 43% for 10 seconds.",
			"When you take damage 50 times, heals a random ally’s HP by 350% of your Attack and increases that ally’s Attack by 51% for 10 seconds.",
			"When you take damage 50 times, heals a random ally’s HP by 420% of your Attack and increases that ally’s Attack by 63% for 10 seconds.",
			"When you take damage 50 times, heals a random ally’s HP by 500% of your Attack and increases that ally’s Attack by 75% for 10 seconds."
		],
		"icon": "ARTIFACT_UNIQUE_37"
	},
	{
		"id": "artifact-47",
		"code": "ARTIFACT_UNIQUE_47",
		"name": "Book of the Mad",
		"skills": [
			80000471,
			80000472,
			80000473,
			80000474,
			80000475
		],
		"text": [
			"Reduces own Mana by 120 every sec and increases DMG dealt to enemies by 17%.",
			"Reduces own Mana by 140 every sec and increases DMG dealt to enemies by 21%.",
			"Reduces own Mana by 170 every sec and increases DMG dealt to enemies by 25%.",
			"Reduces own Mana by 210 every sec and increases DMG dealt to enemies by 30%.",
			"Reduces own Mana by 250 every sec and increases DMG dealt to enemies by 35%."
		],
		"icon": "ARTIFACT_UNIQUE_47"
	},
	{
		"id": "artifact-57",
		"code": "ARTIFACT_UNIQUE_57",
		"name": "Fancy Traditional Pendant",
		"skills": [
			80000571,
			80000572,
			80000573,
			80000574,
			80000575
		],
		"text": [
			"Crit Chance is increased by 120 and Crit DMG is increased by 24%.",
			"Crit Chance is increased by 140 and Crit DMG is increased by 29%.",
			"Crit Chance is increased by 170 and Crit DMG is increased by 35%.",
			"Crit Chance is increased by 210 and Crit DMG is increased by 42%.",
			"Crit Chance is increased by 250 and Crit DMG is increased by 50%."
		],
		"icon": "ARTIFACT_UNIQUE_57"
	},
	{
		"id": "artifact-67",
		"code": "ARTIFACT_UNIQUE_67",
		"name": "Goddess of Glory",
		"skills": [
			80000671,
			80000672,
			80000673,
			80000674,
			80000675
		],
		"text": [
			"Increases ATK Spd of 4 allies by 120 for 20 sec when the battle starts. This effect will not be stacked with other similar effects cast by allies.",
			"Increases ATK Spd of 4 allies by 140 for 20 sec when the battle starts. This effect will not be stacked with other similar effects cast by allies.",
			"Increases ATK Spd of 4 allies by 170 for 20 sec when the battle starts. This effect will not be stacked with other similar effects cast by allies.",
			"Increases ATK Spd of 4 allies by 210 for 20 sec when the battle starts. This effect will not be stacked with other similar effects cast by allies.",
			"Increases ATK Spd of 4 allies by 250 for 20 sec when the battle starts. This effect will not be stacked with other similar effects cast by allies."
		],
		"icon": "ARTIFACT_UNIQUE_67"
	},
	{
		"id": "artifact-10",
		"code": "ARTIFACT_UNIQUE_10",
		"name": "Golden Mask of Ancient King",
		"skills": [
			80000101,
			80000102,
			80000103,
			80000104,
			80000105
		],
		"text": [
			"Upon taking a hit, there is a 5% chance to gain invulnerability to all DMG for 3.5 sec. Has a cooldown of 5 sec.",
			"Upon taking a hit, there is a 5% chance to gain invulnerability to all DMG for 4 sec. Has a cooldown of 5 sec.",
			"Upon taking a hit, there is a 5% chance to gain invulnerability to all DMG for 5 sec. Has a cooldown of 5 sec.",
			"Upon taking a hit, there is a 5% chance to gain invulnerability to all DMG for 6 sec. Has a cooldown of 5 sec.",
			"Upon taking a hit, there is a 5% chance to gain invulnerability to all DMG for 7.5 sec. Has a cooldown of 5 sec."
		],
		"icon": "ARTIFACT_UNIQUE_10"
	},
	{
		"id": "artifact-20",
		"code": "ARTIFACT_UNIQUE_20",
		"name": "Talismans of Resistance",
		"skills": [
			80000201,
			80000202,
			80000203,
			80000204,
			80000205
		],
		"text": [
			"Upon receiving a negative effect, removes all negative effects. Afterward, gains immunity to CC for 1.5 sec. Has a Cooldown of 19 sec.",
			"Upon receiving a negative effect, removes all negative effects. Afterward, gains immunity to CC for 2 sec. Has a Cooldown of 18 sec.",
			"Upon receiving a negative effect, removes all negative effects. Afterward, gains immunity to CC for 2.5 sec. Has a Cooldown of 17 sec.",
			"Upon receiving a negative effect, removes all negative effects. Afterward, gains immunity to CC for 3 sec. Has a Cooldown of 16 sec.",
			"Upon receiving a negative effect, removes all negative effects. Afterward, gains immunity to CC for 3.5 sec. Has a Cooldown of 15 sec."
		],
		"icon": "ARTIFACT_UNIQUE_20"
	},
	{
		"id": "artifact-30",
		"code": "ARTIFACT_UNIQUE_30",
		"name": "Tarot Card of Loss",
		"skills": [
			80000301,
			80000302,
			80000303,
			80000304,
			80000305
		],
		"text": [
			"Reduces Crit Chance by 180 and increases ATK by 36%.",
			"Reduces Crit Chance by 210 and increases ATK by 43%.",
			"Reduces Crit Chance by 260 and increases ATK by 52%.",
			"Reduces Crit Chance by 310 and increases ATK by 63%.",
			"Reduces Crit Chance by 375 and increases ATK by 75%."
		],
		"icon": "ARTIFACT_UNIQUE_30"
	},
	{
		"id": "artifact-40",
		"code": "ARTIFACT_UNIQUE_40",
		"name": "Trident of the Deep",
		"skills": [
			80000401,
			80000402,
			80000403,
			80000404,
			80000405
		],
		"text": [
			"Dealing DMG to enemies 100 times increases ATK by 36% and Crit Chance by 240 for 15 sec. This effect cannot be dispelled.",
			"Dealing DMG to enemies 100 times increases ATK by 44% and Crit Chance by 290 for 15 sec. This effect cannot be dispelled.",
			"Dealing DMG to enemies 100 times increases ATK by 53% and Crit Chance by 350 for 15 sec. This effect cannot be dispelled.",
			"Dealing DMG to enemies 100 times increases ATK by 63% and Crit Chance by 420 for 15 sec. This effect cannot be dispelled.",
			"Dealing DMG to enemies 100 times increases ATK by 75% and Crit Chance by 500 for 15 sec. This effect cannot be dispelled."
		],
		"icon": "ARTIFACT_UNIQUE_40"
	},
	{
		"id": "artifact-60",
		"code": "ARTIFACT_UNIQUE_60",
		"name": "LuLu's Necklace",
		"skills": [
			80000601,
			80000602,
			80000603,
			80000604,
			80000605
		],
		"text": [
			"When the battle starts, increases DMG to Non-Hero enemies by 24% for 30 sec, and recovers Mana by 240 every 5 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 28% for 30 sec, and recovers Mana by 280 every 5 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 34% for 30 sec, and recovers Mana by 340 every 5 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 42% for 30 sec, and recovers Mana by 420 every 5 sec.",
			"When the battle starts, increases DMG to Non-Hero enemies by 50% for 30 sec, and recovers Mana by 500 every 5 sec."
		],
		"icon": "ARTIFACT_UNIQUE_60"
	}
];
//#endregion
//#region src/technomagic/sim/artifacts.ts
/** The same at every refinement. */
var all = (n) => [
	n,
	n,
	n,
	n,
	n
];
/** King's Raid's thousandths, at each refinement, as shares (or points: 1000 is 1). */
var k = (...t) => t.map((n) => n / 1e3);
/** Every artifact the fight has a use for, by id (KR_ARTIFACTS'). */
var ARTIFACTS = {
	"artifact-1001": { allies: {
		atk: k(140, 170, 210, 250, 300),
		critDamage: k(280, 340, 420, 500, 600)
	} },
	"artifact-24": { start: {
		on: "self",
		lasts: [
			10,
			12,
			14,
			17,
			20
		],
		defense: all(.5),
		guards: true
	} },
	"artifact-44": { timer: {
		every: 8,
		lasts: 5,
		hit: [
			240,
			290,
			350,
			420,
			500
		],
		weakness: k(120, 140, 170, 210, 250),
		grows: k(5, 6, 7, 8, 10),
		most: 25
	} },
	"artifact-1002": {
		foes: k(120, 140, 170, 210, 250),
		taken: k(-60, -70, -85, -105, -125)
	},
	"artifact-11": { own: {
		blockMagical: [
			330,
			360,
			400,
			440,
			500
		],
		toughMagical: [
			110,
			120,
			140,
			160,
			200
		]
	} },
	"artifact-21": { own: {
		acc: [
			360,
			430,
			520,
			630,
			750
		],
		accuracy: [
			360,
			430,
			520,
			630,
			750
		]
	} },
	"artifact-41": { bossAtk: {
		atk: k(-240, -290, -350, -420, -500),
		lasts: [
			10,
			12,
			14,
			17,
			20
		]
	} },
	"artifact-61": { timer: {
		every: 7,
		heal: k(1200, 1400, 1700, 2100, 2500),
		recovery: k(24, 28, 34, 42, 50),
		most: 15
	} },
	"artifact-32": { timer: {
		every: 7,
		mdef: k(12, 14, 17, 20, 25),
		most: 6
	} },
	"artifact-42": { own: { defense: k(600, 720, 860, 1030, 1250) } },
	"artifact-52": {
		own: { tough: [
			120,
			140,
			170,
			200,
			250
		] },
		dmg: k(120, 140, 170, 200, 250)
	},
	"artifact-62": { onKnock: {
		wait: all(30),
		manaShare: k(140, 170, 210, 250, 300),
		speed: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: all(5)
	} },
	"artifact-505": { own: { critDamage: k(600, 720, 870, 1050, 1250) } },
	"artifact-504": { own: {
		hp: k(120, 140, 170, 210, 250),
		block: [
			120,
			140,
			170,
			210,
			250
		]
	} },
	"artifact-507": {
		allies: { atk: k(100, 120, 140, 170, 200) },
		own: { defense: k(120, 140, 170, 210, 250) }
	},
	"artifact-506": { start: {
		on: "allies",
		lasts: all(20),
		atk: k(60, 72, 86, 104, 125)
	} },
	"artifact-502": { later: {
		after: 30,
		atk: k(360, 430, 520, 630, 750)
	} },
	"artifact-509": { own: {
		atk: k(240, 290, 350, 420, 500),
		critDamage: k(240, 290, 350, 420, 500)
	} },
	"artifact-508": { start: {
		on: "self-top",
		lasts: all(20),
		atk: k(120, 140, 170, 210, 250)
	} },
	"artifact-901": { allies: {
		atk: k(90, 105, 120, 135, 150),
		hp: k(90, 105, 120, 135, 150),
		defense: k(90, 105, 120, 135, 150)
	} },
	"artifact-900": { own: {
		atk: k(300, 350, 400, 450, 500),
		crit: [
			300,
			350,
			400,
			450,
			500
		]
	} },
	"artifact-902": {
		own: { hp: k(300, 350, 400, 450, 500) },
		later: {
			after: 30.5,
			others: true,
			critDamage: k(600, 700, 800, 900, 1e3)
		}
	},
	"artifact-1": { onBasic: {
		chance: k(120, 140, 170, 200, 250),
		wait: 1,
		mana: 1e3
	} },
	"artifact-2": { onBasic: {
		chance: all(.1),
		wait: 10,
		atk: k(120, 140, 170, 200, 250),
		speed: [
			120,
			140,
			170,
			200,
			250
		],
		lasts: 10
	} },
	"artifact-3": { onBasic: {
		chance: all(.03),
		wait: 1,
		hit: [
			4800,
			5750,
			6900,
			8300,
			1e4
		]
	} },
	"artifact-4": { start: {
		on: "self",
		lasts: all(15),
		speed: [
			480,
			570,
			690,
			830,
			1e3
		]
	} },
	"artifact-5": { timer: {
		every: 10,
		cooldown: [
			1.2,
			1.4,
			1.7,
			2,
			2.5
		],
		speed: [
			96,
			115,
			138,
			165,
			200
		],
		lasts: 5
	} },
	"artifact-6": { low: {
		below: .2,
		atk: k(360, 430, 510, 620, 750),
		speed: [
			360,
			430,
			510,
			620,
			750
		],
		tough: [
			360,
			430,
			510,
			620,
			750
		]
	} },
	"artifact-7": { fullMana: {
		wait: 20,
		crit: [
			480,
			570,
			690,
			830,
			1e3
		],
		acc: [
			480,
			570,
			690,
			830,
			1e3
		],
		lasts: 10
	} },
	"artifact-9": { rescue: {
		below: .25,
		heal: k(360, 430, 510, 620, 750)
	} },
	"artifact-38": {
		own: { dodgePhysical: [
			120,
			140,
			170,
			210,
			250
		] },
		onDodge: {
			atk: k(12, 14, 17, 21, 25),
			most: 20
		}
	},
	"artifact-48": { timer: {
		every: 8,
		lasts: 4,
		speed: [
			120,
			140,
			170,
			210,
			250
		],
		random: 2
	} },
	"artifact-58": { own: { speed: [
		96,
		115,
		138,
		165,
		200
	] } },
	"artifact-68": { own: {
		resist: [
			240,
			290,
			350,
			420,
			500
		],
		accuracy: [
			240,
			290,
			350,
			420,
			500
		]
	} },
	"artifact-515": { onBasic: {
		chance: all(.05),
		wait: 0,
		speed: [
			480,
			580,
			700,
			840,
			1e3
		],
		lasts: 5
	} },
	"artifact-514": {
		own: { hp: k(240, 290, 350, 420, 500) },
		allies: { atk: k(240, 290, 350, 420, 500) }
	},
	"artifact-516": { onKnock: {
		wait: all(20),
		cooldown: [
			6,
			7,
			8,
			9,
			10
		],
		manaEach: [
			600,
			700,
			800,
			900,
			1e3
		]
	} },
	"artifact-511": { own: {
		defense: k(120, 140, 170, 210, 250),
		recovery: k(120, 140, 170, 210, 250)
	} },
	"artifact-510": { own: { atk: k(120, 140, 170, 210, 250) } },
	"artifact-513": { onHurt: {
		chance: .2,
		wait: all(0),
		lasts: all(5),
		weakness: k(120, 140, 170, 210, 250)
	} },
	"artifact-25": { own: { atk: k(480, 580, 690, 830, 1e3) } },
	"artifact-35": { undying: {
		floor: .1,
		lasts: [
			5,
			6,
			7,
			8,
			9
		]
	} },
	"artifact-55": { start: {
		on: "self",
		lasts: all(5),
		mana: k(3100, 3700, 4500, 5400, 6500),
		critResist: [
			120,
			140,
			170,
			210,
			250
		]
	} },
	"artifact-521": {
		opening: { cooldown: [
			1.2,
			1.4,
			1.7,
			2.1,
			2.5
		] },
		foes: k(12, 14, 17, 21, 25)
	},
	"artifact-520": { start: {
		on: "top",
		lasts: all(100),
		atk: k(100, 120, 140, 170, 200)
	} },
	"artifact-523": {
		start: {
			on: "allies",
			lasts: all(3),
			tough: [
				240,
				290,
				350,
				420,
				500
			]
		},
		timer: {
			every: 30,
			lasts: 3,
			tough: [
				240,
				290,
				350,
				420,
				500
			]
		}
	},
	"artifact-522": {
		bossHeal: k(-120, -140, -170, -210, -250),
		boss: k(120, 140, 170, 210, 250)
	},
	"artifact-26": { own: {
		atk: k(120, 140, 170, 200, 250),
		hp: k(120, 140, 170, 200, 250),
		defense: k(120, 140, 170, 200, 250)
	} },
	"artifact-36": { start: {
		on: "self",
		lasts: all(120),
		boss: k(120, 140, 170, 210, 250)
	} },
	"artifact-46": {
		own: { defense: k(120, 140, 170, 210, 250) },
		dmg: k(72, 86, 105, 125, 150),
		foes: k(72, 86, 105, 125, 150)
	},
	"artifact-56": { start: {
		on: "self",
		lasts: all(60),
		atk: k(60, 72, 86, 104, 125)
	} },
	"artifact-66": { timer: {
		every: 10,
		lasts: 7,
		critResist: [
			240,
			290,
			350,
			420,
			500
		]
	} },
	"artifact-23": { onKnock: {
		wait: all(20),
		mana: [
			700,
			800,
			1e3,
			1200,
			1500
		],
		weakness: k(140, 170, 210, 250, 300)
	} },
	"artifact-43": { own: {
		recovery: all(-.3),
		pen: [
			360,
			430,
			520,
			630,
			750
		],
		critDamage: k(360, 430, 520, 630, 750)
	} },
	"artifact-53": { timer: {
		every: 15,
		lasts: 3,
		hot: k(12, 14, 17, 20, 25)
	} },
	"artifact-63": { start: {
		on: "self",
		lasts: all(200),
		foes: k(140, 170, 210, 250, 300),
		taken: k(-140, -170, -210, -250, -300)
	} },
	"artifact-19": { opening: {
		heal: k(280, 340, 420, 500, 600),
		mana: k(140, 170, 210, 250, 300)
	} },
	"artifact-39": { start: {
		on: "self",
		lasts: all(200),
		noDef: true,
		boss: k(240, 290, 350, 420, 500)
	} },
	"artifact-49": { own: {
		defPhysical: k(240, 290, 350, 420, 500),
		blockPhysical: [
			120,
			140,
			170,
			210,
			250
		]
	} },
	"artifact-59": { start: {
		on: "self",
		lasts: all(30),
		taken: k(-240, -280, -340, -420, -500),
		manaEach: [
			120,
			140,
			170,
			210,
			250
		]
	} },
	"artifact-1000": {
		foes: k(120, 140, 170, 210, 250),
		taken: k(-60, -70, -85, -105, -125),
		dragon: k(215, 246, 291, 348, 400),
		dragonTaken: k(-128, -150, -186, -235, -289)
	},
	"artifact-17": { boss: k(120, 140, 170, 200, 250) },
	"artifact-47": {
		drain: [
			-120,
			-140,
			-170,
			-210,
			-250
		],
		dmg: k(170, 210, 250, 300, 350)
	},
	"artifact-57": { own: {
		crit: [
			120,
			140,
			170,
			210,
			250
		],
		critDamage: k(240, 290, 350, 420, 500)
	} },
	"artifact-67": { start: {
		on: "allies",
		lasts: all(20),
		speed: [
			120,
			140,
			170,
			210,
			250
		]
	} },
	"artifact-10": { onHurt: {
		chance: .05,
		wait: [
			8.5,
			9,
			10,
			11,
			12.5
		],
		lasts: [
			3.5,
			4,
			5,
			6,
			7.5
		],
		invulnerable: true
	} },
	"artifact-20": { onKnock: {
		wait: [
			19,
			18,
			17,
			16,
			15
		],
		immune: [
			1.5,
			2,
			2.5,
			3,
			3.5
		]
	} },
	"artifact-30": { own: {
		crit: [
			-180,
			-210,
			-260,
			-310,
			-375
		],
		atk: k(360, 430, 520, 630, 750)
	} },
	"artifact-40": { blows: {
		count: 100,
		atk: k(360, 440, 530, 630, 750),
		crit: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 15
	} },
	"artifact-60": { start: {
		on: "self",
		lasts: all(30),
		foes: k(240, 280, 340, 420, 500),
		manaEach: [
			240,
			280,
			340,
			420,
			500
		]
	} },
	"artifact-64": { onKnock: {
		wait: all(0),
		count: 3,
		speed: all(500),
		lasts: [
			4.8,
			5.8,
			7,
			8.4,
			10
		]
	} }
};
/** Its name, and what it does at each refinement, in King's Raid's words. */
var DATA = new Map(KR_ARTIFACTS.map((one) => [one.id, one]));
/** An artifact as a hero wears it: which, and its tier (R1 to R5); null: none, or one the fight has no use for. */
function artifactOf(worn) {
	const def = worn && ARTIFACTS[worn.id];
	return worn && def ? {
		id: worn.id,
		def,
		tier: Math.min(5, Math.max(1, Math.floor(worn.tier) || 1))
	} : null;
}
/** A number at its tier. */
var at = (tiers, tier) => tiers?.[tier - 1] ?? 0;
/** What its own stats gain from the start (as its gear's). */
function artifactStats(worn) {
	if (!worn) return {};
	return Object.fromEntries(Object.entries(worn.def.own ?? {}).map(([stat, tiers]) => [stat, at(tiers, worn.tier)]));
}
/** An artifact as a square on its wearer's card. */
var artifactBuff = (worn) => {
	const data = DATA.get(worn.id);
	return {
		name: data?.name ?? "Artifact",
		about: data?.text?.[worn.tier - 1] ?? "",
		icon: "🏺"
	};
};
/** What every ally gains of an artifact's `allies`, from every hero on the field wearing one: the highest of each. */
function alliesFrom(field, key) {
	let most = 0;
	for (const on of field) {
		const worn = on.artifact;
		if (on.hp > 0 && worn) most = Math.max(most, at(worn.def.allies?.[key], worn.tier));
	}
	return most;
}
var SHOWN = (worn) => ({
	...artifactBuff(worn),
	about: "Its artifact."
});
/** An artifact's hooks for the hero wearing it (`self`). */
function artifactHooks(self, fight) {
	const worn = self.artifact;
	if (!worn) return null;
	const { def, tier } = worn;
	const t = (tiers) => at(tiers, tier);
	const shown = SHOWN(worn);
	const name = `artifact ${self.index}`;
	let stacks = 0;
	let knocks = 0;
	let dodges = 0;
	let struck = 0;
	let rescued = false;
	let manaEach = 0;
	let manaFor = 0;
	/** A status of its artifact's on `on`, for `lasts` seconds. */
	const give = (on, lasts, does, as = name) => put(on, {
		name: as,
		left: lasts,
		...does,
		shown
	});
	/**
	* A status of its artifact's on the boss, for `lasts` seconds (shown under its health as a curse): one for the artifact,
	* whoever wears it (King's Raid's: the same artifact's on the boss don't stack between allies).
	*/
	const curse = (lasts, does, as = `${worn.id} on the boss`) => put(fight.boss().statuses, {
		name: as,
		left: lasts,
		...does,
		shown: "curse"
	});
	const standing = () => fight.field().filter((on) => on.hp > 0);
	const top = (others) => standing().reduce((best, on) => others && on === self ? best : !best || on.stats.atk > best.stats.atk ? on : best, null);
	const whom = (on) => {
		if (on === "self") return [self];
		if (on === "allies") return standing();
		const best = top(false);
		return on === "top" ? best ? [best] : [] : [.../* @__PURE__ */ new Set([self, ...best ? [best] : []])];
	};
	const earlyOn = () => def.start !== void 0 && fight.elapsed() < t(def.start.lasts);
	/** `n` of `from` at random, each once (by the fight's chances, so the bot's and every page's fight pick the same). */
	const picked = (from, n) => {
		const left = [...from];
		const out = [];
		while (out.length < n && left.length > 0) out.push(...left.splice(Math.floor(fight.roll() * left.length), 1));
		return out;
	};
	return {
		deals(foe) {
			const early = earlyOn() ? def.start : void 0;
			const boss = foe === fight.boss();
			return 1 + t(def.dmg) + t(def.foes) + t(early?.foes) + (boss ? t(def.boss) + t(early?.boss) : 0) + (fight.dragon ? t(def.dragon) : 0);
		},
		taken() {
			const early = earlyOn() ? def.start : void 0;
			return 1 + t(def.taken) + t(early?.taken) + (fight.dragon ? t(def.dragonTaken) : 0);
		},
		begin() {
			const start = def.start;
			if (start) {
				for (const on of whom(start.on)) {
					give(on.statuses, t(start.lasts), {
						...start.atk && { atk: t(start.atk) },
						...start.speed && { speed: t(start.speed) },
						...start.defense && { defends: 1 + t(start.defense) },
						...start.tough && { tough: t(start.tough) },
						...start.critResist && { critResist: t(start.critResist) },
						...start.mana && { mana: 1 + t(start.mana) },
						...start.guards && { guards: true }
					});
					if (start.tough) on.statuses = on.statuses.filter((status) => status.shown.harmful !== true || status.binds === true);
				}
				if (start.manaEach) {
					manaEach = t(start.manaEach);
					manaFor = t(start.lasts);
				}
			}
			const opening = def.opening;
			if (opening) {
				if (opening.heal) fight.heal(self, t(opening.heal) * self.stats.hp);
				if (opening.mana) self.mana = Math.min(MAX_MANA, self.mana + t(opening.mana) * MAX_MANA);
				if (opening.cooldown) self.cooldowns = self.cooldowns.map((left) => Math.max(0, left - t(opening.cooldown)));
			}
			if (def.bossAtk) curse(t(def.bossAtk.lasts), { deals: 1 + t(def.bossAtk.atk) });
			if (def.bossHeal) curse(Infinity, { heals: 1 + t(def.bossHeal) }, `${worn.id} heals`);
			if (def.timer) self.perkWaits[name] = def.timer.every;
		},
		tick(dt) {
			const timer = def.timer;
			const up = self.hp > 0 && fight.field().includes(self);
			if (def.drain && up) self.mana = Math.max(0, self.mana + t(def.drain) * dt);
			if (manaFor > 0 && up) {
				self.mana = Math.min(MAX_MANA, self.mana + manaEach * Math.min(dt, manaFor));
				manaFor -= dt;
			}
			if (timer && up && fight.due(self, name, timer.every)) {
				const lasts = timer.lasts ?? 0;
				if (timer.speed) for (const on of [self, ...picked(standing().filter((on) => on !== self), timer.random ?? 0)]) give(on.statuses, lasts, { speed: t(timer.speed) });
				if (timer.critResist) give(self.statuses, lasts, { critResist: t(timer.critResist) });
				if (timer.cooldown) self.cooldowns = self.cooldowns.map((left) => Math.max(0, left - t(timer.cooldown)));
				if (timer.heal) fight.heal(self, t(timer.heal) * self.stats.atk);
				if (timer.recovery || timer.mdef) {
					stacks = Math.min(timer.most ?? 1, stacks + 1);
					give(self.statuses, Infinity, {
						...timer.recovery && { heals: 1 + t(timer.recovery) * stacks },
						...timer.mdef && { bolsters: { magical: t(timer.mdef) * stacks * self.stats.atk } },
						count: stacks
					});
				}
				if (timer.hot) give(self.statuses, lasts, {}, `${name} heals`);
				if (timer.tough) for (const on of standing()) {
					give(on.statuses, lasts, { tough: t(timer.tough) }, `${name} tough`);
					on.statuses = on.statuses.filter((status) => status.shown.harmful !== true || status.binds === true);
				}
				if (timer.hit) {
					fight.hit(self, t(timer.hit));
					curse(lasts, { takes: 1 + t(timer.weakness) + t(timer.grows) * stacks });
					stacks = Math.min(timer.most ?? 0, stacks + 1);
				}
			}
			if (timer?.hot && up && self.statuses.some((status) => status.name === `${name} heals`)) fight.heal(self, t(timer.hot) * self.stats.hp * dt);
			const later = def.later;
			if (later && fight.elapsed() >= later.after && fight.elapsed() - dt < later.after) {
				const best = top(later.others === true);
				if (best) give(best.statuses, Infinity, {
					...later.atk && { atk: t(later.atk) },
					...later.critDamage && { critDamage: t(later.critDamage) }
				}, `${name} later`);
			}
			const low = def.low;
			if (low && up) {
				const under = self.hp <= self.stats.hp * low.below;
				const on = self.statuses.some((status) => status.name === `${name} low`);
				if (under && !on) give(self.statuses, Infinity, {
					atk: t(low.atk),
					speed: t(low.speed),
					tough: t(low.tough)
				}, `${name} low`);
				if (!under && on) self.statuses = self.statuses.filter((status) => status.name !== `${name} low`);
			}
			if (def.rescue && up && !rescued && self.hp < self.stats.hp * def.rescue.below) {
				rescued = true;
				self.statuses = self.statuses.filter((status) => status.shown.harmful !== true || status.binds === true);
				fight.heal(self, t(def.rescue.heal) * self.stats.hp);
			}
			const full = def.fullMana;
			if (full && up && self.mana >= 6e3 && fight.due(self, `${name} full`, full.wait)) give(self.statuses, full.lasts, {
				critPoints: t(full.crit),
				acc: t(full.acc)
			});
		},
		basic() {
			const on = def.onBasic;
			if (!on || fight.roll() >= t(on.chance) || !fight.due(self, `${name} attack`, on.wait)) return;
			if (on.mana) self.mana = Math.min(MAX_MANA, self.mana + on.mana);
			if (on.atk || on.speed) give(self.statuses, on.lasts ?? 0, {
				...on.atk && { atk: t(on.atk) },
				...on.speed && { speed: t(on.speed) }
			});
			if (on.hit) fight.hit(self, t(on.hit));
		},
		blow() {
			const blows = def.blows;
			if (!blows) return;
			struck++;
			if (struck >= blows.count) {
				struck = 0;
				give(self.statuses, blows.lasts, {
					atk: t(blows.atk),
					critPoints: t(blows.crit)
				}, `${name} blows`);
			}
		},
		hurt() {
			const on = def.onHurt;
			if (!on || self.hp <= 0 || fight.roll() >= on.chance || !fight.due(self, `${name} hurt`, t(on.wait))) return;
			if (on.invulnerable) give(self.statuses, t(on.lasts), { takes: 0 });
			if (on.weakness) curse(t(on.lasts), { takes: 1 + t(on.weakness) });
		},
		knocked() {
			const on = def.onKnock;
			if (!on) return true;
			if (on.count) {
				knocks++;
				if (knocks < on.count) return true;
				knocks = 0;
			} else if (!fight.due(self, `${name} knocked`, t(on.wait))) return true;
			if (on.mana) self.mana = Math.min(MAX_MANA, self.mana + t(on.mana));
			if (on.manaShare) self.mana = Math.min(MAX_MANA, self.mana + t(on.manaShare) * MAX_MANA);
			if (on.speed) give(self.statuses, t(on.lasts), { speed: t(on.speed) });
			if (on.cooldown) self.cooldowns = self.cooldowns.map((left) => Math.max(0, left - t(on.cooldown)));
			if (on.manaEach) {
				manaEach = t(on.manaEach);
				manaFor = 3;
			}
			if (on.weakness) curse(10, { takes: 1 + t(on.weakness) });
			if (on.immune) {
				give(self.statuses, t(on.immune), { guards: true });
				return false;
			}
			return true;
		},
		dodged() {
			const on = def.onDodge;
			if (!on) return;
			dodges = Math.min(on.most, dodges + 1);
			give(self.statuses, Infinity, {
				atk: t(on.atk) * dodges,
				count: dodges
			});
		},
		noDef() {
			return def.start?.noDef === true && earlyOn();
		},
		floor() {
			return def.undying && fight.elapsed() < t(def.undying.lasts) ? def.undying.floor * self.stats.hp : 0;
		}
	};
}
//#endregion
//#region src/technomagic/sim/gear.ts
/** A hero's stats with what its gear gives it (as ../../heroes/stats.ts shows them). Flat ATK (a unique weapon's), flat HP (a main unique treasure's, a TechnoMagic weapon's) and flat DEF (a TechnoMagic armor's) are added before the shares of them. */
function geared(stats, gear = {}) {
	const more = (n, by) => n * (1 + (by ?? 0));
	const plus = (n, by) => n + (by ?? 0);
	const both = (by, one) => (by ?? 0) + (one ?? 0);
	return {
		...stats,
		hp: more(plus(stats.hp, gear.hpFlat), gear.hp),
		atk: more(plus(stats.atk, gear.atkFlat), gear.atk),
		physical: more(plus(stats.physical, gear.defPhysicalFlat), both(gear.defense, gear.defPhysical)),
		magical: more(plus(stats.magical, gear.defMagicalFlat), both(gear.defense, gear.defMagical)),
		crit: plus(stats.crit, gear.crit),
		speed: plus(stats.speed, gear.speed),
		pen: plus(stats.pen, gear.pen),
		acc: plus(stats.acc, gear.acc),
		resist: plus(stats.resist, gear.resist),
		block: {
			physical: plus(stats.block.physical, both(gear.block, gear.blockPhysical)),
			magical: plus(stats.block.magical, both(gear.block, gear.blockMagical))
		},
		dodge: {
			physical: plus(stats.dodge.physical, both(gear.dodge, gear.dodgePhysical)),
			magical: plus(stats.dodge.magical, both(gear.dodge, gear.dodgeMagical))
		},
		blockDef: {
			physical: (stats.blockDef?.physical ?? 0) + both(gear.blockDef, gear.blockDefPhysical) / POINTS,
			magical: (stats.blockDef?.magical ?? 0) + both(gear.blockDef, gear.blockDefMagical) / POINTS
		},
		tough: {
			physical: plus(stats.tough?.physical ?? 0, both(gear.tough, gear.toughPhysical)),
			magical: plus(stats.tough?.magical ?? 0, both(gear.tough, gear.toughMagical))
		}
	};
}
//#endregion
//#region src/technomagic/sim/heroes/kr.ts
var KR_HEROES = {
	annette: {
		mana: {
			regen: 75,
			attack: 425
		},
		wait: .3,
		attack: [{
			lands: [
				1,
				1.2,
				1.4
			],
			blows: [
				800,
				800,
				800
			],
			until: 1.7
		}],
		books: {
			dmg: [
				.25,
				0,
				.25,
				.25
			],
			heal: [
				0,
				.25,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	crow: {
		mana: {
			regen: 75,
			attack: 450
		},
		wait: 0,
		attack: [{
			lands: [.9],
			blows: [2600],
			until: 1.8
		}],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	"dark-lord-kasel": {
		mana: {
			regen: 75,
			attack: 0
		},
		wait: 0,
		attack: [
			{
				lands: [.3, .8],
				blows: [700, 700],
				until: 1.3
			},
			{
				lands: [.3, .4],
				blows: [700, 700],
				until: 1.1
			},
			{
				lands: [.7],
				blows: [700],
				until: 2.3
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	erze: {
		mana: {
			regen: 75,
			attack: 250
		},
		wait: 0,
		attack: [
			{
				lands: [.4],
				blows: [500],
				until: .6
			},
			{
				lands: [.3, .7],
				blows: [500, 500],
				until: .9
			},
			{
				lands: [.7],
				blows: [1500],
				until: 1.5
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	ezekiel: {
		mana: {
			regen: 75,
			attack: 185
		},
		wait: 0,
		attack: [
			{
				lands: [.3],
				blows: [670],
				until: .5
			},
			{
				lands: [.2, .5],
				blows: [670, 670],
				until: .8
			},
			{
				lands: [.4],
				blows: [670],
				until: .7
			},
			{
				lands: [.3],
				blows: [670],
				until: 1
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	"fallen-frey": {
		mana: {
			regen: 85,
			attack: 500
		},
		wait: 0,
		attack: [{
			lands: [1.1],
			blows: [2500],
			until: 2
		}],
		books: {
			dmg: [
				.5,
				0,
				.5,
				0
			],
			heal: [
				.5,
				.5,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	gau: {
		mana: {
			regen: 75,
			attack: 340
		},
		wait: 0,
		attack: [
			{
				lands: [.9],
				blows: [1350],
				until: 1.3
			},
			{
				lands: [.3, .7],
				blows: [1350, 1350],
				until: 1.2
			},
			{
				lands: [.3],
				blows: [1350],
				until: 1.6
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.25,
				.25
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	gremory: {
		mana: {
			regen: 75,
			attack: 600
		},
		wait: 0,
		attack: [{
			lands: [
				1,
				1.1,
				1.2
			],
			blows: [
				1e3,
				1e3,
				1e3
			],
			until: 2.4
		}],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				0
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	kirze: {
		mana: {
			regen: 150,
			attack: 325
		},
		wait: 0,
		attack: [
			{
				lands: [.3, .5],
				blows: [1e3, 1e3],
				until: .8
			},
			{
				lands: [.4, 1],
				blows: [1e3, 1e3],
				until: 1.3
			},
			{
				lands: [.7],
				blows: [1e3],
				until: 1.8
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				0
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 250,
			atk: 0
		}
	},
	klaus: {
		mana: {
			regen: 75,
			attack: 330
		},
		wait: 0,
		attack: [
			{
				lands: [.5, .7],
				blows: [880, 880],
				until: 1
			},
			{
				lands: [.6, 1.1],
				blows: [880, 880],
				until: 1.4
			},
			{
				lands: [.7],
				blows: [880],
				until: 1.6
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	laias: {
		mana: {
			regen: 85,
			attack: 425
		},
		wait: .3,
		attack: [{
			lands: [1],
			blows: [1920],
			until: 1.7
		}],
		books: {
			dmg: [
				0,
				0,
				.5,
				.5
			],
			heal: [
				.5,
				.25,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	loman: {
		mana: {
			regen: 75,
			attack: 250
		},
		wait: 0,
		attack: [
			{
				lands: [.3],
				blows: [800],
				until: .5
			},
			{
				lands: [.4],
				blows: [800],
				until: .9
			},
			{
				lands: [.2, .7],
				blows: [800, 800],
				until: 1
			},
			{
				lands: [.6],
				blows: [1200],
				until: 1.6
			}
		],
		books: {
			dmg: [
				.25,
				0,
				.5,
				.5
			],
			heal: [
				0,
				.5,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	lorraine: {
		mana: {
			regen: 100,
			attack: 325
		},
		wait: 0,
		attack: [{
			lands: [.3],
			blows: [1540],
			until: 1.3
		}],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	lucikiel: {
		mana: {
			regen: 100,
			attack: 292
		},
		wait: 0,
		attack: [
			{
				lands: [.3],
				blows: [750],
				until: .6
			},
			{
				lands: [.4, 1.2],
				blows: [750, 750],
				until: 1.4
			},
			{
				lands: [.5],
				blows: [750],
				until: 1.5
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				0
			],
			heal: [
				0,
				0,
				0,
				.5
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	morrah: {
		mana: {
			regen: 75,
			attack: 240
		},
		wait: 0,
		attack: [
			{
				lands: [.3],
				blows: [912],
				until: .6
			},
			{
				lands: [.2, .4],
				blows: [912, 912],
				until: .8
			},
			{
				lands: [.5],
				blows: [912],
				until: .8
			},
			{
				lands: [.8],
				blows: [912],
				until: 1.6
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	naila: {
		mana: {
			regen: 75,
			attack: 235
		},
		wait: 0,
		attack: [
			{
				lands: [.3],
				blows: [760],
				until: .6
			},
			{
				lands: [
					.1,
					.3,
					.7
				],
				blows: [
					760,
					760,
					760
				],
				until: .9
			},
			{
				lands: [.3],
				blows: [760],
				until: .7
			},
			{
				lands: [.6],
				blows: [760],
				until: 1.6
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	neraxis: {
		mana: {
			regen: 75,
			attack: 255
		},
		wait: 0,
		attack: [
			{
				lands: [.4, .6],
				blows: [800, 800],
				until: .8
			},
			{
				lands: [.2],
				blows: [800],
				until: .4
			},
			{
				lands: [.4, 1.1],
				blows: [800, 800],
				until: 1.9
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	oddy: {
		mana: {
			regen: 75,
			attack: 550
		},
		wait: 0,
		attack: [{
			lands: [1.4],
			blows: [3100],
			until: 2.2
		}],
		books: {
			dmg: [
				.25,
				.25,
				.25,
				.25
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				250,
				250,
				250,
				250
			],
			critStat: 0,
			atk: 0
		}
	},
	phillop: {
		mana: {
			regen: 75,
			attack: 275
		},
		wait: 0,
		attack: [
			{
				lands: [.4],
				blows: [1056],
				until: .7
			},
			{
				lands: [.3, .6],
				blows: [1056, 1056],
				until: 1
			},
			{
				lands: [.2],
				blows: [1056],
				until: .6
			},
			{
				lands: [.6],
				blows: [1056],
				until: 2.1
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.25
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	"rebel-klaus": {
		mana: {
			regen: 75,
			attack: 210
		},
		wait: 0,
		attack: [
			{
				lands: [.4, .6],
				blows: [360, 360],
				until: .8
			},
			{
				lands: [.3, .6],
				blows: [360, 360],
				until: .9
			},
			{
				lands: [.2, .4],
				blows: [360, 360],
				until: .8
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.75
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	selene: {
		mana: {
			regen: 75,
			attack: 500
		},
		wait: 0,
		attack: [{
			lands: [1],
			blows: [2860],
			until: 2
		}],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.25
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	seria: {
		mana: {
			regen: 75,
			attack: 275
		},
		wait: 0,
		attack: [
			{
				lands: [.4],
				blows: [1e3],
				until: .6
			},
			{
				lands: [.5],
				blows: [1e3],
				until: .7
			},
			{
				lands: [.4, .8],
				blows: [950, 950],
				until: 2
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	tanya: {
		mana: {
			regen: 75,
			attack: 285
		},
		wait: 0,
		attack: [
			{
				lands: [
					.5,
					.7,
					.9,
					1.4
				],
				blows: [
					682,
					682,
					682,
					682
				],
				until: 1.6
			},
			{
				lands: [.2, .3],
				blows: [682, 682],
				until: 1.1
			},
			{
				lands: [.2],
				blows: [682],
				until: .7
			}
		],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	},
	valance: {
		mana: {
			regen: 75,
			attack: 425
		},
		wait: 0,
		attack: [{
			lands: [1.2],
			blows: [1400],
			until: 2.3
		}],
		books: {
			dmg: [
				.5,
				0,
				.5,
				0
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: .15
		}
	},
	yanne: {
		mana: {
			regen: 75,
			attack: 375
		},
		wait: 0,
		attack: [{
			lands: [1.2],
			blows: [2e3],
			until: 1.5
		}, {
			lands: [1],
			blows: [2e3],
			until: 1.5
		}],
		books: {
			dmg: [
				.5,
				.5,
				.5,
				.5
			],
			heal: [
				0,
				0,
				0,
				0
			],
			crit: [
				0,
				0,
				0,
				0
			],
			critStat: 0,
			atk: 0
		}
	}
};
//#endregion
//#region src/technomagic/sim/shown.ts
/** The pictures of `hero`'s skills, by index (its passive last). */
var skillArt = (hero) => (skill) => ({
	hero,
	skill
});
/** A share as a whole percentage (0.25: "25%"). */
var pct = (share) => `${Math.round(share * 100)}%`;
/** How many times as much, as a card says it ("twice", "three times"), and as King's Raid does ("doubled", "tripled"); and a place in a count ("3rd"). */
var times = (n) => n === 2 ? "twice" : n === 3 ? "three times" : `${n} times`;
var fold = (n) => n === 2 ? "doubled" : n === 3 ? "tripled" : `${n} times as much`;
var nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : [
	"th",
	"st",
	"nd",
	"rd"
][n % 10] ?? "th"}`;
/** So many seconds, as a card says it ("1 second", "3 seconds"). */
var seconds = (n) => `${n} second${n === 1 ? "" : "s"}`;
/** Every so many seconds ("every second", "every 3 seconds"). */
var every$1 = (n) => n === 1 ? "every second" : `every ${n} seconds`;
/** A share as King's Raid says it: "half", or a percent. */
var part = (share) => share === .5 ? "half" : pct(share);
/** A number as King's Raid writes it, its thousands set apart (12000: "12,000"). */
var num = (n) => n.toLocaleString("en-US");
/** To a tenth of a percent (0.048: "4.8%"). */
var fine = (share) => `${Math.round(share * 1e3) / 10}%`;
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
var LINE_RANK = {
	front: 0,
	middle: 1,
	back: 2
};
var CLASS_RANK = {
	knight: 0,
	warrior: 1,
	assassin: 2,
	mechanic: 3,
	wizard: 4,
	archer: 5,
	priest: 6
};
/**
* Which of two heroes is shown nearer the boss (on the right), as the lineup and the cards along the bottom
* show them: by line, the front first; in the same line, by class, the tank first. (Sorted by it, heroes
* level on both keep their order.)
*/
var nearer = (a, b) => LINE_RANK[lineOf(a)] - LINE_RANK[lineOf(b)] || CLASS_RANK[a.class] - CLASS_RANK[b.class];
var KINGS_RAID = {
	knight: {
		hp: 1706672,
		atk: 19792,
		defense: {
			physical: 8792,
			magical: 6840
		},
		crit: 50,
		block: {
			physical: 100,
			magical: 100
		},
		tough: {
			physical: 250,
			magical: 250
		},
		speed: 1e3
	},
	warrior: {
		hp: 1449520,
		atk: 22488,
		defense: {
			physical: 7328,
			magical: 8792
		},
		crit: 150,
		pen: 150,
		acc: 100,
		dodge: {
			physical: 100,
			magical: 100
		},
		resist: 150,
		speed: 1e3
	},
	assassin: {
		hp: 1384992,
		atk: 24688,
		defense: {
			physical: 7816,
			magical: 6840
		},
		crit: 200,
		critDamage: .3,
		acc: 100,
		dodge: {
			physical: 200,
			magical: 200
		},
		speed: 1e3
	},
	archer: {
		hp: 1066728,
		atk: 27864,
		defense: {
			physical: 5376,
			magical: 4392
		},
		crit: 150,
		pen: 250,
		acc: 100,
		speed: 1e3
	},
	mechanic: {
		hp: 1157176,
		atk: 25416,
		defense: {
			physical: 5376,
			magical: 4392
		},
		crit: 150,
		critDamage: .5,
		pen: 100,
		acc: 200,
		speed: 1e3
	},
	wizard: {
		hp: 985328,
		atk: 29328,
		defense: {
			physical: 3904,
			magical: 5864
		},
		crit: 100,
		pen: 150,
		acc: 100,
		block: {
			physical: 0,
			magical: 250
		},
		dodge: {
			physical: 0,
			magical: 200
		},
		speed: 1e3
	},
	priest: {
		hp: 1104864,
		atk: 23216,
		defense: {
			physical: 4888,
			magical: 6104
		},
		crit: 100,
		acc: 100,
		block: {
			physical: 0,
			magical: 500
		},
		tough: {
			physical: 0,
			magical: 150
		},
		blockDef: {
			physical: 0,
			magical: .23
		},
		speed: 1e3
	}
};
var CLASSES = Object.keys(KINGS_RAID);
/** Each class's ATK as the King's Raid Index has it (level 80): what its numbers for a skill's DMG and heals are at. */
var INDEX_ATK = {
	knight: 15712,
	warrior: 17848,
	assassin: 19592,
	archer: 22112,
	mechanic: 20176,
	wizard: 23280,
	priest: 18424
};
/**
* How each class stands, before what is a hero's own (the kind of damage it deals, and anything else it has
* otherwise): a hero's stats are its class's (King's Raid's own: KINGS_RAID), with its own over them.
*/
var CLASS_STATS = Object.fromEntries(CLASSES.map((one) => {
	const { hp, atk, defense, crit, critDamage, pen, acc, block, dodge, tough, resist, blockDef, speed } = KINGS_RAID[one];
	return [one, {
		hp,
		atk,
		physical: defense.physical,
		magical: defense.magical,
		crit,
		critDamage: critDamage ?? 0,
		speed,
		pen: pen ?? 0,
		acc: acc ?? 0,
		block: block ?? NONE,
		dodge: dodge ?? NONE,
		resist: resist ?? 0,
		tough: tough ?? NONE,
		...blockDef && { blockDef }
	}];
}));
/**
* A blow as the King's Raid Index (kingsraid.netlify.app) has it: the DMG its words say a hero of `kind` deals, as
* thousandths of ATK (as a blow's numbers are), so that at its class's ATK as the Index has it (INDEX_ATK) it deals just that.
*/
var indexed = (kind, dmg) => POINTS * dmg / INDEX_ATK[kind];
/** A heal or a shield as the King's Raid Index has it: so that a hero of `kind`, at its class's ATK, gives just `amount` (a heal gives as much more as its healer's attack is over ATK). */
var indexedHeal = (kind, amount) => amount * ATK / INDEX_ATK[kind];
/**
* What a blow of `blow` deals from a hero of `kind` at its class's ATK, as its words say it (the Index's own number, where it
* has one), `books` times as much (bookDmg: as it is with its skill's books).
*/
var dmg = (kind, blow, books = 1) => num(Math.round(blow * books * KINGS_RAID[kind].atk / POINTS));
/** What a heal or a shield of `amount` gives from a hero of `kind` at its class's ATK, as its words say it, `books` times as much (bookHeal). */
var healed = (kind, amount, books = 1) => num(Math.round(amount * books * KINGS_RAID[kind].atk / ATK));
/**
* A hero's skills are as they are with all their books (King's Raid's playtest's: ./kr.ts), there being none to get here: how
* many times as much the `index`th skill's damage is for them (3: its passive's), and its heals and shields.
*/
var bookDmg = (id, index) => 1 + (KR_HEROES[id]?.books.dmg[index] ?? 0);
var bookHeal = (id, index) => 1 + (KR_HEROES[id]?.books.heal[index] ?? 0);
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
	},
	havoc: {
		lands: [.45],
		until: 1.05
	},
	storm: {
		lands: [
			.5,
			.75,
			1
		],
		until: 1.5
	},
	wave: {
		lands: [.5, .95],
		until: 1.5
	},
	surge: {
		lands: [.55, 1.05],
		until: 1.65
	},
	doomsday: {
		lands: every(9, .6, .15),
		until: 2.5
	},
	arrow: {
		lands: [.45],
		until: 1
	},
	rain: {
		lands: every(12, .7, .08),
		until: 2.1
	},
	rush: {
		lands: every(5, .45, .1),
		until: 1.3
	},
	flash: {
		lands: [1],
		until: 1.7
	},
	snipe: {
		lands: [.4],
		until: 1
	},
	eliminate: {
		lands: every(15, .45, .07),
		until: 1.9
	},
	struggle: {
		lands: [...every(10, .4, .08), 1.4],
		until: 2
	},
	gods: {
		lands: [1.7],
		until: 2.4
	},
	chime: {
		lands: [.42],
		until: 1
	},
	fracture: {
		lands: [.6],
		until: 1.3
	},
	fragments: {
		lands: every(6, .5, .15),
		until: 1.7
	},
	distortion: {
		lands: [1],
		until: 1.8
	},
	hew: {
		lands: [.45],
		until: 1.1
	},
	collision: {
		lands: [.6],
		until: 1.4
	},
	headbutt: {
		lands: [.5],
		until: 1.2
	},
	incarnate: {
		lands: [.8],
		until: 1.6
	},
	talon: {
		lands: [.35],
		until: .9
	},
	winds: {
		lands: [.45, 1.05],
		until: 1.6
	},
	reading: {
		lands: [.6],
		until: 1.3
	},
	dive: {
		lands: [1],
		until: 1.7
	},
	shot: {
		lands: [.45],
		until: 1
	},
	focus: {
		lands: [1.3],
		until: 1.9
	},
	wipeout: {
		lands: [.6],
		until: 1.3
	},
	unleash: {
		lands: [.6],
		until: 1.4
	},
	maw: {
		lands: [.42],
		until: 1
	},
	lightning: {
		lands: [.45, 1.45],
		until: 1.9
	},
	roar: {
		lands: [.6],
		until: 1.5
	},
	breath: {
		lands: every(6, .6, .15),
		until: 1.9
	},
	drain: {
		lands: [.42],
		until: 1
	},
	sweet: {
		lands: [.5],
		until: 1.2
	},
	soak: {
		lands: [.6],
		until: 1.3
	},
	liberation: {
		lands: [.7],
		until: 1.4
	},
	thrust: {
		lands: [.45],
		until: 1.1
	},
	ground: {
		lands: [.6],
		until: 1.4
	},
	shroud: {
		lands: [.6],
		until: 1.4
	},
	creed: {
		lands: [
			.45,
			.8,
			1.3,
			1.45
		],
		until: 2
	},
	chop: {
		lands: [.45],
		until: 1.1
	},
	smash: {
		lands: [.4, .75],
		until: 1.3
	},
	warcry: {
		lands: [.6],
		until: 1.5
	},
	vortex: {
		lands: every(6, .4, .15),
		until: 1.6
	},
	katar: {
		lands: [.3, .55],
		until: 1
	},
	sighted: {
		lands: [.5],
		until: 1.2
	},
	tornado: {
		lands: [
			.4,
			.6,
			.8
		],
		until: 1.3
	},
	whisper: {
		lands: [...every(6, .4, .12), 1.3],
		until: 1.9
	},
	rend: {
		lands: [.45],
		until: 1.1
	},
	determined: {
		lands: [.5],
		until: 1.2
	},
	indomitable: {
		lands: [.55],
		until: 1.4
	},
	perish: {
		lands: [...every(6, .4, .12), 1.4],
		until: 2
	},
	corrupt: {
		lands: [.3, .6],
		until: 1.15
	},
	judge: {
		lands: [
			.4,
			.65,
			1.1
		],
		until: 1.6
	},
	ruin: {
		lands: [
			.5,
			.7,
			.9,
			1.35
		],
		until: 1.8
	},
	advent: {
		lands: [.8],
		until: 1.6
	}
};
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
	const kr = KR_HEROES[def.id]?.attack;
	if (kr && kr.length > 0) moves[attack] = {
		speed: 1,
		parts: kr,
		fifth: false
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
//#region src/technomagic/sim/sets.ts
var TM_SETS = [
	"perseverance",
	"hope",
	"authority"
];
/** Perseverance's growing DMG and ATK, King's Raid's TechSet_50: every 2 seconds 0.3% more, 50 times. */
var GROWS = {
	every: 2,
	most: 50,
	dmg: .003
};
/** Each set's skill for each class: King's Raid's (EquipSetBonusTable's 4-piece UseSkill, SkillTable's numbers). */
var SET_EFFECTS = {
	perseverance: {
		knight: {
			dmg: .1,
			own: { tough: 100 },
			grows: {
				every: 1,
				most: 50,
				dmg: .002,
				tough: 2
			}
		},
		warrior: {
			dmg: .1,
			own: { atk: .1 },
			grows: {
				...GROWS,
				atk: .003
			}
		},
		assassin: {
			dmg: .1,
			own: { atk: .1 },
			grows: {
				...GROWS,
				atk: .003
			}
		},
		archer: {
			dmg: .1,
			own: { atk: .1 },
			grows: {
				...GROWS,
				atk: .003
			}
		},
		mechanic: {
			dmg: .1,
			own: { critDamage: .2 },
			grows: {
				...GROWS,
				critDamage: .006
			}
		},
		wizard: {
			dmg: .1,
			own: { critDamage: .2 },
			grows: {
				...GROWS,
				critDamage: .006
			}
		},
		priest: { own: { heal: .25 } }
	},
	hope: {
		knight: { allies: {
			defense: .1,
			atk: .05
		} },
		warrior: { allies: {
			speed: 100,
			twice: "front"
		} },
		assassin: {
			own: { critDamage: .4 },
			onSkill: {
				mana: 300,
				critDamage: .4,
				lasts: 3
			}
		},
		archer: { allies: {
			critDamage: .2,
			twice: "back"
		} },
		mechanic: { tick: {
			every: 10,
			mana: 500,
			cooldown: .5
		} },
		wizard: {
			allies: { dmg: .02 },
			top: {
				after: 30,
				dmg: .02
			}
		},
		priest: { allies: {
			recovery: .06,
			mana: .06,
			manaAfter: 5
		} }
	},
	authority: {
		knight: {
			own: { block: 300 },
			onBlock: {
				cooldown: 1,
				wait: 2.5
			}
		},
		warrior: {
			own: { hp: .3 },
			secondWind: {
				below: .5,
				heal: .3,
				speed: 300
			}
		},
		assassin: {
			own: { pen: 250 },
			pastDef: .12
		},
		archer: {
			own: { atk: .25 },
			opening: {
				atk: .25,
				lasts: 20
			}
		},
		mechanic: {
			own: { crit: 300 },
			allCrit: { at: 1400 }
		},
		wizard: { fullMana: {
			mana: .2,
			atk: .4
		} },
		priest: { allies: { atk: .1 } }
	}
};
/** A hero's set as it fights: which, and what it does for its class (null: no set). */
function setOf(set, heroClass) {
	if (!set || !TM_SETS.includes(set)) return null;
	return {
		id: set,
		effect: SET_EFFECTS[set][heroClass]
	};
}
/** How many stacks of a set's growing effect it has `elapsed` seconds into the fight. */
var grown = (effect, elapsed) => effect.grows ? Math.min(effect.grows.most, Math.floor(elapsed / effect.grows.every)) : 0;
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
/** What a set does for each class, in King's Raid's words. */
var about = (id, heroClass) => (KR_SETS$1[id]?.four)?.[heroClass]?.text ?? "";
/** Each set as the bot has it: its name and icon, and what it does for a hero of each class wearing four of its pieces. */
var SET_INFO = TM_SETS.map((id) => ({
	id,
	name: NAMES$1[id],
	icon: ICONS[id],
	effects: Object.fromEntries(Object.keys(SET_EFFECTS[id]).map((heroClass) => [heroClass, about(id, heroClass)]))
}));
/** What a set's triggered effects put on their wearer: shown on its card. */
var SET_UP = {
	onSkill: {
		name: "Hope",
		about: "More crit DMG.",
		icon: "🛡️"
	},
	secondWind: {
		name: "Authority",
		about: "ATK Spd up for good.",
		icon: "⚡"
	},
	fullMana: {
		name: "Authority",
		about: "Mana recovery and ATK up for good.",
		icon: "⚡"
	},
	top: {
		name: "Hope",
		about: "Deals more DMG.",
		icon: "🛡️"
	}
};
//#endregion
//#region src/technomagic/sim/skills.ts
/** Each skill's numbers (shares: 0.25 is 25%; points: 1000 is 100%; seconds). */
var SKILL = {
	vigor: {
		dmg: .25,
		above: .95
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
	bastion: { defense: .07 },
	ruthless: { critDamage: .5 },
	piercing: { pen: 250 },
	precision: { crit: 250 },
	guard: { block: 250 },
	parry: {
		mana: 200,
		wait: 1
	},
	"lone-foe": { atk: .35 },
	"lone-guard": { defense: .45 },
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
		about: `Increases DMG dealt by ${pct(SKILL.vigor.dmg)} while HP is above ${pct(SKILL.vigor.above)}.`
	},
	{
		id: "persistence",
		name: "Persistence",
		tier: "S",
		about: `Increases DMG dealt by ${pct(SKILL.persistence.dmg)} ${every$1(SKILL.persistence.every)} (up to ${SKILL.persistence.most} times).`
	},
	{
		id: "war-cry",
		name: "War Cry",
		tier: "S",
		about: `Increases ATK of all allies by ${pct(SKILL["war-cry"].atk)}.`
	},
	{
		id: "whetstone",
		name: "Whetstone",
		tier: "S",
		about: `Increases crit DMG of all allies by ${pct(SKILL.whetstone.critDamage)}.`
	},
	{
		id: "champion",
		name: "Champion",
		tier: "S",
		about: `At the start of the battle, increases DMG of the ally with the highest ATK by ${fine(SKILL.champion.dmg)} for ${seconds(SKILL.champion.lasts)}.`
	},
	{
		id: "berserk",
		name: "Berserk",
		tier: "S",
		about: `Reduces DEF by ${pct(-SKILL.berserk.defense)} and increases ATK by ${pct(SKILL.berserk.atk)}.`
	},
	{
		id: "fortress",
		name: "Fortress",
		tier: "S",
		about: `Reduces ATK by ${pct(-SKILL.fortress.atk)} and increases DEF by ${pct(SKILL.fortress.defense)}.`
	},
	{
		id: "aegis",
		name: "Aegis",
		tier: "S",
		about: `Increases the shields it gives by ${pct(SKILL.aegis.shield)}.`
	},
	{
		id: "mirage",
		name: "Mirage",
		tier: "S",
		about: `Increases dodge by ${pct(share$2(SKILL.mirage.dodge))}. On dodging, recovers ${pct(SKILL.mirage.heal)} of max HP (once ${every$1(SKILL.mirage.wait)}).`
	},
	{
		id: "fundamentals",
		name: "Fundamentals",
		tier: "S",
		about: `Increases DMG of normal attacks by ${pct(SKILL.fundamentals.dmg)}.`
	},
	{
		id: "vitality",
		name: "Vitality",
		tier: "S",
		about: `Increases max HP by ${pct(SKILL.vitality.hp)}.`
	},
	{
		id: "overflow",
		name: "Overflow",
		tier: "A",
		about: `With mana at 100%, reduces every ally’s cooldowns by ${pct(SKILL.overflow.cooldown)} (once ${every$1(SKILL.overflow.wait)}).`
	},
	{
		id: "momentum",
		name: "Momentum",
		tier: "A",
		about: `Each skill used increases ATK by ${pct(SKILL.momentum.atk)} (up to ${SKILL.momentum.most} times).`
	},
	{
		id: "overdrive",
		name: "Overdrive",
		tier: "A",
		about: `Fixes attack speed at ${pct(SKILL.overdrive.speed / POINTS)} and increases ATK by ${pct(SKILL.overdrive.atk)}.`
	},
	{
		id: "regeneration",
		name: "Regeneration",
		tier: "A",
		about: `Recovers ${pct(SKILL.regeneration.heal)} of max HP ${every$1(SKILL.regeneration.every)}.`
	},
	{
		id: "steadfast",
		name: "Steadfast",
		tier: "A",
		about: `Each skill used reduces DMG taken by ${pct(SKILL.steadfast.taken)} (up to ${SKILL.steadfast.most} times).`
	},
	{
		id: "swiftness",
		name: "Swiftness",
		tier: "A",
		about: `Increases attack speed by ${pct(share$2(SKILL.swiftness.speed))}.`
	},
	{
		id: "focus-2",
		name: "Second Focus",
		tier: "A",
		about: `Reduces the second skill’s cooldown by ${pct(SKILL["focus-2"].cooldown)} ${every$1(SKILL["focus-2"].every)}.`
	},
	{
		id: "focus-3",
		name: "Third Focus",
		tier: "A",
		about: `Reduces the third skill’s cooldown by ${pct(SKILL["focus-3"].cooldown)} ${every$1(SKILL["focus-3"].every)}.`
	},
	{
		id: "warm-up",
		name: "Warm-Up",
		tier: "B",
		about: `At the start of the battle, increases ATK by ${pct(SKILL["warm-up"].atk)}.`
	},
	{
		id: "might",
		name: "Might",
		tier: "B",
		about: `Increases ATK by ${pct(SKILL.might.atk)}.`
	},
	{
		id: "focus-1",
		name: "First Focus",
		tier: "B",
		about: `Reduces the first skill’s cooldown by ${pct(SKILL["focus-1"].cooldown)} ${every$1(SKILL["focus-1"].every)}.`
	},
	{
		id: "physical-ward",
		name: "Physical Ward",
		tier: "B",
		about: `Reduces physical DMG taken by ${pct(SKILL["physical-ward"].taken)}, rising to ${pct(SKILL["physical-ward"].most)} over the first ${seconds(SKILL["physical-ward"].over)}.`
	},
	{
		id: "magical-ward",
		name: "Magical Ward",
		tier: "B",
		about: `Reduces magical DMG taken by ${pct(SKILL["magical-ward"].taken)}, rising to ${pct(SKILL["magical-ward"].most)} over the first ${seconds(SKILL["magical-ward"].over)}.`
	},
	{
		id: "bastion",
		name: "Bastion",
		tier: "B",
		about: `Increases DEF of all allies by ${pct(SKILL.bastion.defense)}.`
	},
	{
		id: "ruthless",
		name: "Ruthless",
		tier: "B",
		about: `Increases crit DMG by ${pct(SKILL.ruthless.critDamage)}.`
	},
	{
		id: "piercing",
		name: "Piercing",
		tier: "B",
		about: `Increases penetration by ${pct(share$2(SKILL.piercing.pen))}.`
	},
	{
		id: "precision",
		name: "Precision",
		tier: "B",
		about: `Increases crit chance by ${pct(share$2(SKILL.precision.crit))}.`
	},
	{
		id: "guard",
		name: "Guard",
		tier: "B",
		about: `Increases block by ${pct(share$2(SKILL.guard.block))}.`
	},
	{
		id: "parry",
		name: "Parry",
		tier: "B",
		about: `On blocking, recovers ${SKILL.parry.mana} mana (once ${every$1(SKILL.parry.wait)}).`
	},
	{
		id: "lone-foe",
		name: "Lone Foe",
		tier: "C",
		about: `With one enemy, increases ATK by ${pct(SKILL["lone-foe"].atk)}.`
	},
	{
		id: "lone-guard",
		name: "Lone Guard",
		tier: "C",
		about: `With one enemy, increases DEF by ${pct(SKILL["lone-guard"].defense)}.`
	},
	{
		id: "armor",
		name: "Armor",
		tier: "C",
		about: `Increases DEF by ${pct(SKILL.armor.defense)}.`
	},
	{
		id: "mana-spring",
		name: "Mana Spring",
		tier: "C",
		about: `Recovers ${SKILL["mana-spring"].mana} mana ${every$1(SKILL["mana-spring"].every)}.`
	},
	{
		id: "surge",
		name: "Surge",
		tier: "F",
		about: `With mana at 100%, increases DMG dealt by ${pct(SKILL.surge.dmg)} for ${seconds(SKILL.surge.lasts)} (once ${every$1(SKILL.surge.wait)}).`
	},
	{
		id: "desperation",
		name: "Desperation",
		tier: "F",
		about: `With HP below ${pct(SKILL.desperation.below)}, increases ATK by ${pct(SKILL.desperation.atk)} for ${seconds(SKILL.desperation.lasts)} (once ${every$1(SKILL.desperation.wait)}).`
	},
	{
		id: "mending",
		name: "Mending",
		tier: "F",
		about: `Using a skill increases the heals and shields it gives by ${pct(SKILL.mending.heal)} for ${seconds(SKILL.mending.lasts)} (once ${every$1(SKILL.mending.wait)}).`
	},
	{
		id: "iron-wall",
		name: "Iron Wall",
		tier: "F",
		about: `Increases block by ${pct(share$2(SKILL["iron-wall"].block))}, and by ${pct(share$2(SKILL["iron-wall"].more))} more for the first ${seconds(SKILL["iron-wall"].lasts)}.`
	},
	{
		id: "tenacity",
		name: "Tenacity",
		tier: "F",
		about: `Reduces how long it is knocked down by ${pct(SKILL.tenacity.control)}.`
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
/**
* What a hero's additional skills (`skills`: how many of each) do to its own stats from the start of a fight, done to
* `stats` (shares of ATK and defense added up, as gear's are; Overdrive fixes its attack speed): ./fight.ts fights with
* them, and the heroes page shows them. What they do only now and then, or to every ally, ./fight.ts does as it goes.
*/
function skilledStats(stats, skills) {
	const n = (id) => skills[id] ?? 0;
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
	return stats;
}
/** How much harder a hero's critical blows are for its own additional skills (Ruthless). */
var skilledCritDamage = (skills) => SKILL.ruthless.critDamage * (skills.ruthless ?? 0);
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
		2,
		2.4,
		2.9,
		3.5,
		4.2
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
/** How much more healing reaches every ally, how often (seconds) the ally with the lowest health is healed, and by how much (a share of her ATK). */
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
		1.2,
		1.4,
		1.7,
		2.1,
		2.5
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
/** How many blows gain him a stack, the most stacks, what each adds to his ATK (a share) and attack speed (points), and at the most his blows' blow more (at ATK, through the boss's defense). */
var GIGANTE = {
	name: "Form of Ultimate Destruction, Barbatos Gigante",
	blows: 10,
	most: 10,
	atk: [
		.048,
		.058,
		.07,
		.084,
		.1
	],
	speed: [
		24,
		29,
		35,
		42,
		50
	],
	blow: [
		360,
		430,
		520,
		630,
		750
	]
};
/** Her attack speed (points) after a critical blow, for `lasts` seconds, and meanwhile the arrow more each attack shoots (at ATK). */
var NOTOS = {
	name: "Green Winds, Notos",
	lasts: 10,
	speed: [
		240,
		280,
		340,
		410,
		500
	],
	arrow: [
		1200,
		1400,
		1700,
		2100,
		2500
	]
};
/** The bullet more his attack shoots (at ATK); and after a skill his ATK and crit damage higher (shares) for `lasts` seconds, no sooner than `every` after the last. */
var AKISTRA = {
	name: "Hellhound, Akistra",
	bullet: [
		600,
		700,
		850,
		1e3,
		1250
	],
	boost: [
		.36,
		.43,
		.52,
		.62,
		.75
	],
	lasts: 20,
	every: 20
};
/** How many seconds more her Time Distortion takes off every ally's cooldowns, and their ATK higher (a share) for `lasts` seconds. */
var TEMPODIANA = {
	name: "Moonshade Countdown, Tempodiana",
	cooldown: [
		3,
		4,
		5,
		6,
		7
	],
	atk: [
		.17,
		.21,
		.25,
		.3,
		.35
	],
	lasts: 10
};
/** Every other ally's defense higher (a share) for `guards` seconds; and a stack of Dragon Rage (up to `most`, for `lasts` seconds), each his ATK and defense higher. */
var ATEIN = {
	name: "Dragon’s Ruins, Atein",
	defense: [
		.12,
		.14,
		.17,
		.21,
		.25
	],
	guards: 3,
	rage: [
		.01,
		.012,
		.014,
		.017,
		.02
	],
	most: 100,
	lasts: 10
};
/** What a critical blow leaves eating at the boss over `lasts` seconds (all of it, at ATK), and how much more physical damage it takes meanwhile. */
var BARORO = {
	name: "Cursed Claws, Baroro",
	lasts: 10,
	blow: [
		1800,
		2160,
		2580,
		3100,
		5e3
	],
	takes: [
		.24,
		.28,
		.34,
		.41,
		.5
	]
};
/** What a critical blow of hers deals more (at ATK) and the mana it gains her, no sooner than `every` seconds after the last (the same at every tier). */
var SVELTA = {
	name: "Dragonbane, Svelta",
	blow: 500,
	mana: 150,
	every: .5
};
/** How many blows of his attack bring it on; its blow (at ATK) and stun; and the Storm of Neraxis for `lasts` seconds: every ally's defense higher by a share of his, and its ATK (a share). */
var ACRAVITA = {
	name: "Roaring Dragonmaw, Acravita",
	blows: [
		19,
		18,
		17,
		16,
		15
	],
	blow: 1e3,
	stun: .5,
	lasts: 10,
	defense: [
		.048,
		.057,
		.069,
		.083,
		.1
	],
	atk: [
		.12,
		.14,
		.17,
		.21,
		.25
	]
};
/** What each stack adds to her ATK (a share) and attack speed (points), for `lasts` seconds, up to `most`. */
var PERION = {
	name: "Essence of Greed, Perion",
	atk: .005,
	speed: 5,
	lasts: 30,
	most: [
		90,
		110,
		130,
		160,
		200
	]
};
/** Every `skills` skills of his: a blow (at ATK), the boss taking more physical damage for `lasts` seconds, and his M.DEF higher (a share) for `guards`. */
var GAIAMENES = {
	name: "Wave of Protection, Gaiamenes",
	skills: 3,
	blow: [
		2400,
		2900,
		3500,
		4200,
		5e3
	],
	weakness: [
		.3,
		.36,
		.43,
		.51,
		.6
	],
	lasts: 20,
	defense: [
		.12,
		.14,
		.17,
		.21,
		.25
	],
	guards: 10
};
/** His max HP higher (a share: here, taking that much less); and how likely a blow of his attack is to deal more (at ATK) and freeze the boss for `freeze` seconds. */
var NUMINU = {
	name: "Holy Bird, Numinu",
	hp: [
		.14,
		.17,
		.21,
		.25,
		.3
	],
	chance: .15,
	blow: [
		2400,
		2900,
		3500,
		4200,
		5e3
	],
	freeze: 2
};
/** In Stealth for `lasts` seconds from the start, untouched for the first so many; and her crit damage higher (a share) while she is in Stealth. */
var CAETHASIS = {
	name: "Demon of the Calm, Caethasis",
	lasts: 10,
	untouched: [
		2.4,
		2.9,
		3.5,
		4.2,
		5
	],
	critDamage: [
		.36,
		.43,
		.52,
		.62,
		.75
	]
};
/** His penetration more (points); the share of his current HP each skill costs him, and the DMG each stack adds (a share), for `lasts` seconds, up to `most`. */
var GALICTA = {
	name: "Adversary of the Goddess, Galicta",
	pen: [
		240,
		290,
		350,
		420,
		500
	],
	hp: .2,
	dmg: [
		.024,
		.029,
		.035,
		.042,
		.05
	],
	lasts: 30,
	most: 5
};
/** How much less each of his blows leaves the boss healed (a share) for `lasts` seconds, up to `most` times over; and how likely each is to deal a blow more (at ATK). */
var AEA = {
	name: "Corrupted Holy Sword, Aea",
	heals: [
		.012,
		.014,
		.017,
		.021,
		.025
	],
	lasts: 10,
	most: 12,
	chance: .35,
	blow: [
		1200,
		1400,
		1700,
		2100,
		2500
	]
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
	klaus: (tier) => `Every ${EXIAN.every}rd skill he uses, his ATK and defense are ${pct(atTier(EXIAN.boost, tier))} higher for ${EXIAN.lasts} seconds.`,
	kirze: (tier) => `Each of her blows has a ${pct(ELICIPIRA.chance)} chance to deal ${pct(atTier(ELICIPIRA.blow, tier) / 1e3)} of her ATK more, doubled against the boss.`,
	"fallen-frey": (tier) => `Each skill she uses heals her by ${pct(atTier(ROSMERTA.heal, tier))} of her ATK, and gives her +${atTier(ROSMERTA.pen, tier)} penetration for ${ROSMERTA.lasts} seconds.`,
	gremory: (tier) => `+${atTier(PIGRITIA.speed, tier)} attack speed. Each time she sleeps she is healed by ${pct(atTier(PIGRITIA.heal, tier))} of her max HP and recovers ${pct(atTier(PIGRITIA.mana, tier))} of her mana over ${PIGRITIA.over} seconds, and each Mana Charge gives her ${fine(atTier(PIGRITIA.charge, tier))} more ATK.`,
	annette: (tier) => `Every ${atTier(RASCAL.every, tier)} seconds she gains a Charge (even while Overcharged) and ${pct(RASCAL.mana)} of her mana. While she is Overcharged, every ally deals ${pct(RASCAL.dmg)} more and takes ${pct(RASCAL.taken)} less (${pct(RASCAL.dmg * RASCAL.top)} for the ally with the highest ATK).`,
	morrah: (tier) => `Each blow of her attack has a ${pct(CARPRAIN.chance)} chance to leave the boss hitting ${pct(atTier(CARPRAIN.weaker, tier))} less hard and taking ${pct(atTier(CARPRAIN.weaker, tier))} more magical damage for ${CARPRAIN.lasts} seconds (${pct(atTier(CARPRAIN.weaker, tier) * CARPRAIN.full)} more with 100 Flame on it).`,
	laias: (tier) => `Healing reaches every ally ${pct(atTier(ELTOIRRE.heals, tier))} more, and every ${ELTOIRRE.every} seconds she heals the ally with the lowest HP by ${pct(atTier(ELTOIRRE.mend, tier))} of her ATK.`,
	seria: (tier) => `Each critical blow of her skills deals ${pct(atTier(ELSION.blow, tier) / 1e3)} of her ATK more, leaves the boss healed ${pct(atTier(ELSION.unhealed, tier))} less for ${ELSION.lasts} seconds, and heals her ${pct(atTier(ELSION.heals, tier))} more for ${ELSION.healed} seconds (up to ${ELSION.most} times).`,
	ezekiel: (tier) => `His Fury lasts ${atTier(BARBATOS.longer, tier)} seconds longer, and while it does his crit damage is ${pct(atTier(BARBATOS.critDamage, tier))} higher and his CC resist +${atTier(BARBATOS.resist, tier)}.`,
	lorraine: (tier) => `Every ${ROBURU.every} seconds, with her Poison on the boss, deals ${pct(atTier(ROBURU.blow, tier) / 1e3)} of her ATK to it, and it takes ${pct(atTier(ROBURU.takes, tier))} more magical damage for ${ROBURU.lasts} seconds.`,
	valance: () => `Every ally gains by the TechnoMagic gear it wears: with 1 piece, +${pct(CORBEAU.atk)} ATK; 2, +${pct(CORBEAU.defense)} defense; 3, +${pct(CORBEAU.hp)} max HP (it takes that much less); 4, +${pct(CORBEAU.dmg)} DMG.`,
	lucikiel: (tier) => `Every ${GIGANTE.blows} of his blows gain him a stack of [Incarnation of Doom] (up to ${GIGANTE.most}), each +${fine(atTier(GIGANTE.atk, tier))} ATK and +${atTier(GIGANTE.speed, tier)} attack speed. At ${GIGANTE.most}, each of his blows deals ${pct(atTier(GIGANTE.blow, tier) / 1e3)} of his ATK more, through the boss’s defense.`,
	selene: (tier) => `Each critical blow of hers gives her +${atTier(NOTOS.speed, tier)} attack speed for ${NOTOS.lasts} seconds, and meanwhile her attack shoots an arrow more, dealing ${pct(atTier(NOTOS.arrow, tier) / 1e3)} of her ATK.`,
	crow: (tier) => `His attack shoots a bullet more, dealing ${pct(atTier(AKISTRA.bullet, tier) / 1e3)} of his ATK. A skill of his raises his ATK and crit damage by ${pct(atTier(AKISTRA.boost, tier))} for ${AKISTRA.lasts} seconds, once every ${AKISTRA.every} seconds.`,
	oddy: (tier) => `Her [Time Distortion] takes ${atTier(TEMPODIANA.cooldown, tier)} seconds more off every ally’s cooldowns, and raises their ATK by ${pct(atTier(TEMPODIANA.atk, tier))} for ${TEMPODIANA.lasts} seconds.`,
	phillop: (tier) => `Hurt by the boss, every other ally’s defense is ${pct(atTier(ATEIN.defense, tier))} higher for ${ATEIN.guards} seconds, and he gains a stack of [Dragon Rage] for ${ATEIN.lasts} seconds (up to ${ATEIN.most}), each +${fine(atTier(ATEIN.rage, tier))} ATK and defense.`,
	naila: (tier) => `Each critical blow of hers leaves the boss losing ${pct(atTier(BARORO.blow, tier) / 1e3)} of her ATK over ${BARORO.lasts} seconds, and taking ${pct(atTier(BARORO.takes, tier))} more physical damage meanwhile.`,
	yanne: () => `Each critical blow of hers deals ${pct(SVELTA.blow / 1e3)} of her ATK more and gains her ${SVELTA.mana} mana, no sooner than ${SVELTA.every} seconds after the last.`,
	neraxis: (tier) => `Every ${atTier(ACRAVITA.blows, tier)} blows of his attack, deals ${pct(ACRAVITA.blow / 1e3)} of his ATK to the boss and stuns it for ${ACRAVITA.stun} seconds, and becomes the [Storm of Neraxis] for ${ACRAVITA.lasts} seconds: every ally gains ${fine(atTier(ACRAVITA.defense, tier))} of his P.DEF and M.DEF, and +${pct(atTier(ACRAVITA.atk, tier))} ATK.`,
	erze: (tier) => `Each blow of her skills gives her a stack for ${PERION.lasts} seconds (up to ${atTier(PERION.most, tier)}), each +${fine(PERION.atk)} ATK and +${PERION.speed} attack speed. They can’t be dispelled.`,
	loman: (tier) => `Every ${GAIAMENES.skills} skills he uses, deals ${pct(atTier(GAIAMENES.blow, tier) / 1e3)} of his ATK to the boss, which takes ${pct(atTier(GAIAMENES.weakness, tier))} more physical damage for ${GAIAMENES.lasts} seconds; and his M.DEF is ${pct(atTier(GAIAMENES.defense, tier))} higher for ${GAIAMENES.guards} seconds.`,
	gau: (tier) => `His max HP is ${pct(atTier(NUMINU.hp, tier))} higher (he takes that much less). Each blow of his attack has a ${pct(NUMINU.chance)} chance to deal ${pct(atTier(NUMINU.blow, tier) / 1e3)} of his ATK more and freeze the boss for ${NUMINU.freeze} seconds.`,
	tanya: (tier) => `In [Stealth] for ${CAETHASIS.lasts} seconds as the fight begins, and the boss can’t touch her for the first ${atTier(CAETHASIS.untouched, tier)}. While she is in [Stealth], her crit damage is ${pct(atTier(CAETHASIS.critDamage, tier))} higher.`,
	"rebel-klaus": (tier) => `+${atTier(GALICTA.pen, tier)} penetration. Each skill he uses costs him ${pct(GALICTA.hp)} of his current HP, but gives him a stack for ${GALICTA.lasts} seconds (up to ${GALICTA.most}), each +${fine(atTier(GALICTA.dmg, tier))} DMG. They can’t be dispelled.`,
	"dark-lord-kasel": (tier) => `Each of his blows leaves the boss healed ${fine(atTier(AEA.heals, tier))} less for ${AEA.lasts} seconds (up to ${AEA.most} times over), and has a ${pct(AEA.chance)} chance to deal ${pct(atTier(AEA.blow, tier) / 1e3)} of his ATK more.`
};
EXIAN.name, ELICIPIRA.name, ROSMERTA.name, PIGRITIA.name, RASCAL.name, CARPRAIN.name, ELTOIRRE.name, ELSION.name, BARBATOS.name, ROBURU.name, CORBEAU.name, GIGANTE.name, NOTOS.name, AKISTRA.name, TEMPODIANA.name, ATEIN.name, BARORO.name, SVELTA.name, ACRAVITA.name, PERION.name, GAIAMENES.name, NUMINU.name, CAETHASIS.name, GALICTA.name, AEA.name;
/** The heroes that have a unique weapon, by id. */
var UNIQUE_HEROES = Object.keys(ABOUT);
/** What a hero's unique weapon does at a tier (null: it has none). */
var uniqueAbout = (hero, tier) => ABOUT[hero]?.(tier) ?? null;
/** A hero's unique weapon as it fights: its tier (null: none, or not its own, or one this fight doesn't know). */
function uniqueOf(hero, tier) {
	if (typeof tier !== "number" || !Number.isFinite(tier) || !ABOUT[hero]) return null;
	return Math.min(5, Math.max(1, Math.floor(tier)));
}
/** What Exian gives Klaus for a while, what Rosmerta gives Fallen Frey, what Rascal gives every ally while Annette is Overcharged, and what Eltoirre gives every ally while Laias is on the field. */
var EXIAN_UP = {
	name: "The Guardian, Exian",
	about: "ATK and defense higher.",
	icon: "🛡️",
	art: { uw: "klaus" }
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
var GIGANTE_UP = {
	name: "Incarnation of Doom",
	about: "ATK and attack speed higher for each; at the most, his blows deal more through the boss’s defense.",
	icon: "👿",
	art: { uw: "lucikiel" }
};
var NOTOS_UP = {
	name: "Green Winds, Notos",
	about: "Quicker, and her attack shoots an arrow more.",
	icon: "🍃",
	art: { uw: "selene" }
};
var AKISTRA_UP = {
	name: "Hellhound, Akistra",
	about: "ATK and crit damage higher.",
	icon: "🐺",
	art: { uw: "crow" }
};
var TEMPODIANA_UP = {
	name: "Moonshade Countdown, Tempodiana",
	about: "ATK higher.",
	icon: "🕰️",
	art: { uw: "oddy" }
};
var ATEIN_UP = {
	name: "Dragon’s Ruins, Atein",
	about: "Defense higher while Phillop is hurt.",
	icon: "🐉",
	art: { uw: "phillop" }
};
var DRAGON_RAGE = {
	name: "Dragon Rage",
	about: "ATK and defense higher for each.",
	icon: "🐉",
	art: { uw: "phillop" }
};
var SVELTA_UP = {
	name: "Dragonbane, Svelta",
	about: "A critical blow deals more and gains her mana.",
	icon: "🐲",
	art: { uw: "yanne" }
};
var ACRAVITA_UP = {
	name: "Storm of Neraxis",
	about: "Defense higher by a share of Neraxis’s, and ATK higher.",
	icon: "🌪️",
	art: { uw: "neraxis" }
};
var PERION_UP = {
	name: "Essence of Greed, Perion",
	about: "ATK and attack speed higher for each.",
	icon: "🩸",
	art: { uw: "erze" }
};
var GAIAMENES_UP = {
	name: "Blessing of Orvelia",
	about: "M.DEF higher.",
	icon: "🛡️",
	art: { uw: "loman" }
};
var NUMINU_UP = {
	name: "Holy Bird, Numinu",
	about: "Max HP higher: he takes that much less.",
	icon: "🕊️",
	art: { uw: "gau" }
};
var CAETHASIS_UP = {
	name: "Demon of the Calm, Caethasis",
	about: "Crit damage higher while in Stealth.",
	icon: "👁️",
	art: { uw: "tanya" }
};
var GALICTA_UP = {
	name: "Adversary of the Goddess, Galicta",
	about: "Penetration higher; each skill costs HP but stacks DMG higher.",
	icon: "⚔️",
	art: { uw: "rebel-klaus" }
};
var AEA_UP = {
	name: "Corrupted Holy Sword, Aea",
	about: "Each blow leaves the boss healed less, and may deal a blow more.",
	icon: "🗡️",
	art: { uw: "dark-lord-kasel" }
};
//#endregion
//#region src/technomagic/sim/perks.ts
/** A perk whose words say its own numbers: `words` is given its data, so each is written once (there). */
var said = (data, words) => ({
	...data,
	words: words(data)
});
/** What overlaps itself: every ally gains `first` from one hero with it, and `again` more from each other. */
var aura = (first, again) => ({
	first,
	again
});
/** Transcend 1: everyone's. */
var COMMON_PERKS = {
	"atk-up": said({
		name: "ATK Up",
		bonus: { atk: .3 }
	}, ({ bonus }) => `ATK is increased by ${pct(bonus.atk)}`),
	"hp-up": said({
		name: "HP Up",
		bonus: { hp: .3 }
	}, ({ bonus }) => `HP is increased by ${pct(bonus.hp)}`),
	"def-up": said({
		name: "DEF Up",
		bonus: { defense: .35 }
	}, ({ bonus }) => `DEF is increased by ${pct(bonus.defense)}`),
	"crit-resist-up": said({
		name: "Crit Resist Up",
		bonus: { critResist: 250 }
	}, ({ bonus }) => `Crit Resistance is increased by ${bonus.critResist}`),
	"monster-hunting": said({
		name: "Monster Hunting",
		dmg: 1.1,
		taken: .9
	}, ({ dmg, taken }) => `Increases DMG to Non-Hero enemies by ${pct(dmg - 1)} and takes ${pct(1 - taken)} reduced DMG`)
};
var OPPORTUNE_STRIKE = said({
	name: "Opportune Strike",
	bonus: {
		crit: 150,
		critDamage: .3
	}
}, ({ bonus }) => `Crit Chance is increased by ${bonus.crit} and Crit DMG is increased by ${pct(bonus.critDamage)}.`);
var TACTICAL_FORESIGHT = said({
	name: "Tactical Foresight",
	bonus: { dodge: 200 },
	taken: .9
}, ({ bonus, taken }) => `Dodge rate is increased by ${bonus.dodge} and takes ${pct(1 - taken)} reduced DMG.`);
var BLESSING_OF_MANA = said({
	name: "Blessing of Mana",
	bonus: { manaRegen: 2.5 }
}, ({ bonus }) => `Mana recovery per second rises by ${pct(bonus.manaRegen)}.`);
var TARGET_WEAKNESS = said({
	name: "Target Weakness",
	bonus: {
		atk: .2,
		pen: 200
	}
}, ({ bonus }) => `ATK rises by ${pct(bonus.atk)} and DEF Penetration rises by ${bonus.pen}.`);
/** Transcend 2: each class's five, in the bot's order (class-1 to class-5). */
var CLASS_PERKS = {
	warrior: [
		OPPORTUNE_STRIKE,
		said({
			name: "Warlike",
			bonus: {
				atk: .07,
				resist: 30
			}
		}, ({ bonus }) => `Per each enemy, ATK is increased by ${pct(bonus.atk)} and CC Resistance is increased by ${bonus.resist}. Can be stacked up to max 10 times.`),
		said({
			name: "Offensive Guard",
			atkFromDefense: .5,
			takenPhysical: .85
		}, (p) => `ATK rises equal to ${part(p.atkFromDefense)} of P.DEF and received P.DMG decreases by ${pct(1 - p.takenPhysical)}.`),
		TACTICAL_FORESIGHT,
		said({
			name: "Blood Wrath",
			bonus: {
				lifesteal: 200,
				speed: 200
			}
		}, ({ bonus }) => `Increases Lifesteal by ${bonus.lifesteal} and ATK Spd by ${bonus.speed}.`)
	],
	priest: [
		said({
			name: "Vengeful Curse",
			curse: {
				deals: .3,
				lasts: 3,
				every: 40
			}
		}, ({ curse }) => `When hit by an enemy, attacker's DMG is reduced by ${pct(1 - curse.deals)} for ${curse.lasts} sec. This effect only activates once in ${curse.every} sec, and cannot be dispelled.`),
		said({
			name: "Goddess Blessing",
			allies: { crit: aura(150, 50) }
		}, ({ allies }) => `All allies' Crit Chance is increased by ${allies.crit.first}. When overlapped with the same perk, only gains ${allies.crit.again}.`),
		said({
			name: "Inner Peace",
			allies: {
				mend: aura(.01, .003),
				resist: aura(75, 25)
			}
		}, ({ allies: { mend, resist } }) => `Per every sec, all allies' HP is healed by ${fine(mend.first)}, and CC resistance is increased by ${resist.first}. When overlapped with the same perk, only ${fine(mend.again)} HP per sec is healed, and CC resistance is increased by ${resist.again}.`),
		BLESSING_OF_MANA,
		said({
			name: "Swiftness",
			allies: { speed: aura(150, 50) }
		}, ({ allies }) => `All allies' ATK Spd is increased by ${allies.speed.first}. When overlapped with the same perk, only gains ${allies.speed.again}.`)
	],
	wizard: [
		said({
			name: "Deception",
			immunity: {
				hits: 3,
				every: 40
			}
		}, ({ immunity }) => `When receiving DMG, becomes immune to the next ${immunity.hits} hits of DMG. This effect is activated every ${immunity.every} sec.`),
		said({
			name: "Moral Rise",
			allies: { atk: aura(.15, .03) }
		}, ({ allies }) => `All allies' ATK is increased by ${pct(allies.atk.first)}. When overlapped with the same perk, only ${pct(allies.atk.again)} applies.`),
		BLESSING_OF_MANA,
		said({
			name: "Circuit Burst",
			bonus: { atk: .4 },
			taken: 1.2,
			acc: 200
		}, ({ bonus, taken, acc }) => `Receives ${pct(taken - 1)} more DMG but gains ${pct(bonus.atk)} ATK. ACC is increased by ${acc}.`),
		said({
			name: "Destruction",
			bonus: {
				crit: 200,
				pen: 200
			}
		}, ({ bonus }) => `Increases Crit Chance by ${bonus.crit} and DEF Penetration by ${bonus.pen}.`)
	],
	assassin: [
		TARGET_WEAKNESS,
		said({
			name: "Swift and Nimble",
			nimble: {
				dodge: 100,
				most: 5
			}
		}, ({ nimble }) => `Per every sec, Dodge rate is increased by ${nimble.dodge}. This effect can be stacked up to max ${nimble.most} times, and resets upon dodging an attack.`),
		TACTICAL_FORESIGHT,
		OPPORTUNE_STRIKE,
		said({
			name: "Vital Detection",
			mark: {
				name: "Vital Detection",
				takes: 1.1,
				lasts: 10,
				every: 3
			}
		}, ({ mark }) => `Upon Attack, causes the target to take ${pct(mark.takes - 1)} increased All DMG and have their ATK Spd reduced by 100 for ${mark.lasts} sec. This effect activates once every ${mark.every} sec.`)
	],
	archer: [
		said({
			name: "Precision Shot",
			bonus: { atk: .2 },
			acc: 400
		}, ({ bonus, acc }) => `ATK rises by ${pct(bonus.atk)} and ACC rises by ${acc}.`),
		said({
			name: "Eagle Eye",
			allies: {
				pen: aura(150, 50),
				acc: aura(75, 25)
			}
		}, ({ allies: { pen, acc } }) => `All allies' Penetration is increased by ${pen.first}, and ACC is increased by ${acc.first}. When overlapped with the same perk, gains only ${pen.again} Penetration and ${acc.again} ACC.`),
		said({
			name: "Mortal Wound",
			wound: {
				heals: .5,
				each: 200,
				lasts: 5
			}
		}, ({ wound }) => `Successful Crit Attack reduces enemy recovery rate by ${pct(1 - wound.heals)} and deals Physical continuous DMG every second equal to ${pct(wound.each / 1e3)} of ATK. Does not stack.`),
		OPPORTUNE_STRIKE,
		said({
			name: "Concentration",
			focus: {
				critDamage: .04,
				every: 6,
				most: 20
			}
		}, ({ focus }) => `Every ${focus.every} sec, increases own Crit DMG by ${pct(focus.critDamage)}. This effect can be stacked up to a max of ${focus.most} times and cannot be dispelled.`)
	],
	knight: [
		said({
			name: "Experienced Fighter",
			mark: {
				name: "Experienced Fighter",
				takes: 1.2,
				lasts: Infinity
			}
		}, ({ mark }) => `Attacked targets take ${pct(mark.takes - 1)} more DMG. Does not stack.`),
		said({
			name: "Excellent Strategy",
			allies: { accuracy: aura(150, 50) }
		}, ({ allies }) => `All allies' CC ACC is increased by ${allies.accuracy.first}. When overlapped with the same perk, only ${allies.accuracy.again} applies.`),
		said({
			name: "Battle Cry",
			allies: { hp: aura(.15, .05) }
		}, ({ allies }) => `All allies' Max HP is increased by ${pct(allies.hp.first)}. When overlapped with the same perk, only ${pct(allies.hp.again)} of effect applies.`),
		said({
			name: "Shield of Protection",
			bonus: {
				block: 200,
				resist: 300
			}
		}, ({ bonus }) => `Block Rate is increased by ${bonus.block} and CC resistance is increased by ${bonus.resist}.`),
		said({
			name: "Swift Move",
			bonus: { speed: 400 },
			acc: 200
		}, ({ bonus, acc }) => `Increases ATK Spd by ${bonus.speed} and ACC by ${acc}.`)
	],
	mechanic: [
		TARGET_WEAKNESS,
		said({
			name: "Ready Cannons",
			bonus: { manaRegen: .625 }
		}, ({ bonus }) => `Mana recovery per second rises by ${fine(bonus.manaRegen)} per every enemy.`),
		said({
			name: "Pressure Point",
			bonus: { crit: 400 }
		}, ({ bonus }) => `Crit Chance is increased by ${bonus.crit}.`),
		said({
			name: "Special Bullet",
			mark: {
				name: "Special Bullet",
				deals: .85,
				crit: -share$2(150),
				lasts: Infinity
			}
		}, ({ mark }) => `Attacked target loses ${pct(1 - mark.deals)} of ATK and ${Math.round(-mark.crit * POINTS)} of Crit Chance. Does not stack.`),
		said({
			name: "Amplified Gunpowder",
			allies: { critDamage: aura(.3, .1) }
		}, ({ allies }) => `Increases Crit DMG of all allies by ${pct(allies.critDamage.first)}. When overlapped with the same perk, only ${pct(allies.critDamage.again)} of effect applies.`)
	]
};
/** The perk `id` names for the hero `def` (null: none, or one this fight doesn't know). */
function perkOf(id, def) {
	if (Object.hasOwn(COMMON_PERKS, id)) return COMMON_PERKS[id];
	const own = /^class-([1-5])$/.exec(id);
	if (own) return CLASS_PERKS[def.class][Number(own[1]) - 1] ?? null;
	return def.perks?.[id] ?? null;
}
/** A hero's perks as the fight has them: the ones the bot says it has (each once), and what each does. */
var perksOf = (ids, def) => new Map((ids ?? []).flatMap((id) => {
	const perk = perkOf(id, def);
	return perk ? [[id, perk]] : [];
}));
/** Every ally's from `wearers` heroes with an aura: the first's, and each other's `again`. */
var auraOf = (one, wearers) => wearers > 0 ? one.first + one.again * (wearers - 1) : 0;
/** What a hero's perks make of its skills' moves (by the move each skill is): how many times as hard their blows are, which go through all the boss's defense, and what each leaves on the boss as its first blow lands. */
function moveDmg(def, perks) {
	const out = {};
	for (const perk of perks.values()) {
		const ability = perk.skill?.dmg !== void 0 ? def.abilities[perk.skill.index] : void 0;
		if (ability) out[ability.move] = (out[ability.move] ?? 1) * (perk.skill?.dmg ?? 1);
		if (perk.allSkills) for (const { move } of def.abilities) out[move] = (out[move] ?? 1) * perk.allSkills.dmg;
	}
	return out;
}
function moveWhole(def, perks) {
	return new Set([...perks.values()].flatMap((perk) => perk.skill?.whole ? [def.abilities[perk.skill.index]?.move].filter((move) => move !== void 0) : []));
}
/** What a hero's perks make of its skills' heals and shields (by the move each skill is): how many times as much they give. */
function moveHeals(def, perks) {
	const out = {};
	for (const perk of perks.values()) {
		const ability = perk.skill?.heals !== void 0 ? def.abilities[perk.skill.index] : void 0;
		if (ability) out[ability.move] = (out[ability.move] ?? 1) * (perk.skill?.heals ?? 1);
	}
	return out;
}
function moveMarks(def, perks) {
	const out = {};
	for (const perk of perks.values()) {
		const move = perk.skill?.mark ? def.abilities[perk.skill.index]?.move : void 0;
		if (move && perk.skill?.mark) (out[move] ??= []).push(perk.skill.mark);
	}
	return out;
}
/** What every ally gains, by `key`, from heroes with these perks (each hero's list): each aura by how many wear it. */
function auraTotal(heroes, key) {
	const worn = /* @__PURE__ */ new Map();
	for (const perks of heroes) for (const perk of perks) {
		const aura = perk.allies?.[key];
		if (!aura) continue;
		const name = perk.name ?? perk.words;
		const one = worn.get(name) ?? {
			aura,
			wearers: 0
		};
		one.wearers++;
		worn.set(name, one);
	}
	let total = 0;
	for (const { aura, wearers } of worn.values()) total += auraOf(aura, wearers);
	return total;
}
/** A skill as a hero's perks for it (or for every skill) change it (its cost and cooldown); with none, as it is. */
function tweaked(ability, perks) {
	if (perks.length === 0) return ability;
	let { cost, cooldown } = ability;
	for (const { skill, allSkills } of perks) {
		cost += (skill?.cost ?? 0) + (allSkills?.cost ?? 0);
		cooldown = (cooldown + (skill?.cooldown ?? 0)) * (skill?.cooldownShare ?? 1);
	}
	return {
		...ability,
		cost: Math.max(0, cost),
		cooldown: Math.max(0, cooldown)
	};
}
/** What a hero's gear gives it, with what its perks add to its stats (as gear does). */
function withPerks(gear, perks) {
	const out = { ...gear };
	for (const perk of perks) for (const [stat, more] of Object.entries(perk.bonus ?? {})) out[stat] = (out[stat] ?? 0) + more;
	return out;
}
/** A hero's stats (its gear's and its perks' in them) with what its perks make of them besides: Offensive Guard's ATK from its defense. */
function perkedStats(stats, perks) {
	for (const perk of perks) if (perk.atkFromDefense) stats.atk += perk.atkFromDefense * stats.physical;
	return stats;
}
/** What a hero's own perks give every ally, itself among them: each perk's `first` (it is the first of its kind there), by what it raises. */
function ownAuras(perks) {
	const out = {};
	for (const perk of perks) for (const [key, aura] of Object.entries(perk.allies ?? {})) out[key] = (out[key] ?? 0) + aura.first;
	return out;
}
/** The stat each aura raises, as gear's bonus has it (Inner Peace's heal every second, and Eagle Eye's ACC, are none). */
var AURA_STAT = {
	atk: "atk",
	crit: "crit",
	critDamage: "critDamage",
	speed: "speed",
	pen: "pen",
	accuracy: "accuracy",
	resist: "resist",
	hp: "hp"
};
/**
* What a hero's perks give its own stats, as gear's bonus has them (ATK, max HP and crit DMG shares; chances and the
* like in points, 10 to 1%): its own, and its share of what they give every ally; and Offensive Guard's ATK, so much
* of its physical defense, apart. What the heroes page lists as its perks' effects.
*/
function perkStats(perks) {
	const list = [...perks];
	const bonus = withPerks({}, list);
	for (const [key, more] of Object.entries(ownAuras(list))) {
		const stat = AURA_STAT[key];
		if (stat) bonus[stat] = (bonus[stat] ?? 0) + more;
	}
	return {
		bonus,
		atkFromDefense: list.reduce((sum, perk) => sum + (perk.atkFromDefense ?? 0), 0)
	};
}
/** What every hero's Transcend 5 Light gives: ATK, DEF and HP so much more. */
var T5_LIGHT = .15;
/** A hero's Transcend 5 Light: ATK, DEF and HP +15%, and `more` of its own (as gear gives it), which `says` puts in words. */
var t5Light = (more, says) => ({
	words: `ATK, DEF, HP +${pct(T5_LIGHT)} / ${says(more)}`,
	bonus: {
		atk: T5_LIGHT,
		defense: T5_LIGHT,
		hp: T5_LIGHT,
		...more
	}
});
/**
* A unique treasure whose effect is `effect`, given its tier's numbers: `k(row)` is a row's number at the tier (the
* row's 1★ to 5★).
*/
var treasure = (name, effect) => ({
	name,
	at: (tier) => effect((row) => atTier(row, tier))
});
/** A hero's main treasure as it fights: which of its four (0 to 3), at which tier; null: none, or one this fight doesn't know. */
function treasureOf(def, ut) {
	if (!ut || !Number.isInteger(ut.skill) || typeof ut.tier !== "number" || !Number.isFinite(ut.tier)) return null;
	const index = ut.skill - 1;
	if (!def.treasures?.[index]) return null;
	return {
		index,
		tier: Math.min(5, Math.max(1, Math.floor(ut.tier)))
	};
}
/** The tier of a hero's main treasure when it is its `index`th (0 to 3), else 0: what its part reads its own numbers by. */
var treasureTier = (self, index) => self.treasure?.index === index ? self.treasure.tier : 0;
/** A hero's main treasure's number in `row` when it is its `index`th, else `none`. */
var fromTreasure = (self, index, row, none = 0) => {
	const tier = treasureTier(self, index);
	return tier > 0 ? atTier(row, tier) : none;
};
/** A hero's treasures' names, and what one does at a tier, as the bot says them (null: no such hero or treasure). */
function treasureAbout(hero, skill, tier) {
	const def = hero?.treasures?.[skill - 1];
	return def ? {
		name: def.name,
		text: def.at(tier).words
	} : null;
}
//#endregion
//#region src/technomagic/sim/heroes/reach.ts
var REACH = {
	annette: {
		attack: 0,
		skills: [
			1,
			0,
			3
		]
	},
	crow: {
		attack: 0,
		skills: [
			3,
			2,
			0
		]
	},
	"dark-lord-kasel": {
		attack: 1,
		skills: [
			2,
			2,
			Infinity
		]
	},
	erze: {
		attack: 0,
		skills: [
			Infinity,
			0,
			0
		]
	},
	ezekiel: {
		attack: 0,
		skills: [
			3,
			0,
			0
		]
	},
	"fallen-frey": {
		attack: 0,
		skills: [
			Infinity,
			0,
			2.5
		]
	},
	gau: {
		attack: 1.5,
		skills: [
			2,
			0,
			4.5
		]
	},
	gremory: {
		attack: 0,
		skills: [
			0,
			0,
			0
		]
	},
	kirze: {
		attack: 1.5,
		skills: [
			3,
			Infinity,
			1.5
		]
	},
	klaus: {
		attack: 1,
		skills: [
			0,
			1,
			0
		]
	},
	laias: {
		attack: 0,
		skills: [
			0,
			0,
			Infinity
		]
	},
	loman: {
		attack: 1,
		skills: [
			2,
			0,
			1
		]
	},
	lorraine: {
		attack: 0,
		skills: [
			2.5,
			0,
			4.5
		]
	},
	lucikiel: {
		attack: 2,
		skills: [
			3.5,
			2,
			5
		]
	},
	morrah: {
		attack: 1,
		skills: [
			0,
			0,
			0
		]
	},
	naila: {
		attack: 0,
		skills: [
			0,
			0,
			5
		]
	},
	neraxis: {
		attack: 0,
		skills: [
			2,
			Infinity,
			4
		]
	},
	oddy: {
		attack: 0,
		skills: [
			1.5,
			0,
			Infinity
		]
	},
	phillop: {
		attack: .5,
		skills: [
			2,
			1,
			0
		]
	},
	"rebel-klaus": {
		attack: 1.8,
		skills: [
			3,
			Infinity,
			5
		]
	},
	selene: {
		attack: 0,
		skills: [
			0,
			0,
			2
		]
	},
	seria: {
		attack: 1,
		skills: [
			2,
			4,
			0
		]
	},
	tanya: {
		attack: 0,
		skills: [
			0,
			5,
			0
		]
	},
	valance: {
		attack: 0,
		skills: [
			0,
			0,
			0
		]
	},
	yanne: {
		attack: 0,
		skills: [
			0,
			5,
			0
		]
	}
};
//#endregion
//#region src/technomagic/sim/fight.ts
/** The dragons' ids: King's Raid's Dragon race, for an artifact's DMG against one (./artifacts.ts). */
var DRAGON_IDS = /* @__PURE__ */ new Set([
	"temeraire",
	"scalaxia",
	"zyrrkinoth",
	"armarta"
]);
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
/** The run up to the boss: how much of the way through it the heroes begin fanning out to where each stands. */
var FAN = .6;
/** How far short of where it stands (along the field) a hero begins turning toward it, to arrive there and wait for the rest. */
var NEAR = 6;
/** Where a wave's minions stand: about this far along the field (before the boss), as its wave has them, closer together (the field is narrower here). */
var MINION_X = 4.5;
function makeSim({ boss: def, heroes, seed, stage: firstStage, raid, solo = false, first = [], deathless: noDeaths = false }) {
	const random = seeded(seed);
	const roll = () => random.next();
	const events = [];
	/** The mana each hero has spent on skills this step (what it gained is counted past it, for its Auto). */
	const spent = /* @__PURE__ */ new Map();
	const log = [];
	const sums = [];
	let pending = [];
	const maxHp = def.stats.hp * scaleAt(def, firstStage, solo).hp;
	const boss = {
		index: 0,
		kind: "boss",
		def,
		part: { lands: {} },
		hp: maxHp,
		maxHp,
		stunned: 0,
		slowed: 0,
		slowRate: 1,
		statuses: [],
		x: 7,
		z: 0,
		away: false
	};
	/** Every enemy that has come onto the field, the boss first. */
	const foes = [boss];
	/**
	* The enemy in question (Fight.foe): set as a hero's move lands (the one it is fighting), as a blow lands (the one it lands
	* on), as an enemy's own move goes (that one); otherwise the boss, or while it is away the first minion standing.
	*/
	let focus = null;
	/** The enemies standing on the field (not away, not beaten). */
	const standing = () => foes.filter((one) => !one.away && one.hp > 0);
	const current = () => focus ?? (!boss.away ? boss : standing()[0] ?? boss);
	/** `run` with `on` the enemy in question (and back to the one before after). */
	function as(on, run) {
		const was = focus;
		focus = on;
		try {
			return run();
		} finally {
			focus = was;
		}
	}
	/** Whom each hero is fighting: the enemy nearest it (as King's Raid's heroes go for theirs), kept until it is beaten or away. */
	const aims = /* @__PURE__ */ new Map();
	function targetOf(fighter) {
		const aim = aims.get(fighter);
		if (aim && !aim.away && aim.hp > 0) return aim;
		const far = (one) => (one.x - fighter.x) * (one.x - fighter.x) + (one.z - fighter.z) * (one.z - fighter.z);
		const near = standing().reduce((best, one) => !best || far(one) < far(best) - 1e-9 ? one : best, null);
		if (near) aims.set(fighter, near);
		else aims.delete(fighter);
		return near;
	}
	/** `run` as `fighter` would have it: the enemy in question the one it is fighting. */
	const asFighter = (fighter, run) => as(targetOf(fighter) ?? current(), run);
	/** A raid of more than one wave (BossDef.waves): its waves past the first, as its stage has them as the fight begins; the wave it is on, and how many seconds are left of the heroes' run on to the next. */
	const later = def.waves?.at(Math.min(stagesOf(def), Math.max(1, Math.floor(firstStage) || 1))) ?? [];
	const waves = 1 + later.length;
	let wave = 1;
	let moving = 0;
	const minions = /* @__PURE__ */ new Map();
	let tick = 0;
	let elapsed = 0;
	/** Seconds of the raid's time gone, against this boss; and how long its raid lasts. */
	let clock = 0;
	const raidTime = def.time ?? 210;
	let stage = Math.min(stagesOf(def), Math.max(1, Math.floor(firstStage) || 1));
	let bossAuto = raid;
	let deathless = noDeaths && !raid;
	let result = null;
	/** A raid's run up to the boss: the steps it takes (the first steps of the fight). */
	const marching = raid ? Math.round(2 / TICK) : 0;
	/** The boss's health given back since it was last shown, and how long since then. */
	let mended = 0;
	let mendShown = 0;
	const party = [];
	const treasures = heroes.map(({ def: hero, ut }) => treasureOf(hero, ut));
	const perkSets = heroes.map(({ def: hero, perks }, index) => {
		const out = perksOf(perks, hero);
		const ut = treasures[index];
		const def = ut && hero.treasures?.[ut.index];
		if (ut && def) out.set("ut", def.at(ut.tier));
		return out;
	});
	/** What every ally gains from the start, by perks like Battle Cry (each wearer's: the first in full, the rest each `again`). */
	const startAura = (key) => auraTotal(perkSets.map((perks) => [...perks.values()]), key);
	const battleCry = startAura("hp");
	const artifactHp = heroes.reduce((most, { artifact }) => {
		const worn = artifactOf(artifact);
		return Math.max(most, worn ? at(worn.def.allies?.hp, worn.tier) : 0);
	}, 0);
	const fighters = heroes.map(({ def: hero, skin = 0, gear: worn = {}, set: wearing = null, uw = null, skills: tm = null, sub = false, artifact = null }, index) => {
		const set = setOf(wearing, hero.class);
		const relic = artifactOf(artifact);
		const tier = uniqueOf(hero.id, uw);
		const skills = skillsOf(tm);
		const n = (id) => skills[id] ?? 0;
		const perks = perkSets[index];
		const gear = withPerks(worn, perks.values());
		if (battleCry > 0) gear.hp = (gear.hp ?? 0) + battleCry;
		for (const [stat, value] of Object.entries({ ...set?.effect.own }).concat(Object.entries(artifactStats(relic)))) gear[stat] = (gear[stat] ?? 0) + value;
		if (artifactHp > 0) gear.hp = (gear.hp ?? 0) + artifactHp;
		gear.atk = (gear.atk ?? 0) + CLASS_BUFF.atk + (KR_HEROES[hero.id]?.books.atk ?? 0);
		gear.hp = (gear.hp ?? 0) + CLASS_BUFF.hp;
		const stats = perkedStats(geared(hero.stats, gear), perks.values());
		skilledStats(stats, skills);
		stats.crit += KR_HEROES[hero.id]?.books.critStat ?? 0;
		const motion = motionOf(hero);
		const mana = KR_HEROES[hero.id]?.mana ?? {
			regen: 75,
			attack: 300
		};
		const name = hero.skins[skin] ?? hero.skins[0] ?? hero.name;
		const defs = [...perks.values()];
		const sum = (of) => amplified(defs.map((perk) => of(perk) ?? 1));
		return {
			index,
			id: hero.id,
			name,
			def: hero,
			perks: new Set(perks.keys()),
			perkDefs: defs,
			abilities: hero.abilities.map((ability, i) => tweaked(ability, defs.filter((perk) => perk.skill?.index === i || perk.allSkills))),
			moveDmg: moveDmg(hero, perks),
			moveWhole: moveWhole(hero, perks),
			moveMarks: moveMarks(hero, perks),
			moveHeals: moveHeals(hero, perks),
			perkDmg: sum((perk) => perk.dmg),
			perkTaken: {
				physical: amplified(defs.flatMap((perk) => [perk.taken ?? 1, perk.takenPhysical ?? 1])),
				magical: sum((perk) => perk.taken)
			},
			acc: stats.acc + defs.reduce((sum, perk) => sum + (perk.acc ?? 0), 0),
			perkWaits: {},
			immune: 0,
			nimble: 0,
			wound: 0,
			stats,
			critTimes: 2 + stats.critDamage + (gear.critDamage ?? 0) + skilledCritDamage(skills),
			healTimes: 1 + (gear.heal ?? 0),
			set,
			setDone: {
				wind: false,
				full: false
			},
			artifact: relic,
			unique: tier === null ? null : {
				tier,
				casts: 0
			},
			treasure: treasures[index] ?? null,
			skills,
			stacks: {
				momentum: 0,
				steadfast: 0
			},
			waits: Object.fromEntries(EVERY.filter((id) => n(id) > 0).map((id) => [id, SKILL[id].every])),
			controlTimes: 1 + (gear.control ?? 0),
			accuracy: gear.accuracy ?? 0,
			lifesteal: gear.lifesteal ?? 0,
			recovery: gear.recovery ?? 0,
			manaDamage: gear.manaDamage ?? 0,
			critResist: {
				physical: (gear.critResist ?? 0) + (gear.critResistPhysical ?? 0),
				magical: (gear.critResist ?? 0) + (gear.critResistMagical ?? 0)
			},
			manaPerAttack: mana.attack * (1 + (gear.manaAttack ?? 0)),
			manaRegen: mana.regen * (1 + (gear.manaRegen ?? 0)),
			motion,
			attack: motion.attack,
			part: { lands: {} },
			hp: stats.hp,
			shield: 0,
			shieldLeft: 0,
			statuses: [],
			mana: 0,
			sub,
			auto: sub || raid,
			cooldowns: hero.abilities.map(() => 0),
			reserved: null,
			lastUsed: hero.abilities.map(() => -Infinity),
			income: mana.regen * (1 + (gear.manaRegen ?? 0)),
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
			who: fighter.index,
			...tick < marching && { run: 2 }
		});
		return true;
	}
	/**
	* The run up to the boss, `k` of the way (0 to 1): two abreast, the frontline first (its tanks leading), each pair
	* behind the one before, flat out until they slow to a stop near the boss (marchLeft), fanning out toward the end to
	* where each stands. One that comes up to where it stands sooner (further back) turns toward it as it nears it, and
	* stays there once it has (`arrived` is told of each there).
	* (Only + - * /: ./rules.ts.)
	*/
	function lineUp(k, arrived) {
		const back = 24 * marchLeft(k);
		const s = Math.max(0, (k - FAN) / .4);
		const fan = s * s * (3 - 2 * s);
		const order = [...field].sort((a, b) => nearer(a.def, b.def));
		order.forEach((on, i) => {
			const side = i === order.length - 1 && i % 2 === 0 ? 0 : i % 2 ? -1 : 1;
			const x = HERO_X - back - (i >> 1) * 3;
			const z = side * 3 / 2;
			const [toX, toZ] = spots.get(on);
			const near = Math.min(1, Math.max(0, 1 - (toX - x) / NEAR));
			const there = Math.max(fan, near * near * (3 - 2 * near));
			const from = Math.min(x, toX);
			on.x = from + (toX - from) * there;
			on.z = z + (toZ - z) * there;
			if (there >= 1) arrived?.(on);
		});
	}
	/** The hero whose attack's blow is landing right now (null: none: a skill's, or something else's), and how hard it is (King's Raid's); and whose move, and which. */
	let attacking = null;
	let basic = 0;
	let landing = null;
	/** How long the boss has been still; what each of its parts (heads) is doing, and will do after; whom it goes for, and whether it was busy last step. */
	let idle = 0;
	const going = /* @__PURE__ */ new Map();
	let aim = null;
	let was = false;
	const bossBusy = () => going.size > 0 || boss.stunned > 0;
	/** The boss begins an attack: not while it is stunned, or while any part of it the attack needs is still at another. */
	function bossUse(attack) {
		const plan = def.plans[attack] ?? [];
		if (boss.away || boss.stunned > 0 || plan.length === 0 || plan.some(([, by]) => going.has(by))) return;
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
		as(boss, () => boss.part.used?.(attack));
	}
	/** The boss's stats as it stands the heroes' blows at this stage: its defenses so many times its own. */
	function bossStands() {
		const times = scaleAt(def, stage, solo).defense ?? 1;
		return times === 1 ? def.stats : {
			...def.stats,
			physical: def.stats.physical * times,
			magical: def.stats.magical * times
		};
	}
	/**
	* The hero on the field the boss goes for (not one out of the fight): the one nearest it, as King's Raid's bosses go for
	* theirs; one standing, if any is (null: there is none). Of two as near, the one that came onto the field first.
	*/
	const anyone = () => {
		const there = field.filter((fighter) => !away(fighter.statuses));
		const up = there.filter((fighter) => fighter.hp > 0);
		const from = up.length > 0 ? up : there;
		const far = (fighter) => (fighter.x - 7) * (fighter.x - 7) + fighter.z * fighter.z;
		return from.reduce((nearest, fighter) => !nearest || far(fighter) < far(nearest) - 1e-9 ? fighter : nearest, null);
	};
	/** Each hero's artifact's hooks (./artifacts.ts), wearing one the fight has a use for. */
	const relics = /* @__PURE__ */ new Map();
	/** Whom the boss is going for: another, should that one have left the field, or the fight. */
	const aimed = () => {
		if (!aim || !field.includes(aim) || away(aim.statuses)) aim = anyone();
		return aim;
	};
	/**
	* What the sets worn by the heroes on the field, standing and in the fight, give `to` (an ally) of `key` (./sets.ts
	* SetEffect.allies), added up: twice over the front line's ATK Spd, or the rest's crit DMG, for a set that says so; mana
	* recovery only once its time has come.
	*/
	const allied = (to, key) => field.reduce((sum, on) => {
		const allies = on.hp > 0 && !away(on.statuses) ? on.set?.effect.allies : void 0;
		if (!allies?.[key] || key === "mana" && elapsed < (allies.manaAfter ?? 0)) return sum;
		const front = lineOf(to.def) === "front";
		const twice = allies.twice === "front" && key === "speed" && front || allies.twice === "back" && key === "critDamage" && !front;
		return sum + allies[key] * (twice ? 2 : 1);
	}, 0);
	/** Its set's effect (none: an empty one). */
	const setEffect = (by) => by.set?.effect ?? {};
	/** How many of an additional skill the heroes on the field, standing and in the fight, have between them (one that gives every ally something). */
	const among = (id) => field.reduce((count, on) => count + (on.hp > 0 && !away(on.statuses) ? on.skills[id] ?? 0 : 0), 0);
	/** What every ally gains, as this step began, from the perks of the heroes on the field and standing (./perks.ts's auras). */
	const auras = {
		atk: 0,
		crit: 0,
		critDamage: 0,
		speed: 0,
		pen: 0,
		acc: 0,
		accuracy: 0,
		resist: 0,
		mend: 0
	};
	function aurasNow() {
		const standing = field.filter((on) => on.hp > 0 && !away(on.statuses)).map((on) => on.perkDefs);
		for (const key of Object.keys(auras)) auras[key] = auraTotal(standing, key);
	}
	/** Whether a hero's perk that waits between times (by its name) comes now: then it waits again, `again` seconds. */
	function perkDue(fighter, name, again) {
		if ((fighter.perkWaits[name] ?? 0) > 0) return false;
		fighter.perkWaits[name] = again;
		return true;
	}
	/** How many of an additional skill a hero has. */
	const has = (fighter, id) => fighter.skills[id] ?? 0;
	const bears = (fighter, name) => fighter.statuses.some((status) => status.name === name);
	/**
	* How many times its ATK a hero's blows, heals and shields go by, for now: what the sets on the field give every ally
	* and every War Cry among them; its own set's, growing, at first or once its mana has been full; and its own Momentum's
	* stacks and Desperation. (All added up, as King's Raid's ATK is: ./combat/status.ts.)
	*/
	const atkTimes = (by) => {
		const own = setEffect(by);
		const set = (own.grows?.atk ?? 0) * grown(own, elapsed) + (own.opening && elapsed < own.opening.lasts ? own.opening.atk : 0) + (own.fullMana && by.setDone.full ? own.fullMana.atk : 0);
		return stacked([
			1 + allied(by, "atk") + set + SKILL["war-cry"].atk * among("war-cry") + auras.atk + alliesFrom(field, "atk") + adding(by.statuses, "atk"),
			1 + SKILL.momentum.atk * by.stacks.momentum * has(by, "momentum"),
			bears(by, DESPERATION_UP.name) ? 1 + SKILL.desperation.atk * has(by, "desperation") : 1
		]);
	};
	/**
	* How many times as much DMG a hero's blows deal besides (not its heals): its set's, growing as the fight goes on, and
	* what the sets on the field give every ally; and its own Vigor while its health is high, Persistence growing, and
	* Fundamentals on its attack.
	*/
	const dmgTimes = (by) => {
		const own = setEffect(by);
		const set = (own.dmg ?? 0) + (own.grows?.dmg ?? 0) * grown(own, elapsed) + allied(by, "dmg");
		const vigor = by.hp > by.stats.hp * SKILL.vigor.above ? SKILL.vigor.dmg * has(by, "vigor") : 0;
		const persistence = SKILL.persistence.dmg * has(by, "persistence") * Math.min(SKILL.persistence.most, Math.floor(elapsed / SKILL.persistence.every));
		const fundamentals = attacking === by ? SKILL.fundamentals.dmg * has(by, "fundamentals") : 0;
		return 1 + set + vigor + persistence + fundamentals;
	};
	/** How many times as much a heal or a shield gives for the hero whose it is (its attack, its gear and its Mending; one that is no hero's: as much as it says). */
	const byAttack = (by) => by ? by.stats.atk / ATK * atkTimes(by) * by.healTimes * (bears(by, MENDING_UP.name) ? 1 + SKILL.mending.heal * has(by, "mending") : 1) : 1;
	/**
	* Its skills' books (./heroes/kr.ts: all of them), on what of its own lands (`kind`: its blows, or its heals and shields): the
	* skill using's; what comes of one later, or of its passive, as its books give on the whole (those that give any). Its
	* attack's, none.
	*/
	const bookShare = (by, kind) => {
		if (attacking === by) return 0;
		const books = KR_HEROES[by.id]?.books[kind];
		if (!books) return 0;
		const skill = landing?.by === by ? by.doing?.skill : void 0;
		if (skill !== void 0) return books[skill] ?? 0;
		const some = books.filter((one) => one > 0);
		return some.length > 0 ? some.reduce((sum, one) => sum + one, 0) / some.length : 0;
	};
	/** How many times as much the heal or shield of the skill landing gives, by its books and its perks (its main unique treasure's: moveHeals), added up as King's Raid's skill power is. */
	const healed = (by) => by ? 1 + bookShare(by, "heal") + (landing?.by === by ? by.moveHeals[landing.move] ?? 1 : 1) - 1 : 1;
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
	/** A hero begins a move (it must be free): its attack, or the skill in one of its slots. */
	function begin(fighter, move, skill) {
		fighter.doing = {
			move,
			t: 0,
			part: 0,
			landed: 0,
			blows: 0,
			...skill !== null && { skill }
		};
		events.push({
			kind: "start",
			who: fighter.index,
			move,
			skill: skill !== null
		});
	}
	/** A hero uses a skill (true if it did: it must be free). */
	function use(fighter, index) {
		const ability = sim.slot(fighter, index);
		if (!ability || fighter.doing || !sim.ready(fighter, index)) return false;
		begin(fighter, ability.move, index);
		for (const perk of fighter.perkDefs) if (perk.skill?.index === index) usedWith(fighter, perk.skill);
		fighter.cooldowns[index] = ability.cooldown;
		fighter.lastUsed[index] = elapsed;
		fighter.mana -= ability.cost * SECTION;
		spent.set(fighter, (spent.get(fighter) ?? 0) + ability.cost * SECTION);
		asFighter(fighter, () => fighter.part.used?.(index, ability));
		uniqueCast(fighter);
		skillCast(fighter);
		setCast(fighter);
		return true;
	}
	/** What helps the boss (makes it deal more) is gone. */
	function dispel() {
		const foe = current();
		for (let i = foe.statuses.length - 1; i >= 0; i--) if ((foe.statuses[i].deals ?? 1) > 1) foe.statuses.splice(i, 1);
	}
	/** A status a skill puts on a hero for a while (a perk's: SkillStatus), shown as its skill's square. */
	function given(status, ability) {
		const { name, lasts, ...does } = status;
		return {
			name,
			left: lasts,
			...does,
			shown: {
				name,
				icon: ability?.icon ?? "✨",
				...ability?.art && { art: ability.art }
			}
		};
	}
	/** A hero uses a skill one of its perks changes (its main unique treasure's: ./treasures.ts): what comes of it as it is used. */
	function usedWith(fighter, skill) {
		const ability = fighter.abilities[skill.index];
		if (skill.mana) fighter.mana = Math.min(MAX_MANA, fighter.mana + skill.mana);
		if (skill.heal) sim.heal(fighter, skill.heal * fighter.stats.hp);
		const allies = field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
		if (skill.cleanse) for (const ally of skill.cleanse === "self" ? [fighter] : allies) ally.statuses = ally.statuses.filter((status) => status.shown.harmful !== true || status.binds === true);
		if (skill.dispel) dispel();
		if (skill.self) put(fighter.statuses, given(skill.self, ability));
		if (skill.party) for (const ally of allies) put(ally.statuses, given(skill.party, ability));
		if (skill.allyMana) for (const ally of allies) ally.mana = Math.min(MAX_MANA, ally.mana + skill.allyMana);
	}
	/** What a skill leaves on the boss as its first blow lands (a perk's: SkillMark). */
	function marked(mark) {
		const { name, lasts, ...does } = mark;
		put(current().statuses, {
			name,
			left: lasts,
			...does,
			shown: "curse"
		});
	}
	/**
	* Auto: the skill a hero uses now (null: none yet: it attacks meanwhile). Of the skills it wants (a heal once an ally
	* is hurt or bears something it can clear, one that keeps a status up once that runs out, any other always), it goes
	* for the one it has gone longest without whose cooldown is over (the dearer, where alike), or else the one whose
	* cooldown ends soonest, and saves its mana for it; another it uses meanwhile only if that still has its mana once it
	* can be used, by what the hero gains a second lately. One whose moment its hero says hasn't come is saved for, not
	* used. At full mana, rather than waste what it gains, the one it has gone longest without that it can use.
	*/
	function autoSkill(on) {
		if (!on.abilities.some((_, index) => sim.ready(on, index))) return null;
		const wait = (index) => on.cooldowns[index];
		const last = (index) => on.lastUsed[index] ?? -Infinity;
		const slots = on.abilities.map((_, index) => ({
			index,
			ability: sim.slot(on, index)
		})).filter((one) => one.ability !== null && wanted(one.ability)).sort((a, b) => (last(a.index) === last(b.index) ? 0 : last(a.index) < last(b.index) ? -1 : 1) || b.ability.cost - a.ability.cost || b.index - a.index);
		const ripe = (index) => on.part.ripe?.(index) ?? true;
		const usable = ({ index }) => ripe(index) && sim.ready(on, index);
		const target = slots.find((slot) => wait(slot.index) <= 0) ?? slots.reduce((soonest, slot) => !soonest || wait(slot.index) < wait(soonest.index) ? slot : soonest, void 0);
		if (!target) return null;
		if (usable(target)) return target.index;
		for (const slot of slots) {
			if (slot === target || !usable(slot)) continue;
			const lacks = target.ability.cost * SECTION - (on.mana - slot.ability.cost * SECTION);
			if (lacks <= 0 || lacks <= on.income * wait(target.index)) return slot.index;
		}
		if (on.mana < 6e3) return null;
		return slots.find(usable)?.index ?? null;
	}
	/** Auto: whether a skill is wanted now (a heal once an ally is hurt or bears something it can clear; one that keeps a status up once it runs out). */
	function wanted(ability) {
		const allies = field.filter((ally) => ally.hp > 0 && !away(ally.statuses));
		if (ability.auto?.heals && !allies.some((ally) => ally.hp < ally.stats.hp * AUTO.hurt || ally.statuses.some((status) => status.shown.harmful === true && !status.binds && !status.away))) return false;
		const keeps = ability.auto?.keeps;
		if (keeps && [party, ...allies.map((ally) => ally.statuses)].some((on) => on.some((status) => status.name === keeps && status.left > AUTO.spare))) return false;
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
	/** A hero has used a skill: its set's that comes of it (Hope's assassin: mana, and crit DMG for a while). */
	function setCast(fighter) {
		const on = setEffect(fighter).onSkill;
		if (!on) return;
		fighter.mana = Math.min(MAX_MANA, fighter.mana + on.mana);
		put(fighter.statuses, {
			name: SET_UP.onSkill.name,
			left: on.lasts,
			critDamage: on.critDamage,
			shown: SET_UP.onSkill
		});
	}
	/**
	* A step's time passes for a hero's set (on the field, standing and in the fight): Hope's mechanic's mana and cooldowns for
	* every ally, every so often; Authority's wizard's, once its mana is first full; Authority's warrior's second wind.
	*/
	function setTick(fighter) {
		const own = setEffect(fighter);
		if (!field.includes(fighter) || fighter.hp <= 0 || away(fighter.statuses)) return;
		if (own.tick && perkDue(fighter, "set", own.tick.every)) for (const ally of field.filter((on) => on.hp > 0 && !away(on.statuses))) {
			ally.mana = Math.min(MAX_MANA, ally.mana + own.tick.mana);
			ally.cooldowns = ally.cooldowns.map((left) => Math.max(0, left - (own.tick?.cooldown ?? 0)));
		}
		if (own.fullMana && !fighter.setDone.full && fighter.mana >= 6e3) {
			fighter.setDone.full = true;
			put(fighter.statuses, {
				name: SET_UP.fullMana.name,
				left: Infinity,
				mana: 1 + own.fullMana.mana,
				shown: SET_UP.fullMana
			});
		}
		if (own.secondWind && !fighter.setDone.wind && fighter.hp < fighter.stats.hp * own.secondWind.below) {
			fighter.setDone.wind = true;
			sim.heal(fighter, own.secondWind.heal * fighter.stats.hp);
			fighter.stats.speed += own.secondWind.speed;
			put(fighter.statuses, {
				name: SET_UP.secondWind.name,
				left: Infinity,
				shown: SET_UP.secondWind
			});
		}
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
			const ability = fighter.abilities[skill];
			if (ability && due(fighter, id, every)) fighter.cooldowns[skill] = Math.max(0, fighter.cooldowns[skill] - ability.cooldown * cooldown * n(id));
		}
		if (full && due(fighter, "overflow", SKILL.overflow.wait)) for (const ally of field) ally.cooldowns = ally.cooldowns.map((left, i) => Math.max(0, left - (ally.abilities[i]?.cooldown ?? 0) * SKILL.overflow.cooldown * n("overflow")));
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
	/**
	* A step's time passes for a hero's perks: their waits run down, and what its Mortal Wound has left on the boss; and,
	* every second (on the field, standing), Inner Peace mends it and Swift and Nimble stacks. Its Mortal Wound eats at
	* the boss every second while it is there, wherever the hero is.
	*/
	function perkTick(fighter, dt) {
		for (const name of Object.keys(fighter.perkWaits)) fighter.perkWaits[name] = fighter.perkWaits[name] - dt;
		fighter.wound = Math.max(0, fighter.wound - dt);
		const wound = fighter.wound > 0 ? fighter.perkDefs.find((perk) => perk.wound)?.wound : void 0;
		if (wound && (tick + 1) % SECOND === 0) sim.hit(fighter, wound.each, false);
		if ((tick + 1) % SECOND !== 0 || !field.includes(fighter) || fighter.hp <= 0 || away(fighter.statuses)) return;
		if (auras.mend > 0) sim.heal(fighter, auras.mend * fighter.stats.hp);
		const nimble = fighter.perkDefs.find((perk) => perk.nimble)?.nimble;
		if (nimble) fighter.nimble = Math.min(nimble.most, fighter.nimble + 1);
	}
	/** A hero wielding its own unique weapon has used a skill (./unique.ts): Klaus's every third, and Fallen Frey's every one. */
	function uniqueCast(fighter) {
		const unique = fighter.unique;
		if (!unique) return;
		unique.casts++;
		if (fighter.id === "klaus" && unique.casts % EXIAN.every === 0) {
			const boost = 1 + atTier(EXIAN.boost, unique.tier);
			put(fighter.statuses, {
				name: EXIAN_UP.name,
				left: EXIAN.lasts,
				deals: boost,
				defends: boost,
				shown: EXIAN_UP
			});
		} else if (fighter.id === "fallen-frey") {
			sim.heal(fighter, atTier(ROSMERTA.heal, unique.tier) * ATK, fighter);
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
		attack: (fighter, part) => sim.hit(fighter, basic || 1100 * (part === 4 ? 1.6 : 1)),
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
				basic = attacking ? part.blows?.[doing.landed - 1] ?? 0 : 0;
				landing = {
					by: fighter,
					move
				};
				if (attacking && doing.landed === 1) {
					fighter.mana = Math.min(MAX_MANA, fighter.mana + fighter.manaPerAttack);
					relics.get(fighter)?.basic();
				}
				asFighter(fighter, () => {
					const own = fighter.part.lands[move];
					if (own) own(index);
					else common[move]?.(fighter, index);
					attacking = null;
					basic = 0;
					landing = null;
					if (doing.blows === 1) {
						for (const mark of fighter.moveMarks[move] ?? []) marked(mark);
						const slowing = doing.skill === void 0 ? void 0 : fighter.perkDefs.find((perk) => perk.skill?.index === doing.skill && perk.skill?.slow)?.skill?.slow;
						if (slowing) sim.slow(slowing.points, slowing.lasts);
					}
				});
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
		const rate = boss.slowed > 0 ? boss.slowRate : 1;
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
				const own = boss.part.lands[doing.attack];
				as(boss, () => {
					if (own) own(doing.part, amount);
					else {
						const target = aimed();
						if (target) sim.hurt(target, amount);
					}
				});
				if (result) return;
			}
			if (doing.t >= move.length && going.get(by) === moves) {
				moves.shift();
				if (moves.length === 0) going.delete(by);
			}
		}
	}
	/** A hero's blow on one enemy (`foe`), as Fight.hit says. */
	function strikeFoe(foe, by, amount, counted, pierce, whole) {
		if (foe.hp <= 0 || foe.away || result) return false;
		const { attack, crit } = by.def.passive ?? NO_PASSIVE;
		const { atk, deals: type, crit: points, pen } = by.stats;
		const allCrit = by.set?.effect.allCrit;
		const critical = allCrit !== void 0 && points >= allCrit.at || roll() < share$2(curved(CURVE.crit, points + auras.crit + bookShare(by, "crit") + adding(by.statuses, "critPoints")) + critTaking(foe.statuses, type) - curved(CURVE.chance, foe.part.critResist ?? 0)) + crit + critting(by.statuses);
		const focus = by.perkDefs.find((perk) => perk.focus)?.focus;
		const focused = focus ? focus.critDamage * Math.min(focus.most, Math.floor(elapsed / focus.every)) : 0;
		const setCrit = (setEffect(by).grows?.critDamage ?? 0) * grown(setEffect(by), elapsed) + allied(by, "critDamage") + alliesFrom(field, "critDamage");
		const critTimes = by.critTimes + SKILL.whetstone.critDamage * among("whetstone") + critDamaging(by.statuses) + auras.critDamage + focused + setCrit;
		const skilled = landing?.by === by ? by.moveDmg[landing.move] ?? 1 : 1;
		const acc = by.acc + auras.acc + adding(by.statuses, "acc");
		const plain = foe === boss ? bossStands() : foe.def.stats;
		const lower = {
			physical: blocking(foe.statuses, "physical"),
			magical: blocking(foe.statuses, "magical")
		};
		const dodge = {
			physical: Math.max(0, plain.dodge.physical + dodging(foe.statuses, "physical")),
			magical: Math.max(0, plain.dodge.magical + dodging(foe.statuses, "magical"))
		};
		const stood = {
			...plain,
			dodge,
			block: {
				physical: Math.max(0, plain.block.physical + lower.physical),
				magical: Math.max(0, plain.block.magical + lower.magical)
			}
		};
		const through = whole || landing?.by === by && by.moveWhole.has(landing.move);
		const against = through ? {
			...stood,
			physical: 0,
			magical: 0
		} : {
			...stood,
			physical: stood.physical * defending(foe.statuses, "physical"),
			magical: stood.magical * defending(foe.statuses, "magical")
		};
		const power = (1 + bookShare(by, "dmg") + skilled - 1) * (through ? 1 + (setEffect(by).pastDef ?? 0) : 1);
		const more = amplified([
			dmgTimes(by),
			attack,
			...deals(by.statuses),
			by.perkDmg,
			by.part.deals?.() ?? 1,
			relics.get(by)?.deals(foe) ?? 1,
			...takes(foe.statuses, type)
		]);
		const { taken, blocked, dodged } = strike(amount * (atk / POINTS) * atkTimes(by) * power * more * (critical ? critTimes : 1), type, against, pen + auras.pen + pierce + piercing(by.statuses), reachAt(100), roll, acc);
		if (dodged) {
			events.push({
				kind: "number",
				on: "boss",
				foe: foe.index,
				amount: 0,
				type: "dodged"
			});
			return false;
		}
		events.push({
			kind: "boss-hit",
			foe: foe.index
		});
		relics.get(by)?.blow();
		const marking = by.perkDefs.filter((perk) => perk.mark && (perk.mark.every === void 0 || perkDue(by, perk.mark.name, perk.mark.every)));
		const struck = taken * (foe.part.taken?.[type] ?? 1);
		const dealt = deathless && foe === boss ? struck : Math.min(foe.hp, struck);
		foe.hp -= dealt;
		if (deathless && foe === boss && foe.hp <= 0) foe.hp = foe.maxHp;
		by.dealt += dealt;
		events.push({
			kind: "number",
			on: "boss",
			foe: foe.index,
			amount: dealt,
			type: blocked ? "blocked" : critical ? "crit" : "hit"
		});
		for (const { mark } of marking) if (mark) put(foe.statuses, {
			name: mark.name,
			left: mark.lasts,
			...mark.takes && { takes: mark.takes },
			...mark.deals && { deals: mark.deals },
			...mark.crit && { crit: mark.crit },
			shown: "curse"
		});
		const wound = critical ? by.perkDefs.find((perk) => perk.wound) : void 0;
		if (wound?.wound) {
			by.wound = wound.wound.lasts;
			put(foe.statuses, {
				name: wound.name ?? "Mortal Wound",
				left: wound.wound.lasts,
				heals: wound.wound.heals,
				shown: "curse"
			});
		}
		if (by.lifesteal > 0 && by.hp > 0 && !foe.part.unstolen) {
			const stolen = Math.min(dealt * share$2(curved(CURVE.chance, by.lifesteal)) * healing(by.statuses) * (boss.part.healing?.() ?? 1), by.stats.hp - by.hp);
			if (stolen > 0) by.hp += stolen;
		}
		const skillIndex = critical && landing?.by === by && attacking !== by ? by.doing?.skill : void 0;
		if (skillIndex !== void 0) for (const perk of by.perkDefs) {
			if (perk.skill?.index !== skillIndex) continue;
			if (perk.skill.critMana) by.mana = Math.min(MAX_MANA, by.mana + perk.skill.critMana);
			if (perk.skill.critCooldown) by.cooldowns[skillIndex] = Math.max(0, by.cooldowns[skillIndex] - (by.abilities[skillIndex]?.cooldown ?? 0) * perk.skill.critCooldown);
		}
		if (counted) {
			for (const fighter of fighters) fighter.part.struck?.(by);
			foe.part.struck?.(by, dealt, critical);
			by.part.blow?.(attacking !== by);
		}
		if (counted && foe.hp > 0 && by.id === "kirze" && by.unique && roll() < ELICIPIRA.chance) {
			const was = attacking;
			attacking = null;
			strikeFoe(foe, by, atTier(ELICIPIRA.blow, by.unique.tier) * ELICIPIRA.boss, false, 0, false);
			attacking = was;
		}
		if (foe.hp > 0) {
			if (foe === boss && wave === 1 && waves > 1 && def.waves && foe.hp <= foe.maxHp * def.waves.leaves) bossLeave();
			return critical;
		}
		beaten(foe);
		return critical;
	}
	/**
	* A hero's blow: on the enemy in question (as its move lands, the one it is fighting; else the one it would be), and, as far
	* about it as the move reaches (./heroes/reach.ts), on every other enemy there (not counted again: a blow of its own each).
	*/
	function hitting(by, amount, counted, pierce, whole) {
		const target = focus && !focus.away && focus.hp > 0 ? focus : targetOf(by);
		if (!target) return false;
		const critical = as(target, () => strikeFoe(target, by, amount, counted, pierce, whole));
		const reach = counted ? reachOf(by) : 0;
		if (reach > 0) {
			for (const other of standing()) if (other !== target && (other.x - target.x) * (other.x - target.x) + (other.z - target.z) * (other.z - target.z) <= reach * reach) as(other, () => strikeFoe(other, by, amount, false, pierce, whole));
		}
		return critical;
	}
	/** How far about its target a hero's blow landing now reaches (metres): its attack's, or the skill's it is using (./heroes/reach.ts). */
	function reachOf(by) {
		const reach = REACH[by.id];
		if (!reach) return 0;
		if (attacking === by) return reach.attack;
		const skill = landing?.by === by ? by.doing?.skill : void 0;
		return skill === void 0 ? 0 : reach.skills[skill] ?? 0;
	}
	/** An enemy beaten: the boss, won; a minion, off the field (and its wave, once no other stands, over). */
	function beaten(foe) {
		if (foe === boss) {
			as(boss, () => sim.stun(1, { down: true }));
			boss.part.beaten?.();
			end("won");
			return;
		}
		foe.away = true;
		minions.delete(foe);
		events.push({
			kind: "foe-down",
			foe: foe.index
		});
		if (boss.away && wave < waves && standing().length === 0) nextWave();
	}
	/** The boss flies off the field (the first wave over): the heroes move on. */
	function bossLeave() {
		boss.away = true;
		boss.stunned = 0;
		going.clear();
		events.push({ kind: "boss-leave" });
		nextWave();
	}
	/** On to the next wave: the heroes run on (nothing else happens meanwhile), and what is there comes onto the field as they arrive (arrive()). */
	function nextWave() {
		wave++;
		moving = 3;
		aims.clear();
		for (const on of field) on.doing = null;
		events.push({
			kind: "wave",
			wave,
			of: waves
		});
	}
	/** Arrived at a wave: its minions come onto the field, and at the last, the boss comes back, its landing on the heroes. */
	function arrive() {
		const list = later[wave - 2] ?? [];
		/** How many have stood where each spot is so far (by where the wave has them). */
		const placed = /* @__PURE__ */ new Map();
		for (const one of list) {
			const made = minionOf(one, solo);
			const kind = MINIONS[one.kind];
			let x = MINION_X + one.x * .5;
			let z = one.z * .45;
			const spot = `${one.x},${one.z}`;
			const before = placed.get(spot) ?? 0;
			placed.set(spot, before + 1);
			if (before > 0) {
				x += Math.cos(before * Math.PI * 2 / 5) * 1.8;
				z += Math.sin(before * Math.PI * 2 / 5) * 1.8;
			}
			const foe = {
				index: foes.length,
				kind: one.kind,
				def: {
					id: one.kind,
					name: kind.name,
					stats: made.stats
				},
				part: {
					lands: {},
					...kind.steady && { steady: true }
				},
				hp: made.hp,
				maxHp: made.hp,
				stunned: 0,
				slowed: 0,
				slowRate: 1,
				statuses: [],
				x,
				z,
				away: false
			};
			foes.push(foe);
			minions.set(foe, {
				def: kind,
				atk: made.atk,
				doing: null,
				rest: 0,
				skill: kind.skill?.first ?? 0,
				life: 0,
				fused: false
			});
			events.push({
				kind: "foe-enter",
				foe: foe.index,
				minion: one.kind,
				x,
				z
			});
		}
		if (wave === waves && boss.away && def.waves) {
			boss.away = false;
			events.push({ kind: "boss-return" });
			const { share, knock } = def.waves.lands;
			as(boss, () => {
				for (const on of reachable()) {
					sim.hurt(on, on.hp * share, false);
					sim.knock(on, knock);
				}
			});
		}
	}
	/** The heroes an enemy can reach: on the field, standing, and in the fight. */
	const reachable = () => field.filter((on) => on.hp > 0 && !away(on.statuses));
	/** The hero a minion goes for: the nearest it, or (`random`) any. */
	function heroFor(foe, random = false) {
		const can = reachable();
		if (can.length === 0) return null;
		if (random) return can[Math.floor(roll() * can.length)] ?? null;
		const far = (on) => (on.x - foe.x) * (on.x - foe.x) + (on.z - foe.z) * (on.z - foe.z);
		return can.reduce((best, on) => far(on) < far(best) - 1e-9 ? on : best);
	}
	/** The minions' moves go on by `dt`: each fights by itself (./bosses/dragon/minions.ts). */
	function minionsAdvance(dt) {
		for (const [foe, minion] of minions) {
			if (foe.away || foe.hp <= 0) continue;
			minion.life += dt;
			const fuse = minion.def.fuse;
			if (fuse && !minion.fused && minion.life >= fuse.after) {
				minion.fused = true;
				events.push({
					kind: "foe-use",
					foe: foe.index,
					move: "skill"
				});
				as(foe, () => {
					for (const on of reachable()) sim.hurt(on, on.stats.hp * fuse.share, false);
				});
				if (result) return;
				continue;
			}
			if (foe.stunned > 0) {
				minion.doing = null;
				continue;
			}
			minion.rest -= dt;
			minion.skill -= dt;
			if (!minion.doing && minion.rest <= 0) {
				const skill = minion.def.skill && minion.skill <= 0 ? minion.def.skill : null;
				const move = skill ?? minion.def.attack;
				const target = heroFor(foe, move.random);
				if (!target) continue;
				if (skill) minion.skill = skill.cooldown;
				minion.doing = {
					move,
					t: 0,
					landed: 0,
					target
				};
				events.push({
					kind: "foe-use",
					foe: foe.index,
					move: skill ? "skill" : "attack"
				});
			}
			const doing = minion.doing;
			if (!doing) continue;
			doing.t += dt * (foe.slowed > 0 ? foe.slowRate : 1);
			while (doing.landed < doing.move.lands.length && doing.t >= doing.move.lands[doing.landed]) {
				doing.landed++;
				as(foe, () => minionBlow(foe, minion, doing));
				if (result) return;
			}
			if (doing.t >= doing.move.length) {
				minion.doing = null;
				minion.rest = minion.def.rest;
			}
		}
	}
	/** A blow of a minion's move lands: on its target (or, gone, another), and every hero as far about it as it reaches; and what it leaves on each. */
	function minionBlow(foe, minion, doing) {
		const was = doing.target;
		const target = was && was.hp > 0 && field.includes(was) && !away(was.statuses) ? was : heroFor(foe, doing.move.random);
		if (!target) return;
		doing.target = target;
		const { reach, leaves } = doing.move;
		const struck = reach === Infinity ? reachable() : reachable().filter((on) => on === target || (on.x - target.x) * (on.x - target.x) + (on.z - target.z) * (on.z - target.z) <= reach * reach);
		for (const on of struck) {
			const took = sim.hurt(on, doing.move.share * minion.atk, true, doing.move.deals);
			if (!leaves || took <= 0 || on.hp <= 0) continue;
			if ("freeze" in leaves) sim.knock(on, leaves.freeze);
			else if ("slow" in leaves) {
				const { lasts, pace, ...shown } = leaves.slow;
				put(on.statuses, {
					name: shown.name,
					left: lasts,
					pace,
					shown
				});
			} else {
				const { each, most, ...shown } = leaves.weaken;
				const count = Math.min(most, (on.statuses.find((status) => status.name === shown.name)?.count ?? 0) + 1);
				put(on.statuses, {
					name: shown.name,
					left: Infinity,
					count,
					deals: Math.max(0, 1 - each * count),
					shown
				});
			}
		}
	}
	const sim = {
		raid,
		fighters,
		get field() {
			return field;
		},
		get foe() {
			return current();
		},
		boss,
		foes,
		get wave() {
			return wave;
		},
		waves,
		get moving() {
			return moving;
		},
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
			return raidTime - clock;
		},
		get result() {
			return result;
		},
		get basic() {
			return basic;
		},
		events,
		log,
		sums,
		roll,
		hit(by, amount, counted = true, pierce = 0, whole = false) {
			return hitting(by, amount, counted, pierce, whole);
		},
		heal(fighter, amount, by) {
			if (fighter.hp <= 0) return;
			const given = Math.min(amount * byAttack(by) * healed(by) * healing(fighter.statuses, 1 + fighter.recovery + allied(fighter, "recovery")) * (boss.part.healing?.() ?? 1), fighter.stats.hp - fighter.hp);
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
			const given = amount * byAttack(by) * healed(by) * (by ? 1 + SKILL.aegis.shield * has(by, "aegis") : 1) * (boss.part.shielding?.() ?? 1);
			fighter.shield += given;
			fighter.shieldLeft = Math.max(fighter.shieldLeft, seconds);
			if (by) by.healed += given;
		},
		target: aimed,
		hurt(target, amount, blockable = true, kind) {
			if (target.hp <= 0 || away(target.statuses) || result) return 0;
			const foe = current();
			if (target.immune > 0 || target.part.untouched?.()) {
				if (target.immune > 0) target.immune--;
				events.push({
					kind: "number",
					on: target.index,
					amount: 0,
					type: "immune"
				});
				return 0;
			}
			const type = kind ?? foe.def.stats.deals;
			const guarded = 1 + allied(target, "defense") + SKILL.bastion.defense * among("bastion") + alliesFrom(field, "defense");
			const toughened = (setEffect(target).grows?.tough ?? 0) * grown(setEffect(target), elapsed) + adding(target.statuses, "tough");
			const bare = relics.get(target)?.noDef() === true;
			const walled = elapsed < SKILL["iron-wall"].lasts ? SKILL["iron-wall"].more * has(target, "iron-wall") : 0;
			const stands = {
				...target.stats,
				physical: bare ? 0 : (target.stats.physical + bolstering(target.statuses, "physical") + bolstering(party, "physical")) * stacked([
					guarded,
					...defends(target.statuses, "physical"),
					...defends(party, "physical")
				]),
				magical: bare ? 0 : (target.stats.magical + bolstering(target.statuses, "magical") + bolstering(party, "magical")) * stacked([
					guarded,
					...defends(target.statuses, "magical"),
					...defends(party, "magical")
				]),
				block: {
					physical: target.stats.block.physical + walled + blocking(target.statuses, "physical"),
					magical: target.stats.block.magical + walled + blocking(target.statuses, "magical")
				},
				tough: {
					physical: (target.stats.tough?.physical ?? 0) + toughened,
					magical: (target.stats.tough?.magical ?? 0) + toughened
				}
			};
			const nimbler = (target.nimble > 0 ? target.nimble * (target.perkDefs.find((perk) => perk.nimble)?.nimble?.dodge ?? 0) : 0) + (target.part.dodge?.() ?? 0);
			const nimblest = {
				physical: nimbler + dodging(target.statuses, "physical") + dodging(party, "physical"),
				magical: nimbler + dodging(target.statuses, "magical") + dodging(party, "magical")
			};
			if (nimblest.physical !== 0 || nimblest.magical !== 0) stands.dodge = {
				physical: Math.max(0, stands.dodge.physical + nimblest.physical),
				magical: Math.max(0, stands.dodge.magical + nimblest.magical)
			};
			const critical = roll() < share$2(curved(CURVE.crit, foe.def.stats.crit) - curved(CURVE.chance, target.critResist[type] + critResisting(target.statuses, type) + critResisting(party, type))) + critting(foe.statuses);
			const staged = scaleAt(def, stage, solo);
			const scale = foe === boss ? staged : {
				...staged,
				deals: 1
			};
			const { taken, blocked, dodged } = strike(amount * scale.deals * dealing(foe.statuses) * rage(clock - raidTime) * (critical ? 2 : 1), type, blockable ? stands : {
				...stands,
				block: NONE,
				dodge: NONE
			}, foe.def.stats.pen ?? 0, reachAt(scale.level), roll, foe.def.stats.acc ?? 0);
			if (dodged) {
				target.nimble = 0;
				events.push({
					kind: "number",
					on: target.index,
					amount: 0,
					type: "dodged"
				});
				target.part.dodged?.();
				if (due(target, "mirage", SKILL.mirage.wait)) sim.heal(target, SKILL.mirage.heal * has(target, "mirage") * target.stats.hp);
				relics.get(target)?.dodged();
				return 0;
			}
			events.push({
				kind: "hurt",
				who: target.index,
				blocked,
				...foe !== boss && { by: foe.index }
			});
			const ward = type === "physical" ? SKILL["physical-ward"] : SKILL["magical-ward"];
			const warded = has(target, type === "physical" ? "physical-ward" : "magical-ward");
			let dealt = taken * amplified([
				...takes(party, type),
				...takes(target.statuses, type),
				target.def.passive?.taken ?? 1,
				target.perkTaken[type],
				target.part.takes?.() ?? 1,
				relics.get(target)?.taken() ?? 1,
				1 - Math.min(.9, SKILL.steadfast.taken * target.stacks.steadfast * has(target, "steadfast")),
				warded > 0 ? 1 - Math.min(.9, warded * (ward.taken + (ward.most - ward.taken) * Math.min(1, elapsed / ward.over))) : 1
			]);
			const soaked = Math.min(target.shield, dealt);
			target.shield -= soaked;
			if (soaked > 0) events.push({
				kind: "number",
				on: target.index,
				amount: soaked,
				type: "shield"
			});
			const losing = Math.min(target.hp, Math.max(0, dealt - soaked));
			const floor = relics.get(target)?.floor() ?? 0;
			const kept = floor > 0 && target.hp > floor ? Math.min(losing, target.hp - floor) : losing;
			const lost = kept >= target.hp && target.hp > 1 && target.part.spared?.() ? target.hp - 1 : kept;
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
			target.mana = Math.min(MAX_MANA, target.mana + MANA_PER_HP_LOST * (1 + target.manaDamage) * lost / target.stats.hp);
			if (dealt > 0) for (const fighter of fighters) fighter.part.hurt?.(target);
			if (dealt > 0) relics.get(target)?.hurt();
			for (const perk of target.perkDefs) {
				if (perk.curse && perkDue(target, perk.name ?? perk.words, perk.curse.every)) put(foe.statuses, {
					name: perk.name ?? "Curse",
					left: perk.curse.lasts,
					deals: perk.curse.deals,
					shown: "curse"
				});
				if (perk.immunity && dealt > 0 && target.hp > 0 && perkDue(target, perk.name ?? perk.words, perk.immunity.every)) target.immune = perk.immunity.hits;
			}
			if (blocked) {
				target.part.blocked?.();
				if (target.hp > 0 && due(target, "parry", SKILL.parry.wait)) target.mana = Math.min(MAX_MANA, target.mana + SKILL.parry.mana * has(target, "parry"));
				const onBlock = setEffect(target).onBlock;
				if (onBlock && target.hp > 0 && perkDue(target, "set-block", onBlock.wait)) target.cooldowns = target.cooldowns.map((left) => Math.max(0, left - onBlock.cooldown));
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
			if (fighter.hp <= 0 || away(fighter.statuses) || fighter.statuses.some((status) => status.guards) || fighter.part.guards?.()) return;
			const using = fighter.doing?.skill;
			if (using !== void 0 && fighter.perkDefs.some((perk) => perk.skill?.index === using && perk.skill.steady)) return;
			if (relics.get(fighter)?.knocked() === false) return;
			stagger(fighter);
			const shorter = Math.max(0, 1 - SKILL.tenacity.control * has(fighter, "tenacity")) * (fighter.def.passive?.held ?? 1) * (fighter.part.held?.() ?? 1);
			put(fighter.statuses, {
				name: KNOCKED.name,
				left: seconds * (1 - share$2(curved(CURVE.resist, fighter.stats.resist + resisting(fighter.statuses) + auras.resist))) * shorter,
				binds: true,
				shown: KNOCKED
			});
		},
		stagger,
		mend(amount) {
			const foe = current();
			if (foe.hp <= 0) return;
			const given = Math.min(amount * healing(foe.statuses), foe.maxHp - foe.hp);
			foe.hp += given;
			mended += given;
		},
		stun(seconds, { down = false, by } = {}) {
			const foe = current();
			if (foe.away || foe.hp <= 0) return;
			const held = seconds * (by ? (by.def.passive?.control ?? 1) * by.controlTimes * (1 - share$2(curved(CURVE.resist, Math.max(0, foe.def.stats.resist + resisting(foe.statuses))) - curved(CURVE.accuracy, by.accuracy + auras.accuracy + accurate(by.statuses)))) : 1);
			if (foe !== boss) {
				if (foe.part.steady || held <= 0) return;
				foe.stunned = Math.max(foe.stunned, held);
				const minion = minions.get(foe);
				if (minion) minion.doing = null;
				events.push({
					kind: "foe-daze",
					foe: foe.index,
					seconds: held
				});
				return;
			}
			const taken = foe.part.controlled && foe.hp > 0 ? foe.part.controlled(held, down) : {
				seconds: held,
				down
			};
			if (!taken || taken.seconds <= 0) return;
			const lasts = taken.seconds;
			going.clear();
			foe.stunned = Math.max(foe.stunned, lasts);
			events.push({
				kind: "boss-daze",
				seconds: lasts,
				down: taken.down
			});
		},
		slow(points, seconds) {
			const foe = current();
			if (foe.part.steady || foe.away) return;
			const rate = 1 - share$2(points);
			foe.slowRate = rate;
			foe.slowed = seconds;
			if (foe === boss) events.push({
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
			return sim.reservable(fighter, index) && fighter.cooldowns[index] <= 0 && fighter.mana >= sim.slot(fighter, index).cost * 1e3;
		},
		reservable(fighter, index) {
			return sim.slot(fighter, index) !== null && field.includes(fighter) && fighter.hp > 0 && !bound(fighter.statuses);
		},
		slot(fighter, index) {
			if (index < 0 || index >= fighter.abilities.length) return null;
			return fighter.part.slot ? fighter.part.slot(index) : fighter.abilities[index] ?? null;
		},
		input(input) {
			pending.push(input);
			log.push({
				...input,
				tick
			});
		},
		marks() {
			const foe = boss;
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
			if (foe.hp > 0 && clock > raidTime) {
				const times = rage(clock - raidTime);
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
		gauge: () => boss.part.gauge?.() ?? null,
		checksum() {
			const word = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
			let hash = 2166136261;
			const mix = (n) => {
				word.setFloat64(0, n);
				for (let i = 0; i < 8; i++) hash = Math.imul(hash ^ word.getUint8(i), 16777619);
			};
			mix(tick);
			mix(clock);
			mix(wave);
			mix(moving);
			for (const foe of foes) {
				mix(foe.hp);
				mix(foe.stunned);
				mix(foe.slowed);
				mix(foe.statuses.length);
			}
			for (const fighter of fighters) {
				mix(fighter.hp);
				mix(fighter.mana);
				mix(fighter.shield);
				mix(fighter.dealt);
				mix(fighter.statuses.length);
				mix(fighter.stacks.momentum + fighter.stacks.steadfast);
				mix(fighter.doing ? fighter.doing.t : -1);
				mix(fighter.reserved ?? -1);
				mix(fighter.immune + fighter.nimble + fighter.wound);
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
			if (tick < marching) {
				tick++;
				lineUp(tick / marching);
				if (tick === marching) for (const on of field) on.doing = null;
				if (tick % SECOND === 0) sums.push(sim.checksum());
				return;
			}
			const dt = TICK;
			elapsed += dt;
			aurasNow();
			const before = fighters.map((fighter) => fighter.mana);
			spent.clear();
			idle = bossBusy() ? 0 : idle + dt;
			if (bossAuto && !boss.away && moving <= 0 && idle >= (def.rest ?? 1.1)) {
				const forced = boss.part.next?.() ?? null;
				const may = def.attacks.filter((one) => boss.part.ready?.(one.name) ?? true);
				const basic = def.basic;
				const skill = basic ? may.find((one) => !basic.includes(one.name))?.name : void 0;
				const plain = basic ? basic[Math.floor(roll() * basic.length)] : (may[Math.floor(roll() * may.length)] ?? def.attacks[0])?.name;
				bossUse(forced ?? skill ?? plain ?? "");
			}
			for (const fighter of fighters) {
				fighter.mana = Math.min(MAX_MANA, fighter.mana + fighter.manaRegen * dt * filling([...fighter.statuses, ...party], 1 + allied(fighter, "mana")));
				fighter.cooldowns = fighter.cooldowns.map((left) => Math.max(0, left - dt));
				wear(fighter.statuses, dt);
				fighter.shieldLeft = Math.max(0, fighter.shieldLeft - dt);
				if (fighter.shieldLeft <= 0) fighter.shield = 0;
				skillTick(fighter, dt);
				perkTick(fighter, dt);
				setTick(fighter);
				relics.get(fighter)?.tick(dt);
				asFighter(fighter, () => fighter.part.tick?.(dt));
				const top = setEffect(fighter).top;
				if (top && elapsed >= top.after && elapsed - dt < top.after && field.includes(fighter) && fighter.hp > 0) {
					const most = field.reduce((best, on) => on.hp > 0 && (!best || on.dealt > best.dealt) ? on : best, null);
					if (most) put(most.statuses, {
						name: `${SET_UP.top.name} ${fighter.index}`,
						left: Infinity,
						deals: 1 + top.dmg,
						shown: SET_UP.top
					});
				}
				if (result) return;
			}
			for (const foe of foes) {
				foe.slowed = Math.max(0, foe.slowed - dt);
				foe.stunned = Math.max(0, foe.stunned - dt);
				wear(foe.statuses, dt);
			}
			wear(party, dt);
			if (!deathless) clock += dt;
			as(boss, () => boss.part.tick?.(dt));
			if (result) return;
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
			if (moving > 0) {
				moving = Math.max(0, moving - dt);
				if (moving <= 0) arrive();
				tick++;
				if (tick % SECOND === 0) sums.push(sim.checksum());
				return;
			}
			for (const on of field) {
				on.rested = on.doing ? 0 : on.rested + dt;
				if (on.auto && on.reserved === null && !on.doing) on.reserved = autoSkill(on);
				if (on.reserved !== null && !sim.reservable(on, on.reserved) && !bound(on.statuses)) on.reserved = null;
				if (!on.doing && on.hp > 0 && !bound(on.statuses)) {
					if (on.reserved !== null && use(on, on.reserved)) on.reserved = null;
					else if (on.rested >= (KR_HEROES[on.id]?.wait ?? .45) && targetOf(on)) begin(on, on.attack, null);
				}
			}
			const busy = bossBusy();
			if (busy && !was) aim = anyone();
			was = busy;
			bossAdvance(dt);
			if (result) return;
			minionsAdvance(dt);
			if (result) return;
			const reform = Math.min(1, dt * 4);
			for (const on of field) {
				const speed = (on.stats.speed + auras.speed + allied(on, "speed") + adding(on.statuses, "speed") + (on.part.speed?.() ?? 0)) * pacing(on.statuses, on.part.pace?.() ?? 1);
				on.haste = on.def.passive?.steady ? 1 : Math.max(300, curved(CURVE.speed, speed)) / POINTS;
				advance(on, dt * on.haste);
				if (result) return;
				const [x, z] = spots.get(on);
				on.x += (x - on.x) * reform;
				on.z += (z - on.z) * reform;
			}
			if (!deathless && (field.length > 0 && field.every((on) => on.hp <= 0) || clock >= raidTime + 20)) end("lost");
			fighters.forEach((fighter, i) => {
				const was = before[i];
				if (was >= 6e3 || fighter.mana >= 6e3) return;
				const gained = Math.max(0, fighter.mana - was + (spent.get(fighter) ?? 0));
				fighter.income += (gained / dt - fighter.income) * (dt / AUTO.income);
			});
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
					if (boss.hp <= 0) boss.hp = boss.maxHp;
				}
				return;
			case "stage":
				stage = Math.min(stagesOf(def), Math.max(1, Math.floor(input.stage) || 1));
				return;
		}
	}
	boss.part = as(boss, () => def.join?.(sim)) ?? boss.part;
	for (const fighter of fighters) {
		const hooks = artifactHooks(fighter, {
			elapsed: () => elapsed,
			field: () => field,
			boss: () => boss,
			dragon: DRAGON_IDS.has(def.id),
			roll,
			hit: (by, amount) => void sim.hit(by, amount, true),
			heal: (on, amount) => sim.heal(on, amount),
			due: (on, name, again) => perkDue(on, name, again)
		});
		if (hooks) relics.set(fighter, hooks);
	}
	for (const hooks of relics.values()) hooks.begin();
	for (const fighter of fighters) {
		const tick = setEffect(fighter).tick;
		if (tick) fighter.perkWaits.set = tick.every;
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
	if (marching > 0) {
		const runs = /* @__PURE__ */ new Map();
		for (let t = 1; t <= marching; t++) lineUp(t / marching, (on) => {
			if (!runs.has(on)) runs.set(on, t * TICK);
		});
		for (const event of events) if (event.kind === "enter") event.run = runs.get(fighters[event.who]) ?? 2;
		lineUp(0);
	}
	return sim;
}
//#endregion
//#region src/technomagic/sim/heroes/annette.ts
var RAY = {
	blow: indexed("mechanic", 207192),
	extra: indexed("mechanic", 207192),
	weaker: .15,
	takes: .25,
	lasts: 10
};
var TREATMENT = {
	heal: indexedHeal("mechanic", 284970),
	lasts: 10,
	resist: 250,
	crit: 250,
	dmg: .1
};
var ELIMINATION = {
	blow: indexed("mechanic", 552663),
	over: indexed("mechanic", 682883),
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
/** Her books' (King's Raid's playtest's): more Charge as each skill is used (unless she is Overcharged), and Overcharged, ATK Spd (points). */
var BOOKS = {
	charge: [
		6,
		6,
		9
	],
	speed: 250
};
/** Her own perks' numbers: more Charge from a skill, Process of Elimination's mark, Overcharge's more ATK and longer, and Transcend 5's Dark's for every ally (attack speed in points, ATK a share of hers). */
var PERKS$24 = {
	charge: 1.4,
	eliminated: .25,
	overAtk: 1.4,
	overLonger: 3,
	allies: {
		speed: 200,
		atk: .05
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Blasting Ray's crit chance off the boss (points) and the
* mana it would take (the boss has none); Emergency Treatment's cheaper and more healing; Process of Elimination's DMG and
* the Charge each attack gains; the Charge she begins with, and Overcharge's more cooldown off each attack.
*/
var UT$24 = {
	lens: {
		crit: 250,
		mana: [
			480,
			580,
			700,
			840,
			1e3
		],
		lasts: 10
	},
	script: {
		cost: -1,
		heals: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	},
	code: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		charge: 2
	},
	battery: {
		charge: [
			36,
			43,
			52,
			63,
			75
		],
		cooldown: .05
	}
};
var art$24 = skillArt("annette");
var CHARGING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Charge",
		about: `Passive. A [Charge] every ${CHARGE$1.every} seconds, and ${CHARGE$1.perCrystal} for each crystal of mana she spends; at ${CHARGE$1.full} she is [Overcharged] for ${CHARGE$1.lasts} seconds (ATK higher, and each attack takes ${pct(CHARGE$1.cooldown)} off her skills’ cooldowns).`,
		icon: "⚡",
		art: art$24(3)
	},
	words: `Gains 1 stack of Charge every ${CHARGE$1.every} sec, and gains ${CHARGE$1.perCrystal} stacks of Charge per every orb of mana used. Upon the ${CHARGE$1.full}th Charge stacked, enters Overcharge state. When in Overcharge, ATK is increased by ${pct(CHARGE$1.atk)} for ${CHARGE$1.lasts} sec, and each auto attack reduces skill cooldown by ${pct(CHARGE$1.cooldown)}. All effects cannot be dispelled, and Charge will not stack during Overcharge state. When Overcharged, ATK Spd is increased by ${BOOKS.speed}.`
};
/** Her Charge: shown beside her passive, with how many she has. */
var CHARGED$1 = {
	name: "Charge",
	about: `At ${CHARGE$1.full} she is [Overcharged].`,
	icon: "⚡"
};
/** Overcharged: shown on her card, with how long it has left. */
var OVERCHARGED = {
	name: "Overcharge",
	about: `${pct(CHARGE$1.atk)} higher ATK; each attack takes ${pct(CHARGE$1.cooldown)} off her skills’ cooldowns; her skills do more.`,
	icon: "🔋",
	art: art$24(3)
};
/** What Transcend 5's Dark gives every ally while she is Overcharged. */
var ROUSED = {
	name: "Overcharge (allies)",
	about: `Quicker, and its ATK higher by ${pct(PERKS$24.allies.atk)} of Annette’s.`,
	icon: "⚡",
	art: art$24(3)
};
/** What Emergency Treatment gives each ally: shown on its card, with how long it has left. */
var TREATED = {
	name: "Emergency Treatment",
	about: "Healed over time, and knocked down for less long.",
	icon: "🩹",
	art: art$24(1)
};
var TREATED_OVER = {
	name: "Emergency Treatment",
	about: `Healed over time; more likely to land a critical blow, deals ${pct(TREATMENT.dmg)} more, and can’t be knocked down.`,
	icon: "🩹",
	art: art$24(1)
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
			about: `Rascal fires a ray into the boss: for ${RAY.lasts} seconds it hits ${pct(RAY.weaker)} softer and takes ${pct(RAY.takes)} more magical damage. [Overcharged]: a second ray, and twice that.`,
			words: `Attacks enemies in a straight line, dealing ${dmg("mechanic", RAY.blow, bookDmg("annette", 0))} M.DMG, reducing their ATK by ${pct(RAY.weaker)} and hit enemies take ${pct(RAY.takes)} increased M.DMG for ${RAY.lasts} sec. If the skill is used when in Overcharge state, deals ${dmg("mechanic", RAY.extra, bookDmg("annette", 0))} extra M.DMG, additionally reduces their ATK by ${pct(RAY.weaker)}, and hit enemies take ${pct(RAY.takes)} increased M.DMG. Upon use, the amount of Charge gained is increased by 30%.`,
			icon: "🔆",
			art: art$24(0),
			move: "ray",
			cooldown: 11,
			cost: 2
		},
		{
			name: "Emergency Treatment",
			auto: { heals: true },
			about: `Clears what the boss has left on every ally (not what holds one down or shuts one away) and heals them over ${TREATMENT.lasts} seconds, and they stand being knocked down better meanwhile. [Overcharged]: they are also ${pct(share$2(TREATMENT.crit))} likelier to land a critical blow, deal ${pct(TREATMENT.dmg)} more, and can’t be knocked down.`,
			words: `Dispels negative effects of all allies and heals a total of ${healed("mechanic", TREATMENT.heal, bookHeal("annette", 1))} HP for ${TREATMENT.lasts} sec while increasing CC Resistance by ${TREATMENT.resist}. While Overcharged, all allies' Crit Chance is increased by ${TREATMENT.crit} and DMG dealt to Non-Hero enemies by ${pct(TREATMENT.dmg)} and gains immunity to CC. Upon use, the amount of Charge gained is increased by 30%.`,
			icon: "🩹",
			art: art$24(1),
			move: "treatment",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Process of Elimination",
			about: `A ball of energy that bursts on the boss. [Overcharged]: it bursts harder, stuns the boss for ${ELIMINATION.stun} seconds, and leaves it taking ${pct(ELIMINATION.takes)} more magical damage for ${ELIMINATION.lasts}.`,
			words: `Fires an exploding energy ball to a random target and nearby enemies in range, dealing ${dmg("mechanic", ELIMINATION.blow, bookDmg("annette", 2))} M.DMG. When in Overcharge state, deals ${dmg("mechanic", ELIMINATION.over, bookDmg("annette", 2))} M.DMG, increases M.DMG enemies take by ${pct(ELIMINATION.takes)} for ${ELIMINATION.lasts} sec, and inflicts Stun for ${ELIMINATION.stun} sec upon explosion. Upon use, the amount of Charge gained is increased by 30%.`,
			icon: "💣",
			art: art$24(2),
			move: "elimination",
			cooldown: 25,
			cost: 3
		}
	],
	passive: CHARGING,
	treasures: [
		treasure("Triplex Condensing Lens", (k) => ({
			words: `[Ray of Annihilation] For ${UT$24.lens.lasts} sec, reduces the target's Crit Chance by ${UT$24.lens.crit} and the target's Mana by ${k(UT$24.lens.mana)}.`,
			skill: {
				index: 0,
				mark: {
					name: "Triplex Condensing Lens",
					crit: -share$2(UT$24.lens.crit),
					lasts: UT$24.lens.lasts
				}
			}
		})),
		treasure("Script of Healing", (k) => ({
			words: `[Emergency Treatment] Reduces Mana Cost by ${-UT$24.script.cost} and increases Heal Rate by ${pct(k(UT$24.script.heals))}.`,
			skill: {
				index: 1,
				cost: UT$24.script.cost
			}
		})),
		treasure("Code of Annihilation", (k) => ({
			words: `[Process of Elimination] DMG is increased by ${pct(k(UT$24.code.dmg))} and upon ATK, gains ${UT$24.code.charge} stack of Charge. This stack can be gained while in Overcharge state.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$24.code.dmg)
			}
		})),
		treasure("High Performance Battery", (k) => ({ words: `[Charge] Gains ${k(UT$24.battery.charge)} stacks of Charge at the beginning of every battle. While in Overcharge, Normal attacks increase Cooldown Reduction by ${pct(UT$24.battery.cooldown)}.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			mark: {
				name: "Magic Weakness",
				takes: { magical: 1.25 },
				lasts: 10
			}
		} }, ({ skill: { mark } }) => `Target takes ${pct(mark.takes.magical - 1)} increased M.DMG for ${mark.lasts} sec.`),
		"s1-dark": { words: `Charge amount is boosted by ${pct(PERKS$24.charge - 1)} upon use.` },
		"s2-light": said({ skill: {
			index: 1,
			cooldown: -3
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s2-dark": { words: `Charge amount is boosted by ${pct(PERKS$24.charge - 1)} upon use.` },
		"s3-light": said({ skill: {
			index: 2,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: `Target takes ${pct(PERKS$24.eliminated)} increased M.DMG.` },
		"s4-light": { words: `ATK boost is increased by ${pct(PERKS$24.overAtk - 1)}.` },
		"s4-dark": { words: `Overcharge duration is increased by ${PERKS$24.overLonger} sec.` },
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK Spd +${speed}`),
		"t5-dark": { words: `When Overcharge activates, increases all allies' ATK Spd by ${PERKS$24.allies.speed}, and increases the ATK of all allies by ${pct(PERKS$24.allies.atk)} of Annette's ATK.` }
	},
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
			over = CHARGE$1.lasts + (self.perks.has("s4-dark") ? PERKS$24.overLonger : 0);
			put(self.statuses, {
				name: OVERCHARGED.name,
				left: over,
				deals: 1 + CHARGE$1.atk * (self.perks.has("s4-light") ? PERKS$24.overAtk : 1),
				pace: 1 + share$2(BOOKS.speed),
				shown: OVERCHARGED
			});
			if (self.perks.has("t5-dark")) for (const ally of allies()) put(ally.statuses, {
				name: ROUSED.name,
				left: over,
				pace: 1 + share$2(PERKS$24.allies.speed),
				deals: 1 + PERKS$24.allies.atk * self.stats.atk / ally.stats.atk,
				shown: ROUSED
			});
		};
		const battery = fromTreasure(self, 3, UT$24.battery.charge);
		if (battery > 0) gain(battery);
		return {
			lands: {
				zap() {
					fight.hit(self, fight.basic);
					if (treasureTier(self, 2) > 0) gain(UT$24.code.charge);
					if (over <= 0) return;
					const off = CHARGE$1.cooldown + (treasureTier(self, 3) > 0 ? UT$24.battery.cooldown : 0);
					self.abilities.forEach((ability, i) => {
						self.cooldowns[i] = Math.max(0, self.cooldowns[i] - ability.cooldown * off);
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
							crit: share$2(TREATMENT.crit),
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
					const takes = (more ? ELIMINATION.takes : 0) + (self.perks.has("s3-dark") ? PERKS$24.eliminated : 0);
					if (takes > 0) put(fight.foe.statuses, {
						name: ELIMINATED,
						left: ELIMINATION.lasts,
						takes: { magical: 1 + takes },
						shown: "curse"
					});
					if (more) fight.stun(ELIMINATION.stun, { by: self });
				}
			},
			used(index, ability) {
				if (ability.move === "ray" || ability.move === "treatment" || ability.move === "elimination") overcharged[ability.move] = over > 0;
				const more = index === 0 && self.perks.has("s1-dark") || index === 1 && self.perks.has("s2-dark") ? PERKS$24.charge : 1;
				gain(ability.cost * CHARGE$1.perCrystal * more + (over > 0 ? 0 : BOOKS.charge[index] ?? 0));
			},
			tick(dt) {
				if (treating > 0) {
					treating -= dt;
					treated += dt;
					if (treated >= 1) {
						treated -= 1;
						for (const ally of allies()) fight.heal(ally, TREATMENT.heal / TREATMENT.lasts * (1 + fromTreasure(self, 1, UT$24.script.heals)), self);
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
//#region src/technomagic/sim/heroes/klaus.ts
var CUT_GROUND = {
	blow: indexed("knight", 89289),
	stun: 5
};
var SHIELD_STRIKE = {
	blow: indexed("knight", 136104),
	lasts: 20,
	speed: 500,
	exposed: 1.3
};
var GUARDIAN = {
	lasts: 20,
	taken: .75
};
var VOW = {
	blow: indexed("knight", 16582),
	weak: .8,
	lasts: 8,
	mana: 300
};
/** His own perks' numbers: Shield Strike's stun, Guardian Shield's more (and its P.DMG taken), Vow of Knights' less ATK, and Transcend 5's Dark's guard for every ally (how long, and how long it waits). */
var PERKS$23 = {
	bashStun: 1,
	guardMore: 1.4,
	guardPhysical: .75,
	weaker: .1,
	ward: {
		lasts: 10,
		every: 10,
		defends: 1.2,
		critResist: 200
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Cut Ground's more taken and mana; Shield Strike's crit
* resist and crit chance off the boss; Guardian Shield's more of its guard; Vow of Knights' heal and P.DEF.
*/
var UT$23 = {
	cape: {
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10,
		mana: 400
	},
	determination: {
		critResist: 500,
		crit: [
			120,
			140,
			170,
			210,
			250
		],
		lasts: 10
	},
	insignia: { more: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	mittens: {
		heal: .02,
		defends: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		lasts: 5
	}
};
var art$23 = skillArt("klaus");
var VOW_OF_KNIGHTS = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Vow of Knights",
		about: `Passive. When he blocks he strikes back: the boss hits ${pct(1 - VOW.weak)} less hard for ${VOW.lasts} seconds, and he gains ${VOW.mana} mana.`,
		icon: "🛡️",
		art: art$23(3)
	},
	words: `Upon blocking, deals ${dmg("knight", VOW.blow, bookDmg("klaus", 3))} P.DMG to frontal enemies and decreases ATK of affected targets by ${pct(1 - VOW.weak)} for ${VOW.lasts} sec. Recovers ${VOW.mana} MP after hitting the target. When an ally excluding self takes DMG increases all allies' P.DEF by 20% and P.Crit Resistance by 200 for 5 sec. This effect only activates once every 10 sec.`
};
/** What Guardian Shield gives every hero for a while: shown on each card, with how long it has left. */
var GUARDED$1 = {
	name: "Guardian Shield",
	about: `Takes ${pct(1 - GUARDIAN.taken)} less from the boss.`,
	icon: "✨",
	art: art$23(2)
};
/** What his Transcend 5's Dark gives every ally when another is hit. */
var WARDED$2 = {
	name: "Knight’s Guard",
	about: `P.DEF +${pct(PERKS$23.ward.defends - 1)} and P.Crit Resist +${pct(share$2(PERKS$23.ward.critResist))}.`,
	icon: "🛡️",
	art: art$23(3)
};
var KLAUS = {
	id: "klaus",
	name: "Klaus",
	class: "knight",
	skins: ["Klaus"],
	stats: {
		...CLASS_STATS.knight,
		deals: "physical"
	},
	abilities: [
		{
			name: "Cut Ground",
			about: `A leap and a blow down on the boss that stuns it for ${CUT_GROUND.stun} seconds.`,
			words: `Leaps into the air and deals ${dmg("knight", CUT_GROUND.blow, bookDmg("klaus", 0))} P.DMG to enemies in range, stunning them for ${CUT_GROUND.stun} sec.`,
			icon: "⚔️",
			art: art$23(0),
			move: "slam",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Shield Strike",
			about: `A blow with his shield: for ${SHIELD_STRIKE.lasts} seconds the boss attacks ${pct(share$2(SHIELD_STRIKE.speed))} slower and takes ${pct(SHIELD_STRIKE.exposed - 1)} more.`,
			words: `Deals ${dmg("knight", SHIELD_STRIKE.blow, bookDmg("klaus", 1))} P.DMG proportional to P.DEF to enemies in range and knocks them back. Hit enemies' All DEF and ATK Spd is reduced by ${pct(SHIELD_STRIKE.exposed - 1)} and ${SHIELD_STRIKE.speed} for ${SHIELD_STRIKE.lasts} sec, respectively. Upon blocking an attack, skill cooldown is reduced by 0.5 sec.`,
			icon: "🛡️",
			art: art$23(1),
			move: "bash",
			cooldown: 8,
			cost: 1
		},
		{
			name: "Guardian Shield",
			auto: { keeps: GUARDED$1.name },
			about: `For ${GUARDIAN.lasts} seconds every hero takes ${pct(1 - GUARDIAN.taken)} less from the boss.`,
			words: `All allies' P.DEF is increased for ${GUARDIAN.lasts} sec and P.Crit Resistance is increased by 300, and reduces P.DMG they take by ${pct(1 - GUARDIAN.taken)}..`,
			icon: "✨",
			art: art$23(2),
			move: "guard",
			cooldown: 12,
			cost: 2
		}
	],
	passive: VOW_OF_KNIGHTS,
	treasures: [
		treasure("Cape of Justice", (k) => ({
			words: `[Cut Ground] Increases DMG target receives by ${pct(k(UT$23.cape.takes))} for ${UT$23.cape.lasts} sec, and recovers own Mana by ${UT$23.cape.mana} per every hit enemy.`,
			skill: {
				index: 0,
				mark: {
					name: "Cape of Justice",
					takes: 1 + k(UT$23.cape.takes),
					lasts: UT$23.cape.lasts
				},
				mana: UT$23.cape.mana
			}
		})),
		treasure("Firm Determination", (k) => ({
			words: `[Shield Strike] Reduces All Crit Resistance of the affected enemy by ${UT$23.determination.critResist} and Crit Chance by ${k(UT$23.determination.crit)} for ${UT$23.determination.lasts} sec.`,
			skill: {
				index: 1,
				mark: {
					name: "Firm Determination",
					critTaken: UT$23.determination.critResist,
					crit: -share$2(k(UT$23.determination.crit)),
					lasts: UT$23.determination.lasts
				}
			}
		})),
		treasure("Guardian Knight Insignia", (k) => ({
			words: `[Guardian Shield] Upon activation, removes negative effects on self, and DEF boost is increased by ${pct(k(UT$23.insignia.more))}.`,
			skill: {
				index: 2,
				cleanse: "self"
			}
		})),
		treasure("Mittens", (k) => ({ words: `[Vow of Knights] Upon activation, heals HP by ${pct(UT$23.mittens.heal)} of Max HP, and increases own P.DEF by ${pct(k(UT$23.mittens.defends))} for ${UT$23.mittens.lasts} sec.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cooldown: -2
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s1-dark": { words: "In exchange for 1 additional Mana Cost, the skill has a 100% chance to draw the target in." },
		"s2-light": said({ skill: {
			index: 1,
			mark: {
				name: "Physical Weakness",
				takes: { physical: 1.25 },
				lasts: 10
			}
		} }, ({ skill: { mark } }) => `Target takes ${pct(mark.takes.physical - 1)} increased P.DMG for ${mark.lasts} sec.`),
		"s2-dark": { words: `Stuns the enemy for ${PERKS$23.bashStun} sec.` },
		"s3-light": { words: `DEF boost is increased by ${pct(PERKS$23.guardMore - 1)}.` },
		"s3-dark": { words: `Receives ${pct(1 - PERKS$23.guardPhysical)} reduced P.DMG for the duration.` },
		"s4-light": { words: "Casting time is greatly boosted." },
		"s4-dark": { words: `Reduces an additional ${pct(PERKS$23.weaker)} of ATK.` },
		"t5-light": t5Light({ blockPhysical: 200 }, ({ blockPhysical }) => `P.Block +${blockPhysical}`),
		"t5-dark": { words: `When an ally other than this hero is hit by an attack, increases all allies' P.DEF by ${pct(PERKS$23.ward.defends - 1)} and P.Crit Resist by ${pct(share$2(PERKS$23.ward.critResist))} (${PERKS$23.ward.every} sec Cooldown).` }
	},
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
		/** Until his Transcend 5's Dark may guard every ally again. */
		let warding = 0;
		return {
			lands: {
				swing() {
					fight.hit(self, fight.basic);
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
					fight.slow(SHIELD_STRIKE.speed, SHIELD_STRIKE.lasts);
					if (self.perks.has("s2-dark")) fight.stun(PERKS$23.bashStun, { by: self });
				},
				guard() {
					const more = (self.perks.has("s3-light") ? PERKS$23.guardMore : 1) * (1 + fromTreasure(self, 2, UT$23.insignia.more));
					const taken = Math.max(0, 1 - (1 - GUARDIAN.taken) * more);
					put(fight.party, {
						name: GUARDED$1.name,
						left: GUARDIAN.lasts,
						takes: self.perks.has("s3-dark") ? {
							physical: taken * PERKS$23.guardPhysical,
							magical: taken
						} : taken,
						shown: GUARDED$1
					});
				}
			},
			blocked() {
				fight.cue(self, "vow");
				fight.hit(self, VOW.blow);
				put(fight.foe.statuses, {
					name: "Weakened",
					left: VOW.lasts,
					deals: VOW.weak - (self.perks.has("s4-dark") ? PERKS$23.weaker : 0),
					shown: "slow"
				});
				self.mana = Math.min(MAX_MANA, self.mana + VOW.mana);
				if (treasureTier(self, 3) > 0) {
					fight.heal(self, UT$23.mittens.heal * self.stats.hp);
					put(self.statuses, {
						name: "Mittens",
						left: UT$23.mittens.lasts,
						defends: { physical: 1 + fromTreasure(self, 3, UT$23.mittens.defends) },
						shown: {
							name: "Mittens",
							about: `P.DEF +${pct(fromTreasure(self, 3, UT$23.mittens.defends))}.`,
							icon: "🧤",
							art: art$23(3)
						}
					});
				}
			},
			tick(dt) {
				warding = Math.max(0, warding - dt);
			},
			hurt(who) {
				if (!self.perks.has("t5-dark") || who === self || warding > 0 || self.hp <= 0) return;
				warding = PERKS$23.ward.every;
				put(fight.party, {
					name: WARDED$2.name,
					left: PERKS$23.ward.lasts,
					defends: { physical: PERKS$23.ward.defends },
					critResist: { physical: PERKS$23.ward.critResist },
					shown: WARDED$2
				});
			}
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/ezekiel.ts
var CLAW$1 = {
	blow: BLOW * 1.2,
	fury: 2
};
var INSTINCT = {
	swipe: indexed("assassin", 130014),
	strike: indexed("assassin", 168860),
	down: 3,
	fury: 1.5,
	cost: .15
};
var DESPAIR = {
	blow: indexed("assassin", 270214),
	speed: 300,
	slowed: 5,
	stun: 3,
	lasts: 10,
	cost: .1
};
var DOOM = {
	blow: indexed("assassin", 294746),
	stun: 3,
	fury: 3,
	cost: .2
};
var CURSED = {
	most: 3,
	blow: indexed("assassin", 220255),
	down: 3,
	lasts: 10,
	atk: .3
};
/** His own perks' numbers: Destructive Instinct's Dark's ATK after it (how long), Fury's more Heal Rate, and less taken for each stack of Cursed Blood. */
var PERKS$22 = {
	atk: 1.4,
	atkFor: 5,
	heals: 1.5,
	taken: .12
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Destructive Instinct's heal and more M.DMG taken; Dawning
* Despair's attack speed (points); Strike of Doom's DMG and its Cursed Blood more; the Cursed Blood he begins with, and his
* more DMG to the boss in Fury.
*/
var UT$22 = {
	belt: {
		heal: .15,
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	},
	choker: {
		speed: [
			120,
			140,
			170,
			210,
			250
		],
		lasts: 10
	},
	binds: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		stacks: 1
	},
	sculpture: {
		stacks: 2,
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	}
};
var art$22 = skillArt("ezekiel");
var CURSED_BLOOD = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Cursed Blood",
		about: `Passive. A stack of [Cursed Blood] for each skill he uses; at the ${nth(CURSED.most)}, his skills are ready again, a burst knocks the boss down, and he is in [Fury] for ${CURSED.lasts} seconds: ATK higher, his attack ${times(CLAW$1.fury)} as hard, every skill reinforced (each costs a share of his health), fighting by himself.`,
		icon: "🩸",
		art: art$22(3)
	},
	words: `Ezekiel gains 1 stack of 'Cursed Blood' at the end of skill. Upon the ${nth(CURSED.most)} stack, consumes Cursed Blood to reset all skill cooldown, dealing ${dmg("assassin", CURSED.blow, bookDmg("ezekiel", 3))} M.DMG to nearby enemies and knocking them down for ${CURSED.down} sec, while activating Fury for ${CURSED.lasts} sec, that cannot be dispelled. While in Fury state, goes into an auto-battle mode that cannot be controlled, and ATK is increased by ${pct(CURSED.atk)}, auto attack DMG is ${fold(CLAW$1.fury)}, and all Skill effect are reinforced. Cannot gain Cursed Blood during Fury state, except for when killing an enemy.`
};
/** His stacks of Cursed Blood: shown beside his passive, with how many he has. */
var STACKED = {
	name: "Cursed Blood",
	about: `At ${CURSED.most}, he is in [Fury].`,
	icon: "🩸"
};
/** Fury: shown on his card, with how long it has left. */
var FURY = {
	name: "Fury",
	about: `ATK ${pct(CURSED.atk)} higher, his attack ${times(CLAW$1.fury)} as hard, every skill reinforced (each costs a share of his health); he fights by himself.`,
	icon: "😈",
	art: art$22(3)
};
/** What Dawning Despair in Fury gives him for a while. */
var QUICKENED$1 = {
	name: "Dawning Despair",
	about: "His attacks quickened.",
	icon: "💨",
	art: art$22(1)
};
/** What Destructive Instinct's Dark gives him after it. */
var INSTINCT_UP = {
	name: "Destructive Instinct",
	about: `ATK ${pct(PERKS$22.atk - 1)} higher.`,
	icon: "🌀",
	art: art$22(0)
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
			about: `A swipe of his demon arm, then a blow to the ground that knocks the boss down for ${INSTINCT.down} seconds. In [Fury]: both ${pct(INSTINCT.fury - 1)} harder, for ${pct(INSTINCT.cost)} of the health he has.`,
			words: `Swipes nearby enemies in a circular range and deals ${dmg("assassin", INSTINCT.swipe, bookDmg("ezekiel", 0))} M.DMG. Then strikes the ground, dealing ${dmg("assassin", INSTINCT.strike, bookDmg("ezekiel", 0))} M.DMG and knocking down enemies for ${INSTINCT.down} sec. [Fury] - Consumes ${pct(INSTINCT.cost)} of current HP to activate. Effect range increases and swipe attack draws in enemies.`,
			icon: "🌀",
			art: art$22(0),
			move: "instinct",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Dawning Despair",
			about: `A dash and a blow: the boss’s attacks ${pct(share$2(DESPAIR.speed))} slower for ${DESPAIR.slowed} seconds. In [Fury]: it is also stunned for ${DESPAIR.stun} seconds, and his attacks are ${pct(share$2(DESPAIR.speed))} quicker for ${DESPAIR.lasts}, for ${pct(DESPAIR.cost)} of the health he has.`,
			words: `Dashes to an enemy with the highest ATK and deals ${dmg("assassin", DESPAIR.blow, bookDmg("ezekiel", 1))} M.DMG to enemies in range, reducing their ATK Spd by ${DESPAIR.speed}. [Fury] - Consumes ${pct(DESPAIR.cost)} of current HP to activate. Effect range increases, Stuns target for ${DESPAIR.stun} sec, and increases own ATK Spd by ${DESPAIR.speed} for ${DESPAIR.lasts} sec.`,
			icon: "💨",
			art: art$22(1),
			move: "despair",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Strike of Doom",
			about: `A charged blow that stuns the boss for ${DOOM.stun} seconds. In [Fury]: ${times(DOOM.fury)} as hard, for ${pct(DOOM.cost)} of the health he has.`,
			words: `Charges energy and attacks target enemy, dealing ${dmg("assassin", DOOM.blow, bookDmg("ezekiel", 2))} M.DMG and inflicting Stun for ${DOOM.stun} sec. Ignores target's DMG Reduction effects. [Fury] - Consumes ${pct(DOOM.cost)} of current HP to activate. Attacks enemies in range of target and DMG is ${fold(DOOM.fury)}.`,
			icon: "💥",
			art: art$22(2),
			move: "doom",
			cooldown: 7,
			cost: 2
		}
	],
	passive: CURSED_BLOOD,
	treasures: [
		treasure("Wild Beast’s Leather Belt", (k) => ({
			words: `[Destructive Instinct] Upon use, heals own HP by ${pct(UT$22.belt.heal)}, and for ${UT$22.belt.lasts} sec, increases M.DMG target receives by ${pct(k(UT$22.belt.takes))}.`,
			skill: {
				index: 0,
				heal: UT$22.belt.heal,
				mark: {
					name: "Wild Beast’s Leather Belt",
					takes: { magical: 1 + k(UT$22.belt.takes) },
					lasts: UT$22.belt.lasts
				}
			}
		})),
		treasure("Wild Beast’s Choker", (k) => ({
			words: `[Dawning Despair] Gains Immunity to CC for the skill's duration and increases ATK Spd by ${k(UT$22.choker.speed)} for ${UT$22.choker.lasts} sec.`,
			skill: {
				index: 1,
				steady: true,
				self: {
					name: "Wild Beast’s Choker",
					lasts: UT$22.choker.lasts,
					pace: 1 + share$2(k(UT$22.choker.speed))
				}
			}
		})),
		treasure("Sealing Binds", (k) => ({
			words: `[Strike of Doom] DMG is increased by ${pct(k(UT$22.binds.dmg))} and gains ${UT$22.binds.stacks} additional stack of Cursed Blood after using the skill.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$22.binds.dmg)
			}
		})),
		treasure("Sculpture of Blood", (k) => ({ words: `[Cursed Blood] At the beginning of first battle, Ezekiel gains ${UT$22.sculpture.stacks} stacks of Cursed Blood. While under Fury, DMG dealt to bosses increases by ${pct(k(UT$22.sculpture.dmg))}.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s1-dark": { words: `After activation, ATK is increased by ${pct(PERKS$22.atk - 1)} for ${PERKS$22.atkFor} sec.` },
		"s2-light": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s2-dark": { words: "When activated during Fury state, ignores target DEF." },
		"s3-light": { words: "Becomes immune to CC during activation." },
		"s3-dark": said({ skill: {
			index: 2,
			dmg: 2
		} }, ({ skill }) => `If there is 1 enemy, DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s4-light": { words: `When in Fury state, heal rate is increased by ${pct(PERKS$22.heals - 1)}.` },
		"s4-dark": { words: `Per every stacked 'Cursed Blood', takes ${pct(PERKS$22.taken)} reduced DMG.` },
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK Spd +${speed}`),
		"t5-dark": { words: "When in Fury state, auto attack deals DMG that ignores DEF." }
	},
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
		let stacks = treasureTier(self, 3) > 0 ? UT$22.sculpture.stacks : 0;
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
				...self.perks.has("s4-light") && { heals: PERKS$22.heals },
				...tier === null ? {} : {
					critDamage: atTier(BARBATOS.critDamage, tier),
					resist: atTier(BARBATOS.resist, tier)
				},
				shown: FURY
			});
		};
		/** A blow of his attack (twice as hard in Fury; and with Transcend 5's Dark, through the boss's defense). */
		const claw = () => {
			fight.hit(self, fight.basic * (fury > 0 ? CLAW$1.fury : 1), true, 0, fury > 0 && self.perks.has("t5-dark"));
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
					if (self.perks.has("s1-dark")) put(self.statuses, {
						name: INSTINCT_UP.name,
						left: PERKS$22.atkFor,
						deals: PERKS$22.atk,
						shown: INSTINCT_UP
					});
				},
				despair() {
					fight.hit(self, DESPAIR.blow, true, 0, furious.despair && self.perks.has("s2-dark"));
					fight.slow(DESPAIR.speed, DESPAIR.slowed);
					if (!furious.despair) return;
					fight.stun(DESPAIR.stun, { by: self });
					put(self.statuses, {
						name: QUICKENED$1.name,
						left: DESPAIR.lasts,
						pace: 1 + share$2(DESPAIR.speed),
						shown: QUICKENED$1
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
				stacks += 1 + (move === "doom" && treasureTier(self, 2) > 0 ? UT$22.binds.stacks : 0);
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
			takes: () => self.perks.has("s4-dark") ? 1 - PERKS$22.taken * stacks : 1,
			deals: () => fury > 0 ? 1 + fromTreasure(self, 3, UT$22.sculpture.dmg) : 1,
			guards: () => self.doing?.move === "doom" && self.perks.has("s3-light"),
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
var LIGHT = {
	heal: 612050,
	near: 3.6,
	blast: 24050
};
var BLESSING$1 = {
	shield: 623630,
	lasts: 10,
	allies: 4,
	speed: 500
};
var VENGEANCE = {
	hits: CODED.vengeance.lands.length,
	blow: 4810,
	pierce: 500,
	exposed: .1,
	most: 5,
	lasts: 20,
	stun: .5
};
var TAINTED = {
	taken: 1.15,
	mana: .6 * SECTION,
	every: 1,
	most: 2
};
/**
* Her own perks' numbers: what Light of Doom leaves on the boss and its more healing, Blessing of Doom's block, the
* Blessing of the Fallen Angel's and the Bond's (attack speed in points, ATK a share of hers), and Transcend 5's Dark's.
*/
var PERKS$21 = {
	light: {
		takes: 1.2,
		lasts: 10,
		heals: 2
	},
	block: 400,
	blessing: {
		takes: .9,
		defends: 1.2
	},
	bond: {
		speed: 200,
		atk: .07
	},
	favour: {
		speed: 150,
		deals: 1.15,
		lasts: 30
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Light of Doom's more healing and DMG; Blessing of Doom's
* longer shield and its ATK; Heaven's Vengeance's DMG; Tainted Angel's faster mana and every ally's ATK (three times
* as much for Dark Lord Kasel).
*/
var UT$21 = {
	faith: { more: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	egg: {
		longer: [
			4,
			5,
			6,
			7,
			8
		],
		atk: .3
	},
	dream: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	allure: {
		mana: .5,
		atk: [
			.1,
			.12,
			.14,
			.17,
			.2
		],
		kasel: 3
	}
};
/** What Ring of Allure gives Dark Lord Kasel on top of what every ally has of it, while she is on the field and standing. */
var ALLURED = "Ring of Allure";
var art$21 = skillArt("fallen-frey");
var TAINTED_ANGEL = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: TAINTED.taken,
	shown: {
		name: "Tainted Angel",
		about: `Passive. She takes ${pct(TAINTED.taken - 1)} more from the boss, but her mana fills far faster; at full mana she gains [Darkened Power] every second (${TAINTED.most} at most).`,
		icon: "🌑",
		art: art$21(3)
	},
	words: `As Fallen Frey has been corrupted by the darkness, she takes ${pct(TAINTED.taken - 1)} increased DMG, but she recovers ${TAINTED.mana} Mana every sec, and when her Mana is at 100%, she gains [Darkened Power] every sec. [Darkened Power] can be stacked up to max ${TAINTED.most} times and is irremovable.`
};
/** What her full mana gives her: shown beside her passive, with how many she has. */
var DARKENED$1 = {
	name: "Darkened Power",
	about: "Her next skill spends one: [Heaven’s Vengeance] then stuns the boss with every blow.",
	icon: "🖤"
};
/** What Blessing of Doom gives each ally it shields: shown on its card, with how long it has left. */
var BLESSED$1 = {
	name: "Blessing of Doom",
	about: "A shield takes the boss’s blows first, and its attacks are quickened.",
	icon: "🔮",
	art: art$21(1)
};
/** What Heaven's Vengeance leaves on the boss. */
var EXPOSED$3 = "Heaven’s Vengeance";
/** What her perks give her allies as the fight begins: Light of Doom's Light's mark on the boss, and the rest each ally's square. */
var PURIFIED = "Light of Doom";
var FALLEN_BLESSING = {
	name: "Blessing of the Fallen Angel",
	about: `Takes ${pct(1 - PERKS$21.blessing.takes)} less, and its DEF is ${pct(PERKS$21.blessing.defends - 1)} higher.`,
	icon: "🪽",
	art: art$21(3)
};
var FALLEN_BOND = {
	name: "Bond of the Fallen Angel",
	about: `Quicker, and its ATK higher by ${pct(PERKS$21.bond.atk)} of Fallen Frey’s.`,
	icon: "🔗",
	art: art$21(3)
};
var FALLEN_FAVOUR = {
	name: "Fallen Angel’s Favour",
	about: `Quicker, and deals ${pct(PERKS$21.favour.deals - 1)} more to the boss.`,
	icon: "🌒",
	art: art$21(3)
};
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
			auto: { heals: true },
			about: "Heals the ally with the lowest health and those near it, then the light bursts on the boss.",
			words: `Heals ${healed("priest", LIGHT.heal, bookHeal("fallen-frey", 0))} HP of the ally with the lowest HP and nearby allies and increases Heal Rate by 20% for 10 sec. Afterward, explodes the area around the target and deals ${dmg("priest", LIGHT.blast, bookDmg("fallen-frey", 0))} M.DMG to enemies in range, reducing their Heal Rate by 20% for 10 sec. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack and dispels positive effects of all enemies within range.`,
			icon: "✴️",
			art: art$21(0),
			move: "light",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Blessing of Doom",
			about: `A shield on the ${BLESSING$1.allies} allies with the lowest health for ${BLESSING$1.lasts} seconds, their attacks ${pct(share$2(BLESSING$1.speed))} quicker meanwhile.`,
			words: `Grants [Blessing of Doom] to ${BLESSING$1.allies} allies with the lowest HP, absorbing ${healed("priest", BLESSING$1.shield, bookHeal("fallen-frey", 1))} DMG for ${BLESSING$1.lasts} sec. The shield grants immunity to CC and increases ATK Spd by ${BLESSING$1.speed} for the duration. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack to dispel negative effects from self and additionally dispels negative effects from targets.`,
			icon: "🔮",
			art: art$21(1),
			move: "blessing",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Heaven’s Vengeance",
			about: `${VENGEANCE.hits} blows of light on the boss, through some of its defense, each leaving it ${pct(VENGEANCE.exposed)} easier to hurt for ${VENGEANCE.lasts} seconds (up to ${VENGEANCE.most} times over). With [Darkened Power], every blow stuns it for ${VENGEANCE.stun} seconds.`,
			words: `Brings Heaven's Vengeance upon a random enemy and nearby enemies over ${VENGEANCE.hits} hits, dealing ${dmg("priest", VENGEANCE.blow, bookDmg("fallen-frey", 2))} M.DMG each hit and increasing All DMG the target takes by ${pct(VENGEANCE.exposed)} for ${VENGEANCE.lasts} sec. ${VENGEANCE.pierce} additional DEF Penetration applies to this Skill. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack and inflicts Stun on the hit enemies for ${VENGEANCE.stun} sec each hit. The DMG Boost effect can be stacked up to max ${VENGEANCE.most} times.`,
			icon: "☄️",
			art: art$21(2),
			move: "vengeance",
			cooldown: 22,
			cost: 5
		}
	],
	passive: TAINTED_ANGEL,
	treasures: [
		treasure("Shattered Faith", (k) => ({
			words: `[Light of Doom] Increases Heal Rate and DMG by ${pct(k(UT$21.faith.more))}. The Heal Rate Boost and Reduction effect become irremovable.`,
			skill: {
				index: 0,
				dmg: 1 + k(UT$21.faith.more),
				heals: 1 + k(UT$21.faith.more)
			}
		})),
		treasure("Broken Angel’s Egg", (k) => ({ words: `[Blessing of Doom] Increases the duration of shield by ${k(UT$21.egg.longer)} sec and ATK of targets by ${pct(UT$21.egg.atk)} for the duration of shield.` })),
		treasure("Blossomed Dream", (k) => ({
			words: `[Heaven's Vengeance] Increases DMG by ${pct(k(UT$21.dream.dmg))} and gains immunity to CC while in use.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$21.dream.dmg),
				steady: true
			}
		})),
		treasure("Ring of Allure", (k) => ({
			words: `[Tainted Angel] Increases Mana Recovery per sec by ${pct(UT$21.allure.mana)} and ATK of all allies by ${pct(k(UT$21.allure.atk))}. If the target is [Dark Lord Kasel], the ATK Boost effect multiplies by ${UT$21.allure.kasel} times.`,
			allies: { atk: {
				first: k(UT$21.allure.atk),
				again: k(UT$21.allure.atk)
			} }
		}))
	],
	perks: {
		"s1-light": { words: `Increases All DMG the hit enemies take by ${pct(PERKS$21.light.takes - 1)} for ${PERKS$21.light.lasts} sec.` },
		"s1-dark": said({ skill: {
			index: 0,
			cost: 1
		} }, ({ skill }) => `Increases Mana Cost by ${skill.cost} and Heal Rate by ${pct(PERKS$21.light.heals - 1)}.`),
		"s2-light": { words: "Changes the target of shield to all allies." },
		"s2-dark": { words: `Increases All Block Chance of shielded allies by ${PERKS$21.block}.` },
		"s3-light": said({ skill: {
			index: 2,
			dmg: 1.4
		} }, ({ skill }) => `Increases DMG by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: "Each hit reduces Mana by 200." },
		"s4-light": { words: `At the beginning of the first battle, grants [Blessing of the Fallen Angel] to all allies excluding self, reducing All DMG the targets take by ${pct(1 - PERKS$21.blessing.takes)} and increasing All DEF by ${pct(PERKS$21.blessing.defends - 1)}. The [Blessing of the Fallen Angel] effect is irremovable.` },
		"s4-dark": { words: `At the beginning of the first battle, grants [Bond of the Fallen Angel] to 1 ally with the highest ATK excluding self, increasing the target's ATK Spd by ${PERKS$21.bond.speed} and ATK equal to ${pct(PERKS$21.bond.atk)} of Fallen Frey's ATK. The [Bond of the Fallen Angel] effect is irremovable.` },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": { words: `At the beginning of each battle, increases ATK Spd of the ally with the highest ATK excluding self by ${PERKS$21.favour.speed} and its DMG dealt to Non-Hero enemies by ${pct(PERKS$21.favour.deals - 1)} for ${PERKS$21.favour.lasts} sec. This effect is irremovable.` }
	},
	attack: "smite",
	timing: { skills: {
		light: {
			lands: [.95, 1.45],
			until: 2.35
		},
		vengeance: {
			lands: Array.from({ length: VENGEANCE.hits }, (_, i) => (.7 + i * .12) * SKILL_SPEED),
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
		const others = fight.fighters.filter((ally) => ally !== self);
		const strongest = others.reduce((best, ally) => !best || ally.stats.atk > best.stats.atk ? ally : best, null);
		if (self.perks.has("s4-light")) for (const ally of others) put(ally.statuses, {
			name: FALLEN_BLESSING.name,
			left: Infinity,
			takes: PERKS$21.blessing.takes,
			defends: PERKS$21.blessing.defends,
			shown: FALLEN_BLESSING
		});
		if (strongest && self.perks.has("s4-dark")) {
			strongest.stats.atk += PERKS$21.bond.atk * self.stats.atk;
			put(strongest.statuses, {
				name: FALLEN_BOND.name,
				left: Infinity,
				pace: 1 + share$2(PERKS$21.bond.speed),
				shown: FALLEN_BOND
			});
		}
		if (strongest && self.perks.has("t5-dark")) put(strongest.statuses, {
			name: FALLEN_FAVOUR.name,
			left: PERKS$21.favour.lasts,
			pace: 1 + share$2(PERKS$21.favour.speed),
			deals: PERKS$21.favour.deals,
			shown: FALLEN_FAVOUR
		});
		const allure = fromTreasure(self, 3, UT$21.allure.atk);
		const kasel = allure > 0 ? others.find((ally) => ally.id === "dark-lord-kasel") : void 0;
		const allured = {
			name: ALLURED,
			about: `ATK ${pct(allure * UT$21.allure.kasel)} higher while Fallen Frey is on the field.`,
			icon: "💍",
			art: art$21(3)
		};
		return {
			lands: {
				smite() {
					fight.hit(self, fight.basic);
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
						for (const ally of near) fight.heal(ally, LIGHT.heal * (self.perks.has("s1-dark") ? PERKS$21.light.heals : 1), self);
						return;
					}
					fight.hit(self, LIGHT.blast);
					if (self.perks.has("s1-light")) put(fight.foe.statuses, {
						name: PURIFIED,
						left: PERKS$21.light.lasts,
						takes: PERKS$21.light.takes,
						shown: "curse"
					});
				},
				blessing() {
					spend();
					const allies = self.perks.has("s2-light") ? weakest() : weakest().slice(0, BLESSING$1.allies);
					const block = self.perks.has("s2-dark") ? { blocks: {
						physical: PERKS$21.block,
						magical: PERKS$21.block
					} } : {};
					fight.cue(self, "blessing", allies);
					const lasts = BLESSING$1.lasts + fromTreasure(self, 1, UT$21.egg.longer);
					const egg = treasureTier(self, 1) > 0 ? { deals: 1 + UT$21.egg.atk } : {};
					for (const ally of allies) {
						fight.shield(ally, BLESSING$1.shield, lasts, self);
						put(ally.statuses, {
							name: BLESSED$1.name,
							left: lasts,
							pace: 1 + share$2(BLESSING$1.speed),
							...block,
							...egg,
							shown: BLESSED$1
						});
					}
				},
				vengeance(part) {
					if (part === 0) empowered = spend();
					fight.hit(self, VENGEANCE.blow, true, VENGEANCE.pierce);
					exposed = fight.foe.statuses.some((status) => status.name === EXPOSED$3) ? Math.min(VENGEANCE.most, exposed + 1) : 1;
					put(fight.foe.statuses, {
						name: EXPOSED$3,
						left: VENGEANCE.lasts,
						takes: 1 + VENGEANCE.exposed * exposed,
						shown: "curse"
					});
					if (empowered) fight.stun(VENGEANCE.stun, { by: self });
				}
			},
			tick(dt) {
				self.mana = Math.min(MAX_MANA, self.mana + TAINTED.mana * (treasureTier(self, 3) > 0 ? 1 + UT$21.allure.mana : 1) * dt);
				if (kasel) {
					const there = self.hp > 0 && fight.field.includes(self);
					const on = kasel.statuses.some((status) => status.name === ALLURED);
					if (there && !on) put(kasel.statuses, {
						name: ALLURED,
						left: Infinity,
						deals: (1 + allure * UT$21.allure.kasel) / (1 + allure),
						shown: allured
					});
					else if (!there && on) kasel.statuses = kasel.statuses.filter((status) => status.name !== ALLURED);
				}
				if (self.mana >= 6e3 && stacks < TAINTED.most) {
					darkening += dt;
					if (darkening >= TAINTED.every) {
						darkening -= TAINTED.every;
						stacks++;
					}
				} else darkening = 0;
			},
			lit: () => stacks > 0,
			ripe: (index) => index !== 2 || stacks > 0,
			buffs: () => stacks > 0 ? [{
				...DARKENED$1,
				count: stacks
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/gremory.ts
var POCHI = {
	bite: 5650,
	boss: 3770,
	more: .15,
	bossMore: .3,
	weaker: .06,
	most: 5,
	lasts: 15
};
var PUCHI = {
	blow: 21980,
	stun: 5
};
var PIPPI = {
	blow: 4710,
	through: 3140,
	pierce: 500,
	takes: .05,
	most: 10,
	lasts: 12
};
var SLEEP = { taken: .6 };
var CHARGE = {
	most: 5,
	atk: .1,
	dmg: .05
};
/** Her own perks' numbers: Pochi's Mark's less M.DEF for each, and her sleep's more less taken. */
var PERKS$20 = {
	softer: .06,
	sleepier: 1.2
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Pochi's DMG and its mark's less healing (for each); Puchi's
* CC ACC (points, a moment: as long as its blow takes to land) and what it dispels; Pippi's longer mark and more M.DMG
* taken (for each); her sleep's more less taken and her Mana Charge's crit DMG (for each).
*/
var UT$20 = {
	pillow: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		heals: .06
	},
	treats: {
		accuracy: [
			360,
			430,
			520,
			630,
			750
		],
		lasts: 2
	},
	cage: {
		longer: 8,
		takes: [
			.014,
			.018,
			.022,
			.026,
			.03
		]
	},
	fruit: {
		sleepier: 1.2,
		critDamage: [
			.048,
			.058,
			.07,
			.084,
			.1
		]
	}
};
var art$20 = skillArt("gremory");
/** What all three of her slots turn into once her skills are sealed (its picture is the game's for it, where a passive's would be). */
var SLEEP_SKILL = {
	name: "Eh, whatever. I’m gonna sleep.",
	about: `She sleeps for 3 seconds, taking ${pct(1 - SLEEP.taken)} less and not to be knocked down; then her skills are unsealed, and she gains a [Mana Charge] (${CHARGE.most} at most): +${pct(CHARGE.atk)} ATK and +${pct(CHARGE.dmg)} to all she deals for each.`,
	icon: "💤",
	art: art$20(3),
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
		about: `Each of her skills is sealed once used; once all three are, each turns into this. She sleeps a while (taking ${pct(1 - SLEEP.taken)} less and not to be knocked down), then wakes with her skills unsealed and a [Mana Charge].`,
		icon: "💤",
		art: art$20(3)
	},
	words: `Available once all Skills are sealed. Upon use, dispels CC effects from self. While in use, Gremory gains immunity to CC, takes ${pct(1 - SLEEP.taken)} reduced All DMG, and unlocks all of her sealed Skills. Every time she uses [Eh, whatever. I'm gonna sleep.], she gains a [Mana Charge] stack. Each [Mana Charge] stack increases Gremory's DMG dealt to enemies by ${pct(CHARGE.dmg)} and her ATK by ${pct(CHARGE.atk)}. [Mana Charge] can be stacked up to max ${CHARGE.most} times and is irremovable.`,
	tag: "Once all are sealed"
};
/** Asleep: shown on her card, with how long it has left. */
var SLEEPING = {
	name: "Asleep",
	about: `Takes ${pct(1 - SLEEP.taken)} less from the boss, and can’t be knocked down.`,
	icon: "💤",
	art: art$20(3)
};
/** Her Mana Charge: shown on her card, with how many she has. */
var CHARGED = {
	name: "Mana Charge",
	about: `Each: +${pct(CHARGE.atk)} ATK and +${pct(CHARGE.dmg)} to all she deals; [Pochi, bite them!] hits harder for each.`,
	icon: "🔋"
};
/** How many times each of her skills strikes (its move's blows). */
var BITES = CODED.pochi.lands.length;
var WRAPS = CODED.pippi.lands.length;
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
			about: `${BITES} bites, each harder for her [Mana Charge], each leaving [Pochi’s Mark]: the boss hits ${pct(POCHI.weaker)} softer for each, for ${POCHI.lasts} seconds (up to ${POCHI.most}). Sealed once used.`,
			words: `Attacks an enemy ${BITES} times, dealing ${dmg("assassin", POCHI.bite, bookDmg("gremory", 0))} M.DMG and inflicting [Pochi's Mark] each hit. The M.DMG of each hit increases by ${pct(POCHI.more)} per every stack of [Mana Charge]. [Pochi's Mark] reduces target's ATK by ${pct(POCHI.weaker)} for ${POCHI.lasts} sec, and it can be stacked up to max ${POCHI.most} times. If the target is a Boss, each hit deals additional ${dmg("assassin", POCHI.boss, bookDmg("gremory", 0))} M.DMG. The additional M.DMG increases by ${pct(POCHI.bossMore)} per every stack of [Mana Charge]. This skill is sealed after use.`,
			tag: "Sealed after use",
			icon: "🐶",
			art: art$20(0),
			move: "pochi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Puchi, knock them away!",
			about: `A blow from behind that stuns the boss for ${PUCHI.stun} seconds. Sealed once used.`,
			words: `Attacks the farthest enemy from behind, dealing ${dmg("assassin", PUCHI.blow, bookDmg("gremory", 1))} M.DMG. Afterward, inflicts Stun for ${PUCHI.stun} sec and [Puchi's Mark] on the target. This skill is sealed after use.`,
			tag: "Sealed after use",
			icon: "💥",
			art: art$20(1),
			move: "puchi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Pippi, wrap them!",
			about: `${WRAPS} blows, each leaving [Pippi’s Mark]: the boss takes ${pct(PIPPI.takes)} more magical damage for each, for ${PIPPI.lasts} seconds (up to ${PIPPI.most}). With all ${PIPPI.most} on it, each blow deals more, through its defense. Sealed once used.`,
			words: `Deals a total of ${dmg("assassin", PIPPI.blow * WRAPS, bookDmg("gremory", 2))} M.DMG over ${WRAPS} times to the target and enemies within a large area around the target, inflicting [Pippi's Mark] on hit targets each hit. If this skill deals DMG to a target inflicted with ${PIPPI.most} stacks of [Pippi's Mark], each hit deals additional ${dmg("assassin", PIPPI.through, bookDmg("gremory", 2))} M.DMG that ignores DEF. [Pippi's Mark] increases M.DMG the target takes by ${pct(PIPPI.takes)} for ${PIPPI.lasts} sec, and it can be stacked up to max ${PIPPI.most} times. This skill is sealed after use.`,
			tag: "Sealed after use",
			icon: "🎀",
			art: art$20(2),
			move: "pippi",
			cooldown: 0,
			cost: 4
		}
	],
	passive: LAZY,
	treasures: [
		treasure("Fluffy Pillow", (k) => ({
			words: `[Pochi, bite them!] Increases DMG by ${pct(k(UT$20.pillow.dmg))}, and [Pochi's Mark] additionally reduces Heal Rate by ${pct(UT$20.pillow.heals)}.`,
			skill: {
				index: 0,
				dmg: 1 + k(UT$20.pillow.dmg)
			}
		})),
		treasure("Yum Yum Treats", (k) => ({
			words: `[Puchi, Knock them away!] Increases CC Acc by ${k(UT$20.treats.accuracy)} for the duration of Skill, and dispels positive effects from the target.`,
			skill: {
				index: 1,
				dispel: true,
				self: {
					name: "Yum Yum Treats",
					lasts: UT$20.treats.lasts,
					accuracy: k(UT$20.treats.accuracy)
				}
			}
		})),
		treasure("Carrier Cage", (k) => ({ words: `[Pippi, wrap them!] Increases the duration of [Pippi's Mark] by ${UT$20.cage.longer} sec and M.DMG Boost effect by ${Math.round(k(UT$20.cage.takes) * 1e3) / 10}%.` })),
		treasure("Sinful Fruit: Hot & Spicy", (k) => ({ words: `[Eh, whatever. I'm gonna sleep.] Increases the DMG Reduction effect by ${pct(UT$20.fruit.sleepier - 1)} for the duration of Skill, and [Mana Charge] additionally increases Crit DMG by ${Math.round(k(UT$20.fruit.critDamage) * 1e3) / 10}%.` }))
	],
	perks: {
		"s1-light": { words: "When there is 1 enemy, additional M.DMG dealt to bosses ignores DEF." },
		"s1-dark": { words: `[Pochi's Mark] additionally reduces M.DEF by ${pct(PERKS$20.softer)}.` },
		"s2-light": { words: "The M.Block Chance Reduction effect of [Puchi's Mark] will fix the M.Block Chance to 0 instead." },
		"s2-dark": { words: "Knocks the target away instead of inflicting Stun." },
		"s3-light": said({ skill: {
			index: 2,
			cost: -1
		} }, ({ skill }) => `Reduces Mana Cost by ${-skill.cost}.`),
		"s3-dark": said({ skill: {
			index: 2,
			cost: 1,
			dmg: 2
		} }, ({ skill }) => `Increases Mana Cost by ${skill.cost} and DMG by ${pct(skill.dmg - 1)}.`),
		"s4-light": { words: `Increases All DMG Reduction effect by ${pct(PERKS$20.sleepier - 1)} while in use.` },
		"s4-dark": { words: "At the beginning of each battle, [Eh, whatever. I'm gonna sleep.] becomes activated." },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": said({ dmg: 1.5 }, ({ dmg }) => `Increases DMG dealt to Non-Hero enemies by ${pct(dmg - 1)} when there is 1 enemy.`)
	},
	attack: "nudge",
	join(fight, self) {
		/** Which of her skills are sealed; her Mana Charge; and how long her unique weapon is filling her mana for yet. */
		const sealed = self.abilities.map(() => self.perks.has("s4-dark"));
		let charges = 0;
		let filling = 0;
		const tier = self.unique?.tier ?? null;
		return {
			lands: {
				nudge() {
					fight.hit(self, fight.basic);
				},
				pochi() {
					const bite = POCHI.bite * (1 + POCHI.more * charges);
					const boss = POCHI.boss * (1 + POCHI.bossMore * charges);
					if (self.perks.has("s1-light")) {
						fight.hit(self, bite);
						fight.hit(self, boss, false, 0, true);
					} else fight.hit(self, bite + boss);
					const softer = self.perks.has("s1-dark");
					const pillow = treasureTier(self, 0) > 0;
					mark(fight.foe.statuses, POCHI_MARK, POCHI.most, POCHI.lasts, (count) => ({
						deals: 1 - POCHI.weaker * count,
						...softer && { defends: { magical: 1 - PERKS$20.softer * count } },
						...pillow && { heals: Math.max(0, 1 - UT$20.pillow.heals * count) }
					}));
				},
				puchi() {
					fight.hit(self, PUCHI.blow);
					fight.stun(PUCHI.stun, { by: self });
				},
				pippi() {
					const caged = treasureTier(self, 2) > 0;
					const takes = PIPPI.takes + fromTreasure(self, 2, UT$20.cage.takes);
					const count = mark(fight.foe.statuses, PIPPI_MARK, PIPPI.most, PIPPI.lasts + (caged ? UT$20.cage.longer : 0), (stacks) => ({ takes: { magical: 1 + takes * stacks } }));
					fight.hit(self, PIPPI.blow);
					if (count >= PIPPI.most) fight.hit(self, PIPPI.through, false, PIPPI.pierce);
				},
				sleep() {}
			},
			slot(index) {
				if (sealed.every(Boolean)) return SLEEP_SKILL;
				return sealed[index] ? null : self.abilities[index] ?? null;
			},
			used(index, ability) {
				if (ability !== SLEEP_SKILL) {
					sealed[index] = true;
					return;
				}
				sealed.fill(false);
				charges = Math.min(CHARGE.most, charges + 1);
				const fruit = treasureTier(self, 3) > 0;
				const sleepier = (self.perks.has("s4-light") ? PERKS$20.sleepier : 1) * (fruit ? UT$20.fruit.sleepier : 1);
				put(self.statuses, {
					name: SLEEPING.name,
					left: 3,
					takes: Math.max(0, 1 - (1 - SLEEP.taken) * sleepier),
					guards: true,
					shown: SLEEPING
				});
				const atk = CHARGE.atk + (tier === null ? 0 : atTier(PIGRITIA.charge, tier));
				const critDamage = fromTreasure(self, 3, UT$20.fruit.critDamage) * charges;
				put(self.statuses, {
					name: CHARGED.name,
					left: Infinity,
					count: charges,
					deals: (1 + atk * charges) * (1 + CHARGE.dmg * charges),
					...critDamage > 0 && { critDamage },
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
			pace: () => tier === null ? 1 : 1 + share$2(atTier(PIGRITIA.speed, tier)),
			lit: () => sealed.every(Boolean)
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/kirze.ts
var JUDGMENT = {
	cuts: CODED.judgment.lands.length - 1,
	cut: 5010,
	blow: 20040,
	down: 3
};
var HAZE = {
	burst: 30060,
	stun: 2,
	lasts: 15,
	quicker: 1.5,
	every: 2,
	wave: 8350,
	waveStun: 1
};
var FLOWER = {
	line: 26720,
	burst: 40080,
	speed: 200,
	slowed: 5,
	curse: 10,
	end: 20040,
	each: 2670
};
/** Her passive's: her ATK higher, her crit chance (points), and the stuns on a boss longer. */
var DEEDS = {
	atk: .2,
	crit: 200,
	control: .3
};
/** Her own perks' numbers: the shockwave's longer stun, Crimson Flower's stronger slow (points), her DMG while awakened, her opening's (how long, how much), and Transcend 5's Dark's attack speed for each blow (most). */
var PERKS$19 = {
	waveStun: .5,
	slower: 300,
	awakeDmg: 1.2,
	opening: 20,
	openingDmg: 1.25,
	quicker: 5,
	most: 100
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Blade of Judgment's DMG; Crystal Haze's attack speed
* (points) and every ally's penetration; Crimson Flower's shorter cooldown and the chance of 3 stacks more; End to
* Evil Deeds!'s crit chance and its longer stuns.
*/
var UT$19 = {
	lotus: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		cost: -1
	},
	hobby: {
		speed: [
			120,
			140,
			170,
			210,
			250
		],
		pen: 250
	},
	escape: {
		cooldown: .3,
		chance: [
			.48,
			.58,
			.7,
			.84,
			1
		],
		more: 3
	},
	peace: {
		crit: 250,
		control: [
			.32,
			.34,
			.37,
			.41,
			.45
		]
	}
};
var art$19 = skillArt("kirze");
/** Her passive, the game's End to Evil Deeds!: her ATK higher, more of her blows critical, and the stuns on a boss longer. */
var EVIL_DEEDS = {
	attack: 1 + DEEDS.atk,
	crit: share$2(DEEDS.crit),
	control: 1 + DEEDS.control,
	shown: {
		name: "End to Evil Deeds!",
		about: `Passive. Her blows are ${pct(DEEDS.atk)} harder and ${pct(share$2(DEEDS.crit))} more often critical, and her stuns on a boss last ${pct(DEEDS.control)} longer.`,
		icon: "⚜️",
		art: art$19(3)
	},
	words: `Increases own ATK by ${pct(DEEDS.atk)} and Crit Chance by ${DEEDS.crit}, while increasing the duration of CCs that all allies inflict to Bosses by ${pct(DEEDS.control)}`
};
/** What Crystal Haze gives her for a while: shown beside her passive, with how long it has left. */
var AWAKENING$1 = {
	name: "Arcane Crystal Awakening",
	about: `Quickened, and a shockwave goes out from her every ${HAZE.every} seconds.`,
	icon: "💠",
	art: art$19(1)
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
			about: `${JUDGMENT.cuts} cuts as she spins, then a blow that knocks the boss down for ${JUDGMENT.down} seconds.`,
			words: `Deals ${dmg("warrior", JUDGMENT.cut * JUDGMENT.cuts, bookDmg("kirze", 0))} M.DMG over ${JUDGMENT.cuts} attacks to nearby enemies in a circular range of self. Then, attacks frontal enemies in range, dealing ${dmg("warrior", JUDGMENT.blow, bookDmg("kirze", 0))} M.DMG and knocking them down for ${JUDGMENT.down} sec.`,
			icon: "🌀",
			art: art$19(0),
			move: "judgment",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Disperse, Crystal Haze!",
			about: `A burst that stuns the boss for ${HAZE.stun} seconds. Then for ${HAZE.lasts} seconds she is ${pct(HAZE.quicker - 1)} quicker, and a shockwave goes out from her every ${HAZE.every} seconds that stuns it for ${HAZE.waveStun}.`,
			words: `Unleashes the power of Arcane Crystals within to deal ${dmg("warrior", HAZE.burst, bookDmg("kirze", 1))} M.DMG to all enemies and stun them for ${HAZE.stun} sec. Upon casting, activates [Arcane Crystal Awakening] for ${HAZE.lasts} sec, which increases ATK Spd of all allies by 300 and releases a shockwave every ${HAZE.every} sec to enemies in range of self, dealing ${dmg("warrior", HAZE.wave, bookDmg("kirze", 1))} M.DMG and stunning them for ${HAZE.waveStun} sec.`,
			icon: "💠",
			art: art$19(1),
			move: "haze",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Bloom, Crimson Flower!",
			about: `Crystals in a line to the boss, then they burst: its attacks are ${pct(share$2(FLOWER.speed))} slower for ${FLOWER.slowed} seconds, and it is cursed for ${FLOWER.curse}. When the curse ends it bursts, the harder for every blow landed on the boss meanwhile.`,
			words: `Summons Arcane Crystals and deals ${dmg("warrior", FLOWER.line, bookDmg("kirze", 2))} M.DMG to frontal enemies in a straight line. Shortly afterward, causes an explosion that deals ${dmg("warrior", FLOWER.burst, bookDmg("kirze", 2))} additional M.DMG and inflicts [Arcane Crystal Curse] upon enemies for ${FLOWER.slowed} sec, reducing their ATK Spd by ${FLOWER.speed}. Attacking enemies under [Arcane Crystal Curse] inflicts a stack of [Arcane Crystal Energy]. [Arcane Crystal Curse] explodes after ${FLOWER.curse} sec, dealing M.DMG equal to ${dmg("warrior", FLOWER.end, bookDmg("kirze", 2))} + ${dmg("warrior", FLOWER.each, bookDmg("kirze", 2))} per stack of Arcane Crystal Energy.`,
			icon: "🌺",
			art: art$19(2),
			move: "flower",
			cooldown: 20,
			cost: 4
		}
	],
	passive: EVIL_DEEDS,
	treasures: [
		treasure("Lotus of Crimson Crystal", (k) => ({
			words: `[Slash, Blade of Judgment!] Increases DMG by ${pct(k(UT$19.lotus.dmg))} and reduces Mana Cost by ${-UT$19.lotus.cost}.`,
			skill: {
				index: 0,
				dmg: 1 + k(UT$19.lotus.dmg),
				cost: UT$19.lotus.cost
			}
		})),
		treasure("Remnant of Hobby", (k) => ({
			words: `[Disperse, Crystal Haze!] Increases ATK Spd by an additional ${k(UT$19.hobby.speed)} and increases penetration of all allies by ${UT$19.hobby.pen} for the duration of the skill.`,
			skill: {
				index: 1,
				party: {
					name: "Remnant of Hobby",
					lasts: HAZE.lasts,
					pen: UT$19.hobby.pen
				}
			}
		})),
		treasure("Reminiscence of Escape", (k) => ({
			words: `[Bloom, Crimson Flower!] Decreases Cooldown by ${pct(UT$19.escape.cooldown)}, and gaining 1 stack of [Arcane Crystal Energy] has a ${pct(k(UT$19.escape.chance))} chance to add ${UT$19.escape.more} additional stacks.`,
			skill: {
				index: 2,
				cooldownShare: 1 - UT$19.escape.cooldown
			}
		})),
		treasure("Moment of Peace", (k) => ({
			words: `[End to Evil Deeds!] Increases Crit Chance by an additional ${UT$19.peace.crit} and the effect of the duration of CC increase changes to ${pct(k(UT$19.peace.control))}.`,
			bonus: {
				crit: UT$19.peace.crit,
				control: (1 + k(UT$19.peace.control)) / (1 + DEEDS.control) - 1
			}
		}))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cooldownShare: .97
		} }, ({ skill }) => `Reduces Cooldown by ${pct(1 - skill.cooldownShare)} per each enemy hit.`),
		"s1-dark": said({ skill: {
			index: 0,
			dmg: 2
		} }, ({ skill }) => `If there is only 1 enemy, DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s2-light": { words: `The duration of stun from the shockwave increases by ${PERKS$19.waveStun} sec against Non-Hero enemies.` },
		"s2-dark": { words: `While under [Arcane Crystal Awakening], self deals ${pct(PERKS$19.awakeDmg - 1)} increased DMG to Non-Hero enemies.` },
		"s3-light": { words: `Increases ATK Spd reduction by ${PERKS$19.slower}.` },
		"s3-dark": { words: "If there is only 1 enemy, inflicts 2 stacks of [Arcane Crystal Energy]." },
		"s4-light": { words: `At the beginning of each battle, self deals ${pct(PERKS$19.openingDmg - 1)} increased DMG to Non-Hero enemies for ${PERKS$19.opening} sec.` },
		"s4-dark": said({ dmg: 1.15 }, ({ dmg }) => `Deals ${pct(dmg - 1)} increased DMG to Bosses.`),
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK Spd +${speed}`),
		"t5-dark": { words: `Every normal and Skill attack increases ATK Spd by ${PERKS$19.quicker}. This effect can be stacked up to max ${PERKS$19.most} times.` }
	},
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
		/** Her perks: how long her opening's more DMG lasts yet (End to Evil Deeds!'s Light), and her blows counted for attack speed (Transcend 5's Dark). */
		let opening = self.perks.has("s4-light") ? PERKS$19.opening : 0;
		let quicker = 0;
		return {
			lands: {
				judgment(part) {
					if (part < JUDGMENT.cuts) return fight.hit(self, JUDGMENT.cut);
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
					fight.slow(FLOWER.speed + (self.perks.has("s3-light") ? PERKS$19.slower : 0), FLOWER.slowed);
				}
			},
			struck() {
				if (!curse) return;
				curse.blows++;
				const chance = fromTreasure(self, 2, UT$19.escape.chance);
				if (chance > 0 && fight.roll() < chance) curse.blows += UT$19.escape.more;
			},
			tick(dt) {
				opening = Math.max(0, opening - dt);
				if (awake > 0) {
					awake = Math.max(0, awake - dt);
					wave -= dt;
					if (wave <= 0 && fight.field.includes(self)) {
						wave += HAZE.every;
						fight.cue(self, "wave");
						fight.hit(self, HAZE.wave);
						fight.stun(HAZE.waveStun + (self.perks.has("s2-light") ? PERKS$19.waveStun : 0), { by: self });
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
			deals: () => (awake > 0 && self.perks.has("s2-dark") ? PERKS$19.awakeDmg : 1) * (opening > 0 ? PERKS$19.openingDmg : 1),
			speed: () => quicker * PERKS$19.quicker + (awake > 0 ? fromTreasure(self, 1, UT$19.hobby.speed) : 0),
			blow() {
				if (self.perks.has("t5-dark")) quicker = Math.min(PERKS$19.most, quicker + 1);
			},
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
var DROPLETS = {
	heal: indexedHeal("priest", 338882),
	lasts: 10,
	heals: .25,
	low: .5,
	lowTimes: 1.5
};
var BUBBLE = {
	shield: indexedHeal("priest", 879673),
	lasts: 15,
	taken: .7,
	dmg: .15,
	atk: .2,
	heal: indexedHeal("priest", 35192),
	mana: 1.5
};
var FESTIVAL = {
	blow: indexed("priest", 210084),
	down: 3,
	heal: .15,
	mana: 2 * SECTION,
	lasts: 12,
	every: 4,
	whirl: indexed("priest", 140066),
	whirlDown: 2
};
var WATER_DRAGON = {
	resist: 500,
	defense: 1.1,
	critResist: 250,
	taken: .75,
	lasts: 5
};
/**
* Her own perks' numbers: Healing Droplets' more healing and its M.Crit Resistance (points), the whirlpools' quicker
* coming, Festival of the Flow's more heal, her passive's more M.DEF (a share more of it) and M.Crit Resistance, her more
* CC Resist, and Transcend 5's Dark's mana for every ally (how often).
*/
var PERKS$18 = {
	heals: 1.4,
	critResist: 250,
	whirl: 3,
	festival: .15,
	defense: 1.2,
	critResistMore: 150,
	resist: 400,
	mana: {
		each: .35 * SECTION,
		every: 3
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Healing Droplets' more healing and every ally's M.Block
* (points); Bubble Shield's shorter cooldown; Festival of the Flow's more mana for every ally; her passive's more M.DEF,
* and every ally's mana every second.
*/
var UT$18 = {
	scale: {
		heals: .5,
		block: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 10
	},
	crystal: { cooldown: [
		.14,
		.17,
		.21,
		.25,
		.3
	] },
	papyrus: { mana: [
		600,
		720,
		860,
		1040,
		1250
	] },
	tear: {
		defense: .5,
		mana: [
			48,
			58,
			70,
			84,
			100
		]
	}
};
var art$18 = skillArt("laias");
var BLESSING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Blessing of the Water Dragon",
		about: `Passive. +${WATER_DRAGON.resist} CC Resist for her; every ally has ${pct(WATER_DRAGON.defense - 1)} more M.DEF and ${WATER_DRAGON.critResist} M.Crit Resistance, and each skill she uses has every ally take ${pct(1 - WATER_DRAGON.taken)} less magical damage for ${WATER_DRAGON.lasts} seconds.`,
		icon: "🐉",
		art: art$18(3)
	},
	words: `Increases Laias' CC Resist by ${WATER_DRAGON.resist}, and increases all allies' M.DEF by ${pct(WATER_DRAGON.defense - 1)} and M.Crit Resistance by ${WATER_DRAGON.critResist}. Whenever Laias casts an active Skill, reduces M.DMG all allies take by ${pct(1 - WATER_DRAGON.taken)} for ${WATER_DRAGON.lasts} sec.`
};
/** What her passive gives every ally while she is on the field, and each skill she uses for a while. */
var BLESSED = {
	name: "Blessing of the Water Dragon",
	about: "More M.DEF, and the boss’s magic is less likely to land a critical blow.",
	icon: "🐉",
	art: art$18(3)
};
var WARDED$1 = {
	name: "Water Dragon’s Ward",
	about: `Takes ${pct(1 - WATER_DRAGON.taken)} less magical damage.`,
	icon: "💧",
	art: art$18(3)
};
/** What Healing Droplets gives each ally, shown on its card with how long it has left. */
var DROPLETS_UP = {
	name: "Healing Droplets",
	about: "Healing reaches it the more.",
	icon: "💧",
	art: art$18(0)
};
/** What Bubble Shield gives its ally: for its whole while, and more while the shield holds. */
var BUBBLED = {
	name: "Bubble Shield",
	about: `Takes ${pct(1 - BUBBLE.taken)} less from the boss and deals ${pct(BUBBLE.dmg)} more to it.`,
	icon: "🫧",
	art: art$18(1)
};
var BUBBLE_HOLDS = {
	name: "Bubble",
	about: "While the shield holds: can’t be knocked down, hits harder, and is healed every second.",
	icon: "🫧",
	art: art$18(1)
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
			auto: { heals: true },
			about: `Heals every ally, and for ${DROPLETS.lasts} seconds healing reaches them ${pct(DROPLETS.heals)} more (${DROPLETS.lowTimes} times that for one at ${pct(DROPLETS.low)} of its health or less).`,
			words: `Heals ${healed("priest", DROPLETS.heal, bookHeal("laias", 0))} HP of all allies and increases Heal Rate by ${pct(DROPLETS.heals)} for ${DROPLETS.lasts} sec. If the target's HP is ${pct(DROPLETS.low)} or below, Heal Rate increases by ${DROPLETS.lowTimes} times.`,
			icon: "💧",
			art: art$18(0),
			move: "droplets",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Bubble Shield",
			about: `A shield on the ally with the lowest health: for ${BUBBLE.lasts} seconds it takes ${pct(1 - BUBBLE.taken)} less from the boss and deals ${pct(BUBBLE.dmg)} more. While the shield holds it can’t be knocked down, hits ${pct(BUBBLE.atk)} harder and is healed every second.`,
			words: `For ${BUBBLE.lasts} sec, casts a Shield that blocks ${healed("priest", BUBBLE.shield, bookHeal("laias", 1))} DMG on the ally with the lowest HP. While the Shield is active, gains immunity to CC, increases ATK and heals ${healed("priest", BUBBLE.heal, bookHeal("laias", 1))} HP every sec. For ${BUBBLE.lasts} sec, the ally takes ${pct(1 - BUBBLE.taken)} reduced DMG from Non-Hero targets and increases DMG dealt to Non-Hero enemies by ${pct(BUBBLE.dmg)}. The DMG Reduction effect from and the DMG Boost effect to Non-Hero enemies is irremovable. The target's Mana recovery per second increases by ${pct(BUBBLE.mana - 1)}.`,
			icon: "🫧",
			art: art$18(1),
			move: "bubble",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Festival of the Flow",
			about: `Knocks the boss down for ${FESTIVAL.down} seconds, heals every ally ${pct(FESTIVAL.heal)} of its max HP and gives every other ally ${FESTIVAL.mana / SECTION} mana. Then for ${FESTIVAL.lasts} seconds a whirlpool every ${FESTIVAL.every} seconds strikes the boss and knocks it down for ${FESTIVAL.whirlDown}.`,
			words: `Deals ${dmg("priest", FESTIVAL.blow, bookDmg("laias", 2))} M.DMG to nearby enemies and knocks them down for ${FESTIVAL.down} sec. Upon casting, heals HP of all allies by ${pct(FESTIVAL.heal)} of their Max HP and recovers ${FESTIVAL.mana / SECTION} orbs of Mana of allies excluding self. Afterward, for ${FESTIVAL.lasts} sec, creates a whirlpool every ${FESTIVAL.every} sec that deals ${dmg("priest", FESTIVAL.whirl, bookDmg("laias", 2))} M.DMG to random enemies and knocks them down for ${FESTIVAL.whirlDown} sec.`,
			icon: "🌊",
			art: art$18(2),
			move: "festival",
			cooldown: 20,
			cost: 4
		}
	],
	passive: BLESSING,
	treasures: [
		treasure("Water Dragon Scale", (k) => ({
			words: `[Healing Droplets] Increases Heal Rate by ${pct(UT$18.scale.heals)}, and for ${UT$18.scale.lasts} sec, increases the target's M.Block by ${k(UT$18.scale.block)}.`,
			skill: {
				index: 0,
				heals: 1 + UT$18.scale.heals,
				party: {
					name: "Water Dragon Scale",
					lasts: UT$18.scale.lasts,
					blocks: { magical: k(UT$18.scale.block) }
				}
			}
		})),
		treasure("Oasis Crystal", (k) => ({
			words: `[Bubble Shield] Reduces Cooldown by ${pct(k(UT$18.crystal.cooldown))} and dispels Negative Effects from the target.`,
			skill: {
				index: 1,
				cooldownShare: 1 - k(UT$18.crystal.cooldown)
			}
		})),
		treasure("Papyrus of the Flow", (k) => ({
			words: `[Festival of the Flow] Whirlpool effect targets 2 enemies and all allies recover additional ${k(UT$18.papyrus.mana)} mana.`,
			skill: {
				index: 2,
				allyMana: k(UT$18.papyrus.mana)
			}
		})),
		treasure("Tear of God Dragon", (k) => ({ words: `[Blessing of the Water Dragon] Increases DEF boost by ${pct(UT$18.tear.defense)}. All allies recover Mana by ${k(UT$18.tear.mana)} every sec.` }))
	],
	perks: {
		"s1-light": { words: `Heal rate is increased by ${pct(PERKS$18.heals - 1)}.` },
		"s1-dark": { words: `Upon healing, M.Crit Resistance rises by ${pct(share$2(PERKS$18.critResist))}.` },
		"s2-light": { words: "Changes the target to the ally with the highest ATK." },
		"s2-dark": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s3-light": { words: `DMG effect occurs every ${PERKS$18.whirl} sec.` },
		"s3-dark": { words: `Heals all allies by ${pct(PERKS$18.festival)} of their max HP.` },
		"s4-light": { words: `M.DEF increase rate increases by ${pct(PERKS$18.defense - 1)}, and M.Crit Resistance increases by ${PERKS$18.critResistMore}.` },
		"s4-dark": said({ bonus: { resist: PERKS$18.resist } }, ({ bonus }) => `Increases self CC Resist by ${bonus.resist}.`),
		"t5-light": t5Light({ blockMagical: 200 }, ({ blockMagical }) => `M.Block +${blockMagical}`),
		"t5-dark": { words: `Recovers ${PERKS$18.mana.each} Mana of all allies every ${PERKS$18.mana.every} sec.` }
	},
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
		/** Her perks: how often the whirlpools come; her passive's M.DEF and M.Crit Resistance for every ally; and toward Transcend 5's Dark's next mana. */
		const whirlEvery = self.perks.has("s3-light") ? PERKS$18.whirl : FESTIVAL.every;
		const defense = 1 + (WATER_DRAGON.defense - 1) * (self.perks.has("s4-light") ? PERKS$18.defense : 1) * (treasureTier(self, 3) > 0 ? 1 + UT$18.tear.defense : 1);
		const tear = fromTreasure(self, 3, UT$18.tear.mana);
		const critResist = WATER_DRAGON.critResist + (self.perks.has("s4-light") ? PERKS$18.critResistMore : 0);
		let filling = 0;
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
					fight.hit(self, fight.basic);
				},
				droplets() {
					const on = allies();
					fight.cue(self, "droplets", on);
					for (const ally of on) {
						const low = ally.hp <= ally.stats.hp * DROPLETS.low;
						fight.heal(ally, DROPLETS.heal * (low ? DROPLETS.lowTimes : 1) * (self.perks.has("s1-light") ? PERKS$18.heals : 1), self);
						const resisting = self.perks.has("s1-dark") ? { critResist: { magical: PERKS$18.critResist } } : {};
						put(ally.statuses, {
							name: DROPLETS_UP.name,
							left: DROPLETS.lasts,
							heals: 1 + DROPLETS.heals * (low ? DROPLETS.lowTimes : 1),
							...resisting,
							shown: DROPLETS_UP
						});
					}
				},
				bubble() {
					const ally = self.perks.has("s2-light") ? allies().reduce((best, one) => !best || one.stats.atk > best.stats.atk ? one : best, void 0) : weakest();
					if (!ally) return;
					fight.cue(self, "bubble", [ally]);
					if (bubbled && bubbled !== ally) lift(BUBBLE_HOLDS.name, [bubbled]);
					if (treasureTier(self, 1) > 0) ally.statuses = ally.statuses.filter((status) => status.shown.harmful !== true || status.binds === true);
					fight.shield(ally, BUBBLE.shield, BUBBLE.lasts, self);
					put(ally.statuses, {
						name: BUBBLED.name,
						left: BUBBLE.lasts,
						takes: BUBBLE.taken,
						deals: 1 + BUBBLE.dmg,
						mana: BUBBLE.mana,
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
						fight.heal(ally, ally.stats.hp * (FESTIVAL.heal + (self.perks.has("s3-dark") ? PERKS$18.festival : 0)));
						if (ally !== self) ally.mana = Math.min(MAX_MANA, ally.mana + FESTIVAL.mana);
					}
					flowing = FESTIVAL.lasts;
					whirl = 0;
				}
			},
			used() {
				put(fight.party, {
					name: WARDED$1.name,
					left: WATER_DRAGON.lasts,
					takes: { magical: WATER_DRAGON.taken },
					shown: WARDED$1
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
						defends: { magical: defense },
						critResist: { magical: critResist },
						shown: BLESSED
					});
					if (tier !== null) put(ally.statuses, {
						name: ELTOIRRE_UP.name,
						left: Infinity,
						heals: 1 + atTier(ELTOIRRE.heals, tier),
						shown: ELTOIRRE_UP
					});
				}
				if (tear > 0) for (const ally of on) ally.mana = Math.min(MAX_MANA, ally.mana + tear * dt);
				if (flowing > 0) {
					flowing -= dt;
					whirl += dt;
					if (whirl >= whirlEvery) {
						whirl -= whirlEvery;
						fight.cue(self, "whirlpool");
						fight.hit(self, FESTIVAL.whirl);
						fight.stun(FESTIVAL.whirlDown, {
							down: true,
							by: self
						});
					}
				}
				if (self.perks.has("t5-dark")) {
					filling += dt;
					if (filling >= PERKS$18.mana.every) {
						filling -= PERKS$18.mana.every;
						for (const ally of on) ally.mana = Math.min(MAX_MANA, ally.mana + PERKS$18.mana.each);
					}
				}
				if (tier !== null) {
					mending += dt;
					if (mending >= ELTOIRRE.every) {
						mending -= ELTOIRRE.every;
						const ally = weakest();
						if (ally) {
							fight.cue(self, "eltoirre", [ally]);
							fight.heal(ally, atTier(ELTOIRRE.mend, tier) * ATK, self);
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
var THORNS = {
	hits: CODED.thornbush.lands.length,
	blow: indexed("wizard", 243273) / CODED.thornbush.lands.length
};
var VINE = {
	blow: indexed("wizard", 208671),
	poison: 2,
	shackle: 4,
	after: 2,
	each: indexed("wizard", 208671) / 2
};
var WRATH = {
	blow: indexed("wizard", 359928),
	down: 3,
	more: .2
};
var LEAF = {
	chance: .3,
	times: 3,
	blow: indexed("wizard", 50538)
};
/** The most Poison on the boss, how long it lasts once the last was left, how hard each eats at it every second, and what each takes off the boss's heals. */
var POISON = {
	most: 5,
	lasts: 20,
	each: indexed("wizard", 271720) / 20,
	every: 1,
	heals: .1
};
/** Her own perks' numbers: Thornbush Forest's shackle at full Poison, Tangled Vine's more DMG and its stun after, more Poison at most, Blade Leaf's shackle (its chance), and Transcend 5's Dark's Thornbush Forest (how often, its chance). */
var PERKS$17 = {
	hits: 1,
	full: 5,
	shackle: 3,
	vine: 1.4,
	after: 2,
	most: 6,
	leaf: {
		chance: .2,
		shackle: 2
	},
	forest: {
		every: 5,
		chance: .3
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Thornbush Forest's DMG and shorter cooldown; Tangled Vine's
* cheaper, the mana it would drain (the boss has none) and her own mana; Wrath of the Forest's DMG and, on a critical blow
* at full Poison, the share off her skills' cooldowns; and Blade Leaf's more M.DMG taken (as long as its Poison).
*/
var UT$17 = {
	book: {
		dmg: .5,
		cooldown: [
			1.4,
			1.7,
			2.1,
			2.5,
			3
		]
	},
	belladonna: {
		cost: -1,
		drain: [
			240,
			290,
			350,
			420,
			500
		],
		mana: [
			120,
			140,
			170,
			210,
			250
		]
	},
	root: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		cooldown: .04,
		poison: 5
	},
	terrarium: { takes: [
		.12,
		.14,
		.17,
		.21,
		.25
	] }
};
var art$17 = skillArt("lorraine");
var BLADE_LEAF = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Blade Leaf",
		about: `Passive. Her attack has a ${pct(LEAF.chance)} chance to send ${LEAF.times} leaves at the boss besides, each leaving a [Poison] on it (up to ${POISON.most}).`,
		icon: "🍃",
		art: art$17(3)
	},
	words: `When dealing a normal attack, attacks a random enemy ${LEAF.times} times with a ${pct(LEAF.chance)} chance of inflicting ${dmg("wizard", LEAF.blow, bookDmg("lorraine", 3))} M.DMG and 1 stack of Poison for ${POISON.lasts} seconds. Poison inflicts a total of ${dmg("wizard", POISON.each * POISON.lasts, bookDmg("lorraine", 3))} M.DMG over ${POISON.lasts} seconds, reduces Heal Rate, and can be stacked up to max ${POISON.most} times. If Lorraine dies, Poison effects on enemies will disappear.`
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
			about: `${THORNS.hits} blows, each leaving a [Poison] on the boss (up to ${POISON.most}): each eats at it every second and leaves it healed ${pct(POISON.heals)} less.`,
			words: `Attacks ${THORNS.hits} times at random, dealing a total of ${dmg("wizard", THORNS.blow * THORNS.hits, bookDmg("lorraine", 0))} M.DMG to enemies in range and inflicting 1 stack of Poison with each attack.`,
			icon: "🌿",
			art: art$17(0),
			move: "thornbush",
			cooldown: 7,
			cost: 2
		},
		{
			name: "Tangled Vine",
			about: `A blow that leaves ${VINE.poison} [Poison] and shackles the boss for ${VINE.shackle} seconds (it can do nothing); ${VINE.after} seconds after, a blow the harder for each [Poison] on it.`,
			words: `Deals ${dmg("wizard", VINE.blow, bookDmg("lorraine", 1))} M.DMG to enemies in a straight line, stacking ${VINE.poison} Poison and shackling them for ${VINE.shackle} sec. After some time, deals ${dmg("wizard", VINE.each, bookDmg("lorraine", 1))} M.DMG for each Poison stack.`,
			icon: "🪢",
			art: art$17(1),
			move: "vine",
			cooldown: 10,
			cost: 3
		},
		{
			name: "Wrath of the Forest",
			about: `A blow that knocks the boss down for ${WRATH.down} seconds, ${pct(WRATH.more)} harder for each [Poison] on it.`,
			words: `Deals ${dmg("wizard", WRATH.blow, bookDmg("lorraine", 2))} M.DMG to enemies in range and knocks them down for ${WRATH.down} sec. Enemies inflicted by Poison takes ${pct(WRATH.more)} more DMG per every stack.`,
			icon: "🌳",
			art: art$17(2),
			move: "wrath",
			cooldown: 23,
			cost: 3
		}
	],
	passive: BLADE_LEAF,
	treasures: [
		treasure("Book of Life", (k) => ({
			words: `[Thornbush Forest] DMG is increased by ${pct(UT$17.book.dmg)} and Cooldown is reduced by ${k(UT$17.book.cooldown)} sec.`,
			skill: {
				index: 0,
				dmg: 1 + UT$17.book.dmg,
				cooldown: -k(UT$17.book.cooldown)
			}
		})),
		treasure("Deadly Belladonna", (k) => ({
			words: `[Tangled Vine] Reduces Mana Cost by ${-UT$17.belladonna.cost} and drains ${k(UT$17.belladonna.drain)} MP from the affected enemy that took the DMG, and recovers own Mana by ${k(UT$17.belladonna.mana)}.`,
			skill: {
				index: 1,
				cost: UT$17.belladonna.cost,
				mana: k(UT$17.belladonna.mana)
			}
		})),
		treasure("Root of the World Tree", (k) => ({
			words: `[Wrath of the Forest] DMG is increased by ${pct(k(UT$17.root.dmg))}. Upon Crit Hit on enemies with over ${UT$17.root.poison} stacks of Poison, skill cooldown is reduced by ${pct(UT$17.root.cooldown)}.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$17.root.dmg)
			}
		})),
		treasure("Terrarium of Circulation", (k) => ({ words: `[Blade Leaf] Posion effect will become irremovable, and increases M.DMG the target takes by ${pct(k(UT$17.terrarium.takes))} for the duration of the skill.` }))
	],
	perks: {
		"s1-light": { words: `Hit count is increased by ${PERKS$17.hits}.` },
		"s1-dark": { words: `Enemies with ${PERKS$17.full} or more stacks of Poison are shackled for ${PERKS$17.shackle} sec upon hit.` },
		"s2-light": said({ skill: {
			index: 1,
			dmg: PERKS$17.vine
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s2-dark": { words: `Enemies hit by the final explosion effect are stunned for ${PERKS$17.after} sec.` },
		"s3-light": said({ skill: {
			index: 2,
			cost: 1,
			dmg: 2
		} }, ({ skill }) => `Mana cost is increased by ${skill.cost} orb but DMG is boosted by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: "Enemies with 5 or more stacks of Poison lose their positive effects." },
		"s4-light": { words: `Poison stack maximum is changed to ${PERKS$17.most}.` },
		"s4-dark": { words: `There is a ${pct(PERKS$17.leaf.chance)} chance that hit enemies are shackled for ${PERKS$17.leaf.shackle} sec.` },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": { words: `Every ${PERKS$17.forest.every} sec, targets all enemies and attacks with 'Thornbush Forest' with ${pct(PERKS$17.forest.chance)} chance on each enemy.` }
	},
	attack: "lash",
	join(fight, self) {
		/** How long until Tangled Vine's blow after (0: none coming); toward her Poison's next bite; and toward her unique weapon's next blow. */
		let vine = 0;
		let bitten = 0;
		let roburu = 0;
		const tier = self.unique?.tier ?? null;
		/** Her perks: the most Poison there can be (Blade Leaf's Light); and toward Transcend 5's Dark's next Thornbush Forest. */
		const most = self.perks.has("s4-light") ? PERKS$17.most : POISON.most;
		let forest = 0;
		/** How many Poison are on the boss. */
		const poisons = () => fight.foe.statuses.find((status) => status.name === POISONED)?.count ?? 0;
		/** So many more Poison on the boss (up to the most), all of it begun again: what heals it heals it less for each. */
		const poison = (count) => {
			const stacks = Math.min(most, poisons() + count);
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
		/** A blow of Thornbush Forest: a Poison (and with its Dark, at full Poison, the boss shackled). */
		const thorn = () => {
			fight.hit(self, THORNS.blow);
			poison(1);
			if (self.perks.has("s1-dark") && poisons() >= PERKS$17.full) fight.stun(PERKS$17.shackle, { by: self });
		};
		return {
			lands: {
				lash() {
					if (fight.roll() >= LEAF.chance) {
						fight.hit(self, fight.basic);
						return;
					}
					fight.cue(self, "leaf");
					fight.hit(self, fight.basic + LEAF.blow * LEAF.times);
					poison(LEAF.times);
					const terrarium = fromTreasure(self, 3, UT$17.terrarium.takes);
					if (terrarium > 0) put(fight.foe.statuses, {
						name: "Terrarium of Circulation",
						left: POISON.lasts,
						takes: { magical: 1 + terrarium },
						shown: "venom"
					});
					if (self.perks.has("s4-dark") && fight.roll() < PERKS$17.leaf.chance) fight.stun(PERKS$17.leaf.shackle, { by: self });
				},
				thornbush(part) {
					thorn();
					if (part === THORNS.hits - 1 && self.perks.has("s1-light")) for (let i = 0; i < PERKS$17.hits; i++) thorn();
				},
				vine() {
					fight.hit(self, VINE.blow);
					poison(VINE.poison);
					fight.stun(VINE.shackle, { by: self });
					vine = VINE.after;
				},
				wrath() {
					if (fight.hit(self, WRATH.blow * (1 + WRATH.more * poisons())) && treasureTier(self, 2) > 0 && poisons() >= UT$17.root.poison) self.abilities.forEach((ability, i) => {
						self.cooldowns[i] = Math.max(0, self.cooldowns[i] - ability.cooldown * UT$17.root.cooldown);
					});
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
						fight.hit(self, VINE.each * poisons() * (self.perks.has("s2-light") ? PERKS$17.vine : 1), false);
						if (self.perks.has("s2-dark")) fight.stun(PERKS$17.after, { by: self });
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
				if (self.perks.has("t5-dark") && self.hp > 0 && fight.field.includes(self)) {
					forest += dt;
					if (forest >= PERKS$17.forest.every) {
						forest -= PERKS$17.forest.every;
						if (fight.roll() < PERKS$17.forest.chance) {
							fight.cue(self, "thornbush");
							for (let i = 0; i < THORNS.hits; i++) thorn();
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
			lit: () => poisons() >= most
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/morrah.ts
var CLEAVE = {
	blow: BLOW,
	burning: indexed("knight", 11763)
};
var BURNING = {
	blow: indexed("knight", 58356),
	flames: 3,
	down: 1,
	lasts: 15
};
var HELLFIRE = {
	lasts: 20,
	defense: 6953,
	block: 250,
	every: 1
};
var ERUPTION = {
	blow: indexed("knight", 263466),
	down: 3
};
var SMASH$1 = {
	blow: indexed("knight", 35664),
	flames: 3
};
/** The most Flame on the boss, how long it lasts once the last was left, how hard each burns every second, how much harder it makes her skills, and what each takes off the boss's heals. */
var FLAME = {
	most: 100,
	lasts: 10,
	each: 10,
	every: 1,
	more: .02,
	heals: .01
};
/**
* Her own perks' numbers: Burning Power's attack speed (points), Hellfire's more M.Block and its blow every second (a
* share of her M.DEF), Lava Eruption's heal (a share of what it dealt), Fire Smash's M.DEF for each block (most), the boss
* taking more at full Flame, and Transcend 5's Dark's Flame.
*/
var PERKS$16 = {
	quicker: 200,
	block: 1.2,
	scorch: 1,
	drain: .4,
	harder: {
		defense: .05,
		most: 10
	},
	full: .4,
	flame: {
		each: 2,
		most: 120
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Burning Power's DMG; Hellfire's less taken (points) and
* M.Crit resist for a block of a magical blow while it lasts; Lava Eruption's DMG and less M.DEF on the boss; Fire Smash's
* more Flame and slower boss (ATK Spd, points).
*/
var UT$16 = {
	eye: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	gloves: {
		less: [
			120,
			140,
			170,
			210,
			250
		],
		critResist: 250
	},
	stone: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		defends: .25,
		lasts: 7
	},
	jewel: {
		flames: 3,
		speed: [
			170,
			210,
			250,
			300,
			360
		],
		lasts: 5
	}
};
var art$16 = skillArt("morrah");
var FIRE_SMASH = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Fire Smash",
		about: `Passive. When she blocks she strikes back, leaving ${SMASH$1.flames} [Flame] on the boss.`,
		icon: "🔥",
		art: art$16(3)
	},
	words: `Upon Block, deals ${dmg("knight", SMASH$1.blow, bookDmg("morrah", 3))} M.DMG to enemies in range, and inflicts ${SMASH$1.flames} stack of Flame.`
};
/** What Burning Power gives her for a while: shown beside her passive, with how long it has left. */
var BURNING_UP = {
	name: "Burning Power",
	about: "Each blow of her attack deals more and leaves a [Flame] on the boss.",
	icon: "🔥",
	art: art$16(0)
};
/** What Hellfire gives every ally for a while: shown on each card, with how long it has left. */
var HELLFIRE_UP = {
	name: "Hellfire",
	about: `+${HELLFIRE.defense} M.DEF, and +${HELLFIRE.block} M.Block.`,
	icon: "🌋",
	art: art$16(1)
};
/** What her skills, and her unique weapon, leave on the boss. */
var FLAMED = "Flame";
var SEARED = "Searing Flame";
/** What her perks give her: Burning Power's Light's attack speed, and Fire Smash's Light's M.DEF. */
var QUICKENED = {
	name: "Burning Power (speed)",
	about: "Quicker.",
	icon: "🔥",
	art: art$16(0)
};
var HARDENED = {
	name: "Fire Smash (M.DEF)",
	about: `${pct(PERKS$16.harder.defense)} more M.DEF for each block (${PERKS$16.harder.most} at most).`,
	icon: "🔥",
	art: art$16(3)
};
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
			about: `A blow that knocks the boss down for ${seconds(BURNING.down)} and leaves ${BURNING.flames} [Flame] on it. Then for ${BURNING.lasts} seconds each blow of her attack deals more and leaves a [Flame]. Both are ${pct(FLAME.more)} harder for each [Flame] on the boss.`,
			words: `Deals ${dmg("knight", BURNING.blow, bookDmg("morrah", 0))} M.DMG to enemies in range and knocks them down, inflicting ${BURNING.flames} stacks of Flame. Then for ${BURNING.lasts} sec, each auto attack deals ${dmg("knight", CLEAVE.burning, bookDmg("morrah", 0))} M.DMG and inflicts 1 stack of Flame on enemy. Per each stacked Flame, DMG is increased by ${pct(FLAME.more)}. Each Flame stack deals separate ${dmg("knight", FLAME.each, bookDmg("morrah", 0))} M.DMG every second and reduces Heal rate by ${pct(FLAME.heals)}.`,
			icon: "🔥",
			art: art$16(0),
			move: "burning",
			cooldown: 6,
			cost: 2
		},
		{
			name: "Hellfire",
			auto: { keeps: HELLFIRE_UP.name },
			about: `For ${HELLFIRE.lasts} seconds every ally has +${HELLFIRE.defense} M.DEF and +${HELLFIRE.block} M.Block, and a [Flame] is left on the boss every ${seconds(HELLFIRE.every)}.`,
			words: `For ${HELLFIRE.lasts} sec, all allies' M.DEF is increased by ${HELLFIRE.defense} and M.Block Chance is increased by ${HELLFIRE.block}. Additionally, every ${HELLFIRE.every} sec, inflicts 1 stack of Flame on nearby enemies.`,
			icon: "🌋",
			art: art$16(1),
			move: "hellfire",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Lava Eruption",
			about: `A blow that knocks the boss down for ${seconds(ERUPTION.down)}, ${pct(FLAME.more)} harder for each [Flame] on it.`,
			words: `Deals ${dmg("knight", ERUPTION.blow, bookDmg("morrah", 2))} M.DMG to enemies in range and inflict knock down. Per every stacked Flame, DMG is increased by ${pct(FLAME.more)}.`,
			icon: "☄️",
			art: art$16(2),
			move: "eruption",
			cooldown: 20,
			cost: 3
		}
	],
	passive: FIRE_SMASH,
	treasures: [
		treasure("Hell’s Eye", (k) => ({
			words: `[Burning Power] Increases DMG by ${pct(k(UT$16.eye.dmg))}, and Flame stacked upon enemies become irremovable.`,
			skill: {
				index: 0,
				dmg: 1 + k(UT$16.eye.dmg)
			}
		})),
		treasure("Hatchling Leather Gloves", (k) => ({ words: `[Hellfire] Upon blocking target's M.ATK during the skill's duration, DMG reduction is increased by ${k(UT$16.gloves.less)} and M.Crit resistance is increased by ${UT$16.gloves.critResist}.` })),
		treasure("Hellish Sealing Stone", (k) => ({
			words: `[Lava Eruption] DMG is increased by ${pct(k(UT$16.stone.dmg))} and target's M.DEF is decreased by ${pct(UT$16.stone.defends)} for ${UT$16.stone.lasts} sec.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$16.stone.dmg),
				mark: {
					name: "Hellish Sealing Stone",
					defends: { magical: 1 - UT$16.stone.defends },
					lasts: UT$16.stone.lasts
				}
			}
		})),
		treasure("Jewel of Inferno", (k) => ({ words: `[Fire Smash] Increases the number of Flame stacks by ${UT$16.jewel.flames}. Hit targets have their ATK Spd reduced by ${k(UT$16.jewel.speed)} for ${UT$16.jewel.lasts} sec.` }))
	],
	perks: {
		"s1-light": { words: `ATK Spd is increased by ${PERKS$16.quicker} for ${BURNING.lasts} sec.` },
		"s1-dark": said({ skill: {
			index: 0,
			cooldownShare: .94
		} }, ({ skill }) => `Reduces cooldown by ${pct(1 - skill.cooldownShare)} per each enemy hit.`),
		"s2-light": { words: `M.Block rate is boosted by ${pct(PERKS$16.block - 1)}.` },
		"s2-dark": { words: "While Hellfire is active, deals DMG based on own M.DEF to nearby enemies." },
		"s3-light": said({ skill: {
			index: 2,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: `Heals HP equal to ${pct(PERKS$16.drain)} of DMG dealt.` },
		"s4-light": { words: `Increases own M.DEF by ${pct(PERKS$16.harder.defense)} per each block. Max stack is ${PERKS$16.harder.most}.` },
		"s4-dark": { words: `Target with over ${FLAME.most} stacks of Flame takes ${pct(PERKS$16.full)} increased M.DMG.` },
		"t5-light": t5Light({ blockMagical: 200 }, ({ blockMagical }) => `M.Block +${blockMagical}`),
		"t5-dark": { words: `Flame stack DMG is increased by ${pct(PERKS$16.flame.each - 1)}, and max stack number is changed to ${PERKS$16.flame.most}.` }
	},
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
		/** Her perks: the most Flame there can be, and how hard each burns (Transcend 5's Dark); and her blocks counted for M.DEF (Fire Smash's Light). */
		const most = self.perks.has("t5-dark") ? PERKS$16.flame.most : FLAME.most;
		const each = FLAME.each * (self.perks.has("t5-dark") ? PERKS$16.flame.each : 1);
		let blocks = 0;
		/** How many Flame are on the boss. */
		const flames = () => fight.foe.statuses.find((status) => status.name === FLAMED)?.count ?? 0;
		/** So many more Flame on the boss (up to the most), all of it begun again: what heals it heals it less for each. */
		const burn = (count) => {
			const stacks = Math.min(most, flames() + count);
			put(fight.foe.statuses, {
				name: FLAMED,
				left: FLAME.lasts,
				count: stacks,
				heals: Math.max(0, 1 - FLAME.heals * stacks),
				shown: "burn"
			});
			if (self.perks.has("s4-dark") && stacks >= FLAME.most) put(fight.foe.statuses, {
				name: SEARED,
				left: FLAME.lasts,
				takes: { magical: 1 + PERKS$16.full },
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
				fight.hit(self, fight.basic + CLEAVE.burning * fanning());
				burn(1);
			} else fight.hit(self, fight.basic);
			if (tier === null || fight.roll() >= CARPRAIN.chance) return;
			const weaker = atTier(CARPRAIN.weaker, tier);
			const takes = weaker * (flames() >= most ? CARPRAIN.full : 1);
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
					if (self.perks.has("s1-light")) put(self.statuses, {
						name: QUICKENED.name,
						left: BURNING.lasts,
						pace: 1 + share$2(PERKS$16.quicker),
						shown: QUICKENED
					});
				},
				hellfire() {
					const on = allies();
					fight.cue(self, "hellfire", on);
					for (const ally of on) put(ally.statuses, {
						name: HELLFIRE_UP.name,
						left: HELLFIRE.lasts,
						bolsters: { magical: HELLFIRE.defense },
						blocks: { magical: HELLFIRE.block * (self.perks.has("s2-light") ? PERKS$16.block : 1) },
						shown: HELLFIRE_UP
					});
					hellfire = HELLFIRE.lasts;
					fanned = 0;
				},
				eruption() {
					const before = fight.foe.hp;
					fight.hit(self, ERUPTION.blow * fanning());
					fight.stun(ERUPTION.down, {
						down: true,
						by: self
					});
					if (self.perks.has("s3-dark")) fight.heal(self, PERKS$16.drain * Math.max(0, before - fight.foe.hp));
				}
			},
			blocked() {
				fight.cue(self, "smash");
				fight.hit(self, SMASH$1.blow);
				const jewel = treasureTier(self, 3) > 0;
				burn(SMASH$1.flames + (jewel ? UT$16.jewel.flames : 0));
				if (jewel) fight.slow(fromTreasure(self, 3, UT$16.jewel.speed), UT$16.jewel.lasts);
				if (hellfire > 0 && treasureTier(self, 1) > 0 && fight.foe.def.stats.deals === "magical") {
					const less = fromTreasure(self, 1, UT$16.gloves.less);
					put(self.statuses, {
						name: "Hatchling Leather Gloves",
						left: hellfire,
						takes: { magical: 1 - share$2(less) },
						critResist: { magical: UT$16.gloves.critResist },
						shown: {
							name: "Hatchling Leather Gloves",
							about: `Takes ${pct(share$2(less))} less magical DMG, and is crit less.`,
							icon: "🧤",
							art: art$16(1)
						}
					});
				}
				if (self.perks.has("s4-light") && blocks < PERKS$16.harder.most) {
					blocks++;
					put(self.statuses, {
						name: HARDENED.name,
						left: Infinity,
						count: blocks,
						defends: { magical: 1 + PERKS$16.harder.defense * blocks },
						shown: HARDENED
					});
				}
			},
			tick(dt) {
				if (burning > 0) burning = Math.max(0, burning - dt);
				if (hellfire > 0) {
					hellfire -= dt;
					fanned += dt;
					if (fanned >= HELLFIRE.every) {
						fanned -= HELLFIRE.every;
						burn(1);
						if (self.perks.has("s2-dark") && self.hp > 0 && fight.field.includes(self)) {
							const defense = (self.stats.magical + bolstering(self.statuses, "magical") + bolstering(fight.party, "magical")) * defending([...self.statuses, ...fight.party], "magical");
							fight.hit(self, POINTS * PERKS$16.scorch * defense / self.stats.atk, false);
						}
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
					fight.hit(self, each * count, false);
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
	blow: indexed("warrior", 161315),
	window: 5
};
var BLOSSOM = { blow: PETALS.blow };
var SCATTER = {
	rush: indexed("warrior", 29043),
	cuts: CODED.scatter.lands.length - 1,
	cut: indexed("warrior", 96136) / (CODED.scatter.lands.length - 1),
	through: indexed("warrior", 94128) / (CODED.scatter.lands.length - 1),
	pierce: 1e3,
	speed: 300,
	lasts: 3
};
var MOON$1 = {
	blow: indexed("warrior", 376079),
	boss: indexed("warrior", 186384),
	ripe: indexed("warrior", 415888),
	ripeBoss: indexed("warrior", 195815),
	every: 6,
	light: 1,
	unhealed: 10,
	heals: 0
};
var WITCH = {
	atk: 38567,
	critDamage: .05,
	most: 30
};
/** Her own perks' numbers: Blossom's less healing for the boss, Blood Scattering Blade's mana for each blow, her less taken for each stack of Cold-Blooded Witch, her opening's more DMG, and Transcend 5's Dark's more taken. */
var PERKS$15 = {
	unhealed: {
		heals: .5,
		lasts: 5
	},
	blossomCost: 1,
	mana: .2 * SECTION,
	taken: .007,
	opening: {
		deals: 1.25,
		lasts: 200
	},
	reckless: 1.25
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Falling Petals' and Blossom's DMG, Falling Petals' mana on a
* critical blow and Blossom's seconds off Falling Petals' cooldown on one; Blood Scattering Blade's DMG and less M.Block
* on the boss (points, for as long as its Magic Weakness would last); Red Moon Blade's more DMG for her first so many blows of
* the fight; and Cold-Blooded Witch's more DMG to the boss for each stack.
*/
var UT$15 = {
	whetstone: {
		dmg: .5,
		mana: [
			240,
			290,
			350,
			420,
			500
		],
		seconds: [
			1,
			1.2,
			1.4,
			1.7,
			2
		]
	},
	abyss: {
		dmg: .5,
		block: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 10
	},
	candle: {
		dmg: .7,
		times: [
			7,
			9,
			11,
			13,
			15
		]
	},
	trigrams: { dmg: [
		.007,
		.008,
		.01,
		.012,
		.015
	] }
};
var art$15 = skillArt("seria");
/** What Falling Petals' slot holds for a while after it is used (its picture is Falling Petals'). */
var BLOSSOM_SKILL = {
	name: "Mysterious Sword - Blossom",
	about: `A cut down on the boss: once, within ${PETALS.window} seconds of [Falling Petals].`,
	icon: "🌸",
	art: art$15(0),
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
		about: `Passive. Her ATK is higher, and each critical blow of her skills gives her ${pct(WITCH.critDamage)} more crit damage (up to ${WITCH.most} times).`,
		icon: "🩸",
		art: art$15(3)
	},
	words: `ATK is increased by ${WITCH.atk}. Upon a critical skill hit, own Crit DMG is increased by ${pct(WITCH.critDamage)}. This effect can be stacked up to ${WITCH.most} times.`
};
/** Her Cold-Blooded Witch's stacks: shown on her card, with how many she has. */
var WITCHED = {
	name: "Cold-Blooded Witch",
	about: `${pct(WITCH.critDamage)} more crit damage for each.`,
	icon: "🩸",
	art: art$15(3)
};
/** Moonlight: shown on her card for the second it lasts. */
var MOONLIGHT = {
	name: "Moonlight",
	about: `[Red Moon Blade] used now cuts again, and leaves the boss healed ${pct(1 - MOON$1.heals)} less for ${MOON$1.unhealed} seconds.`,
	icon: "🌕",
	art: art$15(2)
};
/** What her skills leave on the boss. */
var SIN = "Original Sin of Blood";
var WILTED = "Mysterious Sword - Blossom";
/** What her perks give her: her opening's more DMG (Cold-Blooded Witch's Dark), and Transcend 5's Dark. */
var OPENING = {
	name: "Cold-Blooded Witch (opening)",
	about: `Deals ${pct(PERKS$15.opening.deals - 1)} more to the boss.`,
	icon: "🩸",
	art: art$15(3)
};
var RECKLESS = {
	name: "Bloodthirst",
	about: `Every blow of hers critical; but she can’t block, and takes ${pct(PERKS$15.reckless - 1)} more.`,
	icon: "🩸",
	art: art$15(3)
};
var UNHEALED$1 = "Red Moon";
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
			about: `A cut across the boss. For ${PETALS.window} seconds after, this slot holds [Mysterious Sword - Blossom], once.`,
			words: `Performs a horizontal slash to the front and deals ${dmg("warrior", PETALS.blow, bookDmg("seria", 0))} M.DMG to the target and enemies in a narrow range. Can activate [Mysterious Sword - Blossom] (${BLOSSOM_SKILL.cost} Mana: a vertical slash to the front, dealing ${dmg("warrior", BLOSSOM.blow, bookDmg("seria", 0))} M.DMG to the target and enemies in a narrow range) once within ${PETALS.window} sec after use.`,
			icon: "🌸",
			art: art$15(0),
			move: "petals",
			cooldown: 7,
			cost: 1
		},
		{
			name: "Blood Scattering Blade",
			about: `A rush in with a cut that leaves [Original Sin of Blood] (the boss’s attacks ${pct(share$2(SCATTER.speed))} slower for ${SCATTER.lasts} seconds); then ${SCATTER.cuts} more cuts, each with a blow more through its defense.`,
			words: `Rapidly charges forward to deal ${dmg("warrior", SCATTER.rush, bookDmg("seria", 1))} M.DMG and inflicts irremovable Original Sin of Blood on enemies for ${SCATTER.lasts} sec. Enemies under Original Sin of Blood have their ATK Spd reduced by ${SCATTER.speed}. Shortly afterward, attacks enemies under Original Sin of Blood ${SCATTER.cuts} times, and deals additional ${dmg("warrior", SCATTER.cut * SCATTER.cuts, bookDmg("seria", 1))} M.DMG, and if the target is not a hero, deals additional ${dmg("warrior", SCATTER.through * SCATTER.cuts, bookDmg("seria", 1))} DEF Ignoring M.DMG.`,
			icon: "🩸",
			art: art$15(1),
			move: "scatter",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Red Moon Blade",
			about: `A great cut, harder on a boss. Used in [Moonlight] (${seconds(MOON$1.light)} of it every ${MOON$1.every} seconds): it cuts again, and the boss is healed ${pct(1 - MOON$1.heals)} less for ${MOON$1.unhealed} seconds.`,
			words: `Brandishes a moon-bloodying sword, dealing ${dmg("warrior", MOON$1.blow, bookDmg("seria", 2))} M.DMG to enemies in a wide range, and additional ${dmg("warrior", MOON$1.boss, bookDmg("seria", 2))} M.DMG on non-Hero enemies. When the moon is ripe, gains Moonlight for ${MOON$1.light} sec, and when cast at this state, deals ${dmg("warrior", MOON$1.ripe, bookDmg("seria", 2))} M.DMG to enemies and reduces their Heal Rate by ${pct(1 - MOON$1.heals)}. If the target is not a hero, deals additional ${dmg("warrior", MOON$1.ripeBoss, bookDmg("seria", 2))} M.DMG.`,
			icon: "🌙",
			art: art$15(2),
			move: "moon",
			cooldown: 20,
			cost: 4
		}
	],
	passive: COLD_BLOODED,
	treasures: [
		treasure("Whetstone of Demon", (k) => ({ words: `[Mysterious Sword - Falling Petals] Increases DMG by ${pct(UT$15.whetstone.dmg)}, and upon Critical Hit, recovers Mana by ${k(UT$15.whetstone.mana)}. [Mysterious Sword - Blossom] Increases DMG by ${pct(UT$15.whetstone.dmg)}, and upon Critical Hit, reduces Cooldown of [Mysterious Sword - Falling Petals] by ${k(UT$15.whetstone.seconds)} sec.` })),
		treasure("Ring of Abyss", (k) => ({
			words: `[Blood Scattering Blade] Increases DMG by ${pct(UT$15.abyss.dmg)} and reduces M.Block of affected enemies by ${k(UT$15.abyss.block)}.`,
			skill: {
				index: 1,
				dmg: 1 + UT$15.abyss.dmg,
				mark: {
					name: "Ring of Abyss",
					blocks: { magical: -k(UT$15.abyss.block) },
					lasts: UT$15.abyss.lasts
				}
			}
		})),
		treasure("Enlightening Candlelight", (k) => ({
			words: `[Red Moon Blade] Gains immunity to CC for the duration of the skill. When the battle starts, increases DMG by ${pct(UT$15.candle.dmg)} for ${k(UT$15.candle.times)} time.`,
			skill: {
				index: 2,
				steady: true
			}
		})),
		treasure("Demonic Eight Trigrams", (k) => ({ words: `[Cold-Blooded Witch] DMG Boost against Non-Hero enemies increases by an additional ${fine(k(UT$15.trigrams.dmg))} per stack.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cost: -1
		} }, ({ skill }) => `[Mysterious Sword - Falling Petals] - Mana cost is reduced by ${-skill.cost}. [Mysterious Sword - Blossom] - Hit enemies' heal rate is reduced by ${pct(1 - PERKS$15.unhealed.heals)} for ${PERKS$15.unhealed.lasts} sec.`),
		"s1-dark": said({ skill: {
			index: 0,
			mark: {
				name: "Magic Weakness",
				takes: { magical: 1.25 },
				lasts: 10
			}
		} }, ({ skill: { mark } }) => `[Mysterious Sword - Falling Petals] - Target takes ${pct(mark.takes.magical - 1)} increased M.DMG for ${mark.lasts} sec. [Mysterious Sword - Blossom] - Mana cost is increased by ${PERKS$15.blossomCost}, and ignores enemy's DEF.`),
		"s2-light": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Reduces Mana Cost by ${-skill.cost}.`),
		"s2-dark": { words: `Upon each DMG dealt, recovers ${PERKS$15.mana} Mana.` },
		"s3-light": { words: "Dispels positive effects of all enemies in range." },
		"s3-dark": said({ skill: {
			index: 2,
			cost: 1,
			whole: true
		} }, ({ skill }) => `Increases Mana Cost by ${skill.cost} and ignores DEF when attacking Non-Hero enemies.`),
		"s4-light": { words: `Takes ${fine(PERKS$15.taken)} reduced DMG per stack.` },
		"s4-dark": { words: `When the battle starts, increases DMG to Non-Hero enemies by ${pct(PERKS$15.opening.deals - 1)} for ${PERKS$15.opening.lasts} sec.` },
		"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
		"t5-dark": { words: `All of caster's attacks will be critical hits, but the caster becomes unable to block while taking ${pct(PERKS$15.reckless - 1)} increased damage.` }
	},
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
		const blossomSkill = self.perks.has("s1-dark") ? {
			...BLOSSOM_SKILL,
			cost: BLOSSOM_SKILL.cost + PERKS$15.blossomCost
		} : BLOSSOM_SKILL;
		if (self.perks.has("s4-dark")) put(self.statuses, {
			name: OPENING.name,
			left: PERKS$15.opening.lasts,
			deals: PERKS$15.opening.deals,
			shown: OPENING
		});
		if (self.perks.has("t5-dark")) put(self.statuses, {
			name: RECKLESS.name,
			left: Infinity,
			crit: 1,
			takes: PERKS$15.reckless,
			blocks: {
				physical: -Infinity,
				magical: -Infinity
			},
			shown: RECKLESS
		});
		/** A blow of a skill of hers: a critical one makes her critical blows harder, and (with her unique weapon) deals more, and leaves the boss healed less and her healed more. */
		const cut = (amount, pierce = 0, whole = false) => {
			if (!fight.hit(self, amount, true, pierce, whole)) return false;
			witch = Math.min(WITCH.most, witch + 1);
			put(self.statuses, {
				name: WITCHED.name,
				left: Infinity,
				count: witch,
				critDamage: WITCH.critDamage * witch,
				...self.perks.has("s4-light") && { takes: 1 - PERKS$15.taken * witch },
				shown: WITCHED
			});
			if (tier === null) return true;
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
			return true;
		};
		const whetstone = treasureTier(self, 0) > 0 ? 1 + UT$15.whetstone.dmg : 1;
		let candle = fromTreasure(self, 2, UT$15.candle.times);
		const trigrams = fromTreasure(self, 3, UT$15.trigrams.dmg);
		return {
			lands: {
				petals() {
					if (cut(PETALS.blow * whetstone) && whetstone > 1) self.mana = Math.min(MAX_MANA, self.mana + fromTreasure(self, 0, UT$15.whetstone.mana));
				},
				blossom() {
					if (cut(BLOSSOM.blow * whetstone, 0, self.perks.has("s1-dark")) && whetstone > 1) petals = Math.max(0, petals - fromTreasure(self, 0, UT$15.whetstone.seconds));
					if (self.perks.has("s1-light")) put(fight.foe.statuses, {
						name: WILTED,
						left: PERKS$15.unhealed.lasts,
						heals: PERKS$15.unhealed.heals,
						shown: "curse"
					});
				},
				scatter(part) {
					const blows = part === 0 ? 1 : 2;
					if (self.perks.has("s2-dark")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$15.mana * blows);
					if (part === 0) {
						cut(SCATTER.rush);
						put(fight.foe.statuses, {
							name: SIN,
							left: SCATTER.lasts,
							shown: "curse"
						});
						fight.slow(SCATTER.speed, SCATTER.lasts);
						return;
					}
					cut(SCATTER.cut);
					cut(SCATTER.through, SCATTER.pierce);
				},
				moon() {
					cut(MOON$1.blow + MOON$1.boss);
					if (!ripe) return;
					cut(MOON$1.ripe + MOON$1.ripeBoss);
					put(fight.foe.statuses, {
						name: UNHEALED$1,
						left: MOON$1.unhealed,
						heals: MOON$1.heals,
						shown: "curse"
					});
				}
			},
			slot: (index) => index === 0 && blossom > 0 ? blossomSkill : self.abilities[index] ?? null,
			used(index, ability) {
				if (index === 0 && ability === blossomSkill) {
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
				if (waxing >= MOON$1.every) {
					waxing -= MOON$1.every;
					moonlight = MOON$1.light;
				}
			},
			deals: () => (candle > 0 ? 1 + UT$15.candle.dmg : 1) * (1 + trigrams * witch),
			blow() {
				if (candle > 0) candle--;
			},
			lit: () => moonlight > 0,
			ripe: (index) => index !== 2 || moonlight > 0,
			buffs: () => moonlight > 0 ? [{
				...MOONLIGHT,
				left: moonlight
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/valance.ts
var HOLOGRAM = {
	lasts: 15,
	atk: .2,
	crit: .2,
	heal: 13840,
	cooldown: .2
};
var FIELD = {
	lasts: 5,
	defense: 1.3,
	heal: 27670,
	mana: .3 * SECTION
};
var CANNON = {
	blow: 11640,
	stun: 3,
	lasers: CODED.cannon.lands.length - 1,
	laser: 2040,
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
/**
* Her own perks' numbers: how many allies her Hologram is on, and its crit DMG; the field's less taken and attack speed
* (points); her passive's less taken and more to the boss; and Transcend 5's Dark's for each piece of TechnoMagic gear.
*/
var PERKS$14 = {
	holograms: 2,
	critDamage: .5,
	fieldTaken: .75,
	fieldSpeed: 300,
	taken: .7,
	boss: .15,
	piece: .025
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): the Hologram's more DMG to the boss and its more cooldown
* off; the field's block (points); the cannon's shorter cooldown and more Manipulated at most; and every ally's more
* healing, with her passive's own DEF and mana for every ally.
*/
var UT$14 = {
	device: {
		dmg: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		cooldown: .5
	},
	tea: { block: [
		240,
		280,
		340,
		420,
		500
	] },
	sincerity: {
		cooldown: [
			3,
			4,
			5,
			6,
			7
		],
		most: 10
	},
	failure: { heals: [
		.12,
		.14,
		.17,
		.21,
		.25
	] }
};
var art$14 = skillArt("valance");
var AWAKENED = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Technomagic Awakening",
		about: `Passive. Her defense ${pct(AWAKENING.defense - 1)} higher and her mana filling ${pct(AWAKENING.mana - 1)} faster; every ally’s ATK ${pct(AWAKENING.atk)} higher, and (in the Technomagic Kingdom) every ally deals ${pct(AWAKENING.boss)} more to the boss.`,
		icon: "⚙️",
		art: art$14(3)
	},
	words: `Increases self’s All DEF, Mana Recovery/Attack, and ATK of all allies. In Technomagic Kingdom, increases all allies’ DMG dealt to Bosses by ${pct(AWAKENING.boss)}.`
};
/** What her passive gives every ally while she is on the field, and her alone. */
var AWAKENING_UP = {
	name: "Technomagic Awakening",
	about: `ATK ${pct(AWAKENING.atk)} higher, and ${pct(AWAKENING.boss)} more to the boss.`,
	icon: "⚙️",
	art: art$14(3)
};
var AWAKENING_SELF = {
	name: "Technomagic Awakening (Valance)",
	about: `Defense ${pct(AWAKENING.defense - 1)} higher, and mana filling ${pct(AWAKENING.mana - 1)} faster.`,
	icon: "⚙️",
	art: art$14(3)
};
/** Hologram: on its ally's card, with how long it has left. */
var HOLOGRAPHED = {
	name: "Hologram",
	about: "ATK and crit chance higher, healed every second, skills ready sooner; nothing the boss does holds it.",
	icon: "💠",
	art: art$14(0)
};
/** The Violet Force Field: on every ally's card while it lasts. */
var FIELDED = {
	name: "Violet Force Field",
	about: `Defense ${pct(FIELD.defense - 1)} higher, can’t be knocked down, healed and given mana every second.`,
	icon: "🟣",
	art: art$14(1)
};
/** What Ultimate Laser Cannon leaves on the boss. */
var MANIPULATED = "Manipulated";
/** What her Transcend 5's Dark leaves on the boss while she is on the field. */
var EXPOSED$2 = "Technomagic Awakening";
/** Something the boss has left on a hero that can be cleared (not what holds it down, or shuts it away). */
var harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
var VALANCE = {
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
			about: `Clears what the boss has left on the ally with the highest ATK, and gives it a [Hologram] for ${HOLOGRAM.lasts} seconds: ${pct(HOLOGRAM.atk)} more ATK and ${pct(HOLOGRAM.crit)} more crit chance, healed every second, its skills ready ${pct(HOLOGRAM.cooldown)} sooner, and nothing the boss does holds it.`,
			words: `Dispels negative effects from the ally with the highest ATK and grants [Hologram] for ${HOLOGRAM.lasts} sec. [Hologram] increases the target’s ATK, Crit Chance, heals ${healed("mechanic", HOLOGRAM.heal, bookHeal("valance", 0))} HP every sec, and reduces its Cooldown of all active Skills by ${HOLOGRAM.cooldown} sec. While [Hologram] is active, the target gains immunity to negative effects.`,
			icon: "💠",
			art: art$14(0),
			move: "prototype",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Absolute Protection Field – LA",
			about: `A field for ${FIELD.lasts} seconds that reaches every ally: ${pct(FIELD.defense - 1)} more defense, can’t be knocked down, and healed and given mana every second.`,
			words: `Creates an [Violet Force Field] that lasts for ${FIELD.lasts} sec within a wide range of self. Allies within the range of [Violet Force Field] have their All DEF increased by ${pct(FIELD.defense - 1)}, gain immunity to CC, and have ${healed("mechanic", FIELD.heal, bookHeal("valance", 1))} HP healed and Mana recovered every sec.`,
			icon: "🟣",
			art: art$14(1),
			move: "field",
			cooldown: 20,
			cost: 5
		},
		{
			name: "Ultimate Laser Cannon – NCE",
			about: `A laser that stuns the boss for ${CANNON.stun} seconds, then ${CANNON.lasers} more, each stunning it for ${CANNON.laserStun}; each leaves it [Manipulated] for ${CANNON.lasts} seconds (up to ${CANNON.most} times over): taking ${pct(CANNON.takes)} more and healed ${pct(CANNON.heals)} less.`,
			words: `Summons laser cannons behind self that fire laser beams, dealing ${dmg("mechanic", CANNON.blow, bookDmg("valance", 2))} P.DMG to the enemy. The hit target is inflicted with Stun for ${CANNON.stun} sec and becomes [Manipulated] for ${CANNON.lasts} sec. Afterward, the cannons additionally fire a total of ${CANNON.lasers} laser beams to random enemies. Each laser beam deals ${dmg("mechanic", CANNON.laser, bookDmg("valance", 2))} P.DMG, inflicts Stun on the hit target for ${CANNON.laserStun} sec, and inflicts [Manipulated] for ${CANNON.lasts} sec. Enemies who are [Manipulated] have their Heal Rate reduced by ${pct(CANNON.heals)} and take ${pct(CANNON.takes)} increased All DMG. [Manipulated] can be stacked up to max ${CANNON.most} times.`,
			icon: "🔫",
			art: art$14(2),
			move: "cannon",
			cooldown: 20,
			cost: 4
		}
	],
	passive: AWAKENED,
	treasures: [
		treasure("Formula Input Device", (k) => ({ words: `[Hologram] The effect additionally increases DMG dealt to Non-Hero enemies by ${pct(k(UT$14.device.dmg))} and the target's Cooldown Reduction by ${pct(UT$14.device.cooldown)}.` })),
		treasure("A Moment of Tea", (k) => ({
			words: `[Absolute Protection Field - LA] Dispels negative effects from self upon use. For the duration of [Violet Force Field], increases the target's All Block Chance by ${k(UT$14.tea.block)}.`,
			skill: {
				index: 1,
				cleanse: "self"
			}
		})),
		treasure("Sloppy Sincerity", (k) => ({
			words: `[Ultimate Laser Cannon - NCE] Reduces Cooldown by ${k(UT$14.sincerity.cooldown)} sec and changes the max number of [Manipulated] stacks to ${UT$14.sincerity.most}.`,
			skill: {
				index: 2,
				cooldown: -k(UT$14.sincerity.cooldown)
			}
		})),
		treasure("First Failure", (k) => ({ words: `[Technomagic Awakening] All DEF Boost and Mana Recovery/Attack Boost effects now apply to all allies. Increases Heal Rate of all allies by ${pct(k(UT$14.failure.heals))}.` }))
	],
	perks: {
		"s1-light": { words: `[Hologram] applies to ${PERKS$14.holograms} allies with the highest ATK.` },
		"s1-dark": { words: `[Hologram] additionally increases Crit DMG by ${pct(PERKS$14.critDamage)}.` },
		"s2-light": { words: `[Violet Force Field] additionally reduces DMG taken by ${pct(1 - PERKS$14.fieldTaken)}.` },
		"s2-dark": { words: `[Violet Force Field] additionally increases ATK Spd by ${PERKS$14.fieldSpeed}.` },
		"s3-light": { words: "Dispels positive effects from the hit target." },
		"s3-dark": said({ skill: {
			index: 2,
			cost: -1
		} }, ({ skill }) => `Reduces Mana Cost by ${-skill.cost}.`),
		"s4-light": { words: `Reduces DMG all allies take by ${pct(1 - PERKS$14.taken)} in Technomagic Kingdom.` },
		"s4-dark": { words: `Additionally increases all allies' DMG dealt to Bosses by ${pct(PERKS$14.boss)} in Technomagic Kingdom.` },
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK Spd +${pct(share$2(speed))}`),
		"t5-dark": { words: `Reduces all DMG all allies take by ${fine(PERKS$14.piece)} and increases All DMG all enemies take by ${fine(PERKS$14.piece)}. This effect can be stacked up to the number of Technomagic Gear equipped to self.` }
	},
	attack: "bolt",
	join(fight, self) {
		/** Whom her Hologram is on (two, with its Light), and for how long yet; and toward its next heal (once a second). */
		let holos = [];
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
			const stacks = Math.min(treasureTier(self, 2) > 0 ? UT$14.sincerity.most : CANNON.most, (fight.foe.statuses.find((status) => status.name === MANIPULATED)?.count ?? 0) + 1);
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
		/** What her passive gives every ally, with her perks: less taken (its Light, and Transcend 5's Dark), and more to the boss (its Dark). */
		const pieces = self.perks.has("t5-dark") ? tmPieces(self) : 0;
		const taken = (self.perks.has("s4-light") ? PERKS$14.taken : 1) * (1 - PERKS$14.piece * pieces);
		const boss = AWAKENING.boss + (self.perks.has("s4-dark") ? PERKS$14.boss : 0);
		return {
			lands: {
				bolt() {
					fight.hit(self, fight.basic);
				},
				prototype() {
					const top = allies().sort((a, b) => b.stats.atk - a.stats.atk).slice(0, self.perks.has("s1-light") ? PERKS$14.holograms : 1);
					if (top.length === 0) return;
					fight.cue(self, "prototype", top);
					for (const was of holos) if (!top.includes(was)) was.statuses = was.statuses.filter((status) => status.name !== HOLOGRAPHED.name);
					const harder = self.perks.has("s1-dark") ? { critDamage: PERKS$14.critDamage } : {};
					const device = 1 + fromTreasure(self, 0, UT$14.device.dmg);
					for (const ally of top) {
						ally.statuses = ally.statuses.filter((status) => !harmful(status));
						put(ally.statuses, {
							name: HOLOGRAPHED.name,
							left: HOLOGRAM.lasts,
							deals: (1 + HOLOGRAM.atk) * device,
							crit: HOLOGRAM.crit,
							...harder,
							guards: true,
							shown: HOLOGRAPHED
						});
					}
					holos = top;
					holoLeft = HOLOGRAM.lasts;
					holoHeal = 0;
				},
				field() {
					const on = allies();
					fight.cue(self, "field", on);
					const tea = fromTreasure(self, 1, UT$14.tea.block);
					const more = {
						...self.perks.has("s2-light") && { takes: PERKS$14.fieldTaken },
						...self.perks.has("s2-dark") && { pace: 1 + share$2(PERKS$14.fieldSpeed) },
						...tea > 0 && { blocks: {
							physical: tea,
							magical: tea
						} }
					};
					for (const ally of on) put(ally.statuses, {
						name: FIELDED.name,
						left: FIELD.lasts,
						defends: FIELD.defense,
						...more,
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
				if (holos.length > 0) {
					holoLeft -= dt;
					holos = holoLeft <= 0 ? [] : holos.filter((on) => on.hp > 0);
					if (holos.length > 0) holoHeal += dt;
					const healing = holoHeal >= 1;
					if (healing) holoHeal -= 1;
					for (const on of holos) {
						on.statuses = on.statuses.filter((status) => !harmful(status));
						on.cooldowns = on.cooldowns.map((left) => Math.max(0, left - HOLOGRAM.cooldown * (treasureTier(self, 0) > 0 ? 1 + UT$14.device.cooldown : 1) * dt));
						if (healing) fight.heal(on, HOLOGRAM.heal, self);
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
					fight.foe.statuses = fight.foe.statuses.filter((status) => status.name !== EXPOSED$2);
					return;
				}
				if (pieces > 0) put(fight.foe.statuses, {
					name: EXPOSED$2,
					left: Infinity,
					count: pieces,
					takes: 1 + PERKS$14.piece * pieces,
					shown: "curse"
				});
				const failure = fromTreasure(self, 3, UT$14.failure.heals);
				put(self.statuses, {
					name: AWAKENING_SELF.name,
					left: Infinity,
					defends: AWAKENING.defense,
					mana: AWAKENING.mana,
					shown: AWAKENING_SELF
				});
				for (const ally of allies()) {
					if (failure > 0 && ally !== self) put(ally.statuses, {
						name: AWAKENING_SELF.name,
						left: Infinity,
						defends: AWAKENING.defense,
						mana: AWAKENING.mana,
						shown: AWAKENING_SELF
					});
					put(ally.statuses, {
						name: AWAKENING_UP.name,
						left: Infinity,
						deals: (1 + AWAKENING.atk) * (1 + boss),
						...taken < 1 && { takes: taken },
						...failure > 0 && { heals: 1 + failure },
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
};
//#endregion
//#region src/technomagic/sim/heroes/lucikiel.ts
var STORM = {
	hits: CODED.storm.lands.length,
	blow: 5220
};
/** Shadow of Death: how long it lasts, how hard it eats at the boss every second, and what it leaves of the boss's heals. */
var SHADOW = {
	lasts: 10,
	each: 520,
	every: 1,
	heals: .7
};
var WAVE = {
	blow: 7830,
	stun: 3
};
var SURGE = {
	blow: 9140,
	stun: 5
};
var DOOMSDAY = {
	hits: CODED.doomsday.lands.length,
	blow: 2090,
	last: 10440,
	down: 5
};
/** Pain of Doom: how long it lasts, and the blow more each of his blows on it deals. */
var PAIN = {
	lasts: 10,
	blow: 1040
};
/** His passive: what he takes, how long what knocks him down holds him, and his shield's size and how long it lasts. */
var ARMOR$1 = {
	taken: .75,
	held: .5,
	shield: 322e3,
	lasts: 6
};
/** His own perks' numbers: Shadow of Death's more M.DMG taken, Armor of the Demon God's Dark's less taken besides, and Transcend 5's Dark (more DMG every so often, up to so many times). */
var PERKS$13 = {
	shadow: 1.25,
	taken: .15,
	doom: {
		dmg: .05,
		every: 6,
		most: 10
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Death Storm's shorter cooldown and Shadow of Death's more
* M.DMG taken; the Wave's and the Surge's CC ACC (points, a moment: as long as their blows take to land); Pain of Doom's
* more DMG; and Authority of the Demon God's bigger shield.
*/
var UT$13 = {
	emblem: {
		cooldown: -3,
		takes: [
			.14,
			.17,
			.21,
			.25,
			.3
		]
	},
	strap: {
		wave: [
			360,
			430,
			520,
			630,
			750
		],
		surge: [
			480,
			580,
			700,
			840,
			1e3
		],
		lasts: 2
	},
	horns: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	earrings: { shield: [
		.24,
		.29,
		.35,
		.42,
		.5
	] }
};
var art$13 = skillArt("lucikiel");
var ARMOR_OF_THE_DEMON_GOD = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: ARMOR$1.taken,
	held: ARMOR$1.held,
	shown: {
		name: "Armor of the Demon God",
		about: `Passive. He takes ${pct(1 - ARMOR$1.taken)} less, and is knocked down ${pct(1 - ARMOR$1.held)} shorter. Each skill he uses gives him [Authority of the Demon God] for ${ARMOR$1.lasts} seconds: a shield, and he can’t be knocked down while it lasts.`,
		icon: "🛡️",
		art: art$13(3)
	},
	words: `Reduces All DMG taken by ${pct(1 - ARMOR$1.taken)} and the duration of CC by ${pct(1 - ARMOR$1.held)}. Upon every Skill use, creates [Authority of the Demon God] that absorbs ${healed("wizard", ARMOR$1.shield, bookHeal("lucikiel", 3))} DMG for ${ARMOR$1.lasts} sec. Gains immunity to CC for the duration of [Authority of the Demon God].`
};
/** What Annihilation Wave's slot holds once it is used (its picture is the game's for it, past his passive's). */
var SURGE_SKILL = {
	name: "Annihilation Surge",
	about: `A wider wave: a blow that stuns the boss for ${SURGE.stun} seconds, and a blow more. Used, this slot holds [Annihilation Wave] again.`,
	words: `Attacks frontal enemies within a wide range 2 times. The first attack deals ${dmg("wizard", SURGE.blow)} M.DMG and inflicts stun for ${SURGE.stun} sec. The second attack deals ${dmg("wizard", SURGE.blow)} M.DMG and draws in hit targets in front of self. After use, the Skill changes to [Annihilation Wave].`,
	icon: "🌊",
	art: art$13(4),
	move: "surge",
	cooldown: 13,
	cost: 3
};
/** Authority of the Demon God: shown on his card, with how long it has left. */
var AUTHORITY = {
	name: "Authority of the Demon God",
	about: "A shield; he can’t be knocked down.",
	icon: "🛡️",
	art: art$13(3)
};
/** Transcend 5's Dark: shown on his card, with its stacks. */
var RUIN$1 = {
	name: "Destruction",
	about: `${pct(PERKS$13.doom.dmg)} more DMG for each.`,
	icon: "💢",
	art: art$13(3)
};
/** What his skills leave on the boss. */
var SHADOW_OF_DEATH = "Shadow of Death";
var PAIN_OF_DOOM = "Pain of Doom";
var LUCIKIEL = {
	id: "lucikiel",
	name: "Lucikiel",
	class: "wizard",
	line: "front",
	skins: ["Lucikiel"],
	stats: {
		...CLASS_STATS.wizard,
		deals: "magical"
	},
	abilities: [
		{
			name: "Death Storm",
			about: `${STORM.hits} blows that leave [Shadow of Death] on the boss for ${SHADOW.lasts} seconds: it eats at the boss every second and leaves it healed ${pct(1 - SHADOW.heals)} less.`,
			words: `Attacks the target and nearby enemies ${STORM.hits} times, dealing a total of ${dmg("wizard", STORM.blow * STORM.hits, bookDmg("lucikiel", 0))} M.DMG and leaving a [Shadow of Death]. [Shadow of Death] deals ${dmg("wizard", SHADOW.each * SHADOW.lasts, bookDmg("lucikiel", 0))} M.DMG and reduces the target's Heal Rate by ${pct(1 - SHADOW.heals)} over ${SHADOW.lasts} sec.`,
			icon: "🌪️",
			art: art$13(0),
			move: "storm",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Annihilation Wave",
			about: `A blow that stuns the boss for ${WAVE.stun} seconds, and a blow more. Used, this slot holds [Annihilation Surge].`,
			words: `Attacks frontal enemies within range 2 times. The first attack deals ${dmg("wizard", WAVE.blow, bookDmg("lucikiel", 1))} M.DMG and inflicts Stun for ${WAVE.stun} sec. The second attack deals ${dmg("wizard", WAVE.blow, bookDmg("lucikiel", 1))} M.DMG and draws in hit targets in front of self. After use, the Skill changes to [Annihilation Surge].`,
			icon: "🌊",
			art: art$13(1),
			move: "wave",
			cooldown: 13,
			cost: 3
		},
		{
			name: "Doomsday",
			about: `${DOOMSDAY.hits} blows, the last knocking the boss down for ${DOOMSDAY.down} seconds and leaving [Pain of Doom] on it for ${PAIN.lasts}: each blow of his on it meanwhile deals more.`,
			words: `Attacks nearby enemies ${DOOMSDAY.hits} times, dealing ${dmg("wizard", DOOMSDAY.blow, bookDmg("lucikiel", 2))} M.DMG each, and draws them in front of self. The last hit deals ${dmg("wizard", DOOMSDAY.last, bookDmg("lucikiel", 2))} more M.DMG, knocks down hit targets for ${DOOMSDAY.down} sec, and leaves [Pain of Doom] that lasts for ${PAIN.lasts} sec. Each time Lucikiel attacks targets inflicted with [Pain of Doom] with a normal or Skill attack, he deals additional ${dmg("wizard", PAIN.blow, bookDmg("lucikiel", 2))} M.DMG.`,
			icon: "☄️",
			art: art$13(2),
			move: "doomsday",
			cooldown: 23,
			cost: 4
		}
	],
	passive: ARMOR_OF_THE_DEMON_GOD,
	treasures: [
		treasure("Emblem of Destruction", (k) => ({
			words: `[Death Storm] Reduces Cooldown by ${-UT$13.emblem.cooldown} sec and [Shadow of Death] additionally increases M.DMG take by ${pct(k(UT$13.emblem.takes))}`,
			skill: {
				index: 0,
				cooldown: UT$13.emblem.cooldown
			}
		})),
		treasure("Dark Blue Leather Strap", (k) => ({
			words: `[Annihilation Wave] Dispels positive effects from hit targets and increases CC ACC by ${k(UT$13.strap.wave)} for the duration of Skill. [Annihilation Surge] Dispels positive effects from hit targets and increases CC ACC by ${k(UT$13.strap.surge)} for the duration of Skill.`,
			skill: {
				index: 1,
				dispel: true
			}
		})),
		treasure("Horns of a Random Demon", (k) => ({ words: `[Doomsday] Changes DMG dealt with [Pain of Doom] to DMG that ignores DEF and increases DMG dealt with [Pain of Doom] by ${pct(k(UT$13.horns.dmg))}.` })),
		treasure("Blue Blood Earrings", (k) => ({ words: `[Armor of the Demon God] [Authority of the Demon God] becomes irremovable and shield increases by ${pct(k(UT$13.earrings.shield))}.` }))
	],
	perks: {
		"s1-light": { words: "[Shadow of Death] Becomes irremovable." },
		"s1-dark": { words: `[Shadow of Death] additionally increases M.DMG taken by ${pct(PERKS$13.shadow - 1)}.` },
		"s2-light": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Reduces Mana Cost by ${-skill.cost}.`),
		"s2-dark": { words: "At the beginning of the first battle, changes the skill to [Annihilation Surge]." },
		"s3-light": said({ skill: {
			index: 2,
			cooldown: -7
		} }, ({ skill }) => `Reduces Cooldown by ${-skill.cooldown} sec.`),
		"s3-dark": { words: "Each hit reduces the hit target's Mana by 200." },
		"s4-light": { words: "At the beginning of each battle, creates [Authority of the Demon God]." },
		"s4-dark": { words: `Reduces All DMG taken by an additional ${pct(PERKS$13.taken)}.` },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": { words: `Increases DMG dealt to enemies by ${pct(PERKS$13.doom.dmg)} every ${PERKS$13.doom.every} sec. This effect can be stacked up to max ${PERKS$13.doom.most} times and is irremovable.` }
	},
	attack: "havoc",
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
		/** Whether his second slot holds the Surge (its Dark: from the start); how long his Authority lasts yet; his unique weapon's blows toward a stack, and its stacks. */
		let surging = self.perks.has("s2-dark");
		let authority = 0;
		let blows = 0;
		let incarnation = 0;
		/** Seconds he has been in the fight (Transcend 5's Dark), and toward Shadow of Death's next bite. */
		let time = 0;
		let bitten = 0;
		const tier = self.unique?.tier ?? null;
		const surgeSkill = {
			...SURGE_SKILL,
			cost: Math.max(0, SURGE_SKILL.cost + self.abilities[1].cost - LUCIKIEL.abilities[1].cost)
		};
		/** His shield, and for as long as it lasts he can't be knocked down. */
		const armor = () => {
			fight.shield(self, ARMOR$1.shield * (1 + fromTreasure(self, 3, UT$13.earrings.shield)), ARMOR$1.lasts, self);
			authority = ARMOR$1.lasts;
		};
		if (self.perks.has("s4-light")) armor();
		const bears = (name) => fight.foe.statuses.some((status) => status.name === name);
		/** How many stacks of Transcend 5's Dark he has. */
		const ruin = () => self.perks.has("t5-dark") ? Math.min(PERKS$13.doom.most, Math.floor(time / PERKS$13.doom.every)) : 0;
		return {
			lands: {
				havoc() {
					fight.hit(self, fight.basic);
				},
				attack() {
					fight.hit(self, fight.basic);
				},
				storm() {
					fight.hit(self, STORM.blow);
					const shadow = (self.perks.has("s1-dark") ? PERKS$13.shadow : 1) * (1 + fromTreasure(self, 0, UT$13.emblem.takes));
					put(fight.foe.statuses, {
						name: SHADOW_OF_DEATH,
						left: SHADOW.lasts,
						heals: SHADOW.heals,
						...shadow > 1 && { takes: { magical: shadow } },
						shown: "curse"
					});
				},
				wave(part) {
					fight.hit(self, WAVE.blow);
					if (part === 0) fight.stun(WAVE.stun, { by: self });
				},
				surge(part) {
					fight.hit(self, SURGE.blow);
					if (part === 0) fight.stun(SURGE.stun, { by: self });
				},
				doomsday(part) {
					if (part < DOOMSDAY.hits - 1) {
						fight.hit(self, DOOMSDAY.blow);
						return;
					}
					fight.hit(self, DOOMSDAY.blow + DOOMSDAY.last);
					fight.stun(DOOMSDAY.down, {
						down: true,
						by: self
					});
					put(fight.foe.statuses, {
						name: PAIN_OF_DOOM,
						left: PAIN.lasts,
						shown: "curse"
					});
				}
			},
			slot: (index) => index === 1 && surging ? surgeSkill : self.abilities[index] ?? null,
			used(index, ability) {
				if (index === 1) {
					surging = ability !== surgeSkill;
					const accuracy = fromTreasure(self, 1, ability === surgeSkill ? UT$13.strap.surge : UT$13.strap.wave);
					if (accuracy > 0) put(self.statuses, {
						name: "Dark Blue Leather Strap",
						left: UT$13.strap.lasts,
						accuracy,
						shown: {
							name: "Dark Blue Leather Strap",
							about: `CC ACC +${accuracy}.`,
							icon: "🌊",
							art: art$13(1)
						}
					});
				}
				armor();
			},
			blow() {
				if (bears(PAIN_OF_DOOM)) fight.hit(self, PAIN.blow * (1 + fromTreasure(self, 2, UT$13.horns.dmg)), false, 0, treasureTier(self, 2) > 0);
				if (tier === null) return;
				if (incarnation >= GIGANTE.most) fight.hit(self, atTier(GIGANTE.blow, tier), false, 0, true);
				blows++;
				if (blows >= GIGANTE.blows) {
					blows = 0;
					incarnation = Math.min(GIGANTE.most, incarnation + 1);
				}
			},
			tick(dt) {
				authority = Math.max(0, authority - dt);
				if (fight.field.includes(self) && self.hp > 0) time += dt;
				if (!bears(SHADOW_OF_DEATH)) {
					bitten = 0;
					return;
				}
				bitten += dt;
				if (bitten >= SHADOW.every) {
					bitten -= SHADOW.every;
					fight.hit(self, SHADOW.each, false);
				}
			},
			takes: () => self.perks.has("s4-dark") ? (ARMOR$1.taken - PERKS$13.taken) / ARMOR$1.taken : 1,
			guards: () => authority > 0,
			deals: () => (1 + (tier === null ? 0 : atTier(GIGANTE.atk, tier) * incarnation)) * (1 + PERKS$13.doom.dmg * ruin()),
			speed: () => tier === null ? 0 : atTier(GIGANTE.speed, tier) * incarnation,
			lit: () => surging,
			buffs: () => [
				...authority > 0 ? [{
					...AUTHORITY,
					left: authority
				}] : [],
				...incarnation > 0 ? [{
					...GIGANTE_UP,
					count: incarnation
				}] : [],
				...ruin() > 0 ? [{
					...RUIN$1,
					count: ruin()
				}] : []
			]
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/selene.ts
var RAIN = {
	arrows: CODED.rain.lands.length,
	blow: indexed("archer", 617748) / CODED.rain.lands.length
};
var RUSH = {
	arrows: CODED.rush.lands.length,
	blow: indexed("archer", 112278)
};
/** Its arrow at most (with the boss's health whole), knocking it down, and its blow more against a boss, through its defense. */
var FLASH = {
	most: indexed("archer", 657142),
	down: 3,
	boss: indexed("archer", 657142) / 2
};
/** Moonlight Arrow: her ATK and crit chance (points) more for each stack, for `lasts` seconds, up to `most`. */
var MOON = {
	atk: 5056,
	crit: 100,
	lasts: 10,
	most: 3,
	critDamage: .1
};
/** Her own perks' numbers: Arrow Rain's stun (its chance), Rush's flinch, and Moonlight Arrow's most stacks. */
var PERKS$12 = {
	stun: {
		chance: .2,
		lasts: 2
	},
	flinch: .5,
	most: 5
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Arrow Rain's cheaper and shorter cooldown; Rush's DMG and
* its arrow's chance on her attack; Moonlight Flash's DMG and more P.DMG taken; Moonlight Arrow's attack speed (points)
* and more DMG to the boss for each stack.
*/
var UT$12 = {
	gloves: {
		cost: -1,
		cooldown: [
			1.2,
			1.4,
			1.7,
			2.1,
			2.5
		]
	},
	seal: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		chance: .15,
		arrows: 1
	},
	silver: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		takes: .2,
		lasts: 10
	},
	circlet: {
		speed: 100,
		dmg: [
			.024,
			.029,
			.035,
			.042,
			.05
		]
	}
};
var art$12 = skillArt("selene");
var MOONLIGHT_ARROW = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Moonlight Arrow",
		about: `Passive. Each attack of hers gives her +${num(MOON.atk)} ATK and +${MOON.crit} crit chance for ${MOON.lasts} seconds (up to ${MOON.most} times).`,
		icon: "🌙",
		art: art$12(3)
	},
	words: `Upon attacking, increases ATK by ${num(MOON.atk)} and Crit Chance by ${MOON.crit} for ${MOON.lasts} sec. This effect stacks up to ${MOON.most} times. Critical DMG increases additionally by ${pct(MOON.critDamage)} per stack.`
};
/** Moonlight Arrow's stacks: shown on her card. */
var MOONLIT = {
	name: "Moonlight Arrow",
	about: "ATK and crit chance higher for each.",
	icon: "🌙",
	art: art$12(3)
};
var SELENE = {
	id: "selene",
	name: "Selene",
	class: "archer",
	skins: ["Selene"],
	stats: {
		...CLASS_STATS.archer,
		deals: "physical"
	},
	abilities: [
		{
			name: "Arrow Rain",
			about: `${RAIN.arrows} arrows at the boss.`,
			words: `Shoots ${RAIN.arrows} arrows to random enemies and deals a total of ${dmg("archer", RAIN.blow * RAIN.arrows, bookDmg("selene", 0))} P.DMG.`,
			icon: "🏹",
			art: art$12(0),
			move: "rain",
			cooldown: 8,
			cost: 3
		},
		{
			name: "Rush",
			about: `${RUSH.arrows} arrows that launch at the boss.`,
			words: `Upon attacking, summons ${RUSH.arrows} arrows that launch towards the enemy. Each arrow deals ${dmg("archer", RUSH.blow, bookDmg("selene", 1))} P.DMG.`,
			icon: "💨",
			art: art$12(1),
			move: "rush",
			cooldown: 6,
			cost: 1
		},
		{
			name: "Moonlight Flash",
			about: `An arrow the harder the more of the boss’s health is left, knocking it down for ${FLASH.down} seconds, and a blow more through its defense.`,
			words: `Fires an arrow in a straight line, dealing P.DMG to all enemies in range based on the target's remaining HP. Deals a maximum of ${dmg("archer", FLASH.most, bookDmg("selene", 2))} P.DMG and knocks down the target. Against Bosses, deals additional ${dmg("archer", FLASH.boss, bookDmg("selene", 2))} P.DMG that ignores DEF.`,
			icon: "🌕",
			art: art$12(2),
			move: "flash",
			cooldown: 20,
			cost: 4
		}
	],
	passive: MOONLIGHT_ARROW,
	treasures: [
		treasure("Sharpshooter’s Gloves", (k) => ({
			words: `[Arrow Rain] Reduces Mana Cost by ${-UT$12.gloves.cost} and Cooldown by ${k(UT$12.gloves.cooldown)} sec.`,
			skill: {
				index: 0,
				cost: UT$12.gloves.cost,
				cooldown: -k(UT$12.gloves.cooldown)
			}
		})),
		treasure("Wind Spirit Seal Stone", (k) => ({
			words: `[Rush] Increases DMG by ${pct(k(UT$12.seal.dmg))} and has a ${pct(UT$12.seal.chance)} chance to summon ${UT$12.seal.arrows} Rush Arrow upon a normal attack.`,
			skill: {
				index: 1,
				dmg: 1 + k(UT$12.seal.dmg)
			}
		})),
		treasure("Silver Arrow", (k) => ({
			words: `[Moonlight Flash] DMG is increased by ${pct(k(UT$12.silver.dmg))} and target takes ${pct(UT$12.silver.takes)} additional P.DMG for ${UT$12.silver.lasts} sec.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$12.silver.dmg),
				mark: {
					name: "Silver Arrow",
					takes: { physical: 1 + UT$12.silver.takes },
					lasts: UT$12.silver.lasts
				}
			}
		})),
		treasure("Circlet of Wind", (k) => ({
			words: `[Moonlight Arrow] Increases ATK Spd by ${UT$12.circlet.speed} and each stack increases DMG to Non-Hero enemies by ${fine(k(UT$12.circlet.dmg))}.`,
			bonus: { speed: UT$12.circlet.speed }
		}))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s1-dark": { words: `There is a ${pct(PERKS$12.stun.chance)} chance to inflict Stun for ${PERKS$12.stun.lasts} sec.` },
		"s2-light": said({ skill: {
			index: 1,
			whole: true
		} }, () => "Ignores DEF when there is only 1 enemy."),
		"s2-dark": { words: `Makes the enemy flinch for ${PERKS$12.flinch} sec.` },
		"s3-light": said({ skill: {
			index: 2,
			cooldown: -3
		} }, ({ skill }) => `Reduces cooldown by ${-skill.cooldown} sec.`),
		"s3-dark": { words: "Ignores enemy Block." },
		"s4-light": { words: `Max stack number is changed to ${PERKS$12.most}.` },
		"s4-dark": { words: "Auto attack range is boosted by 20%." },
		"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
		"t5-dark": said({ bonus: {
			crit: -300,
			critDamage: 1.5
		} }, ({ bonus }) => `Reduces own Crit Chance by ${-bonus.crit} and increases Crit DMG by ${pct(bonus.critDamage)}.`)
	},
	attack: "arrow",
	timing: {
		attack: [{
			lands: [.98],
			until: 1.03
		}],
		skills: {
			rain: {
				lands: Array.from({ length: RAIN.arrows }, (_, i) => 1 + i * .08),
				until: 2.1
			},
			rush: {
				lands: Array.from({ length: RUSH.arrows }, (_, i) => 1 + i * .1),
				until: 1.6
			},
			flash: {
				lands: [1.45],
				until: 1.6
			}
		}
	},
	join(fight, self) {
		/** Moonlight Arrow's stacks (its Light: more of them), and how long they last yet; how long her unique weapon quickens her yet. */
		const most = self.perks.has("s4-light") ? PERKS$12.most : MOON.most;
		let moon = 0;
		let moonLeft = 0;
		let notos = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of hers: a critical one, with her unique weapon, quickens her for a while. */
		const shoot = (amount, whole = false) => {
			const critical = fight.hit(self, amount, true, 0, whole);
			if (critical && tier !== null) notos = NOTOS.lasts;
			return critical;
		};
		/** Her ATK and crit chance for her Moonlight Arrow's stacks. */
		const moonlit = () => {
			const circlet = 1 + fromTreasure(self, 3, UT$12.circlet.dmg) * moon;
			put(self.statuses, {
				name: MOONLIT.name,
				left: MOON.lasts,
				count: moon,
				deals: (1 + MOON.atk * moon / self.stats.atk) * circlet,
				crit: share$2(MOON.crit * moon),
				critDamage: MOON.critDamage * moon,
				shown: MOONLIT
			});
		};
		/** Her attack: an arrow, a stack of Moonlight Arrow (all of them begun again); with her unique weapon quickening her, an arrow more. */
		const loose = (amount) => {
			shoot(amount);
			moon = Math.min(most, moon + 1);
			moonLeft = MOON.lasts;
			moonlit();
			if (notos > 0 && tier !== null) fight.hit(self, atTier(NOTOS.arrow, tier), false);
			if (treasureTier(self, 1) > 0 && fight.roll() < UT$12.seal.chance) for (let i = 0; i < UT$12.seal.arrows; i++) shoot(RUSH.blow * (1 + fromTreasure(self, 1, UT$12.seal.dmg)));
		};
		return {
			lands: {
				arrow: () => loose(fight.basic),
				attack: () => loose(fight.basic),
				rain() {
					shoot(RAIN.blow);
					if (self.perks.has("s1-dark") && fight.roll() < PERKS$12.stun.chance) fight.stun(PERKS$12.stun.lasts, { by: self });
				},
				rush() {
					shoot(RUSH.blow);
					if (self.perks.has("s2-dark")) fight.stun(PERKS$12.flinch, { by: self });
				},
				flash() {
					shoot(FLASH.most * (fight.foe.hp / fight.foe.maxHp));
					fight.stun(FLASH.down, {
						down: true,
						by: self
					});
					shoot(FLASH.boss, true);
				}
			},
			tick(dt) {
				notos = Math.max(0, notos - dt);
				if (moonLeft > 0) {
					moonLeft -= dt;
					if (moonLeft <= 0) moon = 0;
				}
			},
			speed: () => notos > 0 && tier !== null ? atTier(NOTOS.speed, tier) : 0,
			lit: () => moon >= most,
			buffs: () => notos > 0 ? [{
				...NOTOS_UP,
				left: notos
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/crow.ts
var ELIMINATE = {
	shots: CODED.eliminate.lands.length,
	blow: indexed("mechanic", 164145) / CODED.eliminate.lands.length,
	marks: 2
};
var STRUGGLE = {
	shots: CODED.struggle.lands.length - 1,
	blow: indexed("mechanic", 195630) / (CODED.struggle.lands.length - 1),
	frost: indexed("mechanic", 109497),
	freeze: 4,
	area: 6,
	every: 2,
	chill: indexed("mechanic", 52409),
	chance: .5,
	chilled: 2
};
var GODS = {
	blow: indexed("mechanic", 165718),
	each: indexed("mechanic", 5299),
	focus: 2
};
/** Hunting Dog's Fang Marks: how long they last, and the most there can be. */
var FANG = {
	lasts: 40,
	most: 100
};
/** Hunting Preparation: his ATK (added to his class's, as the game has it), crit DMG more, and mana a second. */
var HUNTING = {
	atk: 25288,
	critDamage: .8,
	mana: 300
};
/** His own perks' numbers: Target will be Eliminated.'s mana for each blow, and the freezing area's more chance. */
var PERKS$11 = {
	mana: 30,
	chance: .3
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Target will be Eliminated.'s shorter cooldown and the mana it
* would take (the boss has none); Struggle is Meaningless.'s cheaper and its chance to freeze the boss with each shot;
* Even Gods shall Die.'s DMG; and Hunting Preparation's more ATK.
*/
var UT$11 = {
	bullet: {
		cooldown: -3,
		mana: [
			24,
			29,
			35,
			42,
			50
		]
	},
	barrage: {
		cost: -1,
		chance: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		freeze: 3
	},
	pendant: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	box: { atk: [
		.24,
		.29,
		.35,
		.42,
		.5
	] }
};
var art$11 = skillArt("crow");
var HUNTING_PREPARATION = {
	attack: 1,
	crit: 0,
	control: 1,
	steady: true,
	shown: {
		name: "Hunting Preparation",
		about: `Passive. Nothing quickens or slows him; his ATK is higher and his crit damage ${pct(HUNTING.critDamage)} higher; he recovers mana every second besides; his attack leaves a [Hunting Dog’s Fang Mark].`,
		icon: "🐺",
		art: art$11(3)
	},
	words: `Crow is not affected by changes in ATK Spd. ATK increases by ${num(HUNTING.atk)} and Crit DMG by ${pct(HUNTING.critDamage)}. Recovers ${HUNTING.mana} Mana every second. It also leaves a 'Hunting Dog's Fang Mark' to target for ${FANG.lasts} sec when dealing a normal attack.`
};
/** The freezing area: shown on his card while it lasts. */
var FREEZING = {
	name: "Freezing Area",
	about: `Strikes the boss every ${STRUGGLE.every} seconds, now and then freezing it.`,
	icon: "❄️",
	art: art$11(1)
};
/** What his skills leave on the boss. */
var FANG_MARK = "Hunting Dog’s Fang Mark";
var CROW = {
	id: "crow",
	name: "Crow",
	class: "mechanic",
	skins: ["Crow"],
	stats: {
		...CLASS_STATS.mechanic,
		atk: CLASS_STATS.mechanic.atk + HUNTING.atk,
		critDamage: CLASS_STATS.mechanic.critDamage + HUNTING.critDamage,
		deals: "physical"
	},
	abilities: [
		{
			name: "Target will be Eliminated.",
			about: `${ELIMINATE.shots} shots, then ${ELIMINATE.marks} [Hunting Dog’s Fang Marks] on the boss (up to ${FANG.most}, for ${FANG.lasts} seconds).`,
			words: `Deals a total of ${dmg("mechanic", ELIMINATE.blow * ELIMINATE.shots, bookDmg("crow", 0))} P.DMG to enemies in front over ${ELIMINATE.shots} times and leaves ${ELIMINATE.marks} 'Hunting Dog's Fang Marks' for ${FANG.lasts} sec. Hunting Dog's Fang Mark stacks up to max ${FANG.most} times.`,
			icon: "🔫",
			art: art$11(0),
			move: "eliminate",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Struggle is Meaningless.",
			about: `${STRUGGLE.shots} shots, then a Frost Bullet that freezes the boss for ${STRUGGLE.freeze} seconds and leaves a freezing area under it for ${STRUGGLE.area}: every ${STRUGGLE.every} seconds it strikes, with a ${pct(STRUGGLE.chance)} chance to freeze the boss for ${STRUGGLE.chilled}.`,
			words: `Attacks a random enemy ${STRUGGLE.shots} times and deals a total of ${dmg("mechanic", STRUGGLE.blow * STRUGGLE.shots, bookDmg("crow", 1))} P.DMG. Shoots a Frost Bullet that deals ${dmg("mechanic", STRUGGLE.frost, bookDmg("crow", 1))} P.DMG to target and surrounding enemies, freezing them for ${STRUGGLE.freeze} sec. The special Frost Bullet creates a freezing area for ${STRUGGLE.area} seconds that deals ${dmg("mechanic", STRUGGLE.chill, bookDmg("crow", 1))} P.DMG every ${STRUGGLE.every} sec, with a ${pct(STRUGGLE.chance)} chance to freeze for ${STRUGGLE.chilled} sec.`,
			icon: "❄️",
			art: art$11(1),
			move: "struggle",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Even Gods shall Die.",
			about: `He focuses, then a laser, harder for each [Hunting Dog’s Fang Mark] on the boss (all of them spent), and ${pct(GODS.focus - 1)} harder for his focus.`,
			words: `Takes position and focuses to shoot a laser, dealing ${dmg("mechanic", GODS.blow, bookDmg("crow", 2))} P.DMG to frontal enemies within range, and consumes target's stack of Hunting Dog's Fang Mark to deal additional ${dmg("mechanic", GODS.each, bookDmg("crow", 2))} P.DMG per each stack. Depending on the focusing time, the effect's range increases, and DMG is increased up to max ${pct(GODS.focus - 1)}. Once the focus is completed, knocks back the enemy far away.`,
			icon: "💥",
			art: art$11(2),
			move: "gods",
			cooldown: 20,
			cost: 4
		}
	],
	passive: HUNTING_PREPARATION,
	treasures: [
		treasure("Teeth-mark Bullet", (k) => ({
			words: `[Target will be Eliminated.] Reduces Cooldown by ${-UT$11.bullet.cooldown} sec, and upon every hit, reduces the target's Mana by ${k(UT$11.bullet.mana)}.`,
			skill: {
				index: 0,
				cooldown: UT$11.bullet.cooldown
			}
		})),
		treasure("Cold Barrage", (k) => ({
			words: `[Struggle is Meaningless] Reduces Mana Cost by ${-UT$11.barrage.cost} and has a ${pct(k(UT$11.barrage.chance))} chance to freeze target for ${UT$11.barrage.freeze} sec upon every strike.`,
			skill: {
				index: 1,
				cost: UT$11.barrage.cost
			}
		})),
		treasure("Pendant of Memories", (k) => ({
			words: `[Even Gods shall Die] Gains immunity to CC during skill activation and DMG is increased by ${pct(k(UT$11.pendant.dmg))}.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$11.pendant.dmg),
				steady: true
			}
		})),
		treasure("Carousel Music Box", (k) => ({ words: `[Hunting Preparation] Increases ATK boost by ${pct(k(UT$11.box.atk))}. Hunting Dog's Fang Mark becomes irremovable.` }))
	],
	perks: {
		"s1-light": { words: `Upon each DMG dealt, recovers ${PERKS$11.mana} Mana.` },
		"s1-dark": { words: "Gains immunity to CC while in use." },
		"s2-light": said({ skill: {
			index: 1,
			cooldown: -3
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s2-dark": { words: `Freezing chance of the Freezing Area increases by ${pct(PERKS$11.chance)}.` },
		"s3-light": said({ skill: {
			index: 2,
			cooldown: 10,
			dmg: 2
		} }, ({ skill }) => `Increases Cooldown by ${skill.cooldown} sec and DMG by ${pct(skill.dmg - 1)}.`),
		"s3-dark": said({ skill: {
			index: 2,
			cost: -1
		} }, ({ skill }) => `Reduces Mana Cost by ${-skill.cost}.`),
		"s4-light": said({ mark: {
			name: "Hunting Preparation",
			takes: 1.15,
			lasts: Infinity
		} }, ({ mark }) => `Boss monster takes ${pct(mark.takes - 1)} increased DMG.`),
		"s4-dark": said({ bonus: { manaRegen: .4 } }, ({ bonus }) => `Mana recovery increases by ${pct(bonus.manaRegen)}.`),
		"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
		"t5-dark": said({ allSkills: {
			cost: 1,
			dmg: 1.75
		} }, ({ allSkills }) => `Increases Mana Cost of all skills by ${allSkills.cost} and DMG by ${pct(allSkills.dmg - 1)}.`)
	},
	attack: "snipe",
	join(fight, self) {
		/** How long his freezing area lasts yet, and toward its next strike; toward his passive's next mana; his unique weapon's wait. */
		let area = 0;
		let chill = 0;
		let akistra = 0;
		const tier = self.unique?.tier ?? null;
		self.stats.atk += HUNTING.atk * fromTreasure(self, 3, UT$11.box.atk);
		/** Cold Barrage: each shot's chance to freeze the boss. */
		const barrage = fromTreasure(self, 1, UT$11.barrage.chance);
		/** How many Fang Marks are on the boss. */
		const fangs = () => fight.foe.statuses.find((status) => status.name === FANG_MARK)?.count ?? 0;
		/** So many more Fang Marks (up to the most), all of them begun again. */
		const mark = (count) => {
			put(fight.foe.statuses, {
				name: FANG_MARK,
				left: FANG.lasts,
				count: Math.min(FANG.most, fangs() + count),
				shown: "curse"
			});
		};
		/** The boss is frozen (as a stun). */
		const freeze = (seconds) => fight.stun(seconds, { by: self });
		return {
			lands: {
				snipe() {
					fight.hit(self, fight.basic);
					mark(1);
					if (tier !== null) fight.hit(self, atTier(AKISTRA.bullet, tier), false);
				},
				eliminate(part) {
					fight.hit(self, ELIMINATE.blow);
					if (self.perks.has("s1-light")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$11.mana);
					if (part === ELIMINATE.shots - 1) mark(ELIMINATE.marks);
				},
				struggle(part) {
					if (part < STRUGGLE.shots) {
						fight.hit(self, STRUGGLE.blow);
						if (barrage > 0 && fight.roll() < barrage) freeze(UT$11.barrage.freeze);
						return;
					}
					fight.hit(self, STRUGGLE.frost);
					if (barrage > 0 && fight.roll() < barrage) freeze(UT$11.barrage.freeze);
					freeze(STRUGGLE.freeze);
					area = STRUGGLE.area;
					chill = 0;
				},
				gods() {
					fight.hit(self, (GODS.blow + GODS.each * fangs()) * GODS.focus);
					const at = fight.foe.statuses.findIndex((status) => status.name === FANG_MARK);
					if (at >= 0) fight.foe.statuses.splice(at, 1);
				}
			},
			used() {
				if (tier === null || akistra > 0) return;
				akistra = AKISTRA.every;
				const boost = atTier(AKISTRA.boost, tier);
				put(self.statuses, {
					name: AKISTRA_UP.name,
					left: AKISTRA.lasts,
					deals: 1 + boost,
					critDamage: boost,
					shown: AKISTRA_UP
				});
			},
			tick(dt) {
				akistra = Math.max(0, akistra - dt);
				if (fight.field.includes(self) && self.hp > 0) self.mana = Math.min(MAX_MANA, self.mana + HUNTING.mana * dt);
				if (area <= 0) return;
				area -= dt;
				chill += dt;
				if (chill >= STRUGGLE.every) {
					chill -= STRUGGLE.every;
					fight.hit(self, STRUGGLE.chill, false);
					if (fight.roll() < STRUGGLE.chance + (self.perks.has("s2-dark") ? PERKS$11.chance : 0)) freeze(STRUGGLE.chilled);
				}
			},
			guards: () => self.doing?.move === "eliminate" && self.perks.has("s1-dark"),
			lit: () => fangs() >= FANG.most,
			buffs: () => area > 0 ? [{
				...FREEZING,
				left: area
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/oddy.ts
var FRACTURE = {
	blow: indexed("mechanic", 76654),
	petrify: 3
};
var FRAGMENTS = {
	hits: CODED.fragments.lands.length,
	blow: indexed("mechanic", 431328) / CODED.fragments.lands.length,
	chance: .5
};
/** Its blow, every ally's ATK Spd more (points) for `lasts` seconds, and what is left of their cooldowns. */
var DISTORTION = {
	blow: indexed("mechanic", 317788),
	speed: 250,
	lasts: 15,
	cooldowns: .5
};
/** Clock Magic: how many of her attacks after a skill deal more, how much (at ATK), their chance to petrify the boss (for `petrify` seconds), and how often at most. */
var CLOCK = {
	attacks: 2,
	blow: indexed("mechanic", 174785),
	chance: .3,
	petrify: 3,
	every: 1
};
/** Her own perks' numbers: Time Fragments' Dark (its cooldown less for each attack), Clock Magic's more attacks and chance, and Transcend 5's Dark (every so often, so many allies' cooldowns less). */
var PERKS$10 = {
	fragments: 1,
	attacks: 3,
	chance: .4,
	ticking: {
		every: 10,
		allies: 4,
		less: 1
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): the mana Time Fracture would take (the boss has none); Time
* Fragments' DMG and its chance more to be ready again at once; Time Distortion's DMG; and Clock Magic's more DMG, and the
* boss's more M.DMG taken.
*/
var UT$10 = {
	orbment: { mana: [
		480,
		580,
		700,
		840,
		1e3
	] },
	collection: {
		chance: .25,
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	},
	threads: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	clockwork: {
		dmg: .5,
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	}
};
var art$10 = skillArt("oddy");
var CLOCK_MAGIC = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Clock Magic",
		about: `Passive. Each skill she uses has her next ${CLOCK.attacks} attacks deal more, each with a ${pct(CLOCK.chance)} chance to petrify the boss for ${CLOCK.petrify} seconds.`,
		icon: "🕰️",
		art: art$10(3)
	},
	words: `Upon using the skill, next ${CLOCK.attacks} attacks deal additional ${dmg("mechanic", CLOCK.blow, bookDmg("oddy", 3))} M.DMG with a ${pct(CLOCK.chance)} chance to petrify the target for ${CLOCK.petrify} sec. This effect activates every ${CLOCK.every} sec.`
};
/** Clock Magic's attacks to come: shown on her card. */
var TICKING = {
	name: "Clock Magic",
	about: "Her next attacks deal more, and may petrify the boss.",
	icon: "🕰️",
	art: art$10(3)
};
/** What Time Distortion gives every ally. */
var DISTORTED = {
	name: "Time Distortion",
	about: `+${DISTORTION.speed} attack speed.`,
	icon: "⏳",
	art: art$10(2)
};
var ODDY = {
	id: "oddy",
	name: "Oddy",
	class: "mechanic",
	skins: ["Oddy"],
	stats: {
		...CLASS_STATS.mechanic,
		deals: "magical"
	},
	abilities: [
		{
			name: "Time Fracture",
			about: `A blow that petrifies the boss for ${FRACTURE.petrify} seconds.`,
			words: `Deals ${dmg("mechanic", FRACTURE.blow, bookDmg("oddy", 0))} M.DMG to enemies in a straight line, and inflicts Petrify for ${FRACTURE.petrify} sec.`,
			icon: "⌛",
			art: art$10(0),
			move: "fracture",
			cooldown: 7,
			cost: 2
		},
		{
			name: "Time Fragments",
			about: `${FRAGMENTS.hits} blows. ${pct(FRAGMENTS.chance)} of the time, it is ready again at once and costs nothing the next time.`,
			words: `Attacks random enemies ${FRAGMENTS.hits} times, dealing a total of ${dmg("mechanic", FRAGMENTS.blow * FRAGMENTS.hits, bookDmg("oddy", 1))} M.DMG. With ${pct(FRAGMENTS.chance)} chance, 'Time Fragments' cooldown resets and consumes no mana for the next single activation.`,
			icon: "🧩",
			art: art$10(1),
			move: "fragments",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Time Distortion",
			about: `A blow; every ally +${DISTORTION.speed} attack speed for ${DISTORTION.lasts} seconds, and what is left of every ally’s cooldowns halved.`,
			words: `Deals ${dmg("mechanic", DISTORTION.blow, bookDmg("oddy", 2))} M.DMG to all enemies and increases all allies' ATK Spd by ${DISTORTION.speed} for ${DISTORTION.lasts} sec. All allies' skill cooldown is reduced by ${pct(DISTORTION.cooldowns)}. 'Time Distortion' is not affected by skill cooldown reduction.`,
			icon: "⏳",
			art: art$10(2),
			move: "distortion",
			cooldown: 35,
			cost: 4
		}
	],
	passive: CLOCK_MAGIC,
	treasures: [
		treasure("Exquisite Orbment", (k) => ({
			words: `[Time Fracture] Gains immunity to CC for the skill's duration, and reduces the target's Mana by ${k(UT$10.orbment.mana)}.`,
			skill: {
				index: 0,
				steady: true
			}
		})),
		treasure("Fragment Collection", (k) => ({
			words: `[Time Fragments] Has a ${pct(UT$10.collection.chance)} chance to reset Cooldown and increases DMG by ${pct(k(UT$10.collection.dmg))}.`,
			skill: {
				index: 1,
				dmg: 1 + k(UT$10.collection.dmg)
			}
		})),
		treasure("Threads of Time", (k) => ({
			words: `[Time Distortion] DMG is increased by ${pct(k(UT$10.threads.dmg))} and all allies' negative effects are dispelled.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$10.threads.dmg),
				cleanse: "allies"
			}
		})),
		treasure("Time Manipulating Clockwork", (k) => ({ words: `[Clock Magic] Increases DMG by ${pct(UT$10.clockwork.dmg)}. Hit enemies take ${pct(k(UT$10.clockwork.takes))} increased M.DMG for ${UT$10.clockwork.lasts} sec.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s1-dark": said({ skill: {
			index: 0,
			cooldown: -1.5
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s2-light": { words: "Target changes to 2 random enemies." },
		"s2-dark": { words: `While in cooldown, auto-attacks will reduce the cooldown of 'Time Fragments' by ${PERKS$10.fragments} sec.` },
		"s3-light": said({ skill: {
			index: 2,
			cost: 2
		} }, ({ skill }) => `Increases Mana Cost by ${skill.cost} and fully recovers Mana for all allies.`),
		"s3-dark": { words: "When there are 5 or more enemies, increases DMG by 100%. Hit Enemies take extra 50% DMG for 10 sec." },
		"s4-light": { words: `Changes the instances of gaining extra DMG from using the skill to ${PERKS$10.attacks} times.` },
		"s4-dark": { words: `Changes the chance to Petrify to ${pct(PERKS$10.chance)}.` },
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK.Spd +${speed}`),
		"t5-dark": { words: `Every ${PERKS$10.ticking.every} sec, any skills on cooldown for ${PERKS$10.ticking.allies} random allies have their cooldowns reduced by ${PERKS$10.ticking.less} sec.` }
	},
	attack: "chime",
	join(fight, self) {
		/** Whether Time Fragments costs nothing the next time; Clock Magic's attacks to come, and its wait; toward Transcend 5's Dark's next time. */
		let free = false;
		let clock = 0;
		let clockWait = 0;
		let ticking = 0;
		const tier = self.unique?.tier ?? null;
		const freeFragments = {
			...self.abilities[1],
			cost: 0
		};
		const attacks = self.perks.has("s4-light") ? PERKS$10.attacks : CLOCK.attacks;
		const chance = self.perks.has("s4-dark") ? PERKS$10.chance : CLOCK.chance;
		/** The heroes on the field and standing. */
		const allies = () => fight.field.filter((ally) => ally.hp > 0);
		return {
			lands: {
				chime() {
					fight.hit(self, fight.basic);
					if (self.perks.has("s2-dark")) self.cooldowns[1] = Math.max(0, self.cooldowns[1] - PERKS$10.fragments);
					if (clock <= 0) return;
					clock--;
					const clockwork = treasureTier(self, 3) > 0;
					fight.hit(self, CLOCK.blow * (clockwork ? 1 + UT$10.clockwork.dmg : 1), false);
					if (clockwork) put(fight.foe.statuses, {
						name: "Time Manipulating Clockwork",
						left: UT$10.clockwork.lasts,
						takes: { magical: 1 + fromTreasure(self, 3, UT$10.clockwork.takes) },
						shown: "curse"
					});
					if (clockWait <= 0 && fight.roll() < chance) {
						clockWait = CLOCK.every;
						fight.stun(CLOCK.petrify, { by: self });
					}
				},
				fracture() {
					fight.hit(self, FRACTURE.blow);
					fight.stun(FRACTURE.petrify, { by: self });
				},
				fragments() {
					fight.hit(self, FRAGMENTS.blow);
				},
				distortion() {
					fight.hit(self, DISTORTION.blow);
					const less = tier === null ? 0 : atTier(TEMPODIANA.cooldown, tier);
					for (const ally of allies()) {
						put(ally.statuses, {
							name: DISTORTED.name,
							left: DISTORTION.lasts,
							pace: 1 + share$2(DISTORTION.speed),
							shown: DISTORTED
						});
						ally.cooldowns = ally.cooldowns.map((left, i) => ally === self && i === 2 ? left : Math.max(0, left * DISTORTION.cooldowns - less));
						if (tier !== null) put(ally.statuses, {
							name: TEMPODIANA_UP.name,
							left: TEMPODIANA.lasts,
							deals: 1 + atTier(TEMPODIANA.atk, tier),
							shown: TEMPODIANA_UP
						});
						if (self.perks.has("s3-light")) ally.mana = MAX_MANA;
					}
					fight.cue(self, "distortion", allies());
				}
			},
			slot: (index) => index === 1 && free ? freeFragments : self.abilities[index] ?? null,
			used(index) {
				clock = attacks;
				if (index !== 1) return;
				free = fight.roll() < FRAGMENTS.chance;
				if (free) self.cooldowns[1] = 0;
				else if (treasureTier(self, 1) > 0 && fight.roll() < UT$10.collection.chance) self.cooldowns[1] = 0;
			},
			tick(dt) {
				clockWait = Math.max(0, clockWait - dt);
				if (!self.perks.has("t5-dark") || self.hp <= 0 || !fight.field.includes(self)) return;
				ticking += dt;
				if (ticking < PERKS$10.ticking.every) return;
				ticking -= PERKS$10.ticking.every;
				const pool = allies();
				for (let i = 0; i < PERKS$10.ticking.allies && pool.length > 0; i++) {
					const ally = pool.splice(Math.floor(fight.roll() * pool.length), 1)[0];
					if (ally) ally.cooldowns = ally.cooldowns.map((left) => Math.max(0, left - PERKS$10.ticking.less));
				}
			},
			lit: () => free,
			buffs: () => clock > 0 ? [{
				...TICKING,
				count: clock
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/phillop.ts
var COLLISION = {
	blow: indexed("knight", 87446),
	down: 3
};
var HEADBUTT = {
	blow: indexed("knight", 72113),
	speed: 200,
	slowed: 10
};
var INCARNATE = {
	defense: 36550,
	heal: .15,
	lasts: 15
};
/** Destroy Armor: what each stack takes off the boss's P.DEF, for `lasts` seconds, up to `most`. */
var ARMOR = {
	defense: 3159,
	lasts: 15,
	most: 5,
	dodge: 40
};
/** His own perks' numbers: Headbutt's blow more and Earth Incarnate's every second (shares of his max HP), the stuns, Destroy Armor's (at full stacks, and its Dark), and Transcend 5's Dark. */
var PERKS$9 = {
	headbutt: .1,
	stun: 3,
	quake: {
		each: .01,
		every: 1
	},
	broken: .01,
	exposed: {
		takes: 1.2,
		lasts: 20,
		every: 20
	},
	bash: {
		chance: .1,
		stun: 2,
		blow: .1
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Collision's less CC resist and P.Block on the boss (points);
* Headbutt's cheaper and less P.Crit resist on the boss (points); Earth Incarnate's attack speed and crit chance (points)
* and more of its defense; and Destroy Armor's weaker boss and less healing for it, for each stack.
*/
var UT$9 = {
	decoration: {
		resist: 250,
		block: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 10
	},
	helmet: {
		cost: -1,
		critResist: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 10
	},
	hammer: {
		speed: 250,
		crit: 250,
		defense: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	},
	titan: {
		weaker: .2,
		heals: [
			.048,
			.058,
			.07,
			.084,
			.1
		]
	}
};
var art$9 = skillArt("phillop");
var DESTROY_ARMOR = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Destroy Armor",
		about: `Passive. Each attack of his takes ${num(ARMOR.defense)} off the boss’s P.DEF for ${ARMOR.lasts} seconds (up to ${ARMOR.most} times).`,
		icon: "🪓",
		art: art$9(3)
	},
	words: `Upon attacking, weakens enemy P.DEF by ${num(ARMOR.defense)} for ${ARMOR.lasts} sec. Can be stacked up to ${ARMOR.most} times max. Per every stack, enemy P.Dodge chance is reduced by ${ARMOR.dodge / 10}%.`
};
/** Earth Incarnate: shown on his card while it lasts. */
var INCARNATION = {
	name: "Earth Incarnate",
	about: `+${num(INCARNATE.defense)} P.DEF and M.DEF; he can’t be knocked down.`,
	icon: "⛰️",
	art: art$9(2)
};
/** What his attack leaves on the boss. */
var BROKEN = "Destroy Armor";
var EXPOSED$1 = "Destroy Armor (exposed)";
var PHILLOP = {
	id: "phillop",
	name: "Phillop",
	class: "knight",
	skins: ["Phillop"],
	stats: {
		...CLASS_STATS.knight,
		deals: "physical"
	},
	abilities: [
		{
			name: "Collision",
			about: `A blow that knocks the boss down for ${COLLISION.down} seconds.`,
			words: `Deals ${dmg("knight", COLLISION.blow, bookDmg("phillop", 0))} P.DMG and knocks down the enemy for ${COLLISION.down} sec.`,
			icon: "💥",
			art: art$9(0),
			move: "collision",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Headbutt",
			about: `A dash and a blow: the boss’s attacks ${pct(HEADBUTT.speed / POINTS)} slower for ${HEADBUTT.slowed} seconds.`,
			words: `Dashes toward the enemy and deals ${dmg("knight", HEADBUTT.blow, bookDmg("phillop", 1))} P.DMG, knocking them back. Hit enemy's Attack Spd is reduced by ${pct(HEADBUTT.speed / POINTS)} for ${HEADBUTT.slowed} sec.`,
			icon: "🐏",
			art: art$9(1),
			move: "headbutt",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Earth Incarnate",
			about: `For ${INCARNATE.lasts} seconds +${num(INCARNATE.defense)} P.DEF and M.DEF, and he can’t be knocked down; he is healed ${pct(INCARNATE.heal)} of his HP.`,
			words: `Increases P.DEF and M.DEF by ${num(INCARNATE.defense)} for ${INCARNATE.lasts} sec and heals ${pct(INCARNATE.heal)} of HP. Gains CC immunity.`,
			icon: "⛰️",
			art: art$9(2),
			move: "incarnate",
			cooldown: 22,
			cost: 3,
			auto: { keeps: INCARNATION.name }
		}
	],
	passive: DESTROY_ARMOR,
	treasures: [
		treasure("Mad Dragon Shield Decoration", (k) => ({
			words: `[Collision] Reduces the target's CC Resist by ${UT$9.decoration.resist} and P.Block chance by ${k(UT$9.decoration.block)} for ${UT$9.decoration.lasts} sec.`,
			skill: {
				index: 0,
				mark: {
					name: "Mad Dragon Shield Decoration",
					resist: -UT$9.decoration.resist,
					blocks: { physical: -k(UT$9.decoration.block) },
					lasts: UT$9.decoration.lasts
				}
			}
		})),
		treasure("Dwarfish Capricorn Helmet", (k) => ({
			words: `[Headbutt] Reduces Mana Cost by ${-UT$9.helmet.cost} and reduces P.Crit Resistance of the affected enemy by ${k(UT$9.helmet.critResist)} for ${UT$9.helmet.lasts} sec.`,
			skill: {
				index: 1,
				cost: UT$9.helmet.cost,
				mark: {
					name: "Dwarfish Capricorn Helmet",
					critTaken: { physical: k(UT$9.helmet.critResist) },
					lasts: UT$9.helmet.lasts
				}
			}
		})),
		treasure("Dwarven Ceremonial Hammer", (k) => ({ words: `[Earth Incarnate] For the duration of skill, ATK Spd and Crit chance is increased by ${UT$9.hammer.speed}, and DEF boost is increased by ${pct(k(UT$9.hammer.defense))}.` })),
		treasure("Hammer of Titan", (k) => ({ words: `[Destroy Armor] Upon attack, reduces the target's ATK by ${pct(UT$9.titan.weaker)} and each stack reduces its Heal Rate by ${Math.round(k(UT$9.titan.heals) * 1e3) / 10}%.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s1-dark": said({ skill: {
			index: 0,
			cooldownShare: .9
		} }, ({ skill }) => `Cooldown is reduced by ${pct(1 - skill.cooldownShare)} per each enemy hit.`),
		"s2-light": { words: `Deals extra P.DMG equal to ${pct(PERKS$9.headbutt)} of max HP.` },
		"s2-dark": { words: `Effect changes to a ${PERKS$9.stun} sec Stun to nearby enemies.` },
		"s3-light": { words: `Deals ${pct(PERKS$9.quake.each)} of Max HP as DMG per sec to nearby enemies.` },
		"s3-dark": { words: `Stuns nearby enemies for ${PERKS$9.stun} sec.` },
		"s4-light": { words: `Enemies with ${ARMOR.most} stacks take ${pct(PERKS$9.broken)} extra P.DMG based off Max HP per attack.` },
		"s4-dark": { words: `Upon attack, dispel all positive effects and target receives ${pct(PERKS$9.exposed.takes - 1)} increased P.DMG for ${PERKS$9.exposed.lasts} sec. Has a cooldown of ${PERKS$9.exposed.every} sec.` },
		"t5-light": t5Light({ blockPhysical: 200 }, ({ blockPhysical }) => `P. Block +${blockPhysical}`),
		"t5-dark": { words: `When auto attacking, there is a ${pct(PERKS$9.bash.chance)} chance to Stun the target for ${PERKS$9.bash.stun} sec and deal extra DMG worth ${pct(PERKS$9.bash.blow)} of own HP.` }
	},
	attack: "hew",
	timing: {
		attack: [{
			lands: [.88],
			until: 1.5
		}],
		skills: { incarnate: {
			lands: [.5],
			until: 2.2
		} }
	},
	join(fight, self) {
		/** Destroy Armor's stacks, and how long they last yet; how long Earth Incarnate lasts yet, and toward its Light's next blow; its Dark's wait; his Dragon Rage. */
		let broken = 0;
		let brokenLeft = 0;
		let incarnate = 0;
		let quake = 0;
		let exposed = 0;
		let rage = 0;
		let rageLeft = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of so much of his max HP (as thousandths of his ATK, as a blow's numbers are). */
		const ofHp = (share) => share * self.stats.hp * POINTS / self.stats.atk;
		/** What Destroy Armor's stacks leave of the boss's P.DEF. */
		const armored = () => {
			const physical = fight.foe.def.stats.physical;
			const titan = treasureTier(self, 3) > 0 ? {
				deals: 1 - UT$9.titan.weaker,
				heals: Math.max(0, 1 - fromTreasure(self, 3, UT$9.titan.heals) * broken)
			} : {};
			put(fight.foe.statuses, {
				name: BROKEN,
				left: ARMOR.lasts,
				count: broken,
				defends: { physical: physical > 0 ? Math.max(0, 1 - ARMOR.defense * broken / physical) : 1 },
				dodges: { physical: -ARMOR.dodge * broken },
				...titan,
				shown: "curse"
			});
		};
		/** His Dragon Rage, as his ATK and defense have it. */
		const raging = () => {
			if (tier === null) return;
			const more = 1 + atTier(ATEIN.rage, tier) * rage;
			put(self.statuses, {
				name: DRAGON_RAGE.name,
				left: ATEIN.lasts,
				count: rage,
				deals: more,
				defends: more,
				shown: DRAGON_RAGE
			});
		};
		/** His attack: a stack of Destroy Armor (all begun again; its Light, at full stacks, a blow more; its Dark, now and then the boss exposed). */
		const hew = () => {
			fight.hit(self, fight.basic);
			broken = Math.min(ARMOR.most, broken + 1);
			brokenLeft = ARMOR.lasts;
			armored();
			if (self.perks.has("s4-light") && broken >= ARMOR.most) fight.hit(self, ofHp(PERKS$9.broken), false);
			if (self.perks.has("s4-dark") && exposed <= 0) {
				exposed = PERKS$9.exposed.every;
				put(fight.foe.statuses, {
					name: EXPOSED$1,
					left: PERKS$9.exposed.lasts,
					takes: { physical: PERKS$9.exposed.takes },
					shown: "curse"
				});
			}
			if (self.perks.has("t5-dark") && fight.roll() < PERKS$9.bash.chance) {
				fight.stun(PERKS$9.bash.stun, { by: self });
				fight.hit(self, ofHp(PERKS$9.bash.blow), false);
			}
		};
		return {
			lands: {
				hew,
				attack: hew,
				collision() {
					fight.hit(self, COLLISION.blow);
					fight.stun(COLLISION.down, {
						down: true,
						by: self
					});
				},
				headbutt() {
					fight.hit(self, HEADBUTT.blow + (self.perks.has("s2-light") ? ofHp(PERKS$9.headbutt) : 0));
					if (self.perks.has("s2-dark")) fight.stun(PERKS$9.stun, { by: self });
					else fight.slow(HEADBUTT.speed, HEADBUTT.slowed);
				},
				incarnate() {
					incarnate = INCARNATE.lasts;
					quake = 0;
					const hammer = treasureTier(self, 2) > 0;
					const defense = INCARNATE.defense * (1 + fromTreasure(self, 2, UT$9.hammer.defense));
					put(self.statuses, {
						name: INCARNATION.name,
						left: INCARNATE.lasts,
						bolsters: {
							physical: defense,
							magical: defense
						},
						...hammer && {
							pace: 1 + UT$9.hammer.speed / 1e3,
							crit: UT$9.hammer.crit / 1e3
						},
						shown: INCARNATION
					});
					fight.heal(self, INCARNATE.heal * self.stats.hp);
					if (self.perks.has("s3-dark")) fight.stun(PERKS$9.stun, { by: self });
				}
			},
			hurt(who) {
				if (who !== self || tier === null || self.hp <= 0) return;
				for (const ally of fight.field) if (ally !== self && ally.hp > 0) put(ally.statuses, {
					name: ATEIN_UP.name,
					left: ATEIN.guards,
					defends: 1 + atTier(ATEIN.defense, tier),
					shown: ATEIN_UP
				});
				rage = Math.min(ATEIN.most, rage + 1);
				rageLeft = ATEIN.lasts;
				raging();
			},
			tick(dt) {
				exposed = Math.max(0, exposed - dt);
				if (brokenLeft > 0) {
					brokenLeft -= dt;
					if (brokenLeft <= 0) broken = 0;
				}
				if (rageLeft > 0) {
					rageLeft -= dt;
					if (rageLeft <= 0) rage = 0;
				}
				if (incarnate <= 0) return;
				incarnate -= dt;
				if (!self.perks.has("s3-light") || self.hp <= 0) return;
				quake += dt;
				if (quake >= PERKS$9.quake.every) {
					quake -= PERKS$9.quake.every;
					fight.hit(self, ofHp(PERKS$9.quake.each), false);
				}
			},
			guards: () => incarnate > 0,
			lit: () => broken >= ARMOR.most
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/naila.ts
var WINDS = {
	blow: indexed("warrior", 212140) / CODED.winds.lands.length,
	boss: indexed("warrior", 158995) / CODED.winds.lands.length,
	down: 3
};
var READING = {
	dodge: 250,
	atk: 37514,
	lasts: 15
};
var DIVE = {
	blow: indexed("warrior", 296346),
	boss: indexed("warrior", 444527),
	downed: 1.5
};
/** Tornado Strike: every so many attacks, its chance, its blow, how much more physical damage the boss takes, and for how long, and how long it is knocked down. */
var TORNADO$1 = {
	every: 5,
	chance: .4,
	blow: indexed("warrior", 183165),
	takes: 1.3,
	lasts: 10,
	down: 3
};
/** Her own perks' numbers: Wind Reading's Dark, Dive Bomb's Dark's cooldown less, Tornado Strike's (its chance, and her ATK Spd after), and Transcend 5's Dark (for each dodge, up to so many). */
var PERKS$8 = {
	reading: 1.3,
	dive: .1,
	chance: .6,
	speed: 300,
	dodge: {
		cooldowns: .02,
		atk: .03,
		speed: 30,
		most: 10
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Fierce Winds' DMG and the mana a critical blow of it would
* take (the boss has none); Wind Reading's heal; Dive Bomb's cheaper and DMG; Tornado Strike's more chance, and its blow
* in Guild War (nothing here).
*/
var UT$8 = {
	gust: {
		dmg: .5,
		mana: [
			240,
			290,
			350,
			420,
			500
		]
	},
	scarf: { heal: [
		.12,
		.14,
		.17,
		.21,
		.25
	] },
	pride: {
		cost: -1,
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	},
	ribbon: {
		chance: .1,
		guildWar: [
			.12,
			.14,
			.17,
			.21,
			.25
		]
	}
};
var art$8 = skillArt("naila");
var TORNADO_STRIKE = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Tornado Strike",
		about: `Passive. Her ${nth(TORNADO$1.every)} attack has a ${pct(TORNADO$1.chance)} chance to deal more, leave the boss taking ${pct(TORNADO$1.takes - 1)} more physical damage for ${TORNADO$1.lasts} seconds, and knock it down for ${TORNADO$1.down}.`,
		icon: "🌪️",
		art: art$8(3)
	},
	words: `Every ${nth(TORNADO$1.every)} normal attack has a ${pct(TORNADO$1.chance)} chance to deal additional ${dmg("warrior", TORNADO$1.blow, bookDmg("naila", 3))} P.DMG to the target. The target takes ${pct(TORNADO$1.takes - 1)} increased P.DMG for ${TORNADO$1.lasts} sec and is knocked down for ${TORNADO$1.down} sec.`
};
/** What Wind Reading gives every ally, and its Dark gives her. */
var READ = {
	name: "Wind Reading",
	about: `+${READING.dodge} P.Dodge and +${num(READING.atk)} ATK.`,
	icon: "🍃",
	art: art$8(1)
};
var READ_DARK = {
	name: "Wind Reading (Dark)",
	about: `Deals ${pct(PERKS$8.reading - 1)} more to the boss.`,
	icon: "🍃",
	art: art$8(1)
};
/** Tornado Strike's Dark, and Transcend 5's Dark's stacks. */
var WHIRLED = {
	name: "Tornado Strike",
	about: `+${PERKS$8.speed} attack speed.`,
	icon: "🌪️",
	art: art$8(3)
};
var GUSTS = {
	name: "Gale",
	about: `+${pct(PERKS$8.dodge.atk)} ATK and +${PERKS$8.dodge.speed} attack speed for each.`,
	icon: "🪶",
	art: art$8(3)
};
/** What her blows leave on the boss. */
var TORN$1 = "Tornado Strike";
var NAILA = {
	id: "naila",
	name: "Naila",
	class: "warrior",
	skins: ["Naila"],
	stats: {
		...CLASS_STATS.warrior,
		deals: "physical"
	},
	abilities: [
		{
			name: "Fierce Winds",
			about: `Two dashes through the boss, each a blow that knocks it down for ${WINDS.down} seconds.`,
			words: `Dashes toward the enemy 2 times, dealing ${dmg("warrior", WINDS.blow * CODED.winds.lands.length, bookDmg("naila", 0))} P.DMG to enemies in range, knocking them down for ${WINDS.down} sec. If the target is not a Hero, deals additional ${dmg("warrior", WINDS.boss * CODED.winds.lands.length, bookDmg("naila", 0))} P.DMG.`,
			icon: "💨",
			art: art$8(0),
			move: "winds",
			cooldown: 8,
			cost: 3
		},
		{
			name: "Wind Reading",
			about: `Every ally +${READING.dodge} P.Dodge and +${num(READING.atk)} ATK for ${READING.lasts} seconds.`,
			words: `All allies' P.Dodge Chance is increased by ${READING.dodge} for ${READING.lasts} sec, and ATK is increased by ${num(READING.atk)}.`,
			icon: "🍃",
			art: art$8(1),
			move: "reading",
			cooldown: 20,
			cost: 1,
			auto: { keeps: READ.name }
		},
		{
			name: "Dive Bomb",
			about: `She flies up and strikes the boss, ${pct(DIVE.downed - 1)} harder while she has it knocked down.`,
			words: `Flies up and strikes ${dmg("warrior", DIVE.blow, bookDmg("naila", 2))} P.DMG to enemies in range. Knocked down enemies take ${pct(DIVE.downed - 1)} increased DMG. If the target is not a Hero, deals additional ${dmg("warrior", DIVE.boss, bookDmg("naila", 2))} P.DMG.`,
			icon: "🦅",
			art: art$8(2),
			move: "dive",
			cooldown: 12,
			cost: 3
		}
	],
	passive: TORNADO_STRIKE,
	treasures: [
		treasure("Soul of Gust", (k) => ({
			words: `[Fierce Winds] Increases DMG by ${pct(UT$8.gust.dmg)} and upon a Critical Hit, reduces Mana by ${k(UT$8.gust.mana)}`,
			skill: {
				index: 0,
				dmg: 1 + UT$8.gust.dmg
			}
		})),
		treasure("Himmullis’s Scarf", (k) => ({
			words: `[Wind Reading] All effects become irremovable and upon activation, heals own HP equals ${pct(k(UT$8.scarf.heal))} of Max HP.`,
			skill: {
				index: 1,
				heal: k(UT$8.scarf.heal)
			}
		})),
		treasure("Tempest Pride", (k) => ({
			words: `[Dive Bomb] Reduces Mana Cost by ${-UT$8.pride.cost} and increases DMG by ${pct(k(UT$8.pride.dmg))}`,
			skill: {
				index: 2,
				cost: UT$8.pride.cost,
				dmg: 1 + k(UT$8.pride.dmg)
			}
		})),
		treasure("Green Ribbon", (k) => ({ words: `[Tornado Strike] Increases the chance of dealing additional DMG by ${pct(UT$8.ribbon.chance)} and upon activation during Guild War, deals additional P.DMG equal to ${pct(k(UT$8.ribbon.guildWar))} of target's Max HP.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: 2
		} }, ({ skill }) => `If there is 1 enemy, DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s1-dark": { words: "Target changes to the enemy with the highest ATK." },
		"s2-light": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s2-dark": { words: `Increases Naila's DMG dealt on non-Hero enemies by ${pct(PERKS$8.reading - 1)} for the duration of skill.` },
		"s3-light": said({ skill: {
			index: 2,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: `Reduces cooldown by ${pct(PERKS$8.dive)} per each enemy that takes Critical DMG.` },
		"s4-light": { words: `Activation chance changes to ${pct(PERKS$8.chance)}.` },
		"s4-dark": { words: `Atk Spd is boosted by ${PERKS$8.speed} when effect takes place.` },
		"t5-light": t5Light({}, () => "P.Dodge +100"),
		"t5-dark": { words: `Upon dodging, all skill cooldowns are reduced by ${pct(PERKS$8.dodge.cooldowns)}. Also, ATK is boosted by ${pct(PERKS$8.dodge.atk)}, and Atk Spd is boosted by ${PERKS$8.dodge.speed}. The ATK and Atk Spd Boosts can stack up to ${PERKS$8.dodge.most} times.` }
	},
	attack: "talon",
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
		/** Her attacks toward Tornado Strike's next chance; how long she has the boss knocked down yet; Transcend 5's Dark's stacks; her unique weapon's blow on the boss, how long it lasts yet, and toward its next bite. */
		let attacks = 0;
		let downed = 0;
		let gusts = 0;
		let baroro = 0;
		let bitten = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of hers: a critical one, with her unique weapon, leaves the boss losing health and taking more physical damage (begun again). */
		const strike = (amount) => {
			const critical = fight.hit(self, amount);
			if (critical && tier !== null) {
				baroro = BARORO.lasts;
				put(fight.foe.statuses, {
					name: BARORO.name,
					left: BARORO.lasts,
					takes: { physical: 1 + atTier(BARORO.takes, tier) },
					shown: "curse"
				});
			}
			return critical;
		};
		/** She knocks the boss down. */
		const down = (seconds) => {
			fight.stun(seconds, {
				down: true,
				by: self
			});
			downed = Math.max(downed, seconds);
		};
		/** A blow of her attack; every 5th, now and then, Tornado Strike. */
		const attack = (amount) => {
			strike(amount);
			attacks++;
			if (attacks < TORNADO$1.every) return;
			attacks = 0;
			if (fight.roll() >= (self.perks.has("s4-light") ? PERKS$8.chance : TORNADO$1.chance) + (treasureTier(self, 3) > 0 ? UT$8.ribbon.chance : 0)) return;
			fight.cue(self, "tornado");
			strike(TORNADO$1.blow);
			put(fight.foe.statuses, {
				name: TORN$1,
				left: TORNADO$1.lasts,
				takes: { physical: TORNADO$1.takes },
				shown: "curse"
			});
			down(TORNADO$1.down);
			if (self.perks.has("s4-dark")) put(self.statuses, {
				name: WHIRLED.name,
				left: TORNADO$1.lasts,
				pace: 1 + share$2(PERKS$8.speed),
				shown: WHIRLED
			});
		};
		return {
			lands: {
				talon: () => attack(fight.basic),
				attack: () => attack(fight.basic),
				winds() {
					strike(WINDS.blow + WINDS.boss);
					down(WINDS.down);
				},
				reading() {
					const allies = fight.field.filter((ally) => ally.hp > 0);
					for (const ally of allies) put(ally.statuses, {
						name: READ.name,
						left: READING.lasts,
						deals: 1 + READING.atk / ally.stats.atk,
						shown: READ
					});
					if (self.perks.has("s2-dark")) put(self.statuses, {
						name: READ_DARK.name,
						left: READING.lasts,
						deals: PERKS$8.reading,
						shown: READ_DARK
					});
					fight.cue(self, "reading", allies);
				},
				dive() {
					if (strike((DIVE.blow + DIVE.boss) * (downed > 0 ? DIVE.downed : 1)) && self.perks.has("s3-dark")) self.cooldowns[2] = Math.max(0, self.cooldowns[2] - (self.abilities[2]?.cooldown ?? 0) * PERKS$8.dive);
				}
			},
			dodged() {
				if (!self.perks.has("t5-dark")) return;
				self.cooldowns = self.cooldowns.map((left, i) => Math.max(0, left - (self.abilities[i]?.cooldown ?? 0) * PERKS$8.dodge.cooldowns));
				gusts = Math.min(PERKS$8.dodge.most, gusts + 1);
			},
			tick(dt) {
				downed = Math.max(0, downed - dt);
				if (baroro <= 0 || tier === null) {
					bitten = 0;
					return;
				}
				baroro -= dt;
				bitten += dt;
				if (bitten >= 1) {
					bitten -= 1;
					fight.hit(self, atTier(BARORO.blow, tier) / BARORO.lasts, false);
				}
			},
			deals: () => 1 + PERKS$8.dodge.atk * gusts,
			speed: () => PERKS$8.dodge.speed * gusts,
			lit: () => attacks === TORNADO$1.every - 1,
			buffs: () => gusts > 0 ? [{
				...GUSTS,
				count: gusts
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/yanne.ts
/** Focus Shot!'s arrow, and how many times as hard it is focused (she always focuses as long as she can). */
var FOCUS = {
	blow: indexed("archer", 179237),
	focused: 1.376
};
var WIPEOUT = { blow: indexed("archer", 279459) };
/** No Holding Back!: her ATK and penetration (points) more, for `lasts` seconds; the share of her mana each blow of her attack takes meanwhile. */
var UNLEASHED = {
	atk: 32032,
	pen: 500,
	lasts: 30,
	mana: .03
};
/** Dragon Slayer: her ATK more, and her max HP a share more. */
var SLAYER = {
	atk: 9477,
	hp: .3
};
/** Her own perks' numbers: Focus Shot!'s Dark, Wipeout!'s Dark, No Holding Back!'s Light and Dark. */
var PERKS$7 = {
	marked: {
		takes: 1.25,
		lasts: 10
	},
	stun: 2,
	speed: 250,
	taken: .75
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Focus Shot!'s more P.DMG taken; Wipeout!'s DMG and the
* share off its cooldown on a critical blow; No Holding Back!'s cheaper and more DMG to the boss; and Dragon Slayer's
* against Dragons (nothing here: Galgoria is a chimera).
*/
var UT$7 = {
	talisman: {
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	},
	arrow: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		cooldown: .12
	},
	steak: {
		cost: -1,
		dmg: [
			.14,
			.17,
			.21,
			.25,
			.3
		]
	},
	heart: {
		taken: .1,
		dmg: [
			.072,
			.086,
			.104,
			.126,
			.15
		]
	}
};
var art$7 = skillArt("yanne");
var DRAGON_SLAYER = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Dragon Slayer",
		about: `Passive. +${num(SLAYER.atk)} ATK and +${pct(SLAYER.hp)} max HP. (More against a Dragon: Galgoria is none.)`,
		icon: "🐉",
		art: art$7(3)
	},
	words: `ATK is increased by ${num(SLAYER.atk)} , and Max HP is increased by ${pct(SLAYER.hp)}. Also, DMG dealt to Dragons is increased by 50%.`
};
/** No Holding Back!: shown on her card while it lasts. */
var UNLEASH = {
	name: "No Holding Back!",
	about: `+${num(UNLEASHED.atk)} ATK and +${UNLEASHED.pen} penetration; each blow of her attack takes ${pct(UNLEASHED.mana)} of her mana.`,
	icon: "🏹",
	art: art$7(2)
};
/** What Focus Shot!'s Dark leaves on the boss. */
var MARKED = "Focus Shot!";
var YANNE = {
	id: "yanne",
	name: "Yanne",
	class: "archer",
	skins: ["Yanne"],
	stats: {
		...CLASS_STATS.archer,
		atk: CLASS_STATS.archer.atk + SLAYER.atk,
		hp: Math.round(CLASS_STATS.archer.hp * (1 + SLAYER.hp)),
		deals: "physical"
	},
	abilities: [
		{
			name: "Focus Shot!",
			about: `An arrow, focused on as long as she can (its DMG ${pct(FOCUS.focused - 1)} more).`,
			words: `Taking up a stance, focuses for a while and deals ${dmg("archer", FOCUS.blow, bookDmg("yanne", 0))} P.DMG to enemies in a straight line. If the target is a dragon, inflicts Stun for 3 sec. The longer she focuses, DMG is increased by ${pct(FOCUS.focused - 1)} and Stun duration by 25%.`,
			icon: "🎯",
			art: art$7(0),
			move: "focus",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Wipeout!",
			about: "A great arrow at the boss.",
			words: `Deals ${dmg("archer", WIPEOUT.blow, bookDmg("yanne", 1))} P.DMG to target enemy and other enemies in range. If the target is a Dragon, deals extra DMG that ignores DEF.`,
			icon: "💥",
			art: art$7(1),
			move: "wipeout",
			cooldown: 10,
			cost: 3
		},
		{
			name: "No Holding Back!",
			about: `What the boss has left on her is cleared; for ${UNLEASHED.lasts} seconds +${num(UNLEASHED.atk)} ATK and +${UNLEASHED.pen} penetration, and each blow of her attack takes ${pct(UNLEASHED.mana)} of her mana.`,
			words: `Removes all negative effects on self. For ${UNLEASHED.lasts} sec, ATK is increased by ${num(UNLEASHED.atk)} and Penetration is increased by ${UNLEASHED.pen}. For the duration of skill, auto attacks are changed to consuming ${pct(UNLEASHED.mana)} mana to deal DMG to all enemies in a straight line and deals extra P.DMG to Dragons ignoring DEF.`,
			icon: "🔥",
			art: art$7(2),
			move: "unleash",
			cooldown: 25,
			cost: 4,
			auto: { keeps: UNLEASH.name }
		}
	],
	passive: DRAGON_SLAYER,
	treasures: [
		treasure("Talisman of Concentration", (k) => ({
			words: `[Focus Shot!] Gains immunity to CC while in use and increases P.DMG target receives by ${pct(k(UT$7.talisman.takes))} for ${UT$7.talisman.lasts} sec.`,
			skill: {
				index: 0,
				steady: true,
				mark: {
					name: "Talisman of Concentration",
					takes: { physical: 1 + k(UT$7.talisman.takes) },
					lasts: UT$7.talisman.lasts
				}
			}
		})),
		treasure("Giant Arrow of Sudden Death", (k) => ({
			words: `[Wipeout!] Increases DMG by ${pct(k(UT$7.arrow.dmg))} and reduces Cooldown by ${pct(UT$7.arrow.cooldown)} upon a Crit Hit`,
			skill: {
				index: 1,
				dmg: 1 + k(UT$7.arrow.dmg),
				critCooldown: UT$7.arrow.cooldown
			}
		})),
		treasure("Dragon Steak", (k) => ({
			words: `[No Holding Back!] Reduces Mana Cost by ${-UT$7.steak.cost} and increases DMG to Non-Hero Enemies by ${pct(k(UT$7.steak.dmg))} for the skill's duration.`,
			skill: {
				index: 2,
				cost: UT$7.steak.cost
			}
		})),
		treasure("Blazing Heart of Giant", (k) => ({ words: `[Dragon Slayer] Reduces DMG that allies take from Dragons by an additional ${pct(UT$7.heart.taken)} and increase DMG dealt to dragons by ${Math.round(k(UT$7.heart.dmg) * 1e3) / 10}%` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: 1.4
		} }, ({ skill }) => `DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s1-dark": said({ skill: {
			index: 0,
			mark: {
				name: MARKED,
				takes: { physical: PERKS$7.marked.takes },
				lasts: PERKS$7.marked.lasts
			}
		} }, ({ skill }) => `Target takes ${pct(PERKS$7.marked.takes - 1)} additional P.DMG for ${skill.mark.lasts} sec.`),
		"s2-light": said({ skill: {
			index: 1,
			dmg: 2
		} }, ({ skill }) => `When there is 1 enemy, DMG is boosted by ${pct(skill.dmg - 1)}.`),
		"s2-dark": { words: `Enemies hit are stunned for ${PERKS$7.stun} sec.` },
		"s3-light": { words: `ATK Spd is boosted by ${PERKS$7.speed} for the duration.` },
		"s3-dark": { words: `For the duration, all DMG taken is reduced by ${pct(1 - PERKS$7.taken)}.` },
		"s4-light": { words: "Reduces DMG that all allies take from Dragons by 20%." },
		"s4-dark": { words: "Changes own DMG Boost against Dragons to 80%." },
		"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
		"t5-dark": { words: "Auto-attacks ignore enemy Block effects." }
	},
	attack: "shot",
	timing: {
		attack: [{
			lands: [.98],
			until: 1.03
		}],
		skills: {
			focus: {
				lands: [1.45],
				until: 1.6
			},
			wipeout: {
				lands: [1.2],
				until: 1.6
			},
			unleash: {
				lands: [1],
				until: 1.6
			}
		}
	},
	join(fight, self) {
		/** How long No Holding Back! lasts yet; until her unique weapon's next. */
		let unleashed = 0;
		let svelta = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of hers: a critical one, with her unique weapon (no sooner than a moment after the last), a blow more and mana. */
		const shoot = (amount) => {
			const critical = fight.hit(self, amount);
			if (critical && tier !== null && svelta <= 0) {
				svelta = SVELTA.every;
				fight.hit(self, SVELTA.blow, false);
				self.mana = Math.min(MAX_MANA, self.mana + SVELTA.mana);
			}
			return critical;
		};
		/** Her attack: an arrow (with No Holding Back! on her, taking a share of her mana as it goes). */
		const loose = (amount) => {
			if (unleashed > 0) self.mana = Math.max(0, self.mana - UNLEASHED.mana * MAX_MANA);
			shoot(amount);
		};
		return {
			lands: {
				shot: () => loose(fight.basic),
				attack: () => loose(fight.basic),
				focus: () => shoot(FOCUS.blow * FOCUS.focused),
				wipeout() {
					shoot(WIPEOUT.blow);
					if (self.perks.has("s2-dark")) fight.stun(PERKS$7.stun, { by: self });
				},
				unleash() {
					const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
					self.statuses = self.statuses.filter((status) => !harmful(status));
					unleashed = UNLEASHED.lasts;
					put(self.statuses, {
						name: UNLEASH.name,
						left: UNLEASHED.lasts,
						deals: (1 + UNLEASHED.atk / self.stats.atk) * (1 + fromTreasure(self, 2, UT$7.steak.dmg)),
						pen: UNLEASHED.pen,
						...self.perks.has("s3-light") && { pace: 1 + share$2(PERKS$7.speed) },
						...self.perks.has("s3-dark") && { takes: PERKS$7.taken },
						shown: UNLEASH
					});
				}
			},
			tick(dt) {
				unleashed = Math.max(0, unleashed - dt);
				svelta = Math.max(0, svelta - dt);
			},
			lit: () => unleashed > 0,
			buffs: () => tier !== null && svelta > 0 ? [{
				...SVELTA_UP,
				left: svelta
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/neraxis.ts
/** Black Lightning Claw: its first blow and its second, and the second's stun. */
var CLAW = {
	blow: indexed("knight", 85803),
	after: indexed("knight", 122794),
	stun: 3,
	speed: 300,
	slowed: 10
};
/** Obsidian Roar: every ally's ATK and defense more, for `lasts` seconds; its blow; and the boss's ATK as much less meanwhile. */
var ROAR$1 = {
	more: 13488,
	lasts: 15,
	blow: indexed("knight", 184295),
	weaker: .3
};
/** Breath of Destruction: its blows (as many as its move has), each taking a share of the boss's M.DEF for `lasts` seconds, and stunning it. */
var BREATH = {
	blow: indexed("knight", 289536) / CODED.breath.lands.length,
	weaker: .2,
	lasts: 1,
	stun: 1
};
/** Black Dragon Hide: his P.DEF and M.DEF more, and what he takes. */
var HIDE = {
	defense: 18962,
	taken: .85
};
/** His own perks' numbers: Black Lightning Claw's Light and Dark, Obsidian Roar's Light, Breath of Destruction's Dark, Black Dragon Hide's Light and Dark, and Transcend 5's Dark. */
var PERKS$6 = {
	stun: 2,
	marked: {
		takes: 1.25,
		lasts: 10
	},
	roar: 2,
	weaker: .3,
	speed: 300,
	low: {
		below: .5,
		more: 1.5
	},
	guard: {
		taken: .9,
		lasts: 30
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Black Lightning Claw's mana for each blow and his more
* defense; Obsidian Roar's more DEF for every ally; Breath of Destruction's longer stun and shorter cooldown; and Black
* Dragon Hide's mana, and every ally's block (points), every so often.
*/
var UT$6 = {
	cartridge: {
		mana: 100,
		defense: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	},
	memories: { defense: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	vortex: {
		stun: 1,
		cooldown: [
			4,
			5,
			6,
			7,
			8
		]
	},
	nova: {
		every: 10,
		mana: SECTION,
		block: [
			240,
			290,
			350,
			420,
			500
		],
		lasts: 5
	}
};
var art$6 = skillArt("neraxis");
var BLACK_DRAGON_HIDE = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: HIDE.taken,
	shown: {
		name: "Black Dragon Hide",
		about: `Passive. +${num(HIDE.defense)} P.DEF and M.DEF; he takes ${pct(1 - HIDE.taken)} less.`,
		icon: "🐲",
		art: art$6(3)
	},
	words: `Increases P.DEF and M.DEF by ${num(HIDE.defense)} and takes reduced P.DMG and M.DMG by ${pct(1 - HIDE.taken)}.`
};
/** Obsidian Roar on an ally; Transcend 5's Dark on the others. */
var ROARED$1 = {
	name: "Obsidian Roar",
	about: "ATK, P.DEF and M.DEF higher.",
	icon: "🐉",
	art: art$6(1)
};
var GUARDED = {
	name: "Neraxis’s Guard",
	about: "Takes less from the boss.",
	icon: "🐲",
	art: art$6(3)
};
/** What his skills leave on the boss. */
var CLAWED = "Black Lightning Claw";
var WEAKENED = "Obsidian Roar";
var BREATHED = "Breath of Destruction";
var NERAXIS = {
	id: "neraxis",
	name: "Neraxis",
	class: "knight",
	skins: ["Neraxis"],
	stats: {
		...CLASS_STATS.knight,
		physical: CLASS_STATS.knight.physical + HIDE.defense,
		magical: CLASS_STATS.knight.magical + HIDE.defense,
		deals: "magical"
	},
	abilities: [
		{
			name: "Black Lightning Claw",
			about: `A blow, and a second after a blow more that stuns the boss for ${CLAW.stun} seconds.`,
			words: `Draws enemies towards the target and deals ${dmg("knight", CLAW.blow, bookDmg("neraxis", 0))} M.DMG. Deals ${dmg("knight", CLAW.after, bookDmg("neraxis", 0))} M.DMG around the target after 1 sec and stuns them for ${CLAW.stun} sec. Reduces ATK Spd of hit enemies by ${CLAW.speed} for ${CLAW.slowed} sec.`,
			icon: "⚡",
			art: art$6(0),
			move: "lightning",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Obsidian Roar",
			about: `Every ally +${num(ROAR$1.more)} ATK, P.DEF and M.DEF for ${ROAR$1.lasts} seconds; a blow, and the boss’s ATK ${pct(ROAR$1.weaker)} lower meanwhile.`,
			words: `Increases ATK, P.DEF, and M.DEF of all allies by ${num(ROAR$1.more)} for ${ROAR$1.lasts} sec. Deals ${dmg("knight", ROAR$1.blow, bookDmg("neraxis", 1))} M.DMG to all enemies and reduces their ATK by ${pct(ROAR$1.weaker)} for ${ROAR$1.lasts} sec.`,
			icon: "🐉",
			art: art$6(1),
			move: "roar",
			cooldown: 15,
			cost: 3,
			auto: { keeps: ROARED$1.name }
		},
		{
			name: "Breath of Destruction",
			about: `Six blows, each taking ${pct(BREATH.weaker)} of the boss’s M.DEF for ${BREATH.lasts} second and stunning it for ${BREATH.stun} second.`,
			words: `Deals a total of ${dmg("knight", BREATH.blow * CODED.breath.lands.length, bookDmg("neraxis", 2))} M.DMG to enemies within a large area around the target over 6 times and reduces their M.DEF by ${pct(BREATH.weaker)} for ${BREATH.lasts} sec. Each hit stuns the enemy for ${BREATH.stun} sec.`,
			icon: "🌋",
			art: art$6(2),
			move: "breath",
			cooldown: 20,
			cost: 4
		}
	],
	passive: BLACK_DRAGON_HIDE,
	treasures: [
		treasure("Cartridge of Black Lightning", (k) => ({
			words: `[Black Lightning Claw] Recovers Mana by ${UT$6.cartridge.mana} upon each hit, and increases own P.DEF and M.DEF by ${pct(k(UT$6.cartridge.defense))} for ${UT$6.cartridge.lasts} sec.`,
			skill: {
				index: 0,
				self: {
					name: "Cartridge of Black Lightning",
					lasts: UT$6.cartridge.lasts,
					defends: 1 + k(UT$6.cartridge.defense)
				}
			}
		})),
		treasure("Memories of the Blue God Dragon", (k) => ({
			words: `[Obsidian Roar] Increases DEF Boost of allies by ${pct(k(UT$6.memories.defense))} and dispels positive effects from all enemies upon using Obsidian Roar.`,
			skill: {
				index: 1,
				dispel: true
			}
		})),
		treasure("Rage Vortex", (k) => ({
			words: `[Breath of Destruction] Increases Stun duration by ${UT$6.vortex.stun} sec and reduces Cooldown of Breath of Destruction by ${k(UT$6.vortex.cooldown)} sec.`,
			skill: {
				index: 2,
				cooldown: -k(UT$6.vortex.cooldown)
			}
		})),
		treasure("Ashen Nova", (k) => ({ words: `[Black Dragon Hide] Every ${UT$6.nova.every} sec, recovers 1 orb of Mana and increases All Block of all allies by ${k(UT$6.nova.block)} for ${UT$6.nova.lasts} sec.` }))
	],
	perks: {
		"s1-light": { words: `Increases Stun duration by ${PERKS$6.stun} sec.` },
		"s1-dark": said({ skill: {
			index: 0,
			mark: {
				name: CLAWED,
				takes: { magical: PERKS$6.marked.takes },
				lasts: PERKS$6.marked.lasts
			}
		} }, ({ skill }) => `Increases the M.DMG that the hit enemy takes by ${pct(PERKS$6.marked.takes - 1)} for ${skill.mark.lasts} sec.`),
		"s2-light": said({ skill: {
			index: 1,
			cost: 1
		} }, ({ skill }) => `Increases Mana Cost by ${skill.cost} and ATK and DEF Boost by ${pct(PERKS$6.roar - 1)}.`),
		"s2-dark": { words: "Reduces ATK Spd of the hit enemy by 300 for 15 sec." },
		"s3-light": said({ skill: {
			index: 2,
			cost: -1
		} }, ({ skill }) => `Reduce Mana Cost by ${-skill.cost}.`),
		"s3-dark": { words: `Changes M.DEF Reduction to ${pct(PERKS$6.weaker)}.` },
		"s4-light": { words: `ATK Spd is increased by ${PERKS$6.speed}` },
		"s4-dark": { words: `When HP falls below ${pct(PERKS$6.low.below)}, skill effects are increased by ${pct(PERKS$6.low.more - 1)}.` },
		"t5-light": t5Light({ resist: 100 }, ({ resist }) => `CC Resist +${resist}`),
		"t5-dark": { words: `At the beginning of every battle, reduces DMG that non-Hero enemies deal to all allies except Neraxis by ${pct(1 - PERKS$6.guard.taken)} for ${PERKS$6.guard.lasts} sec.` }
	},
	attack: "maw",
	timing: {
		attack: [{
			lands: [
				.92,
				1.52,
				2.78,
				3.62
			],
			until: 4.3
		}],
		skills: { roar: {
			lands: [.5],
			until: 2.2
		} }
	},
	join(fight, self) {
		/** His attack's blows toward his unique weapon's next; how long its Storm lasts yet; whether Transcend 5's Dark has guarded his allies yet. */
		let blows = 0;
		let storm = 0;
		let guarded = false;
		const tier = self.unique?.tier ?? null;
		/** Toward Ashen Nova's next. */
		let nova = 0;
		/** What his skills do, as Black Dragon Hide's Dark has it: half again as much under half his health. */
		const more = () => self.perks.has("s4-dark") && self.hp < self.stats.hp * PERKS$6.low.below ? PERKS$6.low.more : 1;
		/** A blow of one of his skills. */
		const blow = (amount) => fight.hit(self, amount * more());
		/** His attack: a blow; every so many, with his unique weapon, a blow more, a stun, and the Storm of Neraxis on every ally. */
		const attack = (amount) => {
			fight.hit(self, amount);
			if (tier === null || ++blows < atTier(ACRAVITA.blows, tier)) return;
			blows = 0;
			fight.hit(self, ACRAVITA.blow, false);
			fight.stun(ACRAVITA.stun, { by: self });
			storm = ACRAVITA.lasts;
			const share = atTier(ACRAVITA.defense, tier);
			for (const ally of fight.field) {
				if (ally.hp <= 0) continue;
				put(ally.statuses, {
					name: ACRAVITA_UP.name,
					left: ACRAVITA.lasts,
					deals: 1 + atTier(ACRAVITA.atk, tier),
					bolsters: {
						physical: self.stats.physical * share,
						magical: self.stats.magical * share
					},
					shown: ACRAVITA_UP
				});
			}
			fight.cue(self, "storm", fight.field);
		};
		return {
			lands: {
				maw: () => attack(fight.basic),
				attack: () => attack(fight.basic),
				lightning(part) {
					blow(part === 0 ? CLAW.blow : CLAW.after);
					if (treasureTier(self, 0) > 0) self.mana = Math.min(MAX_MANA, self.mana + UT$6.cartridge.mana);
					if (part === 0) return;
					fight.stun((CLAW.stun + (self.perks.has("s1-light") ? PERKS$6.stun : 0)) * more(), { by: self });
					fight.slow(CLAW.speed, CLAW.slowed);
				},
				roar() {
					const boost = ROAR$1.more * (self.perks.has("s2-light") ? PERKS$6.roar : 1) * more();
					const defense = boost * (1 + fromTreasure(self, 1, UT$6.memories.defense));
					const on = fight.field.filter((ally) => ally.hp > 0);
					for (const ally of on) put(ally.statuses, {
						name: ROARED$1.name,
						left: ROAR$1.lasts,
						deals: 1 + boost / ally.stats.atk,
						bolsters: {
							physical: defense,
							magical: defense
						},
						shown: ROARED$1
					});
					fight.cue(self, "roar", on);
					blow(ROAR$1.blow);
					put(fight.foe.statuses, {
						name: WEAKENED,
						left: ROAR$1.lasts,
						deals: Math.max(0, 1 - ROAR$1.weaker * more()),
						shown: "curse"
					});
					if (self.perks.has("s2-dark")) fight.slow(300, ROAR$1.lasts);
				},
				breath() {
					const weaker = (self.perks.has("s3-dark") ? PERKS$6.weaker : BREATH.weaker) * more();
					put(fight.foe.statuses, {
						name: BREATHED,
						left: BREATH.lasts,
						defends: { magical: Math.max(0, 1 - weaker) },
						shown: "curse"
					});
					blow(BREATH.blow);
					fight.stun((BREATH.stun + (treasureTier(self, 2) > 0 ? UT$6.vortex.stun : 0)) * more(), { by: self });
				}
			},
			tick(dt) {
				storm = Math.max(0, storm - dt);
				const block = fromTreasure(self, 3, UT$6.nova.block);
				if (block > 0 && self.hp > 0 && fight.field.includes(self)) {
					nova += dt;
					if (nova >= UT$6.nova.every) {
						nova -= UT$6.nova.every;
						self.mana = Math.min(MAX_MANA, self.mana + UT$6.nova.mana);
						for (const ally of fight.field) if (ally.hp > 0) put(ally.statuses, {
							name: "Ashen Nova",
							left: UT$6.nova.lasts,
							blocks: {
								physical: block,
								magical: block
							},
							shown: {
								name: "Ashen Nova",
								about: `+${block} block.`,
								icon: "🐲",
								art: art$6(3)
							}
						});
					}
				}
				if (guarded || !self.perks.has("t5-dark")) return;
				guarded = true;
				for (const ally of fight.fighters) if (ally !== self) put(ally.statuses, {
					name: GUARDED.name,
					left: PERKS$6.guard.lasts,
					takes: PERKS$6.guard.taken,
					shown: GUARDED
				});
			},
			speed: () => self.perks.has("s4-light") ? PERKS$6.speed : 0,
			lit: () => storm > 0,
			buffs: () => storm > 0 ? [{
				...ACRAVITA_UP,
				left: storm
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/erze.ts
/** Sweet Blood: its blow, the share of what it deals she steals, how much shorter its cooldown is for the hit; its stacks, and the blows more at the most. */
var SWEET = {
	blow: indexed("assassin", 104556),
	steals: .1,
	sooner: .5,
	most: 5,
	more: 2
};
/** Soaking Blood: how long nothing touches her, how long before its blow; the most stacks on the boss; its blow, a blow more for every `per` stacks, and the share of what it deals she steals. */
var SOAK = {
	lasts: 5,
	after: 5,
	most: 6,
	blow: indexed("assassin", 76974),
	per: 3,
	steals: .25
};
/** Blood Liberation: how long, a blow every `every` seconds and a blow more each time. */
var LIBERATION = {
	lasts: 10,
	every: 1,
	blow: indexed("assassin", 40404)
};
/** Life Drinker: her max HP lower by this share once it has spared her. */
var DRINKER = { cut: .4 };
/** Her own perks' numbers: Sweet Blood's Light and Dark, Soaking Blood's Light, Blood Liberation's Light, Life Drinker's Light, and Transcend 5's Dark. */
var PERKS$5 = {
	mana: 150,
	sweeter: {
		more: .1,
		most: 30
	},
	stun: 3,
	liberated: 75,
	cut: .33,
	last: .25
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Sweet Blood's cheaper and more P.DMG taken for each blow (up
* to so many, for as long as it lasts); Soaking Blood's DMG and shorter cooldown; Blood Liberation's DMG; and Life
* Drinker's more of what it gives for each enemy killed (nothing here).
*/
var UT$5 = {
	fang: {
		cost: -1,
		takes: [
			.012,
			.014,
			.017,
			.021,
			.025
		],
		most: 10,
		lasts: 15
	},
	wine: {
		dmg: .5,
		cooldown: [
			6,
			7,
			8,
			9,
			10
		]
	},
	lipstick: { dmg: [
		.24,
		.29,
		.35,
		.42,
		.5
	] },
	piano: { more: [
		.24,
		.29,
		.35,
		.42,
		.5
	] }
};
/** What Fang of Thirst leaves on the boss. */
var THIRST = "Fang of Thirst";
var art$5 = skillArt("erze");
var LIFE_DRINKER = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Life Drinker",
		about: `Passive. A blow that would bring her down casts [Soaking Blood] instead (if it is ready: all her mana spent), and her max HP is ${pct(DRINKER.cut)} lower after. (What it gives for each enemy killed: nothing here.)`,
		icon: "🦇",
		art: art$5(3)
	},
	words: `Increases ATK by 4212 and Max HP by 21076 upon killing an enemy. Stacks up to max 50. Upon taking fatal DMG, casts [Soaking Blood], and decreases Max HP by ${pct(DRINKER.cut)}. This effect is not applied when [Soaking Blood] is in cooldown. This skill consumes all Mana upon activation.`
};
/** Sweet Blood's stacks, Soaking Blood on her: shown on her card. */
var SWEETENED = {
	name: "Sweet Blood",
	about: `At ${SWEET.most}, [Sweet Blood] strikes more.`,
	icon: "🩸",
	art: art$5(0)
};
var SOAKED = {
	name: "Soaking Blood",
	about: "Nothing touches her, and she can’t be knocked down.",
	icon: "🛡️",
	art: art$5(1)
};
var LIBERATED = {
	name: "Blood Liberation",
	about: "Blows every second.",
	icon: "🌹",
	art: art$5(2)
};
var ERZE = {
	id: "erze",
	name: "Erze",
	class: "assassin",
	skins: ["Erze"],
	stats: {
		...CLASS_STATS.assassin,
		deals: "physical"
	},
	abilities: [
		{
			name: "Sweet Blood",
			about: `A blow that steals ${pct(SWEET.steals)} of what it deals, its cooldown ${SWEET.sooner} seconds shorter; and a stack of it (at ${SWEET.most}, ${SWEET.more} blows more).`,
			words: `Deals ${dmg("assassin", SWEET.blow, bookDmg("erze", 0))} P.DMG to all enemies and steals HP equal to ${pct(SWEET.steals)} of DMG dealt. Reduces Cooldown of [Sweet Blood] by ${SWEET.sooner} sec on each hit, and gains 1 stack of [Sweet Blood]. [Sweet Blood] can be stacked up to ${SWEET.most} times, and using the skill with ${SWEET.most} stacks of [Sweet Blood] grants additional hits and removes [Sweet Blood] stacks.`,
			icon: "🩸",
			art: art$5(0),
			move: "sweet",
			cooldown: 5,
			cost: 2
		},
		{
			name: "Soaking Blood",
			about: `For ${SOAK.lasts} seconds nothing touches her and she can’t be knocked down; after ${SOAK.after}, a blow on the boss that steals ${pct(SOAK.steals)} of what it deals (a blow more for every ${SOAK.per} stacks of it).`,
			words: `Dispels all negative effects and gains immunity to all CCs, P.DMG, and M.DMG for ${SOAK.lasts} sec. Inflicts 1 stack of [Soaking Blood] on all enemies, and additional 1 stack upon attacking a target with [Soaking Blood]. [Soaking Blood] can be stacked up to ${SOAK.most} times. Deals ${dmg("assassin", SOAK.blow, bookDmg("erze", 1))} P.DMG to enemies with [Soaking Blood] stacks after ${SOAK.after} sec, and steals HP equal to ${pct(SOAK.steals)} of the DMG dealt. For every ${SOAK.per} stack(s) of [Soaking Blood], hit count increases by 1 and removes [Soaking Blood] stacks upon attacking.`,
			icon: "🛡️",
			art: art$5(1),
			move: "soak",
			cooldown: 35,
			cost: 2
		},
		{
			name: "Blood Liberation",
			about: `For ${LIBERATION.lasts} seconds, every second a blow and a blow more.`,
			words: `Deals ${dmg("assassin", LIBERATION.blow, bookDmg("erze", 2))} P.DMG to all enemies every ${LIBERATION.every} sec for ${LIBERATION.lasts} sec. Each hit of [Blood Liberation] causes an additional hit on 1 random enemy.`,
			icon: "🌹",
			art: art$5(2),
			move: "liberation",
			cooldown: 14,
			cost: 3
		}
	],
	passive: LIFE_DRINKER,
	treasures: [
		treasure("Fang of Thirst", (k) => ({
			words: `[Sweet Blood] Reduces Mana Cost by ${-UT$5.fang.cost} and increases P.DMG the hit enemy takes by ${Math.round(k(UT$5.fang.takes) * 1e3) / 10}%. This effect can be stacked up to max ${UT$5.fang.most} times.`,
			skill: {
				index: 0,
				cost: UT$5.fang.cost
			}
		})),
		treasure("Wine of Shivers", (k) => ({
			words: `[Soaking Blood] Increases DMG of [Soaking Blood] by ${pct(UT$5.wine.dmg)} and reduces Cooldown of [Soaking Blood] by ${k(UT$5.wine.cooldown)} sec.`,
			skill: {
				index: 1,
				dmg: 1 + UT$5.wine.dmg,
				cooldown: -k(UT$5.wine.cooldown)
			}
		})),
		treasure("Lipstick of Shame", (k) => ({
			words: `[Blood Liberation] Increases DMG of [Blood Liberation] by ${pct(k(UT$5.lipstick.dmg))} and gains immunity to CC for the duration of [Blood Liberation].`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$5.lipstick.dmg)
			}
		})),
		treasure("Moonlight Piano", (k) => ({ words: `[Life Drinker] Increases ATK boost and Max HP boost by ${pct(k(UT$5.piano.more))}. Life Drinker becomes irremovable.` }))
	],
	perks: {
		"s1-light": { words: `Recovers ${PERKS$5.mana} Mana every hit.` },
		"s1-dark": { words: `Each use increases DMG by ${pct(PERKS$5.sweeter.more)}. Stacks ${PERKS$5.sweeter.most} times max.` },
		"s2-light": { words: `Stuns the target for ${PERKS$5.stun} sec upon hit.` },
		"s2-dark": said({ skill: {
			index: 1,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s3-light": { words: `Recovers ${PERKS$5.liberated} Mana every hit.` },
		"s3-dark": said({ skill: {
			index: 2,
			cost: 1,
			dmg: 2
		} }, ({ skill }) => `Mana cost is increased by ${skill.cost} orb but DMG is boosted by ${pct(skill.dmg - 1)}.`),
		"s4-light": { words: `Increases Max HP by 100% upon killing an enemy and changes the Max HP reduction after auto-casting [Soaking Blood] to ${pct(PERKS$5.cut)}.` },
		"s4-dark": { words: "Increases ATK by 200% upon killing an enemy, but Max HP boost does not apply." },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": { words: `Steals HP equal to ${pct(PERKS$5.last)} of DMG dealt by the final normal attack and gains 1 stack of [Sweet Blood].` }
	},
	attack: "drain",
	join(fight, self) {
		/** Sweet Blood's stacks, and its Dark's uses; how long nothing touches her yet, and until Soaking Blood's blow, its stacks on the boss; how long Blood Liberation lasts yet, and toward its next blow; her max HP's cut (0: none yet); her unique weapon's stacks, and how long they last yet. */
		let sweet = 0;
		let sweeter = 0;
		let soaked = 0;
		let soaking = 0;
		let soakStacks = 0;
		let liberated = 0;
		let liberating = 0;
		let cut = 0;
		let greed = 0;
		let greedLeft = 0;
		const tier = self.unique?.tier ?? null;
		/** A blow of hers that steals a share of what it deals (none: none), and (a skill's) a stack of her unique weapon's. */
		const drink = (amount, steals, skill, counted = true) => {
			const before = self.dealt;
			const critical = fight.hit(self, amount, counted);
			const dealt = self.dealt - before;
			if (steals > 0 && dealt > 0) fight.heal(self, dealt * steals);
			if (skill && dealt > 0 && tier !== null) {
				greed = Math.min(atTier(PERION.most, tier), greed + 1);
				greedLeft = PERION.lasts;
				put(self.statuses, {
					name: PERION_UP.name,
					left: PERION.lasts,
					count: greed,
					deals: 1 + PERION.atk * greed,
					pace: 1 + share$2(PERION.speed * greed),
					shown: PERION_UP
				});
			}
			return critical;
		};
		/** Soaking Blood: what the boss has left on her cleared, nothing touching her for a while, a stack of it on the boss and its blow to come. */
		const soak = () => {
			const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
			self.statuses = self.statuses.filter((status) => !harmful(status));
			soaked = SOAK.lasts;
			soaking = SOAK.after;
			soakStacks = Math.min(SOAK.most, soakStacks + 1);
			put(self.statuses, {
				name: SOAKED.name,
				left: SOAK.lasts,
				guards: true,
				shown: SOAKED
			});
		};
		/** Her attack: a blow (a stack of Soaking Blood more, on a boss that has it). */
		const attack = (amount) => {
			const final = self.perks.has("t5-dark");
			drink(amount, final ? PERKS$5.last : 0, false);
			if (final) sweet = Math.min(SWEET.most, sweet + 1);
			if (soakStacks > 0 && soaking > 0) soakStacks = Math.min(SOAK.most, soakStacks + 1);
		};
		return {
			lands: {
				drain: () => attack(fight.basic),
				sweet() {
					const full = sweet >= SWEET.most;
					const harder = 1 + PERKS$5.sweeter.more * sweeter;
					if (self.perks.has("s1-dark")) sweeter = Math.min(PERKS$5.sweeter.most, sweeter + 1);
					const fang = fromTreasure(self, 0, UT$5.fang.takes);
					for (let i = 0; i < (full ? 1 + SWEET.more : 1); i++) {
						drink(SWEET.blow * harder, SWEET.steals, true);
						if (fang > 0) {
							const count = Math.min(UT$5.fang.most, (fight.foe.statuses.find((status) => status.name === THIRST)?.count ?? 0) + 1);
							put(fight.foe.statuses, {
								name: THIRST,
								left: UT$5.fang.lasts,
								count,
								takes: { physical: 1 + fang * count },
								shown: "curse"
							});
						}
						if (self.perks.has("s1-light")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$5.mana);
						self.cooldowns[0] = Math.max(0, (self.cooldowns[0] ?? 0) - SWEET.sooner);
					}
					sweet = full ? 0 : sweet + 1;
				},
				soak,
				liberation() {
					liberated = LIBERATION.lasts;
					liberating = 0;
					put(self.statuses, {
						name: LIBERATED.name,
						left: LIBERATION.lasts,
						shown: LIBERATED
					});
				}
			},
			tick(dt) {
				soaked = Math.max(0, soaked - dt);
				if (greedLeft > 0) {
					greedLeft -= dt;
					if (greedLeft <= 0) greed = 0;
				}
				if (cut > 0) self.hp = Math.min(self.hp, self.stats.hp * (1 - cut));
				if (soaking > 0) {
					soaking -= dt;
					if (soaking <= 0 && soakStacks > 0 && self.hp > 0) {
						const blows = 1 + Math.floor(soakStacks / SOAK.per);
						soakStacks = 0;
						for (let i = 0; i < blows; i++) drink(SOAK.blow * (self.moveDmg.soak ?? 1), SOAK.steals, true);
						if (self.perks.has("s2-light")) fight.stun(PERKS$5.stun, { by: self });
						fight.cue(self, "soaked");
					}
				}
				if (liberated > 0 && self.hp > 0) {
					liberated -= dt;
					liberating += dt;
					if (liberating >= LIBERATION.every) {
						liberating -= LIBERATION.every;
						for (let i = 0; i < 2; i++) {
							drink(LIBERATION.blow * (self.moveDmg.liberation ?? 1), 0, true);
							if (self.perks.has("s3-light")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$5.liberated);
						}
						fight.cue(self, "liberated");
					}
				}
			},
			untouched: () => soaked > 0,
			guards: () => liberated > 0 && treasureTier(self, 2) > 0,
			spared() {
				const index = 1;
				if ((self.cooldowns[index] ?? 0) > 0) return false;
				self.cooldowns[index] = self.abilities[index].cooldown;
				self.mana = 0;
				cut = self.perks.has("s4-light") ? PERKS$5.cut : DRINKER.cut;
				soak();
				fight.cue(self, "drinker");
				return true;
			},
			lit: () => sweet >= SWEET.most,
			buffs: () => [...sweet > 0 ? [{
				...SWEETENED,
				count: sweet
			}] : []],
			marks: () => soakStacks > 0 && soaking > 0 ? [{
				text: `Soaking Blood ×${soakStacks} ${Math.ceil(soaking)}s`,
				tone: "curse"
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/loman.ts
/** Cut Ground: its blow, how long the boss is down, and how much more physical damage it takes for `lasts` seconds. */
var CUT = {
	blow: indexed("knight", 122794),
	down: 4,
	weakness: .25,
	lasts: 10
};
/** Shrouding Creed: the shield on every ally for `lasts` seconds (none knocked down meanwhile), and what each takes for `taken` seconds. */
var SHROUD = {
	absorbs: 315448,
	shield: indexedHeal("knight", 315448),
	lasts: 5,
	less: .8,
	taken: 10
};
/** Knight's Creed: its first two blows and their stun; its last swing (two blows, all of it) and its stun; the Mark of Creed's blow, how long it lasts, and how often. */
var CREED = {
	blow: indexed("knight", 102676) / 2,
	stun: 1.5,
	last: indexed("knight", 242634),
	lastStun: 5,
	mark: indexed("knight", 95532),
	lasts: 15,
	every: .5
};
/** The Last Gatekeeper: Endurance a second, and for a block (no sooner than `every` after the last); at `most`, its blow (through the boss's defense), and the boss's ATK lower for `lasts` seconds. */
var GATEKEEPER = {
	each: 1,
	every: .2,
	most: 20,
	blow: indexed("knight", 70202),
	weaker: .2,
	lasts: 10
};
/** His own perks' numbers: Cut Ground's Dark, Shrouding Creed's Dark, The Last Gatekeeper's Light, and Transcend 5's Dark. */
var PERKS$4 = {
	weakness: .25,
	longer: 5,
	each: 1,
	ward: {
		block: 200,
		defense: .1,
		lasts: 5,
		every: 5
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Cut Ground's less P.Block and CC resist on the boss (points);
* Shrouding Creed's cheaper and every ally's mana; Knight's Creed's shorter cooldown and more P.DMG taken; and The Last
* Gatekeeper's M.Block (points), and its more Endurance for a block.
*/
var UT$4 = {
	techniques: {
		block: 500,
		resist: [
			120,
			140,
			170,
			210,
			250
		],
		lasts: 10
	},
	doll: {
		cost: -1,
		mana: [
			480,
			580,
			700,
			840,
			1e3
		]
	},
	sea: {
		cooldown: .3,
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	},
	shield: {
		block: [
			240,
			290,
			350,
			420,
			500
		],
		endurance: 1
	}
};
var art$4 = skillArt("loman");
var LAST_GATEKEEPER = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "The Last Gatekeeper",
		about: `Passive. A stack of [Endurance] every second (and for a block); at ${GATEKEEPER.most}, a blow through the boss’s defense, and its ATK ${pct(GATEKEEPER.weaker)} lower for ${GATEKEEPER.lasts} seconds.`,
		icon: "🏰",
		art: art$4(3)
	},
	words: `Stacks [Endurance] every second. [Endurance] cannot be dispelled, and when stacked ${GATEKEEPER.most} times, deals ${dmg("knight", GATEKEEPER.blow, bookDmg("loman", 3))} P.DMG, ignoring DEF on nearby enemies and reduces ATK of affected enemies by ${pct(GATEKEEPER.weaker)} for ${GATEKEEPER.lasts} second(s). A successful block grants 1 additional [Endurance] stack. This effect is activated only once every ${GATEKEEPER.every} second(s).`
};
/** Shrouding Creed's shield, and what every ally takes less for a while; Transcend 5's Dark; Endurance's stacks. */
var SHROUDED = {
	name: "Shrouding Creed",
	about: "A shield: it can’t be knocked down while it lasts.",
	icon: "🛡️",
	art: art$4(1)
};
var CREED_LESS = {
	name: "Shrouding Creed (less)",
	about: `Takes ${pct(1 - SHROUD.less)} less.`,
	icon: "🛡️",
	art: art$4(1)
};
var WARDED = {
	name: "Loman’s Ward",
	about: "M.Block and M.DEF higher.",
	icon: "🛡️",
	art: art$4(3)
};
var ENDURANCE = {
	name: "Endurance",
	about: `At ${GATEKEEPER.most}, The Last Gatekeeper strikes.`,
	icon: "🏰",
	art: art$4(3)
};
/** What his skills leave on the boss. */
var CUT_DOWN = "Cut Ground";
var GATE = "The Last Gatekeeper";
var ORVELIA = "Blessing of Orvelia";
var LOMAN = {
	id: "loman",
	name: "Loman",
	class: "knight",
	skins: ["Loman"],
	stats: {
		...CLASS_STATS.knight,
		deals: "physical"
	},
	abilities: [
		{
			name: "Cut Ground",
			about: `A blow that knocks the boss down for ${CUT.down} seconds; it takes ${pct(CUT.weakness)} more physical damage for ${CUT.lasts} seconds.`,
			words: `Deals ${dmg("knight", CUT.blow, bookDmg("loman", 0))} P.DMG to frontal enemies within range and knocks them down for ${CUT.down} sec, increasing P.Weakness of the affected targets by ${pct(CUT.weakness)} for ${CUT.lasts} sec. Blocks all DMG while the skill is in use.`,
			icon: "⚔️",
			art: art$4(0),
			move: "ground",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Shrouding Creed",
			about: `What the boss has left on every ally is cleared; a shield of ${num(SHROUD.absorbs)} on each for ${SHROUD.lasts} seconds (none can be knocked down meanwhile), and each takes ${pct(1 - SHROUD.less)} less for ${SHROUD.taken} seconds.`,
			words: `Removes negative effects from all allies. Casts a shield upon all allies that absorbs ${num(SHROUD.absorbs)} DMG for ${SHROUD.lasts} second(s) and reduces all DMG to allies by ${pct(1 - SHROUD.less)} for ${SHROUD.taken} second(s). The shield grants immunity to CC while it lasts.`,
			icon: "🛡️",
			art: art$4(1),
			move: "shroud",
			cooldown: 23,
			cost: 3,
			auto: { keeps: CREED_LESS.name }
		},
		{
			name: "Knight's Creed",
			about: `Two blows that stun the boss for ${CREED.stun} seconds, and a last swing that stuns it for ${CREED.lastStun} and leaves the [Mark of Creed] on it for ${CREED.lasts}: each other ally’s blow on it a blow of his more.`,
			words: `Hits frontal enemies within range 3 times. First 2 hits deal ${dmg("knight", CREED.blow * 2, bookDmg("loman", 2))} P.DMG and stun enemies for ${CREED.stun} second(s) while the last hit attacks enemies in wider range 2 times, dealing ${dmg("knight", CREED.last, bookDmg("loman", 2))} P.DMG in total. The last hit stuns enemies for ${CREED.lastStun} seconds and leaves [Mark of Creed] on the enemies, damaging them for ${CREED.lasts} second(s). Targets with [Mark of Creed] take additional ${dmg("knight", CREED.mark, bookDmg("loman", 2))} P.DMG from allies excluding caster. Additional DMG effect is activated only once every ${CREED.every} second(s).`,
			icon: "✝️",
			art: art$4(2),
			move: "creed",
			cooldown: 24,
			cost: 3
		}
	],
	passive: LAST_GATEKEEPER,
	treasures: [
		treasure("Basic Combat Techniques of Orvelian Knights", (k) => ({
			words: `[Cut Ground] For ${UT$4.techniques.lasts} sec, reduces the target's P.Block by ${UT$4.techniques.block} and CC Resist by ${k(UT$4.techniques.resist)}.`,
			skill: {
				index: 0,
				mark: {
					name: "Basic Combat Techniques",
					blocks: { physical: -UT$4.techniques.block },
					resist: -k(UT$4.techniques.resist),
					lasts: UT$4.techniques.lasts
				}
			}
		})),
		treasure("Wooden Doll Miniature", (k) => ({
			words: `[Shrouding Creed] Reduces Mana Cost by ${-UT$4.doll.cost} and recovers target's Mana by ${k(UT$4.doll.mana)}.`,
			skill: {
				index: 1,
				cost: UT$4.doll.cost,
				allyMana: k(UT$4.doll.mana)
			}
		})),
		treasure("Sea of Invocation", (k) => ({
			words: `[Knight's Creed] Reduces Cooldown by ${pct(UT$4.sea.cooldown)}, and increases P.Weakness of the target by ${pct(k(UT$4.sea.takes))} for ${UT$4.sea.lasts} seconds.`,
			skill: {
				index: 2,
				cooldownShare: 1 - UT$4.sea.cooldown,
				mark: {
					name: "Sea of Invocation",
					takes: { physical: 1 + k(UT$4.sea.takes) },
					lasts: UT$4.sea.lasts
				}
			}
		})),
		treasure("Father’s Shield", (k) => ({
			words: `[The Last Gatekeeper] Increases own M.Block by ${k(UT$4.shield.block)}. Upon block, the number of Endurance Stacks increases by ${UT$4.shield.endurance}.`,
			bonus: { blockMagical: k(UT$4.shield.block) }
		}))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cooldown: -3
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s1-dark": { words: `Increases P.Weakness of the affected target by ${pct(PERKS$4.weakness)} for ${CUT.lasts} seconds.` },
		"s2-light": said({ skill: {
			index: 1,
			cooldown: -5
		} }, ({ skill }) => `Reduces Cooldown by ${-skill.cooldown} seconds.`),
		"s2-dark": { words: `The shield lasts ${PERKS$4.longer} seconds longer.` },
		"s3-light": said({ skill: {
			index: 2,
			dmg: 2
		} }, ({ skill }) => `When there is 1 enemy, DMG is boosted by ${pct(skill.dmg - 1)}.`),
		"s3-dark": { words: "While in use, gains immunity to CC." },
		"s4-light": { words: "Increases the number of 'Endurance' stacked every second by 1." },
		"s4-dark": { words: "Decreases ATK Spd of the affected enemy by 200 for 10 sec." },
		"t5-light": t5Light({ blockMagical: 200 }, ({ blockMagical }) => `M. Block +${blockMagical}`),
		"t5-dark": { words: `Upon successfully blocking M.DMG, all allies have their M.Block increased by ${PERKS$4.ward.block} and M.DEF by ${pct(PERKS$4.ward.defense)} of Loman's M.DEF for ${PERKS$4.ward.lasts} sec. This effect is activated only once every ${PERKS$4.ward.every} seconds.` }
	},
	attack: "thrust",
	join(fight, self) {
		/** Endurance's stacks, toward the next, and until a block may add one; how long the Mark of Creed lasts yet, and until it may strike again; Transcend 5's Dark's wait; his unique weapon's skills toward its next. */
		let endurance = 0;
		let enduring = 0;
		let parried = 0;
		let marked = 0;
		let markWait = 0;
		let warding = 0;
		let pride = 0;
		const tier = self.unique?.tier ?? null;
		/** A stack of Endurance more: at the most, The Last Gatekeeper strikes (through the boss's defense), and the boss's ATK is lower (its Dark: slowed too). */
		const endure = () => {
			endurance++;
			if (endurance < GATEKEEPER.most || self.hp <= 0) return;
			endurance = 0;
			fight.hit(self, GATEKEEPER.blow, true, 0, true);
			put(fight.foe.statuses, {
				name: GATE,
				left: GATEKEEPER.lasts,
				deals: 1 - GATEKEEPER.weaker,
				shown: "curse"
			});
			if (self.perks.has("s4-dark")) fight.slow(200, GATEKEEPER.lasts);
			fight.cue(self, "gatekeeper");
		};
		return {
			untouched: () => self.doing?.move === "ground",
			lands: {
				thrust: () => fight.hit(self, fight.basic),
				ground() {
					fight.hit(self, CUT.blow);
					fight.stun(CUT.down, {
						down: true,
						by: self
					});
					put(fight.foe.statuses, {
						name: CUT_DOWN,
						left: CUT.lasts,
						takes: { physical: 1 + CUT.weakness + (self.perks.has("s1-dark") ? PERKS$4.weakness : 0) },
						shown: "curse"
					});
				},
				shroud() {
					const lasts = SHROUD.lasts + (self.perks.has("s2-dark") ? PERKS$4.longer : 0);
					const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
					for (let i = fight.party.length - 1; i >= 0; i--) if (harmful(fight.party[i])) fight.party.splice(i, 1);
					const on = fight.field.filter((ally) => ally.hp > 0);
					for (const ally of on) {
						ally.statuses = ally.statuses.filter((status) => !harmful(status));
						fight.shield(ally, SHROUD.shield, lasts, self);
						put(ally.statuses, {
							name: SHROUDED.name,
							left: lasts,
							guards: true,
							shown: SHROUDED
						});
					}
					put(fight.party, {
						name: CREED_LESS.name,
						left: SHROUD.taken,
						takes: SHROUD.less,
						shown: CREED_LESS
					});
					fight.cue(self, "shroud", on);
				},
				creed(part) {
					if (part < 2) {
						fight.hit(self, CREED.blow);
						fight.stun(CREED.stun, { by: self });
						return;
					}
					fight.hit(self, CREED.last / 2);
					if (part < 3) return;
					fight.stun(CREED.lastStun, { by: self });
					marked = CREED.lasts;
					markWait = 0;
				}
			},
			used() {
				if (tier === null || ++pride < GAIAMENES.skills) return;
				pride = 0;
				fight.hit(self, atTier(GAIAMENES.blow, tier), false);
				put(fight.foe.statuses, {
					name: ORVELIA,
					left: GAIAMENES.lasts,
					takes: { physical: 1 + atTier(GAIAMENES.weakness, tier) },
					shown: "curse"
				});
				put(self.statuses, {
					name: GAIAMENES_UP.name,
					left: GAIAMENES.guards,
					defends: { magical: 1 + atTier(GAIAMENES.defense, tier) },
					shown: GAIAMENES_UP
				});
			},
			struck(by) {
				if (marked <= 0 || by === self || markWait > 0 || self.hp <= 0) return;
				markWait = CREED.every;
				fight.hit(self, CREED.mark, false);
			},
			blocked() {
				if (parried <= 0) {
					parried = GATEKEEPER.every;
					endure();
					if (treasureTier(self, 3) > 0) for (let i = 0; i < UT$4.shield.endurance; i++) endure();
				}
				if (!self.perks.has("t5-dark") || warding > 0 || fight.foe.def.stats.deals !== "magical") return;
				warding = PERKS$4.ward.every;
				const defense = self.stats.magical * PERKS$4.ward.defense;
				for (const ally of fight.field) if (ally.hp > 0) put(ally.statuses, {
					name: WARDED.name,
					left: PERKS$4.ward.lasts,
					blocks: { magical: PERKS$4.ward.block },
					bolsters: { magical: defense },
					shown: WARDED
				});
			},
			tick(dt) {
				marked = Math.max(0, marked - dt);
				markWait = Math.max(0, markWait - dt);
				parried = Math.max(0, parried - dt);
				warding = Math.max(0, warding - dt);
				if (!fight.field.includes(self) || self.hp <= 0) return;
				enduring += dt;
				if (enduring < 1) return;
				enduring -= 1;
				for (let i = 0; i < GATEKEEPER.each + (self.perks.has("s4-light") ? PERKS$4.each : 0); i++) endure();
			},
			guards: () => self.perks.has("s3-dark") && self.doing?.move === "creed",
			lit: () => marked > 0,
			buffs: () => endurance > 0 ? [{
				...ENDURANCE,
				count: endurance
			}] : [],
			marks: () => marked > 0 ? [{
				text: `Mark of Creed ${Math.ceil(marked)}s`,
				tone: "curse"
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/gau.ts
/** Smash: its two blows, and how long the first knocks the boss down. */
var SMASH = {
	blow: indexed("warrior", 157882) / CODED.smash.lands.length,
	down: 3,
	speed: 250,
	slowed: 10
};
/** Battle Roar: every ally's ATK more, for `lasts` seconds. */
var ROAR = {
	atk: 3845,
	lasts: 15
};
/** Vortex: its blows (as many as its move has; against one that isn't a Hero), and how long the last freezes the boss. */
var VORTEX = {
	blow: indexed("warrior", 347796) / CODED.vortex.lands.length,
	freeze: 4
};
/** Enrage: his ATK more for each stack, and his DMG on the boss (a share), for `lasts` seconds, up to `most`. */
var ENRAGE = {
	atk: 901,
	dmg: .03,
	lasts: 5,
	most: 10,
	resist: 10
};
/** His own perks' numbers: Smash's Dark, Battle Roar's Light and Dark, Enrage's Light and Dark, and Transcend 5's Dark. */
var PERKS$3 = {
	harder: {
		more: .15,
		most: 10
	},
	roar: 1.4,
	speed: 200,
	enrage: 1.4,
	fury: {
		taken: .05,
		crit: 50,
		lifesteal: 50
	},
	mend: {
		heal: .1,
		less: .006
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Smash's weaker boss and more P.DMG taken; Battle Roar's
* cheaper and every ally's crit DMG; Vortex's DMG; and Enrage's more stacks at most, and his penetration (points) at
* the most.
*/
var UT$3 = {
	helmet: {
		weaker: .2,
		takes: [
			.12,
			.14,
			.17,
			.21,
			.25
		],
		lasts: 10
	},
	horn: {
		cost: -1,
		critDamage: [
			.24,
			.29,
			.35,
			.42,
			.5
		]
	},
	mug: { dmg: [
		.1,
		.12,
		.14,
		.17,
		.2
	] },
	bracelet: {
		most: 30,
		pen: [
			120,
			140,
			170,
			210,
			250
		]
	}
};
var art$3 = skillArt("gau");
var ENRAGED = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Enrage",
		about: `Passive. Each blow of his attack: +${num(ENRAGE.atk)} ATK and +${pct(ENRAGE.dmg)} DMG on the boss for ${ENRAGE.lasts} seconds (up to ${ENRAGE.most} times).`,
		icon: "😡",
		art: art$3(3)
	},
	words: `Upon attacking, increases ATK by ${num(ENRAGE.atk)} for ${ENRAGE.lasts} sec, and DMG to Non-Hero enemies by ${pct(ENRAGE.dmg)}. This effect can be stacked up to max ${ENRAGE.most} times. Status Resistance increases by ${ENRAGE.resist} for each stack.`
};
/** Battle Roar on an ally; Enrage's stacks on him. */
var ROARED = {
	name: "Battle Roar",
	about: "ATK higher.",
	icon: "📯",
	art: art$3(1)
};
var RAGING = {
	name: "Enrage",
	about: "ATK and DMG on the boss higher for each.",
	icon: "😡",
	art: art$3(3)
};
var GAU = {
	id: "gau",
	name: "Gau",
	class: "warrior",
	skins: ["Gau"],
	stats: {
		...CLASS_STATS.warrior,
		deals: "physical"
	},
	abilities: [
		{
			name: "Smash",
			about: `Two blows, the first knocking the boss down for ${SMASH.down} seconds.`,
			words: `Deals ${dmg("warrior", SMASH.blow * CODED.smash.lands.length, bookDmg("gau", 0))} P.DMG to enemies within range, and the first attack knocks them down for ${SMASH.down} sec and reduces their ATK Spd by ${SMASH.speed} for ${SMASH.slowed} sec.`,
			icon: "🪓",
			art: art$3(0),
			move: "smash",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Battle Roar",
			about: `What the boss has left on every ally is cleared, and each gains +${num(ROAR.atk)} ATK for ${ROAR.lasts} seconds.`,
			words: `All allies' ATK is increased by ${num(ROAR.atk)} for ${ROAR.lasts} sec. Upon activation, dispels all negative effects from allies.`,
			icon: "📯",
			art: art$3(1),
			move: "warcry",
			cooldown: 12,
			cost: 2,
			auto: { keeps: ROARED.name }
		},
		{
			name: "Vortex",
			about: `A whirl of blows, the last freezing the boss for ${VORTEX.freeze} seconds; he can’t be knocked down meanwhile.`,
			words: `Deals ${dmg("warrior", VORTEX.blow * CODED.vortex.lands.length, bookDmg("gau", 2))} P.DMG to nearby enemies. If the target is not a Hero, deals P.DMG. The last attack freezes nearby enemies for ${VORTEX.freeze} sec. Gains immunity to CC for the duration of Skill.`,
			icon: "🌀",
			art: art$3(2),
			move: "vortex",
			cooldown: 20,
			cost: 3
		}
	],
	passive: ENRAGED,
	treasures: [
		treasure("King of Frost Helmet", (k) => ({
			words: `[Smash] Reduces the target's ATK by ${pct(UT$3.helmet.weaker)} and increases P.DMG target receives by ${pct(k(UT$3.helmet.takes))} for ${UT$3.helmet.lasts} sec.`,
			skill: {
				index: 0,
				mark: {
					name: "King of Frost Helmet",
					deals: 1 - UT$3.helmet.weaker,
					takes: { physical: 1 + k(UT$3.helmet.takes) },
					lasts: UT$3.helmet.lasts
				}
			}
		})),
		treasure("Fighter’s Horn", (k) => ({
			words: `[Battle Roar] Reduces Mana Cost by ${-UT$3.horn.cost} and increases Crit DMG by ${pct(k(UT$3.horn.critDamage))} for duration of skill.`,
			skill: {
				index: 1,
				cost: UT$3.horn.cost
			}
		})),
		treasure("Barbarian Mug", (k) => ({
			words: `[Vortex] DMG is increased by ${pct(k(UT$3.mug.dmg))}.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$3.mug.dmg)
			}
		})),
		treasure("Snowdrop Bracelet", (k) => ({ words: `[Enrage] Max stack number is changed to ${UT$3.bracelet.most}, and after ${UT$3.bracelet.most}th stack, own Penetration is increased by ${k(UT$3.bracelet.pen)}.` }))
	],
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			cost: -1
		} }, ({ skill }) => `Mana cost is reduced by ${-skill.cost}.`),
		"s1-dark": { words: `Each use increases DMG by ${pct(PERKS$3.harder.more)}. Stacks ${PERKS$3.harder.most} times max.` },
		"s2-light": { words: `ATK boost is increased by ${pct(PERKS$3.roar - 1)}.` },
		"s2-dark": { words: `ATK Spd boost of ${PERKS$3.speed} is added to the effect.` },
		"s3-light": said({ skill: {
			index: 2,
			cooldown: -3
		} }, ({ skill }) => `Cooldown reduced by ${-skill.cooldown} sec.`),
		"s3-dark": { words: "Immune to all types of DMG while in use." },
		"s4-light": { words: `ATK boost is increased by ${pct(PERKS$3.enrage - 1)}.` },
		"s4-dark": { words: `Takes ${pct(PERKS$3.fury.taken)} more DMG per each stack, but gains a boost of ${PERKS$3.fury.crit} Crit Chance and Lifesteal per each stack as well.` },
		"t5-light": t5Light({ blockPhysical: 200 }, ({ blockPhysical }) => `P. Block +${blockPhysical}`),
		"t5-dark": { words: `Heals HP worth ${pct(PERKS$3.mend.heal)} of ATK every second, and every 1% of HP lost reduces received DMG by ${PERKS$3.mend.less * 100}%.` }
	},
	attack: "chop",
	timing: {
		attack: [{
			lands: [.88],
			until: 1.5
		}],
		skills: { warcry: {
			lands: [.5],
			until: 2.2
		} }
	},
	join(fight, self) {
		/** Enrage's stacks, and how long they last yet; Smash's Dark's uses; toward Transcend 5's Dark's next heal. */
		let rage = 0;
		let rageLeft = 0;
		let smashed = 0;
		let mending = 0;
		const tier = self.unique?.tier ?? null;
		const most = treasureTier(self, 3) > 0 ? UT$3.bracelet.most : ENRAGE.most;
		const bracelet = fromTreasure(self, 3, UT$3.bracelet.pen);
		/** Enrage's stacks on him: his ATK (its Light: more) and DMG on the boss; its Dark, his crit chance too. */
		const enraged = () => {
			const atk = ENRAGE.atk * (self.perks.has("s4-light") ? PERKS$3.enrage : 1) * rage;
			const fury = self.perks.has("s4-dark");
			put(self.statuses, {
				name: RAGING.name,
				left: ENRAGE.lasts,
				count: rage,
				deals: (1 + atk / self.stats.atk) * (1 + ENRAGE.dmg * rage),
				resist: ENRAGE.resist * rage,
				...fury && { crit: share$2(PERKS$3.fury.crit * rage) },
				...bracelet > 0 && rage >= most && { pen: bracelet },
				shown: RAGING
			});
		};
		/** A blow of his: with Enrage's Dark, he steals a share of what it deals for each stack. */
		const strike = (amount, counted = true) => {
			const before = self.dealt;
			const critical = fight.hit(self, amount, counted);
			if (self.perks.has("s4-dark") && rage > 0) fight.heal(self, (self.dealt - before) * share$2(PERKS$3.fury.lifesteal * rage));
			return critical;
		};
		/** His attack: a blow, a stack of Enrage (all begun again); with his unique weapon, now and then a blow more and the boss frozen. */
		const chop = (amount) => {
			strike(amount);
			rage = Math.min(most, rage + 1);
			rageLeft = ENRAGE.lasts;
			enraged();
			if (tier !== null && fight.roll() < NUMINU.chance) {
				strike(atTier(NUMINU.blow, tier), false);
				fight.stun(NUMINU.freeze, { by: self });
			}
		};
		return {
			lands: {
				chop: () => chop(fight.basic),
				attack: () => chop(fight.basic),
				smash(part) {
					strike(SMASH.blow * (1 + PERKS$3.harder.more * smashed));
					if (part !== 0) return;
					if (self.perks.has("s1-dark")) smashed = Math.min(PERKS$3.harder.most, smashed + 1);
					fight.stun(SMASH.down, {
						down: true,
						by: self
					});
					fight.slow(SMASH.speed, SMASH.slowed);
				},
				warcry() {
					const atk = ROAR.atk * (self.perks.has("s2-light") ? PERKS$3.roar : 1);
					const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
					for (let i = fight.party.length - 1; i >= 0; i--) if (harmful(fight.party[i])) fight.party.splice(i, 1);
					const on = fight.field.filter((ally) => ally.hp > 0);
					for (const ally of on) {
						ally.statuses = ally.statuses.filter((status) => !harmful(status));
						const horn = fromTreasure(self, 1, UT$3.horn.critDamage);
						put(ally.statuses, {
							name: ROARED.name,
							left: ROAR.lasts,
							deals: 1 + atk / ally.stats.atk,
							...self.perks.has("s2-dark") && { pace: 1 + share$2(PERKS$3.speed) },
							...horn > 0 && { critDamage: horn },
							shown: ROARED
						});
					}
					fight.cue(self, "warcry", on);
				},
				vortex(part) {
					strike(VORTEX.blow);
					if (part === (self.motion.moves.vortex.parts[0]?.lands.length ?? 1) - 1) fight.stun(VORTEX.freeze, { by: self });
				}
			},
			tick(dt) {
				if (rageLeft > 0) {
					rageLeft -= dt;
					if (rageLeft <= 0) rage = 0;
				}
				if (!self.perks.has("t5-dark") || self.hp <= 0) return;
				mending += dt;
				if (mending < 1) return;
				mending -= 1;
				fight.heal(self, PERKS$3.mend.heal * self.stats.atk);
			},
			takes() {
				const uw = tier !== null ? 1 / (1 + atTier(NUMINU.hp, tier)) : 1;
				const lost = self.perks.has("t5-dark") ? Math.max(.1, 1 - PERKS$3.mend.less * 100 * (1 - self.hp / self.stats.hp)) : 1;
				const fury = self.perks.has("s4-dark") ? 1 + PERKS$3.fury.taken * rage : 1;
				return uw * lost * fury;
			},
			guards: () => self.doing?.move === "vortex",
			untouched: () => self.perks.has("s3-dark") && self.doing?.move === "vortex",
			lit: () => rage >= most,
			buffs: () => tier !== null ? [NUMINU_UP] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/tanya.ts
/** Stealth: how long, her crit chance and dodge (points) more meanwhile. */
var STEALTH = {
	lasts: 10,
	crit: 50,
	dodge: 50
};
/** Target Sighted: how much more physical damage the boss takes for `lasts` seconds, its blow, how long the boss is down, and (in Stealth) stunned. */
var SIGHTED = {
	takes: 1.3,
	lasts: 10,
	blow: indexed("assassin", 119110),
	down: 2,
	stun: 6
};
/** Blade Tornado: its blows (as many as its move has), each a stack of Bleed; in Stealth, the boss's healing as much as `heals` for `lasts` seconds. */
var TORNADO = {
	blow: indexed("assassin", 247062) / CODED.tornado.lands.length,
	heals: .3,
	lasts: 10
};
/** A stack of Bleed: what it takes of the boss every second (at her ATK), for `lasts` seconds. */
var BLEED = {
	each: 470,
	lasts: 5
};
/** Whisper of Death: its six blows, and its last. */
var WHISPER = {
	blow: indexed("assassin", 841890) / (CODED.whisper.lands.length - 1),
	last: indexed("assassin", 264085)
};
/** Silent Ambush: a critical blow of a skill deals more (at ATK); on the boss, a blow more through its defense. */
var AMBUSH = {
	blow: indexed("assassin", 61307),
	boss: indexed("assassin", 42824),
	speed: 200,
	slowed: 10
};
/** Her own perks' numbers: Target Sighted's Light, Blade Tornado's Dark, Silent Ambush's Light, and Transcend 5's Dark. */
var PERKS$2 = {
	heals: .7,
	mana: 200,
	boss: 2,
	stealth: {
		chance: .15,
		more: 1.5
	}
};
/**
* Her unique treasures' numbers (1★ to 5★: ../treasures.ts): Target Sighted's DMG and mana; Blade Tornado's DMG and the
* share off its cooldown on a critical blow; Whisper of Death's DMG, and her ATK for it used in Stealth; and Silent
* Ambush's mana for her, and the mana it would take (the boss has none).
*/
var UT$2 = {
	codex: {
		dmg: .5,
		mana: [
			480,
			580,
			700,
			840,
			1e3
		]
	},
	mask: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		cooldown: .08
	},
	dagger: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		atk: .2,
		lasts: 10
	},
	needle: {
		mana: [
			120,
			140,
			170,
			210,
			250
		],
		drain: 200
	}
};
var art$2 = skillArt("tanya");
var SILENT_AMBUSH = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Silent Ambush",
		about: `Passive. A critical blow of a skill of hers deals ${pct(AMBUSH.blow / 1e3)} of her ATK more, and ${pct(AMBUSH.boss / 1e3)} more through the boss’s defense.`,
		icon: "🗡️",
		art: art$2(3)
	},
	words: `Deals additional ${dmg("assassin", AMBUSH.blow, bookDmg("tanya", 3))} P.DMG to the enemy and silences them for 1 sec upon a Critical Hit with the skill. If the target is not a Hero, deals additional ${dmg("assassin", AMBUSH.boss, bookDmg("tanya", 3))} P.DMG that ignores DEF and reduces the target's ATK Spd by ${AMBUSH.speed} for ${AMBUSH.slowed} sec.`
};
/** Stealth on her; Bleed on the boss. */
var STEALTHED = {
	name: "Stealth",
	about: `+${STEALTH.crit} crit chance and +${STEALTH.dodge} dodge.`,
	icon: "🌫️",
	art: art$2(0)
};
var BLED = "Bleed";
/** What her skills leave on the boss. */
var EXPOSED = "Target Sighted";
var UNHEALED = "Target Sighted (healing)";
var TORN = "Blade Tornado";
var TANYA = {
	id: "tanya",
	name: "Tanya",
	class: "assassin",
	line: "front",
	skins: ["Tanya"],
	stats: {
		...CLASS_STATS.assassin,
		deals: "physical"
	},
	abilities: [
		{
			name: "Target Sighted",
			about: `The boss takes ${pct(SIGHTED.takes - 1)} more physical damage for ${SIGHTED.lasts} seconds; a blow that knocks it down (in Stealth: stunned for ${SIGHTED.stun} seconds; else, Stealth).`,
			words: `Moves behind the enemy with the lowest P.DEF and increase their P.DMG taken by ${pct(SIGHTED.takes - 1)}, while knocking them down and inflicting ${dmg("assassin", SIGHTED.blow, bookDmg("tanya", 0))} P.DMG. If in a Stealth state, stun said enemy for ${SIGHTED.stun} sec. If not, gain Stealth for ${STEALTH.lasts} sec. While in a Stealth State, Crit Rate and Dodge Rate rises by ${STEALTH.crit}.`,
			icon: "🎯",
			art: art$2(0),
			move: "sighted",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Blade Tornado",
			about: `Three blows, each a stack of Bleed on the boss (in Stealth: it is healed ${pct(1 - TORNADO.heals)} less for ${TORNADO.lasts} seconds, her Stealth spent; else, Stealth).`,
			words: `Attacks nearby enemies 3 times and deals a total of ${dmg("assassin", TORNADO.blow * CODED.tornado.lands.length, bookDmg("tanya", 1))} P.DMG, inflicting 1 stack of Bleed per each hit. If used in a Stealth state, target's heal rate is reduced by ${pct(1 - TORNADO.heals)}, and Stealth is dispelled. If not, turns into Stealth mode for ${STEALTH.lasts} sec. [Stealth] Crit Rate and Dodge Rate are increased by ${STEALTH.crit}.`,
			icon: "🌪️",
			art: art$2(1),
			move: "tornado",
			cooldown: 14,
			cost: 2
		},
		{
			name: "Whisper of Death",
			about: "Six blows and a seventh (out of Stealth: Stealth).",
			words: `Attacks random enemies 6 times and deals a total of ${dmg("assassin", WHISPER.blow * (CODED.whisper.lands.length - 1), bookDmg("tanya", 2))} P.DMG, then deals one additional attack of ${dmg("assassin", WHISPER.last, bookDmg("tanya", 2))} extra P.DMG. If used in Stealth state, dispels all enemies' buffs. If not, turns into Stealth mode for ${STEALTH.lasts} sec. [Stealth] Crit Rate and Dodge Rate are increased by ${STEALTH.crit}.`,
			icon: "💀",
			art: art$2(2),
			move: "whisper",
			cooldown: 18,
			cost: 3
		}
	],
	passive: SILENT_AMBUSH,
	treasures: [
		treasure("Copied Codex of Stealth", (k) => ({
			words: `[Target Sighted] Increases DMG by ${pct(UT$2.codex.dmg)}, and after use, recovers Mana by ${k(UT$2.codex.mana)}.`,
			skill: {
				index: 0,
				dmg: 1 + UT$2.codex.dmg,
				mana: k(UT$2.codex.mana)
			}
		})),
		treasure("Laughing Mask All-round Belt", (k) => ({
			words: `[Blade Tornado] Increases DMG by ${pct(k(UT$2.mask.dmg))} and reduces Cooldown by ${pct(UT$2.mask.cooldown)} upon a Crit Hit.`,
			skill: {
				index: 1,
				dmg: 1 + k(UT$2.mask.dmg),
				critCooldown: UT$2.mask.cooldown
			}
		})),
		treasure("Dagger of Silence", (k) => ({
			words: `[Whisper of Death] DMG is increased by ${pct(k(UT$2.dagger.dmg))} and upon use, immediately gains Stealth. If used in Stealth mode, ATK is increased by ${pct(UT$2.dagger.atk)} for ${UT$2.dagger.lasts} sec.`,
			skill: {
				index: 2,
				dmg: 1 + k(UT$2.dagger.dmg)
			}
		})),
		treasure("Needle of Silence", (k) => ({ words: `[Silent Ambush] Upon activation, recovers own Mana by ${k(UT$2.needle.mana)} while reducing the target's Mana by ${UT$2.needle.drain}.` }))
	],
	perks: {
		"s1-light": { words: `Reduces the target's Heal Rate by ${pct(1 - PERKS$2.heals)}.` },
		"s1-dark": { words: "For 10 sec, target's P.Crit resistance is reduced by 250." },
		"s2-light": said({ skill: {
			index: 1,
			dmg: 2
		} }, ({ skill }) => `If there is 1 enemy, DMG is increased by ${pct(skill.dmg - 1)}.`),
		"s2-dark": { words: `Recovers ${PERKS$2.mana} mana upon a Crit hit.` },
		"s3-light": said({ skill: {
			index: 2,
			cost: 1,
			dmg: 2
		} }, ({ skill }) => `Mana cost is increased by ${skill.cost} orb but DMG is boosted by ${pct(skill.dmg - 1)}.`),
		"s3-dark": said({ skill: {
			index: 2,
			cooldown: -5
		} }, ({ skill }) => `Cooldown is reduced by ${-skill.cooldown} sec.`),
		"s4-light": { words: `Increases additional DMG against non-Hero enemies by ${pct(PERKS$2.boss - 1)}.` },
		"s4-dark": { words: "Increases Silence duration by 0.5 sec." },
		"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
		"t5-dark": { words: `Normal attacks have a ${pct(PERKS$2.stealth.chance)} chance to activate Stealth mode that lasts for ${STEALTH.lasts} sec. While in Stealth mode, normal attacks deal ${pct(PERKS$2.stealth.more - 1)} increased DMG.` }
	},
	attack: "katar",
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
		/** How long her Stealth lasts yet; how long the boss can't touch her yet (her unique weapon); whether it has hidden her as the fight begins; Bleed's stacks on the boss (how long each lasts yet), and toward their next bite. */
		let stealth = 0;
		let untouched = 0;
		let begun = false;
		const bleeds = [];
		let bleeding = 0;
		const tier = self.unique?.tier ?? null;
		/** In Stealth for a while: her crit chance higher (and with her unique weapon, her crit damage); her dodge (dodge, below). */
		const hide = () => {
			stealth = STEALTH.lasts;
			put(self.statuses, {
				name: STEALTHED.name,
				left: STEALTH.lasts,
				crit: share$2(STEALTH.crit),
				...tier !== null && { critDamage: atTier(CAETHASIS.critDamage, tier) },
				shown: STEALTHED
			});
			fight.cue(self, "stealth");
		};
		/** Her Stealth spent. */
		const unhide = () => {
			stealth = 0;
			self.statuses = self.statuses.filter((status) => status.name !== STEALTHED.name);
		};
		/** A blow of one of her skills: a critical one, Silent Ambush (a blow more, and one through the boss's defense: its Light, twice as hard); Blade Tornado's Dark, mana. */
		const skill = (amount, tornado = false) => {
			if (!fight.hit(self, amount)) return;
			fight.hit(self, AMBUSH.blow, false);
			self.mana = Math.min(MAX_MANA, self.mana + fromTreasure(self, 3, UT$2.needle.mana));
			fight.hit(self, AMBUSH.boss * (self.perks.has("s4-light") ? PERKS$2.boss : 1), false, 0, true);
			fight.slow(AMBUSH.speed, AMBUSH.slowed);
			if (tornado && self.perks.has("s2-dark")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$2.mana);
		};
		/** Her attack: a blow (Transcend 5's Dark: harder in Stealth, and now and then Stealth). */
		const attack = (amount) => {
			const dark = self.perks.has("t5-dark");
			fight.hit(self, amount * (dark && stealth > 0 ? PERKS$2.stealth.more : 1));
			if (dark && stealth <= 0 && fight.roll() < PERKS$2.stealth.chance) hide();
		};
		return {
			lands: {
				katar: () => attack(fight.basic),
				attack: () => attack(fight.basic),
				sighted() {
					const hidden = stealth > 0;
					put(fight.foe.statuses, {
						name: EXPOSED,
						left: SIGHTED.lasts,
						takes: { physical: SIGHTED.takes },
						shown: "curse"
					});
					if (self.perks.has("s1-light")) put(fight.foe.statuses, {
						name: UNHEALED,
						left: SIGHTED.lasts,
						heals: PERKS$2.heals,
						shown: "curse"
					});
					skill(SIGHTED.blow);
					fight.stun(SIGHTED.down, {
						down: true,
						by: self
					});
					if (hidden) fight.stun(SIGHTED.stun, { by: self });
					else hide();
				},
				tornado(part) {
					skill(TORNADO.blow, true);
					bleeds.push(BLEED.lasts);
					if (part < (self.motion.moves.tornado.parts[0]?.lands.length ?? 1) - 1) return;
					if (stealth > 0) {
						put(fight.foe.statuses, {
							name: TORN,
							left: TORNADO.lasts,
							heals: TORNADO.heals,
							shown: "curse"
						});
						unhide();
					} else hide();
				},
				whisper(part) {
					const last = (self.motion.moves.whisper.parts[0]?.lands.length ?? 1) - 1;
					skill(part === last ? WHISPER.last : WHISPER.blow);
					if (part === last && stealth <= 0) hide();
				}
			},
			used(index) {
				if (index !== 2 || treasureTier(self, 2) <= 0) return;
				if (stealth > 0) put(self.statuses, {
					name: "Dagger of Silence",
					left: UT$2.dagger.lasts,
					deals: 1 + UT$2.dagger.atk,
					shown: {
						name: "Dagger of Silence",
						about: `ATK ${pct(UT$2.dagger.atk)} higher.`,
						icon: "🗡️",
						art: art$2(2)
					}
				});
				hide();
			},
			tick(dt) {
				if (!begun && tier !== null) {
					begun = true;
					hide();
					untouched = atTier(CAETHASIS.untouched, tier);
				}
				stealth = Math.max(0, stealth - dt);
				untouched = Math.max(0, untouched - dt);
				for (let i = bleeds.length - 1; i >= 0; i--) {
					bleeds[i] = bleeds[i] - dt;
					if (bleeds[i] <= 0) bleeds.splice(i, 1);
				}
				if (bleeds.length === 0) {
					bleeding = 0;
					return;
				}
				bleeding += dt;
				if (bleeding < 1) return;
				bleeding -= 1;
				fight.hit(self, BLEED.each * bleeds.length, false);
			},
			untouched: () => untouched > 0,
			dodge: () => stealth > 0 ? STEALTH.dodge : 0,
			lit: () => stealth > 0,
			buffs: () => tier !== null && stealth > 0 ? [{
				...CAETHASIS_UP,
				left: stealth
			}] : [],
			marks: () => bleeds.length > 0 ? [{
				text: `${BLED} ×${bleeds.length}`,
				tone: "curse"
			}] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/rebel-klaus.ts
/** Determined Strike: its blow, the blow more against a boss, and how long it stuns. */
var DETERMINED = {
	blow: 8020,
	boss: 5340,
	stun: 2
};
/** Indomitable Will: its blow, and the state's attack speed (points) and how much shorter it is held down, for `lasts` seconds. */
var WILL = {
	blow: 5010,
	lasts: 10,
	speed: 500,
	held: .5
};
/** Perish.: its blows (as many as its move has, but the last), the last's, and how long that knocks the boss down. */
var PERISH = {
	blow: 3340,
	last: 8350,
	down: 3
};
/** Power of Galicta: his crit chance more (points), the penetration past which his blows go through all of the boss's defense, his attack's blow more and how long its curse lasts. */
var GALICTA_POWER = {
	crit: 200,
	whole: 1e3,
	blow: 4010,
	lasts: 6
};
/** His own perks' numbers: Determined Strike's Light and Dark, Indomitable Will's Light, Perish.'s Light, Power of Galicta's Light and Dark, and Transcend 5's Dark. */
var PERKS$1 = {
	alone: 2,
	stun: 1,
	critDamage: .5,
	mana: 100,
	exposed: .5,
	boss: 1e3,
	dark: {
		dmg: 1.12,
		taken: .95
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts): Determined Strike's cheaper and more of its blow against a
* boss; Indomitable Will's longer and his ATK meanwhile; Perish.'s shorter cooldown and its stun for each blow; and Power of
* Galicta's CC resist (points), and the penetration it would take off the boss (it has none).
*/
var UT$1 = {
	cloak: {
		cost: -1,
		boss: [
			.48,
			.58,
			.7,
			.84,
			1
		]
	},
	hatred: {
		longer: 5,
		atk: [
			.14,
			.17,
			.21,
			.25,
			.3
		]
	},
	mittens: {
		cooldown: [
			2.4,
			2.9,
			3.5,
			4.2,
			5
		],
		stun: 1
	},
	protection: {
		resist: [
			360,
			430,
			520,
			630,
			750
		],
		pen: 200
	}
};
var art$1 = skillArt("rebel-klaus");
var POWER_OF_GALICTA = {
	attack: 1,
	crit: share$2(GALICTA_POWER.crit),
	control: 1,
	shown: {
		name: "Power of Galicta",
		about: `Passive. +${GALICTA_POWER.crit} crit chance; with ${num(GALICTA_POWER.whole)} penetration or more, his blows go through all of the boss’s defense. A blow of his attack deals a blow more and leaves [Curse of Galicta] on the boss for ${GALICTA_POWER.lasts} seconds (not the blow more while it is on).`,
		icon: "🗡️",
		art: art$1(3)
	},
	words: `Rebel Klaus is not affected by Block stats, but his Crit Chance increases by ${GALICTA_POWER.crit}, and when his DEF Penetration reaches ${num(GALICTA_POWER.whole)} or above, all of his attacks ignore the target's DEF. Additionally, his normal attack deal additional ${dmg("warrior", GALICTA_POWER.blow, bookDmg("rebel-klaus", 3))} P.DMG to all enemies and inflict [Curse of Galicta] upon them for ${GALICTA_POWER.lasts} sec. If the target is already inflicted with [Curse of Galicta], the target won't take additional DMG.`
};
/** [Indomitable Will] on him; Galicta's DMG stacks on him. */
var WILLED = {
	name: "Indomitable Will",
	about: `ATK Spd +${WILL.speed}, and held down ${pct(WILL.held)} as long.`,
	icon: "🔥",
	art: art$1(1)
};
var GALICTA_STACKS = {
	name: "Adversary of the Goddess, Galicta",
	about: "DMG higher for each.",
	icon: "⚔️",
	art: { uw: "rebel-klaus" }
};
/** What his attack leaves on the boss. */
var CURSE = "Curse of Galicta";
var REBEL_KLAUS = {
	id: "rebel-klaus",
	name: "Rebel Klaus",
	class: "warrior",
	skins: ["Rebel Klaus"],
	stats: {
		...CLASS_STATS.warrior,
		deals: "physical"
	},
	abilities: [
		{
			name: "Determined Strike",
			about: `A blow that stuns the boss for ${DETERMINED.stun} seconds, and a blow more against a boss.`,
			words: `Deals ${dmg("warrior", DETERMINED.blow, bookDmg("rebel-klaus", 0))} P.DMG to frontal enemies within range and inflicts Stun for ${DETERMINED.stun} sec. If the target is a boss, deals additional ${dmg("warrior", DETERMINED.boss, bookDmg("rebel-klaus", 0))} P.DMG.`,
			icon: "⚔️",
			art: art$1(0),
			move: "determined",
			cooldown: 7,
			cost: 3
		},
		{
			name: "Indomitable Will",
			about: `A blow, and [Indomitable Will] for ${WILL.lasts} seconds: ATK Spd +${WILL.speed}, and what knocks him down holds him ${pct(WILL.held)} as long.`,
			words: `Deals ${dmg("warrior", WILL.blow, bookDmg("rebel-klaus", 1))} P.DMG to nearby enemies, entering into the irremoveable state [Indomitable Will] for ${WILL.lasts} sec. While in [Indomitable Will] state, ATK Spd is increased by ${WILL.speed} and the duration of CC inflicted upon self is reduced by ${pct(1 - WILL.held)}.`,
			icon: "🔥",
			art: art$1(1),
			move: "indomitable",
			cooldown: 18,
			cost: 2
		},
		{
			name: "Perish.",
			about: `Blows on the boss one after another, and a last that knocks it down for ${PERISH.down} seconds.`,
			words: `Attacks a random enemy 6 times, dealing ${dmg("warrior", PERISH.blow, bookDmg("rebel-klaus", 2))} P.DMG each hit. Afterward, delivers an additional attack that deals ${dmg("warrior", PERISH.last, bookDmg("rebel-klaus", 2))} P.DMG to nearby enemies and knocks them down for ${PERISH.down} sec.`,
			icon: "💀",
			art: art$1(2),
			move: "perish",
			cooldown: 20,
			cost: 4
		}
	],
	passive: POWER_OF_GALICTA,
	treasures: [
		treasure("Cloak of Despair", (k) => ({
			words: `[Determined Strike] Reduces Mana Cost by ${-UT$1.cloak.cost} and increases additional P.DMG by ${pct(k(UT$1.cloak.boss))} if the target is a boss.`,
			skill: {
				index: 0,
				cost: UT$1.cloak.cost
			}
		})),
		treasure("Irreversible Hatred", (k) => ({ words: `[Indomitable Will] Increases the duration of [Indomitable Will] by ${UT$1.hatred.longer} sec, and increases ATK by ${pct(k(UT$1.hatred.atk))} for the duration of Skill.` })),
		treasure("Old Mittens", (k) => ({
			words: `[Perish.] Reduces Cooldown by ${k(UT$1.mittens.cooldown)} sec, and each hit inflicts Stun on the target for ${UT$1.mittens.stun} sec.`,
			skill: {
				index: 2,
				cooldown: -k(UT$1.mittens.cooldown)
			}
		})),
		treasure("Everlasting Protection", (k) => ({
			words: `[Power of Galicta] Increases CC Resist by ${k(UT$1.protection.resist)}, and reduces the targets DEF Penetration by ${UT$1.protection.pen} for the duration of [Curse of Galicta].`,
			bonus: { resist: k(UT$1.protection.resist) }
		}))
	],
	attack: "rend",
	perks: {
		"s1-light": said({ skill: {
			index: 0,
			dmg: PERKS$1.alone
		} }, ({ skill }) => `Increases DMG by ${pct(skill.dmg - 1)} when there is one enemy.`),
		"s1-dark": { words: `Increases the duration of Stun by ${PERKS$1.stun} sec.` },
		"s2-light": { words: `Increases Crit DMG by ${pct(PERKS$1.critDamage)} while in [Indomitable Will] state.` },
		"s2-dark": { words: "Upon using the skill, dispels all negative effects from self." },
		"s3-light": { words: `Recovers own Mana by ${PERKS$1.mana} each hit.` },
		"s3-dark": { words: "Gains immunity to CC while in use." },
		"s4-light": { words: `Additionally reduces the target's P.DEF by ${pct(PERKS$1.exposed)} for the duration of [Curse of Galicta].` },
		"s4-dark": { words: `Deals additional P.DMG equal to ${pct(PERKS$1.boss / 1e3)} of ATK to Non-Hero enemies.` },
		"t5-light": t5Light({ crit: 100 }, ({ crit }) => `Crit Chance +${crit}`),
		"t5-dark": said({
			dmg: PERKS$1.dark.dmg,
			taken: PERKS$1.dark.taken
		}, ({ dmg, taken }) => `At the beginning of each battle, Rebel Klaus deals ${pct(dmg - 1)} increased DMG to Non-Hero enemies and takes ${pct(1 - taken)} reduced DMG. This effect can be stacked up to max 5 times and is irremovable.`)
	},
	join(fight, self) {
		/** How long [Indomitable Will] lasts yet; Galicta's DMG stacks, and how long they last yet. */
		let willed = 0;
		let stacks = 0;
		let stacksLeft = 0;
		const tier = self.unique?.tier ?? null;
		/** What his unique weapon adds to his penetration. */
		const uwPen = tier !== null ? atTier(GALICTA.pen, tier) : 0;
		/** A blow of his: through his unique weapon's penetration, and (with 1000 or more) through all of the boss's defense. */
		const strike = (amount, counted = true) => {
			const whole = self.stats.pen + uwPen + piercing(self.statuses) >= GALICTA_POWER.whole;
			return fight.hit(self, amount, counted, uwPen, whole);
		};
		/** [Indomitable Will] on him (its Light: his crit damage higher meanwhile). */
		const will = () => {
			const hatred = treasureTier(self, 1) > 0;
			willed = WILL.lasts + (hatred ? UT$1.hatred.longer : 0);
			put(self.statuses, {
				name: WILLED.name,
				left: willed,
				...self.perks.has("s2-light") && { critDamage: PERKS$1.critDamage },
				...hatred && { deals: 1 + fromTreasure(self, 1, UT$1.hatred.atk) },
				shown: WILLED
			});
		};
		/** His attack: a blow; unless the boss bears the curse, a blow more and the curse on it (its Light: its P.DEF lower meanwhile). Its Dark: a blow more against a Non-Hero. */
		const rend = () => {
			strike(fight.basic);
			if (!fight.foe.statuses.some((status) => status.name === CURSE)) {
				strike(GALICTA_POWER.blow, false);
				put(fight.foe.statuses, {
					name: CURSE,
					left: GALICTA_POWER.lasts,
					...self.perks.has("s4-light") && { defends: { physical: 1 - PERKS$1.exposed } },
					shown: "curse"
				});
			}
			if (self.perks.has("s4-dark")) strike(PERKS$1.boss, false);
		};
		return {
			lands: {
				rend,
				attack: rend,
				determined() {
					strike(DETERMINED.blow);
					strike(DETERMINED.boss * (1 + fromTreasure(self, 0, UT$1.cloak.boss)), false);
					fight.stun(DETERMINED.stun + (self.perks.has("s1-dark") ? PERKS$1.stun : 0), { by: self });
				},
				indomitable() {
					if (self.perks.has("s2-dark")) {
						const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
						self.statuses = self.statuses.filter((status) => !harmful(status));
					}
					strike(WILL.blow);
					will();
				},
				perish(part) {
					const last = part === (self.motion.moves.perish.parts[0]?.lands.length ?? 1) - 1;
					strike(last ? PERISH.last : PERISH.blow);
					if (treasureTier(self, 2) > 0) fight.stun(UT$1.mittens.stun, { by: self });
					if (last) fight.stun(PERISH.down, {
						down: true,
						by: self
					});
					else if (self.perks.has("s3-light")) self.mana = Math.min(MAX_MANA, self.mana + PERKS$1.mana);
				}
			},
			used() {
				if (tier === null) return;
				self.hp -= self.hp * GALICTA.hp;
				stacks = Math.min(GALICTA.most, stacks + 1);
				stacksLeft = GALICTA.lasts;
				put(self.statuses, {
					name: GALICTA_STACKS.name,
					left: GALICTA.lasts,
					count: stacks,
					deals: 1 + atTier(GALICTA.dmg, tier) * stacks,
					shown: GALICTA_STACKS
				});
			},
			tick(dt) {
				if (willed > 0) willed -= dt;
				if (stacksLeft > 0) {
					stacksLeft -= dt;
					if (stacksLeft <= 0) stacks = 0;
				}
			},
			speed: () => willed > 0 ? WILL.speed : 0,
			held: () => willed > 0 ? WILL.held : 1,
			guards: () => self.perks.has("s3-dark") && self.doing?.move === "perish",
			lit: () => willed > 0,
			buffs: () => tier !== null ? [GALICTA_UP] : []
		};
	}
};
//#endregion
//#region src/technomagic/sim/heroes/dark-lord-kasel.ts
/** Judgment Blade: its two blows, and in the [Dark Lord] state its blow more and how long that knocks the boss down. */
var JUDGE = {
	blow: 6010,
	lord: 8350,
	down: 3
};
/** Doom: its three blows, how long they knock the boss down, and in the [Dark Lord] state its blow more. */
var RUIN = {
	blow: 5010,
	down: 3,
	lord: 10020
};
/** Advent of the Dark Lord: its blow; the state's seconds, its attack's blow more, and the ATK (a share) and penetration (points) each stack spent gives. */
var ADVENT = {
	blow: 10020,
	lasts: 20,
	blowMore: 2e3,
	atk: .01,
	pen: 10
};
/** One Fallen to Darkness: his ATK more (a share), the stacks each skill needs, the most, and what each blow of his attack gives. */
var FALLEN = {
	atk: .25,
	needs: [
		5,
		15,
		25
	],
	most: 40,
	each: 1
};
/** His own perks' numbers: Judgment Blade's Light, Doom's Light, Advent's Dark, One Fallen to Darkness's Light and Dark, and Transcend 5's Dark. */
var PERKS = {
	judge: {
		needs: 10,
		dmg: 1.8
	},
	doom: {
		takes: 1.3,
		lasts: 10
	},
	attack: 1.5,
	start: 10,
	more: 2,
	dark: {
		atk: .01,
		dmg: .01,
		lasts: 20,
		most: 30
	}
};
/**
* His unique treasures' numbers (1★ to 5★: ../treasures.ts; King's Raid's own, its 3★ 34% among them): Judgment Blade's
* DMG; Doom's DMG; the [Dark Lord] state's more DMG to the boss and crit DMG; and One Fallen to Darkness's more [Dark
* Energy] at most, and the chance of a stack more for each blow of his attack.
*/
var UT = {
	authority: { dmg: [
		.24,
		.29,
		.34,
		.42,
		.5
	] },
	lifeforce: {
		dmg: [
			.24,
			.29,
			.35,
			.42,
			.5
		],
		pulled: 2
	},
	portrait: {
		dmg: [
			.14,
			.17,
			.21,
			.25,
			.3
		],
		critDamage: .8
	},
	tear: {
		most: [
			64,
			69,
			75,
			82,
			90
		],
		chance: .35
	}
};
var art = skillArt("dark-lord-kasel");
var ONE_FALLEN = {
	attack: 1 + FALLEN.atk,
	crit: 0,
	control: 1,
	shown: {
		name: "One Fallen to Darkness",
		about: `Passive. No mana: each skill needs stacks of [Dark Energy] instead (up to ${FALLEN.most}), which each blow of his attack gives him. ATK +${pct(FALLEN.atk)}.`,
		icon: "🌑",
		art: art(3)
	},
	words: `Although Dark Lord Kasel cannot recover Mana since he is granted the power of Darkness, his ATK increases, deals attacks that always hit, and requires [Dark Energy] stacks to use Skills. Normal attacks grant [Dark Energy] stacks. [Dark Energy] can be stacked up to max ${FALLEN.most} times and is irremovable.`
};
/** His [Dark Energy]; the [Dark Lord] state; Transcend 5's Dark's stacks. */
var ENERGY = {
	name: "Dark Energy",
	about: "What his skills need.",
	icon: "🌑",
	art: art(3)
};
var LORD = {
	name: "Dark Lord",
	about: "ATK and penetration higher, skills enhanced, immune to CC, and his attack deals more.",
	icon: "😈",
	art: art(2)
};
var DARKENED = {
	name: "Darkness",
	about: "ATK and DMG on the boss higher for each.",
	icon: "🖤",
	art: art(3)
};
//#endregion
//#region src/technomagic/sim/heroes/index.ts
/** The heroes there are, in the order of their cards. */
var HEROES = [
	KIRZE,
	KLAUS,
	FALLEN_FREY,
	GREMORY,
	ANNETTE,
	MORRAH,
	LAIAS,
	SERIA,
	EZEKIEL,
	LORRAINE,
	VALANCE,
	LUCIKIEL,
	SELENE,
	CROW,
	ODDY,
	PHILLOP,
	NAILA,
	YANNE,
	NERAXIS,
	ERZE,
	LOMAN,
	GAU,
	TANYA,
	REBEL_KLAUS,
	{
		id: "dark-lord-kasel",
		name: "Dark Lord Kasel",
		class: "warrior",
		skins: ["Dark Lord Kasel"],
		stats: {
			...CLASS_STATS.warrior,
			deals: "physical"
		},
		abilities: [
			{
				name: "Judgment Blade",
				about: `Two blows. [Dark Lord]: a blow more that knocks the boss down for ${JUDGE.down} seconds. Needs ${FALLEN.needs[0]} [Dark Energy].`,
				words: `Attacks frontal enemies in a straight line 2 times, dealing ${dmg("warrior", JUDGE.blow, bookDmg("dark-lord-kasel", 0))} P.DMG each and preventing enemies from recovering Mana for 2 seconds. [Dark Lord] Additionally attacks enemies in a wide range 1 time, dealing ${dmg("warrior", JUDGE.lord, bookDmg("dark-lord-kasel", 0))} P.DMG and knocking them down for ${JUDGE.down} seconds. Requires ${FALLEN.needs[0]} or more stacks of [Dark Energy] for use.`,
				tag: `${FALLEN.needs[0]} Dark Energy`,
				icon: "⚔️",
				art: art(0),
				move: "judge",
				cooldown: 11,
				cost: 0
			},
			{
				name: "Doom",
				about: `Three blows that knock the boss down for ${RUIN.down} seconds. [Dark Lord]: a blow more. Needs ${FALLEN.needs[1]} [Dark Energy].`,
				words: `Explodes darkness and attacks frontal enemies in a straight line 3 times, dealing ${dmg("warrior", RUIN.blow, bookDmg("dark-lord-kasel", 1))} P.DMG each and knocking them away for ${RUIN.down} seconds. [Dark Lord] Deals ${dmg("warrior", RUIN.lord, bookDmg("dark-lord-kasel", 1))} P.DMG to 1 enemy furthest away and pulls them in front of self, exploding darkness afterward. Can be used with ${FALLEN.needs[1]} or more stacks of [Dark Energy].`,
				tag: `${FALLEN.needs[1]} Dark Energy`,
				icon: "💥",
				art: art(1),
				move: "ruin",
				cooldown: 15,
				cost: 0
			},
			{
				name: "Advent of the Dark Lord",
				about: `What the boss has left on him cleared, a blow, and [Dark Lord] for ${ADVENT.lasts} seconds: all his [Dark Energy] spent, each +${pct(ADVENT.atk)} ATK and +${ADVENT.pen} penetration; his skills enhanced, immune to CC, and his attack deals more. Needs ${FALLEN.needs[2]} [Dark Energy].`,
				words: `Dispels negative effects from self and enters into an irremovable [Dark Lord] state for ${ADVENT.lasts} sec, dealing ${dmg("warrior", ADVENT.blow, bookDmg("dark-lord-kasel", 2))} P.DMG to nearby enemies in a circular range of self. During [Dark Lord] state, all Skills are enhanced, gains immunity to CC, and normal attacks deal additional ${dmg("warrior", ADVENT.blowMore, bookDmg("dark-lord-kasel", 2))} P.DMG each hit. Requires ${FALLEN.needs[2]} or more stacks of [Dark Energy] for use. Upon use, consumes all stacks to increase own ATK, and DEF Penetration by ${ADVENT.pen} per stack.`,
				tag: `${FALLEN.needs[2]} Dark Energy`,
				icon: "😈",
				art: art(2),
				move: "advent",
				cooldown: 25,
				cost: 0
			}
		],
		passive: ONE_FALLEN,
		treasures: [
			treasure("Authority of Corruption", (k) => ({
				words: `[Judgment Blade] Increases DMG by ${pct(k(UT.authority.dmg))} and dispels positive effects from the target.`,
				skill: {
					index: 0,
					dmg: 1 + k(UT.authority.dmg),
					dispel: true
				}
			})),
			treasure("Faint Lifeforce", (k) => ({
				words: `[Doom] Increases DMG by ${pct(k(UT.lifeforce.dmg))} and changes the number of pulled enemies to ${UT.lifeforce.pulled} during [Dark Lord] state.`,
				skill: {
					index: 1,
					dmg: 1 + k(UT.lifeforce.dmg)
				}
			})),
			treasure("Traveler’s Portrait", (k) => ({ words: `[Advent of the Dark Lord] Increases DMG dealt to Non-Hero enemies by ${pct(k(UT.portrait.dmg))} and Crit DMG by ${pct(UT.portrait.critDamage)} during [Dark Lord] state.` })),
			treasure("Twisted Tear", (k) => ({ words: `[One Fallen to Darkness] Changes the max number of stacks to ${k(UT.tear.most)}, and normal attacks have a ${pct(UT.tear.chance)} chance of stacking 1 additional stack of [Dark Energy].` }))
		],
		attack: "corrupt",
		perks: {
			"s1-light": said({ skill: {
				index: 0,
				dmg: PERKS.judge.dmg
			} }, ({ skill }) => `Increases number of Dark Energy stacks required for use by ${PERKS.judge.needs} and increases DMG by ${pct(skill.dmg - 1)}.`),
			"s1-dark": { words: "Increases the duration of disabling Mana recovery by 2 sec." },
			"s2-light": said({ skill: {
				index: 1,
				mark: {
					name: "Doom",
					takes: { physical: PERKS.doom.takes },
					lasts: PERKS.doom.lasts
				}
			} }, ({ skill }) => `Increases P.DMG the hit targets take by ${pct(PERKS.doom.takes - 1)} for ${skill.mark.lasts} sec.`),
			"s2-dark": { words: "Inflicts Stun on enemies instead of knocking them away." },
			"s3-light": { words: "Increases P.Block Chance by 400 for the duration of Skill." },
			"s3-dark": { words: `Increases DMG of normal attacks by ${pct(PERKS.attack - 1)} for the duration of Skill.` },
			"s4-light": { words: `At the beginning of each battle, gains ${PERKS.start} stacks of [Dark Energy].` },
			"s4-dark": { words: `When there is 1 enemy, gains ${PERKS.more} additional stacks of [Dark Energy].` },
			"t5-light": t5Light({ critDamage: .2 }, ({ critDamage }) => `Crit DMG +${pct(critDamage)}`),
			"t5-dark": { words: `Normal attacks increase own ATK by ${pct(PERKS.dark.atk)} and DMG dealt to bosses by ${pct(PERKS.dark.dmg)} for ${PERKS.dark.lasts} sec. This effect can be stacked up to max ${PERKS.dark.most} times and is irremovable.` }
		},
		join(fight, self) {
			/** His [Dark Energy]; how long the [Dark Lord] state lasts yet, and the stacks it spent; Transcend 5's Dark's stacks, and how long they last yet; the boss's healing lowered by his unique weapon. */
			let energy = self.perks.has("s4-light") ? PERKS.start : 0;
			let lord = 0;
			let spent = 0;
			let dark = 0;
			let darkLeft = 0;
			let unhealed = 0;
			const tier = self.unique?.tier ?? null;
			const most = fromTreasure(self, 3, UT.tear.most, FALLEN.most);
			const needs = (index) => (FALLEN.needs[index] ?? 0) + (index === 0 && self.perks.has("s1-light") ? PERKS.judge.needs : 0);
			/** His [Dark Energy] on his card (it can't be dispelled). */
			const shown = () => put(self.statuses, {
				name: ENERGY.name,
				left: Infinity,
				count: energy,
				shown: ENERGY
			});
			shown();
			/** A blow of his: in the [Dark Lord] state, through the penetration its stacks gave; with his unique weapon, the boss healed less for a while, and now and then a blow more. */
			const strike = (amount) => {
				fight.hit(self, amount, true, lord > 0 ? ADVENT.pen * spent : 0);
				if (tier === null) return;
				unhealed = Math.min(AEA.most, unhealed + 1);
				put(fight.foe.statuses, {
					name: AEA.name,
					left: AEA.lasts,
					count: unhealed,
					heals: 1 - atTier(AEA.heals, tier) * unhealed,
					shown: "curse"
				});
				if (fight.roll() < AEA.chance) fight.hit(self, atTier(AEA.blow, tier), false);
			};
			return {
				lands: {
					corrupt() {
						const harder = lord > 0 && self.perks.has("s3-dark") ? PERKS.attack : 1;
						strike(fight.basic * harder);
						if (lord > 0) strike(ADVENT.blowMore * harder);
						const tear = treasureTier(self, 3) > 0 && fight.roll() < UT.tear.chance ? 1 : 0;
						energy = Math.min(most, energy + FALLEN.each + (self.perks.has("s4-dark") ? PERKS.more : 0) + tear);
						shown();
						if (self.perks.has("t5-dark")) {
							dark = Math.min(PERKS.dark.most, dark + 1);
							darkLeft = PERKS.dark.lasts;
							put(self.statuses, {
								name: DARKENED.name,
								left: PERKS.dark.lasts,
								count: dark,
								deals: (1 + PERKS.dark.atk * dark) * (1 + PERKS.dark.dmg * dark),
								shown: DARKENED
							});
						}
					},
					judge(part) {
						if (part < 2) strike(JUDGE.blow);
						else if (lord > 0) {
							strike(JUDGE.lord);
							fight.stun(JUDGE.down, {
								down: true,
								by: self
							});
						}
					},
					ruin(part) {
						if (part < 3) {
							strike(RUIN.blow);
							if (part === 0) fight.stun(RUIN.down, {
								down: !self.perks.has("s2-dark"),
								by: self
							});
						} else if (lord > 0) strike(RUIN.lord);
					},
					advent: () => strike(ADVENT.blow)
				},
				slot: (index) => energy >= needs(index) ? self.abilities[index] ?? null : null,
				used(index, _ability) {
					if (index !== 2) return;
					const harmful = (status) => status.shown.harmful === true && !status.binds && !status.away;
					self.statuses = self.statuses.filter((status) => !harmful(status));
					spent = energy;
					energy = 0;
					shown();
					lord = ADVENT.lasts;
					const portrait = treasureTier(self, 2) > 0;
					put(self.statuses, {
						name: LORD.name,
						left: ADVENT.lasts,
						deals: (1 + ADVENT.atk * spent) * (1 + fromTreasure(self, 2, UT.portrait.dmg)),
						...portrait && { critDamage: UT.portrait.critDamage },
						shown: LORD
					});
				},
				tick(dt) {
					self.mana = 0;
					if (lord > 0) lord -= dt;
					if (darkLeft > 0) {
						darkLeft -= dt;
						if (darkLeft <= 0) dark = 0;
					}
					if (!fight.foe.statuses.some((status) => status.name === AEA.name)) unhealed = 0;
				},
				guards: () => lord > 0,
				lit: () => lord > 0,
				buffs: () => tier !== null ? [AEA_UP] : []
			};
		}
	}
];
//#endregion
//#region src/technomagic/sim/bot.ts
/** The sim's version: a hash of it (./version.ts), so any change to it is another (a page whose sim isn't the bot's is told to reload). */
var SIM_VERSION = "0c8107595988";
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
var STEP_SECONDS = TICK;
var MOST_TICKS = Math.ceil(232 / TICK) + 1;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
var MOST_INPUTS = 2e4;
/** The most stages any boss has (each boss's own: BossInfo.stages). */
var MOST_STAGE = Math.max(...BOSSES.map(stagesOf));
/**
* What a hero's unique treasure (its `skill`th: 1 to 4, UT1 to UT4) does at a tier (1 to 5) as its main treasure, as the
* bot says it: its name, and King's Raid's words with the fight's numbers (null: no such hero or treasure).
*/
var uniqueTreasureText = (hero, skill, tier) => treasureAbout(HEROES.find((one) => one.id === hero), skill, tier);
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
/**
* What a hero's perks (the bot's ids) give its own stats, as gear's bonus has them (shares of ATK, max HP and crit DMG;
* chances and the like in points, 10 to 1%), and Offensive Guard's ATK from its physical defense (a share of it): for
* its Perk Effects on the heroes page. Null: no such hero.
*/
function tmPerkStats(hero, perks) {
	const def = HEROES.find((one) => one.id === hero);
	return def ? perkStats(perksOf(perks, def).values()) : null;
}
/** The heroes there are, in the order of their cards; and the bosses, by id. */
var TM_HEROES = HEROES.map((hero) => ({
	id: hero.id,
	name: hero.name,
	class: hero.class,
	skins: hero.skins.length,
	skills: [...hero.abilities.map(({ name, cost, cooldown, tag, words, about }) => ({
		name,
		cost,
		cooldown,
		tag: tag ?? null,
		text: words ?? about ?? ""
	})), ...hero.passive ? [{
		name: hero.passive.shown.name,
		cost: null,
		cooldown: null,
		tag: hero.passive.tag ?? null,
		text: hero.passive.words ?? hero.passive.shown.about ?? ""
	}] : []],
	treasures: (hero.treasures ?? []).map((one) => one.name)
}));
var BOSS_IDS = BOSSES.map((boss) => boss.id);
/** The TechnoMagic Raid's bosses, and the Dragon Raid's dragons, in order. */
var TM_BOSS_INFO = TM_BOSSES.map((boss) => ({
	id: boss.id,
	name: boss.name,
	stages: stagesOf(boss)
}));
var DRAGON_INFO = DRAGONS.map((boss) => ({
	id: boss.id,
	name: boss.name,
	stages: stagesOf(boss)
}));
var TM_SET_INFO = SET_INFO;
/** How many of a TechnoMagic set's pieces a hero wears for its effect. */
var TM_SET_PIECES = 4;
var KR_PIECES = KR_PIECES$1;
var KR_POOLS = KR_POOLS$1;
/** A main stat's base, times its refinement's factor (R1 to R5: thousandths, at max level) for its kind of stat. */
var KR_REFINE = KR_REFINE$1;
var KR_SETS = KR_SETS$1;
var KR_RUNES = KR_RUNES$1;
/** The TechnoMagic gear's unique options (King's Raid's 47), by number: the additional skill each is (null: none), and King's Raid's words and numbers. */
var KR_UNIQUE = KR_UNIQUE$1;
var TM_ARTIFACTS = KR_ARTIFACTS.filter((one) => one.id in ARTIFACTS).map(({ id, code, name, icon, text }) => ({
	id,
	code,
	name,
	icon,
	text: (text ?? []).map((line) => line ?? "")
}));
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
	if (!whole(run.stage - 1, stagesOf(boss))) return "stage";
	if (run.heroes.length === 0 || run.heroes.length > 9) return "heroes";
	const entries = [];
	for (const hero of run.heroes) {
		const def = HEROES.find((one) => one.id === hero.id);
		if (!def || !whole(hero.skin, def.skins.length)) return "hero";
		const gear = {};
		for (const [stat, n] of Object.entries(hero.gear)) if (Number.isFinite(n)) gear[stat] = n;
		const skills = Array.isArray(hero.skills) ? hero.skills.filter((id) => typeof id === "string") : [];
		const perks = Array.isArray(hero.perks) ? hero.perks.filter((id) => typeof id === "string") : [];
		const ut = hero.ut && typeof hero.ut.skill === "number" && typeof hero.ut.tier === "number" ? {
			skill: hero.ut.skill,
			tier: hero.ut.tier
		} : null;
		const artifact = hero.artifact && typeof hero.artifact.id === "string" && typeof hero.artifact.tier === "number" ? {
			id: hero.artifact.id,
			tier: hero.artifact.tier
		} : null;
		entries.push({
			def,
			skin: hero.skin,
			gear,
			set: typeof hero.set === "string" ? hero.set : null,
			uw: typeof hero.uw === "number" ? hero.uw : null,
			skills,
			sub: run.solo === true && hero.sub === true,
			perks,
			ut,
			artifact
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
export { BOSS_IDS, DRAGON_INFO, KR_PIECES, KR_POOLS, KR_REFINE, KR_RUNES, KR_SETS, KR_UNIQUE, MOST_INPUTS, MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_ARTIFACTS, TM_BOSS_INFO, TM_HEROES, TM_SET_INFO, TM_SET_PIECES, TM_SKILLS, UNIQUE_WEAPON_HEROES, readInputs, replay, startRaid, tmPerkStats, uniqueTreasureText, uniqueWeaponText };
