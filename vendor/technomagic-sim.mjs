// Built from Koma-UI's src/technomagic/sim/ by scripts/build-sim.mjs: don't edit it here.
//#region src/technomagic/assets/bosses/galgoria.ts
/** Galgoria: one mesh on one skeleton (the game's files spell it Gargoria). */
var GALGORIA_ASSETS = {
	name: "Galgoria",
	folder: "bosses/galgoria",
	models: ["Raid_Gargoria_Mesh"]
};
//#endregion
//#region src/technomagic/assets/heroes/annette.ts
/**
* Rascal, her golem, hovering beside her left shoulder and a little behind it: on the boss's side of her as the
* field shows her, so her attack's beam (out of it: ../../heroes/annette/fx.ts) goes clear of her. The same for both her skins.
*/
var RASCAL$1 = {
	at: [
		.6,
		1.15,
		-.2
	],
	size: 1
};
/**
* Annette as Mixamo rigged her, read for her idle alone: she stands in it, and runs in and does the rest as
* ../../heroes/annette/moves.ts has it. The same for both her skins (one skeleton).
*/
var MOVED_BY = {
	kind: "rigged",
	folder: "Annette_Mixamo",
	idle: "Annette - Idle.fbx"
};
var ANNETTE_ASSETS = {
	name: "Annette",
	folder: "heroes/annette",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/33/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Annette",
		portrait: {
			file: "Annette.png",
			crop: {
				x: 417,
				y: 420,
				size: 140
			},
			head: {
				x: 428,
				y: 458,
				size: 110
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Annette_Vari05_Body", "Hero_Annette_Vari05_Hair"],
			floating: {
				model: "Hero_Annette_Vari05_Weapon",
				...RASCAL$1
			},
			movedBy: MOVED_BY
		}
	}, {
		name: "Annette_Halloween",
		model: {
			kind: "parts",
			parts: ["Hero_Annette_Cos17Halloween_Body", "Hero_Annette_Cos17Halloween_Hair"],
			floating: {
				model: "Hero_Annette_Cos17Halloween_Weapon",
				...RASCAL$1
			},
			movedBy: MOVED_BY
		}
	}]
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
//#region src/technomagic/assets/heroes/ezekiel.ts
var DRIVE = "https://drive.google.com/uc?export=download&id=";
var EZEKIEL_ASSETS = {
	name: "Ezekiel",
	folder: "heroes/ezekiel",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/37/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Ezekiel",
		portrait: {
			file: "Ezekiel.png",
			from: `${DRIVE}1YnvFZjPQRrM40MH0gZrBU_lYrFu6t1pR`,
			crop: {
				x: 320,
				y: 200,
				size: 190
			},
			head: {
				x: 350,
				y: 240,
				size: 120
			}
		},
		model: {
			kind: "parts",
			parts: [
				"Hero_Ezekiel_Vari05_Mesh",
				"Hero_Ezekiel_Vari05_Weapon",
				"Hero_Ezekiel_Vari05_Arm"
			]
		}
	}, {
		name: "Ezekiel_Halloween",
		portrait: {
			file: "Ezekiel_Halloween.png",
			from: `${DRIVE}1b1DtYAIpUJij08QrDdNpi_tZIPRHyq79`,
			crop: {
				x: 510,
				y: 50,
				size: 180
			},
			head: {
				x: 545,
				y: 90,
				size: 110
			}
		},
		model: {
			kind: "parts",
			parts: [
				"Hero_Ezekiel_Cos18Halloween_Mesh",
				"Hero_Ezekiel_Cos18Halloween_Weapon",
				"Hero_Ezekiel_Cos18Halloween_Arm"
			]
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
				idle: "Standing Torch Idle 01.fbx",
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
//#region src/technomagic/assets/heroes/gremory.ts
/**
* Her cube, floating under her, big enough to lie on: she lies on her side along its top, her head at its back and
* her right knee over its front edge (its top just under her as she lies: her moves, ../../heroes/gremory/moves.ts,
* keep her there). The same for both her skins.
*/
var CUBE = {
	at: [
		0,
		.52,
		-.1
	],
	size: 1.1
};
var GREMORY_ASSETS = {
	name: "Gremory",
	folder: "heroes/gremory",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/94/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Gremory",
		portrait: {
			file: "Gremory.png",
			crop: {
				x: 315,
				y: 132,
				size: 80
			},
			head: {
				x: 327,
				y: 142,
				size: 56
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Gremory_Vari05_Normal", "Hero_Gremory_Vari05_Hair"],
			repaint: {
				from: "Hero_Gremory_Vari05_Normal",
				to: "Hero_Gremory_Vari05_Hood"
			},
			floating: {
				model: "Hero_Gremory_Vari05_Weapon",
				...CUBE
			}
		}
	}, {
		name: "Gremory_DailyLook",
		model: {
			kind: "parts",
			parts: ["Hero_Gremory_Cos21DailyLook_Body"],
			floating: {
				model: "Hero_Gremory_Cos21DailyLook_Weapon",
				...CUBE
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
//#endregion
//#region src/technomagic/assets/heroes/laias.ts
var LAIAS_ASSETS = {
	name: "Laias",
	folder: "heroes/laias",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/29/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Laias",
		portrait: {
			file: "Laias.png",
			from: "https://drive.google.com/uc?export=download&id=1OY08dVdhjOslRqDW75djPgT0J3PrpBsl",
			crop: {
				x: 375,
				y: 185,
				size: 210
			},
			head: {
				x: 418,
				y: 250,
				size: 130
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Ell_Vari05_Body", "Hero_Ell_Vari05_Hair"],
			right: "Hero_Ell_Vari05_Weapon"
		}
	}, {
		name: "Laias_Dessert",
		model: {
			kind: "parts",
			parts: ["Hero_Ell_Cos20Dessert_Body", "Hero_Ell_Cos20Dessert_Hair"],
			right: "Hero_Ell_Cos20Dessert_Weapon"
		}
	}]
};
//#endregion
//#region src/technomagic/assets/heroes/morrah.ts
var MORRAH_ASSETS = {
	name: "Morrah",
	folder: "heroes/morrah",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/22/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Morrah",
		portrait: {
			file: "Morrah.png",
			crop: {
				x: 450,
				y: 62,
				size: 170
			},
			head: {
				x: 472,
				y: 98,
				size: 104
			}
		},
		model: {
			kind: "parts",
			parts: ["Hero_Morrah_Vari05_Body", "Hero_Morrah_Vari05_Hair"],
			left: "Hero_Morrah_Vari05_Shield",
			right: "Hero_Morrah_Vari05_Sword",
			blade: "y"
		}
	}, {
		name: "Morrah_Halloween",
		model: {
			kind: "parts",
			parts: ["Hero_Morrah_Cos19Halloween_Body", "Hero_Morrah_Cos19Halloween_Hair"],
			left: "Hero_Morrah_Cos19Halloween_Shield",
			right: "Hero_Morrah_Cos19Halloween_Sword",
			blade: "y"
		}
	}]
};
//#endregion
//#region src/technomagic/assets/heroes/seria.ts
var SERIA_ASSETS = {
	name: "Seria",
	folder: "heroes/seria",
	skills: {
		from: "https://kingsraid.shodyra.com/static/images/52/",
		files: [
			"s1.png",
			"s2.png",
			"s3.png",
			"s4.png"
		]
	},
	skins: [{
		name: "Seria",
		model: {
			kind: "parts",
			parts: ["Hero_Seria_Vari05_Body", "Hero_Seria_Hair_01"],
			left: "Hero_Seria_Vari05_WeaponB",
			right: "Hero_Seria_Vari05_WeaponA",
			offHand: "held",
			blade: "y"
		}
	}, {
		name: "Seria_Christmas",
		model: {
			kind: "parts",
			parts: ["Hero_Seria_Cos19Christmas_Body", "Hero_Seria_Cos19Christmas_Hair"],
			left: "Hero_Seria_Cos19Christmas_Weapon_B",
			right: "Hero_Seria_Cos19Christmas_Weapon_A",
			offHand: "held",
			blade: "y"
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
/** An attack: its track, when in it its venom sprays and lands (`hit`), and what that takes of whoever it lands on, least to most, before their defense. */
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
		hurts: [3e4, 45e3]
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
		hurts: [2e4, 3e4]
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
/** What these take off how likely the blows on a bearer are to be critical (points). */
function critResisting(on) {
	let more = 0;
	for (const { critResist } of on) more += critResist ?? 0;
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
		dodge: NONE,
		crit: 100,
		resist: 150
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
/** A tier's number from a weapon's list (1 to TIERS; out of range: the nearest). */
var atTier = (list, tier) => list[Math.min(list.length, Math.max(1, Math.floor(tier))) - 1];
var pct = (share) => `${Math.round(share * 100)}%`;
/** To a tenth of a percent (4.8%). */
var fine = (share) => `${Math.round(share * 1e3) / 10}%`;
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
	ezekiel: (tier) => `His Fury lasts ${atTier(BARBATOS.longer, tier)} seconds longer, and while it does his crit damage is ${pct(atTier(BARBATOS.critDamage, tier))} higher and his CC resist +${atTier(BARBATOS.resist, tier)}.`
};
EXIAN.name, ELICIPIRA.name, ROSMERTA.name, PIGRITIA.name, RASCAL.name, CARPRAIN.name, ELTOIRRE.name, ELSION.name, BARBATOS.name;
/** Each weapon's picture: its item's (the bot's catalog id, public/gear/items/weapons/). */
var PICTURES = {
	clause: "/gear/items/weapons/the-guardian-exian.png",
	kirze: "/gear/items/weapons/judgment-edge-elicipira.png",
	"fallen-frey": "/gear/items/weapons/angels-despair-rosmerta.png",
	gremory: "/gear/items/weapons/gateway-to-purgatory-pigritia.png",
	annette: "/gear/items/weapons/crystallized-technomagic-rascal.png",
	morrah: "/gear/items/weapons/flame-of-victory-carprain.png",
	laias: "/gear/items/weapons/flowing-circle-eltoirre.png",
	seria: "/gear/items/weapons/executioner-of-domains-elsion.png",
	ezekiel: "/gear/items/weapons/jailer-of-despair-barbatos.png"
};
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
	image: PICTURES.clause
};
var ROSMERTA_UP = {
	name: "Angel’s Despair, Rosmerta",
	about: "Sees past more of the boss’s defense.",
	icon: "🖤",
	image: PICTURES["fallen-frey"]
};
var RASCAL_UP = {
	name: "Crystallized Technomagic, Rascal",
	about: "Deals more to the boss and takes less from it while Annette is Overcharged.",
	icon: "🤖",
	image: PICTURES.annette
};
var ELTOIRRE_UP = {
	name: "Flowing Circle, Eltoirre",
	about: "Healing reaches it the more while Laias is on the field.",
	icon: "☥",
	image: PICTURES.laias
};
var ELSION_UP = {
	name: "Executioner of Domains, Elsion",
	about: "Healing reaches her the more.",
	icon: "⚔️",
	image: PICTURES.seria
};
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
	roll: 0,
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
	rock: 0,
	spread: 0,
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
//#region src/technomagic/heroes/annette/moves.ts
/** How she stands: upright and bright, her weight on both feet, her left hand on her hip, her right loose at her side. */
var STAND$5 = {
	...REST,
	hipX: 0,
	hipY: -.01,
	hipTurn: -.08,
	lean: 0,
	tilt: .03,
	nod: .02,
	lfX: .05,
	lfZ: .06,
	rfX: -.04,
	rfZ: -.03,
	lhX: .22,
	lhY: .02,
	lhZ: -.02,
	rhX: -.21,
	rhY: -.1,
	rhZ: .05,
	bTurn: 0,
	bUp: -1.3
};
/** A pose of hers, for a track: what is added to how she stands. */
var as$5 = (pose) => at(pose, STAND$5);
/** Her right arm thrust out at the boss, her hand pointing at it (Rascal fires where she points). */
var POINT = {
	rhX: -.12,
	rhY: .36,
	rhZ: .46,
	bTurn: 0,
	bUp: .05
};
var ZAP$1 = {
	keys: [
		[0, {}],
		[.2, as$5({
			twist: .25,
			lean: -.04,
			rhX: -.2,
			rhY: .3,
			rhZ: .05,
			bUp: 1
		})],
		[.42, as$5({
			...LOW,
			twist: -.3,
			lean: .12,
			...POINT
		})],
		[.6, as$5({
			...LOW,
			hipY: -.11,
			twist: -.32,
			lean: .1,
			...POINT,
			rhY: .35
		})],
		[1, {}]
	],
	lands: [.45]
};
var AIMED$1 = {
	lhX: .06,
	lhY: .32,
	lhZ: .46,
	rhX: -.1,
	rhY: .34,
	rhZ: .47,
	bTurn: 0,
	bUp: .05
};
var RAY$1 = {
	keys: [
		[0, {}],
		[.3, as$5({
			...COILED,
			twist: .35,
			lean: .05,
			lhX: -.02,
			lhY: .12,
			lhZ: .08,
			rhX: -.24,
			rhY: .14,
			rhZ: -.04,
			bUp: .6
		})],
		[.7, as$5({
			...LOW,
			twist: -.2,
			lean: .18,
			nod: .05,
			...AIMED$1
		})],
		[1.1, as$5({
			...LOW,
			hipY: -.12,
			twist: -.22,
			lean: .16,
			nod: .06,
			...AIMED$1,
			lhY: .33,
			rhY: .35
		})],
		[1.5, {}]
	],
	lands: [.75]
};
var TREATMENT$1 = {
	keys: [
		[0, {}],
		[.25, as$5({
			...COILED,
			lean: .12,
			nod: .12,
			lhX: .06,
			lhY: .32,
			lhZ: .2,
			rhX: -.06,
			rhY: .32,
			rhZ: .2,
			bUp: 1.2
		})],
		[.55, as$5({
			...TALL,
			jump: .12,
			lean: -.12,
			nod: -.2,
			lhX: .42,
			lhY: .72,
			lhZ: .08,
			rhX: -.42,
			rhY: .72,
			rhZ: .08,
			bTurn: -.6,
			bUp: 1.2
		})],
		[.95, as$5({
			...TALL,
			jump: .14,
			lean: -.14,
			nod: -.22,
			lhX: .43,
			lhY: .74,
			lhZ: .08,
			rhX: -.43,
			rhY: .74,
			rhZ: .08,
			bTurn: -.6,
			bUp: 1.25
		})],
		[1.4, {}]
	],
	lands: [.6]
};
var ELIMINATION$1 = {
	keys: [
		[0, {}],
		[.35, as$5({
			...COILED,
			twist: .35,
			lean: -.06,
			nod: -.1,
			lhX: .2,
			lhY: .12,
			lhZ: .18,
			rhX: -.18,
			rhY: .78,
			rhZ: -.06,
			bUp: 1.5
		})],
		[.65, as$5({
			...TALL,
			jump: .35,
			twist: .2,
			lean: -.1,
			nod: -.15,
			lhX: .3,
			lhY: .3,
			lhZ: .1,
			rhX: -.16,
			rhY: .82,
			rhZ: .08,
			bUp: 1.4
		})],
		[.95, as$5({
			...LOW,
			twist: -.35,
			lean: .2,
			nod: .05,
			lhX: .24,
			lhY: .1,
			lhZ: -.1,
			...POINT
		})],
		[1.35, as$5({
			...LOW,
			hipY: -.12,
			twist: -.36,
			lean: .18,
			nod: .06,
			lhX: .24,
			lhY: .1,
			lhZ: -.1,
			...POINT
		})],
		[1.8, {}]
	],
	lands: [1]
};
//#endregion
//#region src/technomagic/heroes/annette/index.ts
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
var art$8 = (index) => skillPicture(ANNETTE_ASSETS, index);
var CHARGING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Charge",
		about: "Passive. A Charge every half second, and 10 for each crystal of mana she spends; at 100 she is Overcharged for 15 seconds (ATK higher, and each attack takes 10% off her skills’ cooldowns).",
		icon: "⚡",
		image: art$8(3)
	}
};
/** Her Charge: shown beside her passive, with how many she has. */
var CHARGED$1 = {
	name: "Charge",
	about: "At 100 she is Overcharged.",
	icon: "⚡"
};
/** Overcharged: shown on her card, with how long it has left. */
var OVERCHARGED = {
	name: "Overcharge",
	about: "30% higher ATK; each attack takes 10% off her skills’ cooldowns; her skills do more.",
	icon: "🔋",
	image: art$8(3)
};
/** What Emergency Treatment gives each ally: shown on its card, with how long it has left. */
var TREATED = {
	name: "Emergency Treatment",
	about: "Healed over time, and knocked down for less long.",
	icon: "🩹",
	image: art$8(1)
};
var TREATED_OVER = {
	name: "Emergency Treatment",
	about: "Healed over time; more likely to land a critical blow, deals 10% more, and can’t be knocked down.",
	icon: "🩹",
	image: art$8(1)
};
/** What Blasting Ray and Process of Elimination leave on the boss. */
var RAYED = "Blasting Ray";
var ELIMINATED = "Process of Elimination";
var ANNETTE = {
	id: "annette",
	name: "Annette",
	class: "mechanic",
	assets: ANNETTE_ASSETS,
	stats: {
		...CLASS_STATS.mechanic,
		deals: "magical"
	},
	abilities: [
		{
			name: "Blasting Ray",
			icon: "🔆",
			image: art$8(0),
			move: "ray",
			cooldown: 11,
			cost: 2
		},
		{
			name: "Emergency Treatment",
			icon: "🩹",
			image: art$8(1),
			move: "treatment",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Process of Elimination",
			icon: "💣",
			image: art$8(2),
			move: "elimination",
			cooldown: 25,
			cost: 3
		}
	],
	passive: CHARGING,
	attack: "zap",
	stands: STAND$5,
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
//#region src/technomagic/heroes/ezekiel/moves.ts
/** How he stands: low and loose, his weight back, his demon arm hanging heavy at his right side with its claws pointing down, his left hand at his hip. */
var STAND$4 = {
	...REST,
	hipX: -.03,
	hipY: -.04,
	hipTurn: -.15,
	lean: .08,
	tilt: .04,
	nod: .04,
	lfX: .07,
	lfZ: .08,
	rfX: -.03,
	rfZ: -.05,
	lhX: .2,
	lhY: -.04,
	lhZ: -.04,
	rhX: -.25,
	rhY: -.12,
	rhZ: .08,
	bTurn: 0,
	bUp: -1.2
};
/** A pose of his, for a track: what is added to how he stands. */
var as$4 = (pose) => at(pose, STAND$4);
/** His demon arm drawn back and up behind him, its claws raised, to swipe. */
var DRAWN = {
	rhX: -.3,
	rhY: .4,
	rhZ: -.2,
	bTurn: 2.2,
	bUp: .8
};
/** Swept through, across in front of him to his left, its claws out ahead. */
var SWEPT = {
	rhX: .2,
	rhY: .2,
	rhZ: .4,
	bTurn: .8,
	bUp: -.1
};
var CLAW$1 = {
	keys: [
		[0, {}],
		[.2, as$4({
			...COILED,
			twist: -.4,
			lean: .12,
			...DRAWN
		})],
		[.38, as$4({
			...LUNGE,
			ahead: 1.2,
			twist: .45,
			lean: .3,
			...SWEPT
		})],
		[.55, as$4({
			...LUNGE,
			ahead: 1.25,
			hipY: -.28,
			twist: .5,
			lean: .28,
			...SWEPT,
			rhX: .22
		})],
		[1, {}]
	],
	lands: [.4]
};
var INSTINCT$1 = {
	keys: [
		[0, {}],
		[.25, as$4({
			...COILED,
			twist: -.6,
			lean: .15,
			...DRAWN
		})],
		[.45, as$4({
			...LUNGE,
			ahead: 1.5,
			twist: .7,
			lean: .32,
			...SWEPT
		})],
		[.6, as$4({
			...LUNGE,
			ahead: 1.6,
			twist: .75,
			lean: .3,
			...SWEPT,
			rhX: .26
		})],
		[.85, as$4({
			...TUCKED,
			ahead: 1.8,
			jump: 1.2,
			lean: -.15,
			rhX: -.2,
			rhY: .85,
			rhZ: 0,
			bTurn: 0,
			bUp: 1.4
		})],
		[1.05, as$4({
			...KNEELING,
			ahead: 2,
			lean: .5,
			rhX: -.08,
			rhY: -.3,
			rhZ: .42,
			bTurn: 0,
			bUp: -1.3
		})],
		[1.4, as$4({
			...KNEELING,
			ahead: 2,
			hipY: -.4,
			lean: .46,
			rhX: -.08,
			rhY: -.3,
			rhZ: .4,
			bTurn: 0,
			bUp: -1.3
		})],
		[1.85, {}]
	],
	lands: [.47, 1.07]
};
var DESPAIR$1 = {
	keys: [
		[0, {}],
		[.2, as$4({
			...COILED,
			lean: .3,
			twist: -.3,
			...DRAWN
		})],
		[.42, as$4({
			...LUNGE,
			ahead: 3.4,
			lean: .5,
			twist: .2,
			rhX: -.1,
			rhY: .3,
			rhZ: .52,
			bTurn: 0,
			bUp: 0
		})],
		[.55, as$4({
			...LUNGE,
			ahead: 3.6,
			lean: .42,
			twist: .6,
			...SWEPT
		})],
		[.75, as$4({
			...LOW,
			ahead: 3.5,
			lean: .25,
			twist: .5,
			...SWEPT
		})],
		[1.3, {}]
	],
	lands: [.56]
};
var DOOM$1 = {
	keys: [
		[0, {}],
		[.3, as$4({
			...TALL,
			lean: -.15,
			nod: -.15,
			twist: -.3,
			rhX: -.18,
			rhY: .85,
			rhZ: -.05,
			bTurn: 0,
			bUp: 1.5
		})],
		[.8, as$4({
			...TALL,
			lean: -.17,
			nod: -.17,
			twist: -.32,
			rhX: -.18,
			rhY: .88,
			rhZ: -.05,
			bTurn: 0,
			bUp: 1.52
		})],
		[1, as$4({
			...LUNGE,
			ahead: 1.6,
			lean: .48,
			twist: .2,
			rhX: -.06,
			rhY: .05,
			rhZ: .5,
			bTurn: 0,
			bUp: -.9
		})],
		[1.3, as$4({
			...LUNGE,
			ahead: 1.6,
			hipY: -.3,
			lean: .45,
			twist: .22,
			rhX: -.06,
			rhY: .05,
			rhZ: .48,
			bTurn: 0,
			bUp: -.9
		})],
		[1.75, {}]
	],
	lands: [1.02]
};
//#endregion
//#region src/technomagic/heroes/ezekiel/index.ts
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
var art$7 = (index) => skillPicture(EZEKIEL_ASSETS, index);
var CURSED_BLOOD = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Cursed Blood",
		about: "Passive. A stack of Cursed Blood for each skill he uses; at the 3rd, his skills are ready again, a burst knocks the boss down, and he is in Fury for 10 seconds: ATK higher, his attack twice as hard, every skill reinforced (each costs a share of his health), fighting by himself.",
		icon: "🩸",
		image: art$7(3)
	}
};
/** His stacks of Cursed Blood: shown beside his passive, with how many he has. */
var STACKED = {
	name: "Cursed Blood",
	about: "At 3, he is in Fury.",
	icon: "🩸"
};
/** Fury: shown on his card, with how long it has left. */
var FURY = {
	name: "Fury",
	about: "ATK 30% higher, his attack twice as hard, every skill reinforced (each costs a share of his health); he fights by himself.",
	icon: "😈",
	image: art$7(3)
};
/** What Dawning Despair in Fury gives him for a while. */
var QUICKENED = {
	name: "Dawning Despair",
	about: "His attacks quickened.",
	icon: "💨",
	image: art$7(1)
};
var EZEKIEL = {
	id: "ezekiel",
	name: "Ezekiel",
	class: "assassin",
	assets: EZEKIEL_ASSETS,
	stats: {
		...CLASS_STATS.assassin,
		deals: "magical"
	},
	abilities: [
		{
			name: "Destructive Instinct",
			icon: "🌀",
			image: art$7(0),
			move: "instinct",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Dawning Despair",
			icon: "💨",
			image: art$7(1),
			move: "despair",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Strike of Doom",
			icon: "💥",
			image: art$7(2),
			move: "doom",
			cooldown: 7,
			cost: 2
		}
	],
	passive: CURSED_BLOOD,
	attack: "claw",
	stands: STAND$4,
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
		return {
			lands: {
				claw() {
					fight.hit(self, CLAW.blow * (fury > 0 ? CLAW.fury : 1));
				},
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
var art$6 = (index) => skillPicture(CLAUSE_ASSETS, index);
var VOW_OF_KNIGHTS = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Vow of Knights",
		about: "Passive. When he blocks he strikes back: the boss hits 20% less hard for 8 seconds, and he gains 300 mana.",
		icon: "🛡️",
		image: art$6(3)
	}
};
/** What Guardian Shield gives every hero for a while: shown on each card, with how long it has left. */
var GUARDED$1 = {
	name: "Guardian Shield",
	about: "Takes 25% less from the boss.",
	icon: "✨",
	image: art$6(2)
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
			image: art$6(0),
			move: "slam",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Shield Strike",
			icon: "🛡️",
			image: art$6(1),
			move: "bash",
			cooldown: 8,
			cost: 1
		},
		{
			name: "Guardian Shield",
			icon: "✨",
			image: art$6(2),
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
//#region src/technomagic/heroes/fallen-frey/moves.ts
/** How she stands: upright, her weight on both feet, her weapon held before her at her waist, her right hand loose at her side. */
var STAND$3 = {
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
var as$3 = (pose) => at(pose, STAND$3);
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
		[.22, as$3({
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
		[.38, as$3({
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
		[.6, as$3({
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
		[.25, as$3({
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
		[.55, as$3({
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
		[.8, as$3({
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
		[1.05, as$3({
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
		[1.25, as$3({
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
var BLESSING$2 = {
	keys: [
		[0, {}],
		[.3, as$3({
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
		[.6, as$3({
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
		[.95, as$3({
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
var EVERY$1 = .12;
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
		[.3, as$3({
			...COILED,
			lean: .2,
			lhX: .16,
			lhY: .1,
			lhZ: .2,
			rhX: -.16,
			rhY: .05,
			rhZ: .1
		})],
		[.65, as$3({
			...HOVER,
			...STRETCHED,
			jump: .9,
			lean: .04,
			nod: -.05
		})],
		[1.8, as$3({
			...HOVER,
			...STRETCHED,
			jump: 1.05,
			lean: .05,
			nod: -.06,
			lhY: .35,
			rhY: .29
		})],
		[3.05, as$3({
			...HOVER,
			...STRETCHED,
			jump: .95,
			lean: .04,
			nod: -.05
		})],
		[3.45, as$3({
			...COILED,
			lean: .15
		})],
		[3.85, {}]
	],
	lands: Array.from({ length: BLOWS }, (_, i) => FIRST + i * EVERY$1)
};
//#endregion
//#region src/technomagic/heroes/fallen-frey/index.ts
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
var art$5 = (index) => skillPicture(FALLEN_FREY_ASSETS, index);
var TAINTED_ANGEL = {
	attack: 1,
	crit: 0,
	control: 1,
	taken: TAINTED.taken,
	shown: {
		name: "Tainted Angel",
		about: "Passive. She takes 15% more from the boss, but her mana fills far faster; at full mana she gains Darkened Power every second (2 at most).",
		icon: "🌑",
		image: art$5(3)
	}
};
/** What her full mana gives her: shown beside her passive, with how many she has. */
var DARKENED = {
	name: "Darkened Power",
	about: "Her next skill spends one: Heaven’s Vengeance then stuns the boss with every blow.",
	icon: "🖤"
};
/** What Blessing of Doom gives each ally it shields: shown on its card, with how long it has left. */
var BLESSED$1 = {
	name: "Blessing of Doom",
	about: "A shield takes the boss’s blows first, and its attacks are quickened.",
	icon: "🔮",
	image: art$5(1)
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
			image: art$5(0),
			move: "light",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Blessing of Doom",
			icon: "🔮",
			image: art$5(1),
			move: "blessing",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Heaven’s Vengeance",
			icon: "☄️",
			image: art$5(2),
			move: "vengeance",
			cooldown: 22,
			cost: 5
		}
	],
	passive: TAINTED_ANGEL,
	attack: "smite",
	stands: STAND$3,
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
//#region src/technomagic/heroes/gremory/moves.ts
/** How far back she is turned, lying, her head end a little up; and rolled onto her right side. */
var LIE = -Math.PI / 2 + .3;
var SIDE = -Math.PI / 2;
/**
* How she lies: on her right side along the top of the cube, her head at its back, propped on her right hand, its
* elbow bent under her on the cube; her left hand hung on her left leg, which is bent, its knee out ahead of her and
* its foot on the cube; her right leg along it, the back of its knee on its front edge, its shin hanging down off it.
*/
var STAND$2 = {
	...REST,
	flip: LIE,
	roll: SIDE,
	hipX: .185,
	hipY: .078,
	hipZ: 0,
	hipTurn: 0,
	lean: 0,
	twist: 0,
	tilt: 0,
	nod: 0,
	look: 0,
	lfX: .119,
	lfY: .479,
	lfZ: .084,
	lfTip: 0,
	rfX: .037,
	rfY: .252,
	rfZ: .024,
	rfTip: .5,
	lhX: .131,
	lhY: -.085,
	lhZ: .08,
	rhX: .035,
	rhY: .429,
	rhZ: .07,
	bTurn: 0,
	bUp: 0
};
/** Lying so, her right elbow bends down under her, onto the cube; her left knee out ahead of her and down onto it; and her right knee over its edge, its shin hanging. */
var BENDS = {
	lKnee: [
		-.14,
		-.34,
		.93
	],
	rKnee: [
		.88,
		-.47,
		0
	],
	rElbow: [
		-.92,
		-.28,
		.29
	]
};
/** A pose of hers, for a track: what is added to how she lies. */
var as$2 = (pose) => at(pose, STAND$2);
/** Her attack: how far her cube tips up (15°) as it lands, how far apart its pieces are then, and how far ahead and up it has swept her (as the field measures it). */
var UPPERCUT = {
	rock: Math.PI / 12,
	spread: .35,
	ahead: 2.4,
	jump: .4
};
/** Her left hand out at the boss, her arm straight; and further, jabbing. */
var OUT$1 = {
	lhX: .29,
	lhY: .02,
	lhZ: .12
};
var JAB = {
	lhX: .35,
	lhY: -.04,
	lhZ: .12
};
var NUDGE$1 = {
	keys: [
		[0, {}],
		[.21, {
			ahead: -.15,
			rock: -.04,
			spread: .06
		}],
		[.39, {
			ahead: 1.3,
			jump: .5,
			rock: UPPERCUT.rock * .6,
			spread: .22,
			...as$2({
				lhX: .2,
				lhY: .2,
				lhZ: .15
			})
		}],
		[.54, {
			...UPPERCUT,
			...as$2(JAB)
		}],
		[.78, {
			...UPPERCUT,
			...as$2(JAB),
			ahead: UPPERCUT.ahead + .12,
			spread: UPPERCUT.spread + .03
		}],
		[1.17, {
			ahead: .6,
			jump: .12,
			rock: .025,
			spread: .05
		}],
		[1.43, {}]
	],
	lands: [.54]
};
/** Pochi, bite them!: five bites. */
var BITES = 5;
var BITE = {
	first: .5,
	every: .2
};
var POCHI$1 = {
	keys: [
		[0, {}],
		[.25, as$2({
			nod: .2,
			lhX: .2,
			lhY: .2,
			lhZ: .15
		})],
		[.45, as$2({
			nod: .25,
			...OUT$1
		})],
		...Array.from({ length: BITES }, (_, i) => [BITE.first + .1 + i * BITE.every, as$2({
			nod: .25,
			...JAB
		})]),
		[BITE.first + BITES * BITE.every + .1, as$2({
			nod: .25,
			...OUT$1
		})],
		[BITE.first + BITES * BITE.every + .45, {}]
	],
	lands: Array.from({ length: BITES }, (_, i) => BITE.first + i * BITE.every)
};
var PUCHI$1 = {
	keys: [
		[0, {}],
		[.4, as$2({
			nod: .1,
			lhX: .54,
			lhY: .46,
			lhZ: 0
		})],
		[.75, as$2({
			nod: .3,
			lhX: .19,
			lhY: -.09,
			lhZ: .15
		})],
		[.95, as$2({
			nod: .3,
			lhX: .2,
			lhY: -.08,
			lhZ: .15
		})],
		[1.4, {}]
	],
	lands: [.8]
};
/** Pippi, wrap them!: ten blows. */
var WRAPS = 10;
var WRAP = {
	first: .6,
	every: .15
};
var RAISED = {
	nod: .15,
	lhX: .54,
	lhY: .27,
	lhZ: -.12
};
var WAVED = {
	nod: .15,
	lhX: .5,
	lhY: .34,
	lhZ: .12
};
var PIPPI$1 = {
	keys: [
		[0, {}],
		[.3, as$2({
			nod: .1,
			lhX: .2,
			lhY: .2,
			lhZ: .15
		})],
		[.55, as$2(RAISED)],
		...Array.from({ length: WRAPS / 2 }, (_, i) => [WRAP.first + (i * 2 + 1) * WRAP.every, as$2(i % 2 === 0 ? WAVED : RAISED)]),
		[WRAP.first + WRAPS * WRAP.every, as$2(RAISED)],
		[WRAP.first + WRAPS * WRAP.every + .5, {}]
	],
	lands: Array.from({ length: WRAPS }, (_, i) => WRAP.first + i * WRAP.every)
};
var DOZING = {
	flip: STAND$2.flip - .12,
	nod: -.1,
	rhX: -.11,
	rhY: .39,
	rhZ: .34,
	lhX: .13,
	lhY: -.12,
	lhZ: .08
};
var SLEEP$1 = {
	keys: [
		[0, {}],
		[.35, as$2({
			nod: -.15,
			lhX: .18,
			lhY: .85,
			lhZ: 0
		})],
		[.8, as$2(DOZING)],
		[2.9, as$2({
			...DOZING,
			nod: -.15
		})],
		[3.3, as$2({ nod: .1 })],
		[3.55, {}]
	],
	lands: [.8]
};
//#endregion
//#region src/technomagic/heroes/gremory/index.ts
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
var art$4 = (index) => skillPicture(GREMORY_ASSETS, index);
/** What all three of her slots turn into once her skills are sealed (its picture is the game's for it, where a passive's would be). */
var SLEEP_SKILL = {
	name: "Eh, whatever. I’m gonna sleep.",
	icon: "💤",
	image: art$4(3),
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
		about: "Each of her skills is sealed once used; once all three are, each turns into this. She sleeps a while (taking 40% less and not to be knocked down), then wakes with her skills unsealed and a Mana Charge.",
		icon: "💤",
		image: art$4(3)
	}
};
/** Asleep: shown on her card, with how long it has left. */
var SLEEPING = {
	name: "Asleep",
	about: "Takes 40% less from the boss, and can’t be knocked down.",
	icon: "💤",
	image: art$4(3)
};
/** Her Mana Charge: shown on her card, with how many she has. */
var CHARGED = {
	name: "Mana Charge",
	about: "Each: +10% ATK and +2% to all she deals; Pochi, bite them! hits harder for each.",
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
	assets: GREMORY_ASSETS,
	stats: {
		...CLASS_STATS.assassin,
		deals: "magical"
	},
	abilities: [
		{
			name: "Pochi, bite them!",
			icon: "🐶",
			image: art$4(0),
			move: "pochi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Puchi, knock them away!",
			icon: "💥",
			image: art$4(1),
			move: "puchi",
			cooldown: 0,
			cost: 3
		},
		{
			name: "Pippi, wrap them!",
			icon: "🎀",
			image: art$4(2),
			move: "pippi",
			cooldown: 0,
			cost: 4
		}
	],
	passive: LAZY,
	attack: "nudge",
	stands: STAND$2,
	bends: BENDS,
	seated: true,
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
var art$3 = (index) => skillPicture(KIRZE_ASSETS, index);
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
		image: art$3(3)
	}
};
/** What Crystal Haze gives her for a while: shown beside her passive, with how long it has left. */
var AWAKENING = {
	name: "Arcane Crystal Awakening",
	about: "Quickened, and a shockwave goes out from her every 2 seconds.",
	icon: "💠",
	image: art$3(1)
};
var KIRZE = {
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
			image: art$3(0),
			move: "judgment",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Disperse, Crystal Haze!",
			icon: "💠",
			image: art$3(1),
			move: "haze",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Bloom, Crimson Flower!",
			icon: "🌺",
			image: art$3(2),
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
};
//#endregion
//#region src/technomagic/heroes/laias/moves.ts
/** How she stands: upright and calm, her weight on both feet, her staff upright beside her in her right hand, her left hand loose at her side. */
var STAND$1 = {
	...REST,
	hipX: 0,
	hipY: -.01,
	hipTurn: -.05,
	lean: 0,
	tilt: .02,
	lfX: .05,
	lfZ: .05,
	rfX: -.04,
	rfZ: -.03,
	lhX: .21,
	lhY: -.12,
	lhZ: .03,
	rhX: -.22,
	rhY: .04,
	rhZ: .12,
	bTurn: 0,
	bUp: 1.45
};
/** A pose of hers, for a track: what is added to how she stands. */
var as$1 = (pose) => at(pose, STAND$1);
/** Her staff held out ahead at the boss, its head tipped toward it. */
var AIMED = {
	rhX: -.12,
	rhY: .3,
	rhZ: .42,
	bTurn: 0,
	bUp: .5
};
var SPLASH$1 = {
	keys: [
		[0, {}],
		[.22, as$1({
			twist: .3,
			lean: -.05,
			rhX: -.26,
			rhY: .2,
			rhZ: -.08,
			bUp: 1.2
		})],
		[.4, as$1({
			...LOW,
			twist: -.32,
			lean: .14,
			lhX: .24,
			lhY: -.04,
			lhZ: -.08,
			...AIMED
		})],
		[.6, as$1({
			...LOW,
			hipY: -.11,
			twist: -.34,
			lean: .12,
			lhX: .24,
			lhY: -.04,
			lhZ: -.08,
			...AIMED,
			rhY: .29
		})],
		[1, {}]
	],
	lands: [.42]
};
var DROPLETS$1 = {
	keys: [
		[0, {}],
		[.25, as$1({
			...COILED,
			lean: .12,
			nod: .15,
			lhX: .06,
			lhY: .28,
			lhZ: .2,
			rhX: -.14,
			rhY: .2,
			rhZ: .18
		})],
		[.55, as$1({
			...TALL,
			lean: -.12,
			nod: -.22,
			lhX: .45,
			lhY: .5,
			lhZ: .08,
			rhX: -.16,
			rhY: .78,
			rhZ: .08,
			bUp: 1.5
		})],
		[.9, as$1({
			...TALL,
			lean: -.14,
			nod: -.24,
			lhX: .46,
			lhY: .52,
			lhZ: .08,
			rhX: -.16,
			rhY: .8,
			rhZ: .08,
			bUp: 1.52
		})],
		[1.3, {}]
	],
	lands: [.6]
};
var BUBBLE$1 = {
	keys: [
		[0, {}],
		[.3, as$1({
			...COILED,
			lean: .1,
			nod: .12,
			twist: .15,
			lhX: .1,
			lhY: .18,
			lhZ: .3
		})],
		[.6, as$1({
			...LOW,
			lean: .16,
			nod: .05,
			twist: -.1,
			lhX: .18,
			lhY: .32,
			lhZ: .5
		})],
		[.9, as$1({
			...LOW,
			hipY: -.11,
			lean: .15,
			nod: .06,
			twist: -.12,
			lhX: .18,
			lhY: .33,
			lhZ: .51
		})],
		[1.3, {}]
	],
	lands: [.62]
};
var FESTIVAL$1 = {
	keys: [
		[0, {}],
		[.3, as$1({
			...COILED,
			lean: .15,
			twist: .2,
			lhX: .12,
			lhY: .1,
			lhZ: .2,
			rhX: -.16,
			rhY: .14,
			rhZ: .1
		})],
		[.65, as$1({
			...TALL,
			jump: .2,
			lean: -.15,
			nod: -.25,
			lhX: .42,
			lhY: .6,
			lhZ: .06,
			rhX: -.14,
			rhY: .85,
			rhZ: .1,
			bUp: 1.55
		})],
		[.95, as$1({
			...LOW,
			hipY: -.16,
			lean: .25,
			nod: .12,
			twist: -.2,
			lhX: .3,
			lhY: .05,
			lhZ: .1,
			rhX: -.1,
			rhY: .1,
			rhZ: .45,
			bUp: -.9
		})],
		[1.35, as$1({
			...LOW,
			hipY: -.17,
			lean: .24,
			nod: .12,
			twist: -.21,
			lhX: .3,
			lhY: .05,
			lhZ: .1,
			rhX: -.1,
			rhY: .1,
			rhZ: .45,
			bUp: -.9
		})],
		[1.8, {}]
	],
	lands: [1]
};
//#endregion
//#region src/technomagic/heroes/laias/index.ts
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
var art$2 = (index) => skillPicture(LAIAS_ASSETS, index);
var BLESSING = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Blessing of the Water Dragon",
		about: "Passive. +500 CC Resist for her; every ally has 10% more M.DEF and 250 M.Crit Resistance, and each skill she uses has every ally take 25% less magical damage for 5 seconds.",
		icon: "🐉",
		image: art$2(3)
	}
};
/** What her passive gives every ally while she is on the field, and each skill she uses for a while. */
var BLESSED = {
	name: "Blessing of the Water Dragon",
	about: "More M.DEF, and the boss’s magic is less likely to land a critical blow.",
	icon: "🐉",
	image: art$2(3)
};
var WARDED = {
	name: "Water Dragon’s Ward",
	about: "Takes 25% less magical damage.",
	icon: "💧",
	image: art$2(3)
};
/** What Healing Droplets gives each ally, shown on its card with how long it has left. */
var DROPLETS_UP = {
	name: "Healing Droplets",
	about: "Healing reaches it the more.",
	icon: "💧",
	image: art$2(0)
};
/** What Bubble Shield gives its ally: for its whole while, and more while the shield holds. */
var BUBBLED = {
	name: "Bubble Shield",
	about: "Takes 30% less from the boss and deals 15% more to it.",
	icon: "🫧",
	image: art$2(1)
};
var BUBBLE_HOLDS = {
	name: "Bubble",
	about: "While the shield holds: can’t be knocked down, hits harder, and is healed every second.",
	icon: "🫧",
	image: art$2(1)
};
var LAIAS = {
	id: "laias",
	name: "Laias",
	class: "priest",
	assets: LAIAS_ASSETS,
	stats: {
		...CLASS_STATS.priest,
		deals: "magical",
		resist: CLASS_STATS.priest.resist + WATER_DRAGON.resist
	},
	abilities: [
		{
			name: "Healing Droplets",
			icon: "💧",
			image: art$2(0),
			move: "droplets",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Bubble Shield",
			icon: "🫧",
			image: art$2(1),
			move: "bubble",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Festival of the Flow",
			icon: "🌊",
			image: art$2(2),
			move: "festival",
			cooldown: 20,
			cost: 4
		}
	],
	passive: BLESSING,
	attack: "splash",
	stands: STAND$1,
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
						critResist: WATER_DRAGON.critResist,
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
//#region src/technomagic/heroes/morrah/moves.ts
/** How she stands: ready and unbothered, her shield before her, her sword out to her right with its point down a little ahead. */
var STAND = {
	...REST,
	hipX: 0,
	hipY: -.03,
	hipTurn: -.08,
	lean: .02,
	tilt: .03,
	lfX: .05,
	lfZ: .1,
	rfX: -.05,
	rfZ: -.08,
	lhX: .13,
	lhY: .24,
	lhZ: .3,
	rhX: -.3,
	rhY: .06,
	rhZ: .14,
	bTurn: 5.9,
	bUp: -.5
};
/** A pose of hers, for a track: what is added to how she stands. */
var as = (pose) => at(pose, STAND);
var CLEAVE$1 = {
	keys: [
		[0, {}],
		[.18, as({
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
		[.3, as({
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
		[.44, as({
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
		[.6, as({
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
		[.74, as({
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
		[1.15, {}]
	],
	lands: [.3, .6]
};
var BURNING$1 = {
	keys: [
		[0, {}],
		[.3, as({
			...COILED,
			lean: -.05,
			twist: .3,
			nod: -.1,
			rhX: -.16,
			rhY: .72,
			rhZ: -.02,
			bTurn: 6.28,
			bUp: 1.7,
			lhX: .16,
			lhY: .26,
			lhZ: .3
		})],
		[.55, as({
			...COILED,
			hipY: -.22,
			lean: -.08,
			twist: .35,
			nod: -.12,
			rhX: -.16,
			rhY: .76,
			rhZ: -.04,
			bTurn: 6.28,
			bUp: 1.85,
			lhX: .16,
			lhY: .26,
			lhZ: .3
		})],
		[.75, as({
			...LUNGE,
			ahead: 1.2,
			lean: .42,
			twist: -.3,
			nod: .08,
			rhX: -.08,
			rhY: .04,
			rhZ: .5,
			bTurn: 6.28,
			bUp: -.7,
			lhX: .18,
			lhY: .16,
			lhZ: .2
		})],
		[1, as({
			...LUNGE,
			hipY: -.29,
			ahead: 1.25,
			lean: .4,
			twist: -.32,
			nod: .06,
			rhX: -.08,
			rhY: .03,
			rhZ: .48,
			bTurn: 6.28,
			bUp: -.68,
			lhX: .18,
			lhY: .16,
			lhZ: .2
		})],
		[1.5, {}]
	],
	lands: [.76]
};
var HELLFIRE$1 = {
	keys: [
		[0, {}],
		[.3, as({
			...COILED,
			lean: .1,
			twist: .2,
			rhX: -.24,
			rhY: .5,
			rhZ: .1,
			bTurn: 6.28,
			bUp: 1.2,
			lhX: .14,
			lhY: .3,
			lhZ: .36
		})],
		[.55, as({
			...LOW,
			hipY: -.22,
			lean: .25,
			twist: -.1,
			nod: -.25,
			rhX: -.2,
			rhY: -.08,
			rhZ: .3,
			bTurn: 6.28,
			bUp: -1.45,
			lhX: .1,
			lhY: .36,
			lhZ: .42
		})],
		[1.1, as({
			...LOW,
			hipY: -.21,
			lean: .22,
			twist: -.12,
			nod: -.3,
			rhX: -.2,
			rhY: -.07,
			rhZ: .3,
			bTurn: 6.28,
			bUp: -1.45,
			lhX: .1,
			lhY: .38,
			lhZ: .42
		})],
		[1.5, {}]
	],
	lands: [.55]
};
var ERUPTION$1 = {
	keys: [
		[0, {}],
		[.35, as({
			...COILED,
			twist: .6,
			lean: .05,
			rhX: -.34,
			rhY: .3,
			rhZ: -.2,
			bTurn: 3.6,
			bUp: 1.4,
			lhX: .18,
			lhY: .24,
			lhZ: .32
		})],
		[.6, as({
			...TUCKED,
			ahead: .8,
			jump: .9,
			lean: -.1,
			twist: .2,
			rhX: -.12,
			rhY: .8,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 2.1,
			lhX: .2,
			lhY: .34,
			lhZ: .24
		})],
		[.82, as({
			...KNEELING,
			ahead: 1.4,
			lean: .5,
			twist: -.1,
			rhX: -.06,
			rhY: 0,
			rhZ: .46,
			bTurn: 6.28,
			bUp: -1.3,
			lhX: .2,
			lhY: .12,
			lhZ: .3
		})],
		[1.2, as({
			...KNEELING,
			hipY: -.4,
			ahead: 1.4,
			lean: .46,
			twist: -.12,
			rhX: -.06,
			rhY: 0,
			rhZ: .44,
			bTurn: 6.28,
			bUp: -1.28,
			lhX: .2,
			lhY: .12,
			lhZ: .3
		})],
		[1.75, {}]
	],
	lands: [.84]
};
//#endregion
//#region src/technomagic/heroes/morrah/index.ts
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
var art$1 = (index) => skillPicture(MORRAH_ASSETS, index);
var FIRE_SMASH = {
	attack: 1,
	crit: 0,
	control: 1,
	shown: {
		name: "Fire Smash",
		about: "Passive. When she blocks she strikes back, leaving 3 Flame on the boss.",
		icon: "🔥",
		image: art$1(3)
	}
};
/** What Burning Power gives her for a while: shown beside her passive, with how long it has left. */
var BURNING_UP = {
	name: "Burning Power",
	about: "Each blow of her attack deals more and leaves a Flame on the boss.",
	icon: "🔥",
	image: art$1(0)
};
/** What Hellfire gives every ally for a while: shown on each card, with how long it has left. */
var HELLFIRE_UP = {
	name: "Hellfire",
	about: "30% more M.DEF, and +250 M.Block.",
	icon: "🌋",
	image: art$1(1)
};
/** What her skills, and her unique weapon, leave on the boss. */
var FLAMED = "Flame";
var MORRAH = {
	id: "morrah",
	name: "Morrah",
	class: "knight",
	assets: MORRAH_ASSETS,
	stats: {
		...CLASS_STATS.knight,
		deals: "magical"
	},
	abilities: [
		{
			name: "Burning Power",
			icon: "🔥",
			image: art$1(0),
			move: "burning",
			cooldown: 6,
			cost: 2
		},
		{
			name: "Hellfire",
			icon: "🌋",
			image: art$1(1),
			move: "hellfire",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Lava Eruption",
			icon: "☄️",
			image: art$1(2),
			move: "eruption",
			cooldown: 20,
			cost: 3
		}
	],
	passive: FIRE_SMASH,
	attack: "cleave",
	stands: STAND,
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
		return {
			lands: {
				cleave() {
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
				},
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
//#region src/technomagic/heroes/seria/index.ts
var PETALS$1 = {
	blow: 2500,
	window: 5
};
var BLOSSOM$1 = { blow: 2500 };
var SCATTER$1 = {
	rush: 2e3,
	cut: 1200,
	through: 800,
	pierce: 1e3,
	slow: .7,
	lasts: 3
};
var MOON$1 = {
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
var art = (index) => skillPicture(SERIA_ASSETS, index);
/** What Falling Petals' slot holds for a while after it is used (its picture is Falling Petals'). */
var BLOSSOM_SKILL = {
	name: "Mysterious Sword - Blossom",
	icon: "🌸",
	image: art(0),
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
		image: art(3)
	}
};
/** Her Cold-Blooded Witch's stacks: shown on her card, with how many she has. */
var WITCHED = {
	name: "Cold-Blooded Witch",
	about: "5% more crit damage for each.",
	icon: "🩸",
	image: art(3)
};
/** Moonlight: shown on her card for the second it lasts. */
var MOONLIGHT = {
	name: "Moonlight",
	about: "Red Moon Blade used now cuts again, and leaves the boss healed not at all for 10 seconds.",
	icon: "🌕",
	image: art(2)
};
/** What her skills leave on the boss. */
var SIN = "Original Sin of Blood";
var UNHEALED = "Red Moon";
//#endregion
//#region src/technomagic/heroes/index.ts
/** The heroes there are, in the order of their cards. */
var HEROES = [
	KIRZE,
	CLAUSE,
	FALLEN_FREY,
	GREMORY,
	ANNETTE,
	MORRAH,
	LAIAS,
	{
		id: "seria",
		name: "Seria",
		class: "warrior",
		assets: SERIA_ASSETS,
		stats: {
			...CLASS_STATS.warrior,
			atk: CLASS_STATS.warrior.atk + WITCH.atk,
			deals: "magical"
		},
		abilities: [
			{
				name: "Mysterious Sword - Falling Petals",
				icon: "🌸",
				image: art(0),
				move: "petals",
				cooldown: 7,
				cost: 1
			},
			{
				name: "Blood Scattering Blade",
				icon: "🩸",
				image: art(1),
				move: "scatter",
				cooldown: 13,
				cost: 2
			},
			{
				name: "Red Moon Blade",
				icon: "🌙",
				image: art(2),
				move: "moon",
				cooldown: 20,
				cost: 4
			}
		],
		passive: COLD_BLOODED,
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
						cut(PETALS$1.blow);
					},
					blossom() {
						cut(BLOSSOM$1.blow);
					},
					scatter(part) {
						if (part === 0) {
							cut(SCATTER$1.rush);
							put(fight.foe.statuses, {
								name: SIN,
								left: SCATTER$1.lasts,
								shown: "curse"
							});
							fight.slow(SCATTER$1.slow, SCATTER$1.lasts);
							return;
						}
						cut(SCATTER$1.cut);
						cut(SCATTER$1.through, SCATTER$1.pierce);
					},
					moon() {
						cut(MOON$1.blow + MOON$1.boss);
						if (!ripe) return;
						cut(MOON$1.ripe);
						put(fight.foe.statuses, {
							name: UNHEALED,
							left: MOON$1.unhealed,
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
						blossom = PETALS$1.window;
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
				lit: () => moonlight > 0,
				buffs: () => moonlight > 0 ? [{
					...MOONLIGHT,
					left: moonlight
				}] : []
			};
		}
	},
	EZEKIEL
];
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
//#region src/technomagic/heroes/seria/moves.ts
var PETALS = {
	keys: [
		[0, {}],
		[.18, at({
			...COILED,
			twist: -.5,
			lean: .08,
			rhX: -.36,
			rhY: .22,
			rhZ: -.1,
			bTurn: 4.3,
			bUp: .15,
			lhX: .2,
			lhY: .05,
			lhZ: .1
		})],
		[.32, at({
			...LUNGE,
			ahead: 1.6,
			lean: .3,
			twist: .6,
			rhX: .3,
			rhY: .22,
			rhZ: .3,
			bTurn: 7.5,
			bUp: .05,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[.5, at({
			...LUNGE,
			hipY: -.29,
			ahead: 1.7,
			lean: .26,
			twist: .66,
			rhX: .32,
			rhY: .24,
			rhZ: .2,
			bTurn: 7.8,
			bUp: .1,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[.9, {}]
	],
	lands: [.33]
};
var BLOSSOM = {
	keys: [
		[0, {}],
		[.2, at({
			...COILED,
			lean: -.05,
			nod: -.1,
			rhX: -.12,
			rhY: .7,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1.8,
			lhX: .2,
			lhY: .05,
			lhZ: .1
		})],
		[.36, at({
			...LUNGE,
			ahead: 1.5,
			lean: .45,
			rhX: -.06,
			rhY: .06,
			rhZ: .48,
			bTurn: 6.28,
			bUp: -.7,
			lhX: .22,
			lhY: .02,
			lhZ: -.12
		})],
		[.55, at({
			...LUNGE,
			hipY: -.3,
			ahead: 1.55,
			lean: .42,
			rhX: -.06,
			rhY: .05,
			rhZ: .46,
			bTurn: 6.28,
			bUp: -.68,
			lhX: .22,
			lhY: .02,
			lhZ: -.12
		})],
		[.95, {}]
	],
	lands: [.37]
};
var SCATTER = {
	keys: [
		[0, {}],
		[.15, at({
			...COILED,
			hipY: -.24,
			lean: .3,
			twist: -.4,
			rhX: -.34,
			rhY: .1,
			rhZ: -.2,
			bTurn: 4,
			bUp: 0,
			lhX: .2,
			lhY: .05,
			lhZ: .1
		})],
		[.3, at({
			...LUNGE,
			ahead: 3.2,
			lean: .5,
			twist: .6,
			rhX: .3,
			rhY: .2,
			rhZ: .3,
			bTurn: 7.5,
			bUp: 0,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[.48, at({
			...WIDE,
			ahead: 3.3,
			lean: .3,
			twist: -.55,
			rhX: -.34,
			rhY: .22,
			rhZ: .3,
			bTurn: 5.2,
			bUp: .1,
			lhX: .24,
			lhY: .1,
			lhZ: .1
		})],
		[.66, at({
			...LUNGE,
			ahead: 3.4,
			lean: .4,
			twist: .55,
			rhX: .3,
			rhY: .24,
			rhZ: .3,
			bTurn: 7.6,
			bUp: .1,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[.85, at({
			...LUNGE,
			hipY: -.29,
			ahead: 3.4,
			lean: .36,
			twist: .6,
			rhX: .32,
			rhY: .24,
			rhZ: .22,
			bTurn: 7.8,
			bUp: .1,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[1.3, {}]
	],
	lands: [
		.31,
		.49,
		.67
	]
};
var MOON = {
	keys: [
		[0, {}],
		[.3, at({
			...TALL,
			lean: -.15,
			nod: -.3,
			twist: .3,
			rhX: -.14,
			rhY: .78,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1.9,
			lhX: .22,
			lhY: .1,
			lhZ: .1
		})],
		[.7, at({
			...TALL,
			lean: -.17,
			nod: -.32,
			twist: .32,
			rhX: -.14,
			rhY: .8,
			rhZ: 0,
			bTurn: 6.28,
			bUp: 1.95,
			lhX: .22,
			lhY: .1,
			lhZ: .1
		})],
		[.9, at({
			...WIDE,
			ahead: 1,
			lean: .3,
			twist: -.6,
			rhX: -.36,
			rhY: .2,
			rhZ: .3,
			bTurn: 4.6,
			bUp: 0,
			lhX: .24,
			lhY: .1,
			lhZ: .1
		})],
		[1.05, at({
			...WIDE,
			ahead: 1.1,
			lean: .32,
			twist: .7,
			rhX: .34,
			rhY: .2,
			rhZ: .28,
			bTurn: 7.9,
			bUp: 0,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[1.3, at({
			...WIDE,
			hipY: -.32,
			ahead: 1.1,
			lean: .3,
			twist: .72,
			rhX: .34,
			rhY: .22,
			rhZ: .22,
			bTurn: 8,
			bUp: .1,
			lhX: .24,
			lhY: .05,
			lhZ: -.15
		})],
		[1.8, {}]
	],
	lands: [1.06]
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
	blessing: BLESSING$2,
	vengeance: VENGEANCE$1,
	nudge: NUDGE$1,
	pochi: POCHI$1,
	puchi: PUCHI$1,
	pippi: PIPPI$1,
	sleep: SLEEP$1,
	zap: ZAP$1,
	ray: RAY$1,
	treatment: TREATMENT$1,
	elimination: ELIMINATION$1,
	cleave: CLEAVE$1,
	burning: BURNING$1,
	hellfire: HELLFIRE$1,
	eruption: ERUPTION$1,
	splash: SPLASH$1,
	droplets: DROPLETS$1,
	bubble: BUBBLE$1,
	festival: FESTIVAL$1,
	petals: PETALS,
	blossom: BLOSSOM,
	scatter: SCATTER,
	moon: MOON,
	claw: CLAW$1,
	instinct: INSTINCT$1,
	despair: DESPAIR$1,
	doom: DOOM$1,
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
/** What Authority's support puts on the ally with the highest ATK. */
var GUARDED = {
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
		about: "Increases dodge by 200. On dodging, recovers 3% of max HP (once every 3 seconds)."
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
		about: "Fixes attack speed at 1000 and increases ATK by 40%."
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
		about: "Increases attack speed by 250."
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
		about: "Increases penetration by 250."
	},
	{
		id: "precision",
		name: "Precision",
		tier: "B",
		about: "Increases crit chance by 250."
	},
	{
		id: "guard",
		name: "Guard",
		tier: "B",
		about: "Increases block by 250."
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
		about: "Increases block by 150, and by 200 more for the first 10 seconds."
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
	const fighters = heroes.map(({ def: hero, skin = 0, gear = {}, set: wearing = null, uw = null, skills: worn = null }, index) => {
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
		const motion = motionOf(hero, skin);
		const name = (hero.assets.skins[skin] ?? hero.assets.skins[0])?.name ?? hero.name;
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
			critResist: gear.critResist ?? 0,
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
			const dealt = Math.min(foe.hp, taken * taking(foe.statuses, type));
			foe.hp -= dealt;
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
			const critical = roll() < share(foe.def.stats.crit - target.critResist - critResisting(target.statuses));
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
			const ability = sim.slot(fighter, index);
			return ability !== null && field.includes(fighter) && fighter.hp > 0 && !bound(fighter.statuses) && fighter.cooldowns[index] <= 0 && fighter.mana >= ability.cost * 1e3;
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
//#region src/technomagic/sim/verify.ts
var SIM_VERSION = 12;
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
		const skills = Array.isArray(hero.skills) ? hero.skills.filter((id) => typeof id === "string") : [];
		entries.push({
			def,
			skin: hero.skin,
			gear,
			set: typeof hero.set === "string" ? hero.set : null,
			uw: typeof hero.uw === "number" ? hero.uw : null,
			skills
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
export { BOSS_IDS, HERO_SKINS, MOST_INPUTS, MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_SKILLS, UNIQUE_WEAPON_HEROES, readInputs, replay, startRaid, uniqueWeaponText };
