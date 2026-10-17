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
/**
* King's Raid's soft caps: a stat's points past its soft cap count half (past `hard`, a fifth), so none is easily
* pushed to 100%. Each stat's (SOFT) is where the fight uses it.
*/
function soft(points, cap, hard = Infinity) {
	if (points <= cap) return points;
	if (points <= hard) return cap + (points - cap) * .5;
	return cap + (hard - cap) * .5 + (points - hard) * .2;
}
/**
* Each stat's soft cap (points): penetration, Tough and block DEF at 450; ACC, CC accuracy, CC resist and lifesteal at
* 500; block and dodge at 500, with a hard cap at 1000; attack speed at 500 more than as quick as it comes (1000), with
* a hard cap 1000 more.
*/
var SOFT = {
	pen: 450,
	tough: 450,
	blockDef: 450,
	acc: 500,
	resist: 500,
	lifesteal: 500,
	chance: 500,
	hard: 1e3
};
/**
* The attack a heal's or a shield's numbers are written for (as much HP as it says, from a hero with this much ATK; so
* many times as much for so many times its ATK): King's Raid's classes' average ATK, an assassin's. A blow's numbers
* are thousandths of its hero's ATK, as the game's shares have them (1000: a blow as hard as its ATK).
*/
var ATK = 19592;
/**
* What a defense takes off a blow, as King's Raid has it (its community's formula, against a level 90 boss): DEF_MOST
* of the blow at most, half of that at DEF_CURVE, never all of it. Defense is King's Raid's own size of DEF.
*/
var DEF_MOST = .9817;
var DEF_CURVE = 19360.37;
/** A blocked blow does this much of what it would have (less its target's block DEF against that kind). */
var BLOCKED = .5;
/**
* A blow of `amount` of a kind lands on `target`, from one with `pen` points of penetration: dodged (it
* takes nothing), or what it takes once the target's defense against that kind (less what penetration
* sees past) has worn it down, and whether it blocked it (then less again), and its Tough off what is left. `roll` is the
* fight's chances (../sim/random.ts).
*/
function strike(amount, type, target, pen, roll) {
	if (roll() < share(soft(target.dodge[type], SOFT.chance, SOFT.hard))) return {
		taken: 0,
		blocked: false,
		dodged: true
	};
	const blocked = roll() < share(soft(target.block[type], SOFT.chance, SOFT.hard));
	const defense = Math.max(0, target[type]) * (1 - share(soft(pen, SOFT.pen)));
	const kept = blocked ? Math.max(0, BLOCKED - soft((target.blockDef?.[type] ?? 0) * POINTS, SOFT.blockDef) / POINTS) : 1;
	const tough = 1 - share(soft(target.tough?.[type] ?? 0, SOFT.tough));
	return {
		taken: amount * (1 - DEF_MOST * defense / (DEF_CURVE + defense)) * kept * tough,
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
		hurts: [3e5, 45e4]
	},
	roar: {
		length: 2.1,
		hit: .5,
		hurts: [2e5, 3e5]
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
function defending(on, type) {
	let times = 1;
	for (const { defends } of on) times *= typeof defends === "number" ? defends : defends?.[type] ?? 1;
	return times;
}
/** What these add to a bearer's defense against a kind of damage. */
function bolstering(on, type) {
	let more = 0;
	for (const { bolsters } of on) more += bolsters?.[type] ?? 0;
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
//#region src/technomagic/sim/bosses/galgoria/skills.ts
var IMPRISONMENT = {
	hits: 150,
	lasts: 8,
	deals: 1.3
};
var DESTROYER = {
	share: .3,
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
	lasts: 10,
	deals: .5,
	crit: -.5,
	cooldown: 18
};
var FATAL = {
	after: 3,
	heals: .2,
	most: 5,
	deals: .1,
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
var POISONED$1 = {
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
/** Its skills that count toward Fatal Venom, and each one's cooldown. */
var COOLDOWNS = {
	destroyer: DESTROYER.cooldown,
	swamp: SWAMP.cooldown,
	explosion: EXPLOSION.cooldown
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
	/** Its skills' cooldowns, by name; its skills used toward Fatal Venom; and how long its swamp lasts yet, its blow each so often. */
	const cooldowns = /* @__PURE__ */ new Map();
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
			destroyer(part, amount) {
				if (part < 3) return venom(amount);
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
					name: POISONED$1.name,
					left: SWAMP.lasts,
					mana: SWAMP.mana,
					deals: SWAMP.deals,
					shown: POISONED$1
				});
				swamp = SWAMP.lasts;
				swampHurts = 0;
				swampAmount = amount / (SWAMP.lasts / SWAMP.every);
			},
			explosion(part, amount) {
				const heroes = reachable();
				for (const fighter of heroes) {
					fight.hurt(fighter, amount);
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
					fight.hurt(fighter, amount);
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
					for (const fighter of reachable()) if (fighter.statuses.some((status) => status.name === POISONED$1.name)) fight.hurt(fighter, swampAmount);
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
/**
* So many times less health than the game's: a hero's ATK here is the game's (its unique weapon's and its potentials'), but
* what more King's Raid's heroes deal to it (sets, more DMG to bosses, buffs) is not here. (Before HP, which it cuts.)
*/
var GEARED = 80;
/**
* Its health at stage 1, before GEARED: more than the game's (20 billion), so that 8 heroes on Auto at Transcend 5 (ATK Up,
* Monster Hunting, HP Up, two class perks, T5 Light) with R1 unique weapons and no other gear win about 4 times in 5
* (tried over 60 fights). Its stages 2 and 3 go up from it evenly (each so many times the last) to stage 4.
*/
var FIRST_HP = 384e8;
/**
* Its health and defense (P.DEF and M.DEF alike) at each stage, as King's Raid's Galgoria raid has them at its stages 1
* to 5 (its table, from its players' guides on DC Inside's King's Raid gallery: 20 to 87.6 billion HP, 117,000 to 222,300
* DEF); 6 to 8 go on from there (a first guess: the game's stage 6 is said to be past 300,000 DEF). But for its health at
* stages 1 to 3 (FIRST_HP). That health is the game's raid's, with more than one player, cut by GEARED; alone, it is
* ROOM_HP times less again. And how hard its blows are, either way.
*/
var KR_HP = [
	2e10,
	269e8,
	378e8,
	507e8,
	876e8,
	12e10,
	165e9,
	225e9
];
var HP = KR_HP.map((hp, i) => (i < 3 ? FIRST_HP * (KR_HP[3] / FIRST_HP) ** (i / 3) : hp) / GEARED);
var DEF = [
	117e3,
	128300,
	142e3,
	175300,
	222300,
	3e5,
	38e4,
	47e4
];
var ROOM_HP = 1.7;
var DEALS = [
	2,
	2.25,
	2.5,
	2.75,
	3,
	3.25,
	3.5,
	3.75
];
var scales = (times) => HP.map((hp, i) => ({
	hp: hp / HP[0] * times,
	deals: DEALS[i],
	defense: DEF[i] / DEF[0]
}));
//#endregion
//#region src/technomagic/sim/bosses/index.ts
/** The bosses of the TechnoMagic Raid there are so far: the first is the one fought unless another is asked for. */
var BOSSES = [{
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
		resist: 150
	},
	stages: {
		room: scales(1),
		solo: scales(1 / ROOM_HP)
	},
	attacks: ATTACKS,
	plans: PLANS,
	moves: MOVES,
	join: galgoriaPart
}];
//#endregion
//#region src/technomagic/sim/bosses/boss.ts
/** A boss's scale at `stage` (1 to its last; past it, its last), alone or not. */
function scaleAt(def, stage, solo) {
	const row = solo ? def.stages.solo : def.stages.room;
	return row[Math.min(row.length, Math.max(1, Math.floor(stage) || 1)) - 1] ?? {
		hp: 1,
		deals: 1
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
		resist: plus(stats.resist, gear.resist),
		block: {
			physical: plus(stats.block.physical, both(gear.block, gear.blockPhysical)),
			magical: plus(stats.block.magical, both(gear.block, gear.blockMagical))
		},
		dodge: {
			physical: plus(stats.dodge.physical, gear.dodge),
			magical: plus(stats.dodge.magical, gear.dodge)
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
		hp: 1354584,
		atk: 15712,
		defense: {
			physical: 6984,
			magical: 5432
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
		hp: 1150488,
		atk: 17848,
		defense: {
			physical: 5816,
			magical: 6984
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
		hp: 1099264,
		atk: 19592,
		defense: {
			physical: 6208,
			magical: 5432
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
		hp: 846664,
		atk: 22112,
		defense: {
			physical: 4264,
			magical: 3488
		},
		crit: 150,
		pen: 250,
		acc: 100,
		speed: 1e3
	},
	mechanic: {
		hp: 918448,
		atk: 20176,
		defense: {
			physical: 4264,
			magical: 3488
		},
		crit: 150,
		critDamage: .5,
		pen: 100,
		acc: 200,
		speed: 1e3
	},
	wizard: {
		hp: 782056,
		atk: 23280,
		defense: {
			physical: 3104,
			magical: 4656
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
		hp: 876928,
		atk: 18424,
		defense: {
			physical: 3880,
			magical: 4848
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
* thousandths of ATK (as a blow's numbers are), so that at its class's ATK it deals just that.
*/
var indexed = (kind, dmg) => POINTS * dmg / KINGS_RAID[kind].atk;
/** A heal or a shield as the King's Raid Index has it: so that a hero of `kind`, at its class's ATK, gives just `amount` (a heal gives as much more as its healer's attack is over ATK). */
var indexedHeal = (kind, amount) => amount * ATK / KINGS_RAID[kind].atk;
/** What a blow of `blow` deals from a hero of `kind` at its class's ATK, as its words say it (the Index's own number, where it has one). */
var dmg = (kind, blow) => num(Math.round(blow * KINGS_RAID[kind].atk / POINTS));
/** What a heal or a shield of `amount` gives from a hero of `kind` at its class's ATK, as its words say it. */
var healed = (kind, amount) => num(Math.round(amount * KINGS_RAID[kind].atk / ATK));
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
var MANA_PER_HP_LOST = 2500;
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
var AUTHORITY$1 = {
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
		dps: `+${AUTHORITY$1.pen} penetration`,
		support: `+${AUTHORITY$1.mana / SECTION} mana sections at the start; the ally with the highest ATK can’t be knocked down for ${AUTHORITY$1.guardFor} seconds`,
		knight: `+${pct(AUTHORITY$1.resist / POINTS)} CC resist; its skills strip what helps the boss`
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
var GUARDED$2 = {
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
		speed: 2e3,
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
		about: `Increases dodge by ${pct(share(SKILL.mirage.dodge))}. On dodging, recovers ${pct(SKILL.mirage.heal)} of max HP (once ${every$1(SKILL.mirage.wait)}).`
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
		about: `Increases attack speed by ${pct(share(SKILL.swiftness.speed))}.`
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
		about: `Increases penetration by ${pct(share(SKILL.piercing.pen))}.`
	},
	{
		id: "precision",
		name: "Precision",
		tier: "B",
		about: `Increases crit chance by ${pct(share(SKILL.precision.crit))}.`
	},
	{
		id: "guard",
		name: "Guard",
		tier: "B",
		about: `Increases block by ${pct(share(SKILL.guard.block))}.`
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
		about: `Increases block by ${pct(share(SKILL["iron-wall"].block))}, and by ${pct(share(SKILL["iron-wall"].more))} more for the first ${seconds(SKILL["iron-wall"].lasts)}.`
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
				crit: -share(150),
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
//#region src/technomagic/sim/fight.ts
/** The additional skills that come round again every so many seconds: each first comes once that long has gone. */
var EVERY = [
	"regeneration",
	"mana-spring",
	"focus-1",
	"focus-2",
	"focus-3"
];
/** The boss's defenses as blows with `acc` points of ACC find them (soft-capped): so much less likely dodged or blocked. */
var seenPast = (stats, points) => {
	const acc = soft(points, SOFT.acc);
	return {
		...stats,
		dodge: {
			physical: Math.max(0, stats.dodge.physical - acc),
			magical: Math.max(0, stats.dodge.magical - acc)
		},
		block: {
			physical: Math.max(0, stats.block.physical - acc),
			magical: Math.max(0, stats.block.magical - acc)
		}
	};
};
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
	const fighters = heroes.map(({ def: hero, skin = 0, gear: worn = {}, set: wearing = null, uw = null, skills: tm = null, sub = false }, index) => {
		const set = setOf(wearing, hero.class);
		const tier = uniqueOf(hero.id, uw);
		const skills = skillsOf(tm);
		const n = (id) => skills[id] ?? 0;
		const perks = perkSets[index];
		const gear = withPerks(worn, perks.values());
		if (battleCry > 0) gear.hp = (gear.hp ?? 0) + battleCry;
		const stats = perkedStats(geared(hero.stats, gear), perks.values());
		if (set?.id === "authority" && set.role === "dps") stats.pen += AUTHORITY$1.pen;
		if (set?.id === "authority" && set.role === "knight") stats.resist += AUTHORITY$1.resist;
		skilledStats(stats, skills);
		const motion = motionOf(hero);
		const name = hero.skins[skin] ?? hero.skins[0] ?? hero.name;
		const defs = [...perks.values()];
		const product = (of) => defs.reduce((times, perk) => times * (of(perk) ?? 1), 1);
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
			perkDmg: product((perk) => perk.dmg),
			perkTaken: {
				physical: product((perk) => perk.taken) * product((perk) => perk.takenPhysical),
				magical: product((perk) => perk.taken)
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
			mana: Math.min(MAX_MANA, MAX_MANA / 2 + (set?.id === "authority" && set.role === "support" ? AUTHORITY$1.mana : 0)),
			sub,
			auto: sub || raid,
			cooldowns: hero.abilities.map(() => 0),
			reserved: null,
			lastUsed: hero.abilities.map(() => -Infinity),
			income: 100 * (1 + (gear.manaRegen ?? 0)),
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
	/** The hero whose attack's blow is landing right now (null: none: a skill's, or something else's); and whose move, and which. */
	let attacking = null;
	let landing = null;
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
		foe.part.used?.(attack);
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
	* How many times its ATK a hero's blows, heals and shields go by, for now: every Hope and Perseverance support
	* on the field and every War Cry among them; and its own Momentum's stacks and Desperation.
	*/
	const atkTimes = (by) => (1 + HOPE.atk * wearing("hope", "support").length + PERSEVERANCE.atk * wearing("perseverance", "support").length + SKILL["war-cry"].atk * among("war-cry") + auras.atk) * (1 + SKILL.momentum.atk * by.stacks.momentum * has(by, "momentum")) * (bears(by, DESPERATION_UP.name) ? 1 + SKILL.desperation.atk * has(by, "desperation") : 1);
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
	/** How many times as much the heal or shield of the skill landing gives, by its perks (its main unique treasure's: moveHeals). */
	const healed = (by) => by && landing?.by === by ? by.moveHeals[landing.move] ?? 1 : 1;
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
		if (fighter.set?.id === "authority" && fighter.set.role === "knight") dispel();
		for (const perk of fighter.perkDefs) if (perk.skill?.index === index) usedWith(fighter, perk.skill);
		fighter.cooldowns[index] = ability.cooldown;
		fighter.lastUsed[index] = elapsed;
		fighter.mana -= ability.cost * SECTION;
		spent.set(fighter, (spent.get(fighter) ?? 0) + ability.cost * SECTION);
		fighter.part.used?.(index, ability);
		uniqueCast(fighter);
		skillCast(fighter);
		return true;
	}
	/** What helps the boss (makes it deal more) is gone. */
	function dispel() {
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
		put(foe.statuses, {
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
				landing = {
					by: fighter,
					move
				};
				const own = fighter.part.lands[move];
				if (own) own(index);
				else common[move]?.(fighter, index);
				attacking = null;
				landing = null;
				if (doing.blows === 1) {
					for (const mark of fighter.moveMarks[move] ?? []) marked(mark);
					const slowing = doing.skill === void 0 ? void 0 : fighter.perkDefs.find((perk) => perk.skill?.index === doing.skill && perk.skill?.slow)?.skill?.slow;
					if (slowing) sim.slow(slowing.points, slowing.lasts);
				}
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
		hit(by, amount, counted = true, pierce = 0, whole = false) {
			if (foe.hp <= 0 || result) return false;
			const { attack, crit } = by.def.passive ?? NO_PASSIVE;
			const { atk, deals: type, crit: points, pen } = by.stats;
			const critical = roll() < share(points + auras.crit + critTaking(foe.statuses, type)) + crit + critting(by.statuses);
			const focus = by.perkDefs.find((perk) => perk.focus)?.focus;
			const focused = focus ? focus.critDamage * Math.min(focus.most, Math.floor(elapsed / focus.every)) : 0;
			const critTimes = by.critTimes + SKILL.whetstone.critDamage * among("whetstone") + critDamaging(by.statuses) + auras.critDamage + focused;
			const skilled = landing?.by === by ? by.moveDmg[landing.move] ?? 1 : 1;
			const acc = by.acc + auras.acc;
			const plain = bossStands();
			const lower = {
				physical: blocking(foe.statuses, "physical"),
				magical: blocking(foe.statuses, "magical")
			};
			const stood = lower.physical === 0 && lower.magical === 0 ? plain : {
				...plain,
				block: {
					physical: Math.max(0, plain.block.physical + lower.physical),
					magical: Math.max(0, plain.block.magical + lower.magical)
				}
			};
			const seen = acc > 0 ? seenPast(stood, acc) : stood;
			const against = whole || landing?.by === by && by.moveWhole.has(landing.move) ? {
				...seen,
				physical: 0,
				magical: 0
			} : {
				...seen,
				physical: seen.physical * defending(foe.statuses, "physical"),
				magical: seen.magical * defending(foe.statuses, "magical")
			};
			const { taken, blocked, dodged } = strike(amount * (atk / POINTS) * atkTimes(by) * dmgTimes(by) * attack * dealing(by.statuses) * (critical ? critTimes : 1) * by.perkDmg * skilled * (by.part.deals?.() ?? 1), type, against, pen + auras.pen + pierce + piercing(by.statuses), roll);
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
			const marking = by.perkDefs.filter((perk) => perk.mark && (perk.mark.every === void 0 || perkDue(by, perk.mark.name, perk.mark.every)));
			const struck = taken * taking(foe.statuses, type) * (foe.part.taken?.[type] ?? 1);
			const dealt = deathless ? struck : Math.min(foe.hp, struck);
			foe.hp -= dealt;
			if (deathless && foe.hp <= 0) foe.hp = foe.maxHp;
			by.dealt += dealt;
			events.push({
				kind: "number",
				on: "boss",
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
				const stolen = Math.min(dealt * share(soft(by.lifesteal, SOFT.lifesteal)) * healing(by.statuses) * (foe.part.healing?.() ?? 1), by.stats.hp - by.hp);
				if (stolen > 0) by.hp += stolen;
			}
			if (attacking === by) by.mana = Math.min(MAX_MANA, by.mana + by.manaPerAttack);
			const skillIndex = critical && landing?.by === by && attacking !== by ? by.doing?.skill : void 0;
			if (skillIndex !== void 0) for (const perk of by.perkDefs) {
				if (perk.skill?.index !== skillIndex) continue;
				if (perk.skill.critMana) by.mana = Math.min(MAX_MANA, by.mana + perk.skill.critMana);
				if (perk.skill.critCooldown) by.cooldowns[skillIndex] = Math.max(0, by.cooldowns[skillIndex] - (by.abilities[skillIndex]?.cooldown ?? 0) * perk.skill.critCooldown);
			}
			if (counted) {
				for (const fighter of fighters) fighter.part.struck?.(by);
				foe.part.struck?.(by, dealt);
				by.part.blow?.(attacking !== by);
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
			const given = Math.min(amount * byAttack(by) * healed(by) * healing(fighter.statuses) * (foe.part.healing?.() ?? 1), fighter.stats.hp - fighter.hp);
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
			const given = amount * byAttack(by) * healed(by) * (by ? 1 + SKILL.aegis.shield * has(by, "aegis") : 1) * (foe.part.shielding?.() ?? 1);
			fighter.shield += given;
			fighter.shieldLeft = Math.max(fighter.shieldLeft, seconds);
			if (by) by.healed += given;
		},
		target: aimed,
		hurt(target, amount, blockable = true) {
			if (target.hp <= 0 || away(target.statuses) || result) return 0;
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
			const type = foe.def.stats.deals;
			const guarded = 1 + HOPE.defense * wearing("hope", "support").length + PERSEVERANCE.defense * wearing("perseverance", "support").length + SKILL.bastion.defense * among("bastion");
			const walled = elapsed < SKILL["iron-wall"].lasts ? SKILL["iron-wall"].more * has(target, "iron-wall") : 0;
			const stands = {
				...target.stats,
				physical: (target.stats.physical + bolstering(target.statuses, "physical") + bolstering(party, "physical")) * guarded * defending(target.statuses, "physical") * defending(party, "physical"),
				magical: (target.stats.magical + bolstering(target.statuses, "magical") + bolstering(party, "magical")) * guarded * defending(target.statuses, "magical") * defending(party, "magical"),
				block: {
					physical: target.stats.block.physical + walled + blocking(target.statuses, "physical"),
					magical: target.stats.block.magical + walled + blocking(target.statuses, "magical")
				}
			};
			const nimbler = (target.nimble > 0 ? target.nimble * (target.perkDefs.find((perk) => perk.nimble)?.nimble?.dodge ?? 0) : 0) + (target.part.dodge?.() ?? 0);
			if (nimbler > 0) stands.dodge = {
				physical: stands.dodge.physical + nimbler,
				magical: stands.dodge.magical + nimbler
			};
			const critical = roll() < share(foe.def.stats.crit - target.critResist[type] - critResisting(target.statuses, type) - critResisting(party, type)) + critting(foe.statuses);
			const { taken, blocked, dodged } = strike(amount * scaleAt(def, stage, solo).deals * dealing(foe.statuses) * rage(clock - 210) * (critical ? 2 : 1), type, blockable ? stands : {
				...stands,
				block: NONE,
				dodge: NONE
			}, 0, roll);
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
				return 0;
			}
			events.push({
				kind: "hurt",
				who: target.index,
				blocked
			});
			let dealt = taken * taking(party, type) * taking(target.statuses, type) * (target.def.passive?.taken ?? 1) * (target.set?.id === "hope" && target.set.role === "knight" ? HOPE.taken : 1) * target.perkTaken[type] * (target.part.takes?.() ?? 1);
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
			const losing = Math.min(target.hp, Math.max(0, dealt - soaked));
			const lost = losing >= target.hp && target.hp > 1 && target.part.spared?.() ? target.hp - 1 : losing;
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
			if (dealt > 0) for (const fighter of fighters) fighter.part.hurt?.(target);
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
			stagger(fighter);
			const shorter = Math.max(0, 1 - SKILL.tenacity.control * has(fighter, "tenacity")) * (fighter.def.passive?.held ?? 1) * (fighter.part.held?.() ?? 1);
			put(fighter.statuses, {
				name: KNOCKED.name,
				left: seconds * (1 - share(soft(fighter.stats.resist + resisting(fighter.statuses) + auras.resist, SOFT.resist))) * shorter,
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
			const lasts = seconds * (by ? (by.def.passive?.control ?? 1) * by.controlTimes * (1 - share(soft(Math.max(0, foe.def.stats.resist + resisting(foe.statuses)), SOFT.resist) - soft(by.accuracy + auras.accuracy + accurate(by.statuses), SOFT.acc))) : 1);
			going.clear();
			foe.stunned = Math.max(foe.stunned, lasts);
			events.push({
				kind: "boss-daze",
				seconds: lasts,
				down
			});
		},
		slow(points, seconds) {
			if (foe.part.steady) return;
			const rate = 1 - share(points);
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
			if (bossAuto && idle >= 1.1) {
				const forced = foe.part.next?.() ?? null;
				const may = def.attacks.filter((one) => foe.part.ready?.(one.name) ?? true);
				bossUse(forced ?? (may[Math.floor(roll() * may.length)] ?? def.attacks[0])?.name ?? "");
			}
			for (const fighter of fighters) {
				fighter.mana = Math.min(MAX_MANA, fighter.mana + fighter.manaRegen * dt * filling(fighter.statuses) * filling(party));
				fighter.cooldowns = fighter.cooldowns.map((left) => Math.max(0, left - dt));
				wear(fighter.statuses, dt);
				fighter.shieldLeft = Math.max(0, fighter.shieldLeft - dt);
				if (fighter.shieldLeft <= 0) fighter.shield = 0;
				skillTick(fighter, dt);
				perkTick(fighter, dt);
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
				if (on.auto && on.reserved === null && !on.doing) on.reserved = autoSkill(on);
				if (on.reserved !== null && !sim.reservable(on, on.reserved) && !bound(on.statuses)) on.reserved = null;
				if (!on.doing && on.hp > 0 && !bound(on.statuses)) {
					if (on.reserved !== null && use(on, on.reserved)) on.reserved = null;
					else if (on.rested >= .45 && foe.hp > 0) begin(on, on.attack, null);
				}
			}
			const busy = bossBusy();
			if (busy && !was) aim = anyone();
			was = busy;
			bossAdvance(dt);
			if (result) return;
			const reform = Math.min(1, dt * 4);
			for (const on of field) {
				const quicker = Math.max(0, on.stats.speed + auras.speed + (on.part.speed?.() ?? 0) - POINTS);
				on.haste = on.def.passive?.steady ? 1 : (POINTS + soft(quicker, SOFT.chance, SOFT.hard)) / POINTS * (on.part.pace?.() ?? 1) * pacing(on.statuses);
				advance(on, dt * on.haste);
				if (result) return;
				const [x, z] = spots.get(on);
				on.x += (x - on.x) * reform;
				on.z += (z - on.z) * reform;
			}
			if (!deathless && (field.length > 0 && field.every((on) => on.hp <= 0) || clock >= 230)) end("lost");
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
			name: GUARDED$2.name,
			left: AUTHORITY$1.guardFor,
			guards: true,
			shown: GUARDED$2
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
var ZAP = { blow: BLOW * 1.4 };
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
	words: `Gains 1 stack of Charge every ${CHARGE$1.every} sec, and gains ${CHARGE$1.perCrystal} stacks of Charge per every orb of mana used. Upon the ${CHARGE$1.full}th Charge stacked, enters Overcharge state. When in Overcharge, ATK is increased by ${pct(CHARGE$1.atk)} for ${CHARGE$1.lasts} sec, and each auto attack reduces skill cooldown by ${pct(CHARGE$1.cooldown)}. All effects cannot be dispelled, and Charge will not stack during Overcharge state.`
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
			words: `Attacks enemies in a straight line, dealing ${dmg("mechanic", RAY.blow)} M.DMG, reducing their ATK by ${pct(RAY.weaker)} and hit enemies take ${pct(RAY.takes)} increased M.DMG for ${RAY.lasts} sec. If the skill is used when in Overcharge state, deals ${dmg("mechanic", RAY.extra)} extra M.DMG, additionally reduces their ATK by ${pct(RAY.weaker)}, and hit enemies take ${pct(RAY.takes)} increased M.DMG.`,
			icon: "🔆",
			art: art$24(0),
			move: "ray",
			cooldown: 11,
			cost: 2
		},
		{
			name: "Emergency Treatment",
			auto: { heals: true },
			about: `Clears what the boss has left on every ally (not what holds one down or shuts one away) and heals them over ${TREATMENT.lasts} seconds, and they stand being knocked down better meanwhile. [Overcharged]: they are also ${pct(share(TREATMENT.crit))} likelier to land a critical blow, deal ${pct(TREATMENT.dmg)} more, and can’t be knocked down.`,
			words: `Dispels negative effects of all allies and heals a total of ${healed("mechanic", TREATMENT.heal)} HP for ${TREATMENT.lasts} sec while increasing CC Resistance by ${TREATMENT.resist}. While Overcharged, all allies' Crit Chance is increased by ${TREATMENT.crit} and DMG dealt to Non-Hero enemies by ${pct(TREATMENT.dmg)} and gains immunity to CC.`,
			icon: "🩹",
			art: art$24(1),
			move: "treatment",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Process of Elimination",
			about: `A ball of energy that bursts on the boss. [Overcharged]: it bursts harder, stuns the boss for ${ELIMINATION.stun} seconds, and leaves it taking ${pct(ELIMINATION.takes)} more magical damage for ${ELIMINATION.lasts}.`,
			words: `Fires an exploding energy ball to a random target and nearby enemies in range, dealing ${dmg("mechanic", ELIMINATION.blow)} M.DMG. When in Overcharge state, deals ${dmg("mechanic", ELIMINATION.over)} M.DMG, increases M.DMG enemies take by ${pct(ELIMINATION.takes)} for ${ELIMINATION.lasts} sec, and inflicts Stun for ${ELIMINATION.stun} sec upon explosion.`,
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
					crit: -share(UT$24.lens.crit),
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
				shown: OVERCHARGED
			});
			if (self.perks.has("t5-dark")) for (const ally of allies()) put(ally.statuses, {
				name: ROUSED.name,
				left: over,
				pace: 1 + share(PERKS$24.allies.speed),
				deals: 1 + PERKS$24.allies.atk * self.stats.atk / ally.stats.atk,
				shown: ROUSED
			});
		};
		const battery = fromTreasure(self, 3, UT$24.battery.charge);
		if (battery > 0) gain(battery);
		return {
			lands: {
				zap() {
					fight.hit(self, ZAP.blow);
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
							crit: share(TREATMENT.crit),
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
				gain(ability.cost * CHARGE$1.perCrystal * more);
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
	words: `Upon blocking, deals ${dmg("knight", VOW.blow)} P.DMG to frontal enemies and decreases ATK of affected targets by ${pct(1 - VOW.weak)} for ${VOW.lasts} sec. Recovers ${VOW.mana} MP after hitting the target. When an ally excluding self takes DMG increases all allies' P.DEF by 20% and P.Crit Resistance by 200 for 5 sec. This effect only activates once every 10 sec.`
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
	about: `P.DEF +${pct(PERKS$23.ward.defends - 1)} and P.Crit Resist +${pct(share(PERKS$23.ward.critResist))}.`,
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
			words: `Leaps into the air and deals ${dmg("knight", CUT_GROUND.blow)} P.DMG to enemies in range, stunning them for ${CUT_GROUND.stun} sec.`,
			icon: "⚔️",
			art: art$23(0),
			move: "slam",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Shield Strike",
			about: `A blow with his shield: for ${SHIELD_STRIKE.lasts} seconds the boss attacks ${pct(share(SHIELD_STRIKE.speed))} slower and takes ${pct(SHIELD_STRIKE.exposed - 1)} more.`,
			words: `Deals ${dmg("knight", SHIELD_STRIKE.blow)} P.DMG proportional to P.DEF to enemies in range and knocks them back. Hit enemies' All DEF and ATK Spd is reduced by ${pct(SHIELD_STRIKE.exposed - 1)} and ${SHIELD_STRIKE.speed} for ${SHIELD_STRIKE.lasts} sec, respectively. Upon blocking an attack, skill cooldown is reduced by 0.5 sec.`,
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
					crit: -share(k(UT$23.determination.crit)),
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
		"t5-dark": { words: `When an ally other than this hero is hit by an attack, increases all allies' P.DEF by ${pct(PERKS$23.ward.defends - 1)} and P.Crit Resist by ${pct(share(PERKS$23.ward.critResist))} (${PERKS$23.ward.every} sec Cooldown).` }
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
	words: `Ezekiel gains 1 stack of 'Cursed Blood' at the end of skill. Upon the ${nth(CURSED.most)} stack, consumes Cursed Blood to reset all skill cooldown, dealing ${dmg("assassin", CURSED.blow)} M.DMG to nearby enemies and knocking them down for ${CURSED.down} sec, while activating Fury for ${CURSED.lasts} sec, that cannot be dispelled. While in Fury state, goes into an auto-battle mode that cannot be controlled, and ATK is increased by ${pct(CURSED.atk)}, auto attack DMG is ${fold(CLAW$1.fury)}, and all Skill effect are reinforced. Cannot gain Cursed Blood during Fury state, except for when killing an enemy.`
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
			words: `Swipes nearby enemies in a circular range and deals ${dmg("assassin", INSTINCT.swipe)} M.DMG. Then strikes the ground, dealing ${dmg("assassin", INSTINCT.strike)} M.DMG and knocking down enemies for ${INSTINCT.down} sec. [Fury] - Consumes ${pct(INSTINCT.cost)} of current HP to activate. Effect range increases and swipe attack draws in enemies.`,
			icon: "🌀",
			art: art$22(0),
			move: "instinct",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Dawning Despair",
			about: `A dash and a blow: the boss’s attacks ${pct(share(DESPAIR.speed))} slower for ${DESPAIR.slowed} seconds. In [Fury]: it is also stunned for ${DESPAIR.stun} seconds, and his attacks are ${pct(share(DESPAIR.speed))} quicker for ${DESPAIR.lasts}, for ${pct(DESPAIR.cost)} of the health he has.`,
			words: `Dashes to an enemy with the highest ATK and deals ${dmg("assassin", DESPAIR.blow)} M.DMG to enemies in range, reducing their ATK Spd by ${DESPAIR.speed}. [Fury] - Consumes ${pct(DESPAIR.cost)} of current HP to activate. Effect range increases, Stuns target for ${DESPAIR.stun} sec, and increases own ATK Spd by ${DESPAIR.speed} for ${DESPAIR.lasts} sec.`,
			icon: "💨",
			art: art$22(1),
			move: "despair",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Strike of Doom",
			about: `A charged blow that stuns the boss for ${DOOM.stun} seconds. In [Fury]: ${times(DOOM.fury)} as hard, for ${pct(DOOM.cost)} of the health he has.`,
			words: `Charges energy and attacks target enemy, dealing ${dmg("assassin", DOOM.blow)} M.DMG and inflicting Stun for ${DOOM.stun} sec. Ignores target's DMG Reduction effects. [Fury] - Consumes ${pct(DOOM.cost)} of current HP to activate. Attacks enemies in range of target and DMG is ${fold(DOOM.fury)}.`,
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
					pace: 1 + share(k(UT$22.choker.speed))
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
			fight.hit(self, CLAW$1.blow * (fury > 0 ? CLAW$1.fury : 1), true, 0, fury > 0 && self.perks.has("t5-dark"));
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
						pace: 1 + share(DESPAIR.speed),
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
var SMITE = { blow: BLOW * 1.5 };
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
	mana: .4 * SECTION,
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
			words: `Heals ${healed("priest", LIGHT.heal)} HP of the ally with the lowest HP and nearby allies and increases Heal Rate by 20% for 10 sec. Afterward, explodes the area around the target and deals ${dmg("priest", LIGHT.blast)} M.DMG to enemies in range, reducing their Heal Rate by 20% for 10 sec. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack and dispels positive effects of all enemies within range.`,
			icon: "✴️",
			art: art$21(0),
			move: "light",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Blessing of Doom",
			about: `A shield on the ${BLESSING$1.allies} allies with the lowest health for ${BLESSING$1.lasts} seconds, their attacks ${pct(share(BLESSING$1.speed))} quicker meanwhile.`,
			words: `Grants [Blessing of Doom] to ${BLESSING$1.allies} allies with the lowest HP, absorbing ${healed("priest", BLESSING$1.shield)} DMG for ${BLESSING$1.lasts} sec. The shield grants immunity to CC and increases ATK Spd by ${BLESSING$1.speed} for the duration. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack to dispel negative effects from self and additionally dispels negative effects from targets.`,
			icon: "🔮",
			art: art$21(1),
			move: "blessing",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Heaven’s Vengeance",
			about: `${VENGEANCE.hits} blows of light on the boss, through some of its defense, each leaving it ${pct(VENGEANCE.exposed)} easier to hurt for ${VENGEANCE.lasts} seconds (up to ${VENGEANCE.most} times over). With [Darkened Power], every blow stuns it for ${VENGEANCE.stun} seconds.`,
			words: `Brings Heaven's Vengeance upon a random enemy and nearby enemies over ${VENGEANCE.hits} hits, dealing ${dmg("priest", VENGEANCE.blow)} M.DMG each hit and increasing All DMG the target takes by ${pct(VENGEANCE.exposed)} for ${VENGEANCE.lasts} sec. ${VENGEANCE.pierce} additional DEF Penetration applies to this Skill. If this Skill is used with 1 or more stacks of [Darkened Power], consumes 1 stack and inflicts Stun on the hit enemies for ${VENGEANCE.stun} sec each hit. The DMG Boost effect can be stacked up to max ${VENGEANCE.most} times.`,
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
				pace: 1 + share(PERKS$21.bond.speed),
				shown: FALLEN_BOND
			});
		}
		if (strongest && self.perks.has("t5-dark")) put(strongest.statuses, {
			name: FALLEN_FAVOUR.name,
			left: PERKS$21.favour.lasts,
			pace: 1 + share(PERKS$21.favour.speed),
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
							pace: 1 + share(BLESSING$1.speed),
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
var NUDGE = { blow: BLOW * 1.3 };
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
	dmg: .02
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
			words: `Attacks an enemy ${BITES} times, dealing ${dmg("assassin", POCHI.bite)} M.DMG and inflicting [Pochi's Mark] each hit. The M.DMG of each hit increases by ${pct(POCHI.more)} per every stack of [Mana Charge]. [Pochi's Mark] reduces target's ATK by ${pct(POCHI.weaker)} for ${POCHI.lasts} sec, and it can be stacked up to max ${POCHI.most} times. If the target is a Boss, each hit deals additional ${dmg("assassin", POCHI.boss)} M.DMG. The additional M.DMG increases by ${pct(POCHI.bossMore)} per every stack of [Mana Charge]. This skill is sealed after use.`,
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
			words: `Attacks the farthest enemy from behind, dealing ${dmg("assassin", PUCHI.blow)} M.DMG. Afterward, inflicts Stun for ${PUCHI.stun} sec and [Puchi's Mark] on the target. This skill is sealed after use.`,
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
			words: `Deals a total of ${dmg("assassin", PIPPI.blow * WRAPS)} M.DMG over ${WRAPS} times to the target and enemies within a large area around the target, inflicting [Pippi's Mark] on hit targets each hit. If this skill deals DMG to a target inflicted with ${PIPPI.most} stacks of [Pippi's Mark], each hit deals additional ${dmg("assassin", PIPPI.through)} M.DMG that ignores DEF. [Pippi's Mark] increases M.DMG the target takes by ${pct(PIPPI.takes)} for ${PIPPI.lasts} sec, and it can be stacked up to max ${PIPPI.most} times. This skill is sealed after use.`,
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
					fight.hit(self, NUDGE.blow);
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
			pace: () => tier === null ? 1 : 1 + share(atTier(PIGRITIA.speed, tier)),
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
	crit: share(DEEDS.crit),
	control: 1 + DEEDS.control,
	shown: {
		name: "End to Evil Deeds!",
		about: `Passive. Her blows are ${pct(DEEDS.atk)} harder and ${pct(share(DEEDS.crit))} more often critical, and her stuns on a boss last ${pct(DEEDS.control)} longer.`,
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
			words: `Deals ${dmg("warrior", JUDGMENT.cut * JUDGMENT.cuts)} M.DMG over ${JUDGMENT.cuts} attacks to nearby enemies in a circular range of self. Then, attacks frontal enemies in range, dealing ${dmg("warrior", JUDGMENT.blow)} M.DMG and knocking them down for ${JUDGMENT.down} sec.`,
			icon: "🌀",
			art: art$19(0),
			move: "judgment",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Disperse, Crystal Haze!",
			about: `A burst that stuns the boss for ${HAZE.stun} seconds. Then for ${HAZE.lasts} seconds she is ${pct(HAZE.quicker - 1)} quicker, and a shockwave goes out from her every ${HAZE.every} seconds that stuns it for ${HAZE.waveStun}.`,
			words: `Unleashes the power of Arcane Crystals within to deal ${dmg("warrior", HAZE.burst)} M.DMG to all enemies and stun them for ${HAZE.stun} sec. Upon casting, activates [Arcane Crystal Awakening] for ${HAZE.lasts} sec, which increases ATK Spd of all allies by 300 and releases a shockwave every ${HAZE.every} sec to enemies in range of self, dealing ${dmg("warrior", HAZE.wave)} M.DMG and stunning them for ${HAZE.waveStun} sec.`,
			icon: "💠",
			art: art$19(1),
			move: "haze",
			cooldown: 17,
			cost: 3
		},
		{
			name: "Bloom, Crimson Flower!",
			about: `Crystals in a line to the boss, then they burst: its attacks are ${pct(share(FLOWER.speed))} slower for ${FLOWER.slowed} seconds, and it is cursed for ${FLOWER.curse}. When the curse ends it bursts, the harder for every blow landed on the boss meanwhile.`,
			words: `Summons Arcane Crystals and deals ${dmg("warrior", FLOWER.line)} M.DMG to frontal enemies in a straight line. Shortly afterward, causes an explosion that deals ${dmg("warrior", FLOWER.burst)} additional M.DMG and inflicts [Arcane Crystal Curse] upon enemies for ${FLOWER.slowed} sec, reducing their ATK Spd by ${FLOWER.speed}. Attacking enemies under [Arcane Crystal Curse] inflicts a stack of [Arcane Crystal Energy]. [Arcane Crystal Curse] explodes after ${FLOWER.curse} sec, dealing M.DMG equal to ${dmg("warrior", FLOWER.end)} + ${dmg("warrior", FLOWER.each)} per stack of Arcane Crystal Energy.`,
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
var SPLASH = { blow: BLOW * 1.5 };
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
	heal: indexedHeal("priest", 35192)
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
			words: `Heals ${healed("priest", DROPLETS.heal)} HP of all allies and increases Heal Rate by ${pct(DROPLETS.heals)} for ${DROPLETS.lasts} sec. If the target's HP is ${pct(DROPLETS.low)} or below, Heal Rate increases by ${DROPLETS.lowTimes} times.`,
			icon: "💧",
			art: art$18(0),
			move: "droplets",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Bubble Shield",
			about: `A shield on the ally with the lowest health: for ${BUBBLE.lasts} seconds it takes ${pct(1 - BUBBLE.taken)} less from the boss and deals ${pct(BUBBLE.dmg)} more. While the shield holds it can’t be knocked down, hits ${pct(BUBBLE.atk)} harder and is healed every second.`,
			words: `For ${BUBBLE.lasts} sec, casts a Shield that blocks ${healed("priest", BUBBLE.shield)} DMG on the ally with the lowest HP. While the Shield is active, gains immunity to CC, increases ATK and heals ${healed("priest", BUBBLE.heal)} HP every sec. For ${BUBBLE.lasts} sec, the ally takes ${pct(1 - BUBBLE.taken)} reduced DMG from Non-Hero targets and increases DMG dealt to Non-Hero enemies by ${pct(BUBBLE.dmg)}. The DMG Reduction effect from and the DMG Boost effect to Non-Hero enemies is irremovable.`,
			icon: "🫧",
			art: art$18(1),
			move: "bubble",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Festival of the Flow",
			about: `Knocks the boss down for ${FESTIVAL.down} seconds, heals every ally ${pct(FESTIVAL.heal)} of its max HP and gives every other ally ${FESTIVAL.mana / SECTION} mana. Then for ${FESTIVAL.lasts} seconds a whirlpool every ${FESTIVAL.every} seconds strikes the boss and knocks it down for ${FESTIVAL.whirlDown}.`,
			words: `Deals ${dmg("priest", FESTIVAL.blow)} M.DMG to nearby enemies and knocks them down for ${FESTIVAL.down} sec. Upon casting, heals HP of all allies by ${pct(FESTIVAL.heal)} of their Max HP and recovers ${FESTIVAL.mana / SECTION} orbs of Mana of allies excluding self. Afterward, for ${FESTIVAL.lasts} sec, creates a whirlpool every ${FESTIVAL.every} sec that deals ${dmg("priest", FESTIVAL.whirl)} M.DMG to random enemies and knocks them down for ${FESTIVAL.whirlDown} sec.`,
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
		"s1-dark": { words: `Upon healing, M.Crit Resistance rises by ${pct(share(PERKS$18.critResist))}.` },
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
					fight.hit(self, SPLASH.blow);
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
var LASH = { blow: BLOW * 1.3 };
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
	words: `When dealing a normal attack, attacks a random enemy ${LEAF.times} times with a ${pct(LEAF.chance)} chance of inflicting ${dmg("wizard", LEAF.blow)} M.DMG and 1 stack of Poison for ${POISON.lasts} seconds. Poison inflicts a total of ${dmg("wizard", POISON.each * POISON.lasts)} M.DMG over ${POISON.lasts} seconds, reduces Heal Rate, and can be stacked up to max ${POISON.most} times. If Lorraine dies, Poison effects on enemies will disappear.`
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
			words: `Attacks ${THORNS.hits} times at random, dealing a total of ${dmg("wizard", THORNS.blow * THORNS.hits)} M.DMG to enemies in range and inflicting 1 stack of Poison with each attack.`,
			icon: "🌿",
			art: art$17(0),
			move: "thornbush",
			cooldown: 7,
			cost: 2
		},
		{
			name: "Tangled Vine",
			about: `A blow that leaves ${VINE.poison} [Poison] and shackles the boss for ${VINE.shackle} seconds (it can do nothing); ${VINE.after} seconds after, a blow the harder for each [Poison] on it.`,
			words: `Deals ${dmg("wizard", VINE.blow)} M.DMG to enemies in a straight line, stacking ${VINE.poison} Poison and shackling them for ${VINE.shackle} sec. After some time, deals ${dmg("wizard", VINE.each)} M.DMG for each Poison stack.`,
			icon: "🪢",
			art: art$17(1),
			move: "vine",
			cooldown: 10,
			cost: 3
		},
		{
			name: "Wrath of the Forest",
			about: `A blow that knocks the boss down for ${WRATH.down} seconds, ${pct(WRATH.more)} harder for each [Poison] on it.`,
			words: `Deals ${dmg("wizard", WRATH.blow)} M.DMG to enemies in range and knocks them down for ${WRATH.down} sec. Enemies inflicted by Poison takes ${pct(WRATH.more)} more DMG per every stack.`,
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
						fight.hit(self, LASH.blow);
						return;
					}
					fight.cue(self, "leaf");
					fight.hit(self, LASH.blow + LEAF.blow * LEAF.times);
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
	words: `Upon Block, deals ${dmg("knight", SMASH$1.blow)} M.DMG to enemies in range, and inflicts ${SMASH$1.flames} stack of Flame.`
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
			words: `Deals ${dmg("knight", BURNING.blow)} M.DMG to enemies in range and knocks them down, inflicting ${BURNING.flames} stacks of Flame. Then for ${BURNING.lasts} sec, each auto attack deals ${dmg("knight", CLEAVE.burning)} M.DMG and inflicts 1 stack of Flame on enemy. Per each stacked Flame, DMG is increased by ${pct(FLAME.more)}. Each Flame stack deals separate ${dmg("knight", FLAME.each)} M.DMG every second and reduces Heal rate by ${pct(FLAME.heals)}.`,
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
			words: `Deals ${dmg("knight", ERUPTION.blow)} M.DMG to enemies in range and inflict knock down. Per every stacked Flame, DMG is increased by ${pct(FLAME.more)}.`,
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
				fight.hit(self, CLEAVE.blow + CLEAVE.burning * fanning());
				burn(1);
			} else fight.hit(self, CLEAVE.blow);
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
						pace: 1 + share(PERKS$16.quicker),
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
						takes: { magical: 1 - share(less) },
						critResist: { magical: UT$16.gloves.critResist },
						shown: {
							name: "Hatchling Leather Gloves",
							about: `Takes ${pct(share(less))} less magical DMG, and is crit less.`,
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
							const defense = (self.stats.magical + bolstering(self.statuses, "magical") + bolstering(fight.party, "magical")) * defending(self.statuses, "magical") * defending(fight.party, "magical");
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
			words: `Performs a horizontal slash to the front and deals ${dmg("warrior", PETALS.blow)} M.DMG to the target and enemies in a narrow range. Can activate [Mysterious Sword - Blossom] (${BLOSSOM_SKILL.cost} Mana: a vertical slash to the front, dealing ${dmg("warrior", BLOSSOM.blow)} M.DMG to the target and enemies in a narrow range) once within ${PETALS.window} sec after use.`,
			icon: "🌸",
			art: art$15(0),
			move: "petals",
			cooldown: 7,
			cost: 1
		},
		{
			name: "Blood Scattering Blade",
			about: `A rush in with a cut that leaves [Original Sin of Blood] (the boss’s attacks ${pct(share(SCATTER.speed))} slower for ${SCATTER.lasts} seconds); then ${SCATTER.cuts} more cuts, each with a blow more through its defense.`,
			words: `Rapidly charges forward to deal ${dmg("warrior", SCATTER.rush)} M.DMG and inflicts irremovable Original Sin of Blood on enemies for ${SCATTER.lasts} sec. Enemies under Original Sin of Blood have their ATK Spd reduced by ${SCATTER.speed}. Shortly afterward, attacks enemies under Original Sin of Blood ${SCATTER.cuts} times, and deals additional ${dmg("warrior", SCATTER.cut * SCATTER.cuts)} M.DMG, and if the target is not a hero, deals additional ${dmg("warrior", SCATTER.through * SCATTER.cuts)} DEF Ignoring M.DMG.`,
			icon: "🩸",
			art: art$15(1),
			move: "scatter",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Red Moon Blade",
			about: `A great cut, harder on a boss. Used in [Moonlight] (${seconds(MOON$1.light)} of it every ${MOON$1.every} seconds): it cuts again, and the boss is healed ${pct(1 - MOON$1.heals)} less for ${MOON$1.unhealed} seconds.`,
			words: `Brandishes a moon-bloodying sword, dealing ${dmg("warrior", MOON$1.blow)} M.DMG to enemies in a wide range, and additional ${dmg("warrior", MOON$1.boss)} M.DMG on non-Hero enemies. When the moon is ripe, gains Moonlight for ${MOON$1.light} sec, and when cast at this state, deals ${dmg("warrior", MOON$1.ripe)} M.DMG to enemies and reduces their Heal Rate by ${pct(1 - MOON$1.heals)}. If the target is not a hero, deals additional ${dmg("warrior", MOON$1.ripeBoss)} M.DMG.`,
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
var BOLT = { blow: BLOW * 1.4 };
var HOLOGRAM = {
	lasts: 15,
	atk: .2,
	crit: .2,
	heal: 13840,
	cooldown: .2
};
var FIELD = {
	lasts: 5,
	defense: 1.15,
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
			words: `Dispels negative effects from the ally with the highest ATK and grants [Hologram] for ${HOLOGRAM.lasts} sec. [Hologram] increases the target’s ATK, Crit Chance, heals ${healed("mechanic", HOLOGRAM.heal)} HP every sec, and reduces its Cooldown of all active Skills by ${HOLOGRAM.cooldown} sec. While [Hologram] is active, the target gains immunity to negative effects.`,
			icon: "💠",
			art: art$14(0),
			move: "prototype",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Absolute Protection Field – LA",
			about: `A field for ${FIELD.lasts} seconds that reaches every ally: ${pct(FIELD.defense - 1)} more defense, can’t be knocked down, and healed and given mana every second.`,
			words: `Creates an [Violet Force Field] that lasts for ${FIELD.lasts} sec within a wide range of self. Allies within the range of [Violet Force Field] have their All DEF increased by ${pct(FIELD.defense - 1)}, gain immunity to CC, and have ${healed("mechanic", FIELD.heal)} HP healed and Mana recovered every sec.`,
			icon: "🟣",
			art: art$14(1),
			move: "field",
			cooldown: 20,
			cost: 5
		},
		{
			name: "Ultimate Laser Cannon – NCE",
			about: `A laser that stuns the boss for ${CANNON.stun} seconds, then ${CANNON.lasers} more, each stunning it for ${CANNON.laserStun}; each leaves it [Manipulated] for ${CANNON.lasts} seconds (up to ${CANNON.most} times over): taking ${pct(CANNON.takes)} more and healed ${pct(CANNON.heals)} less.`,
			words: `Summons laser cannons behind self that fire laser beams, dealing ${dmg("mechanic", CANNON.blow)} P.DMG to the enemy. The hit target is inflicted with Stun for ${CANNON.stun} sec and becomes [Manipulated] for ${CANNON.lasts} sec. Afterward, the cannons additionally fire a total of ${CANNON.lasers} laser beams to random enemies. Each laser beam deals ${dmg("mechanic", CANNON.laser)} P.DMG, inflicts Stun on the hit target for ${CANNON.laserStun} sec, and inflicts [Manipulated] for ${CANNON.lasts} sec. Enemies who are [Manipulated] have their Heal Rate reduced by ${pct(CANNON.heals)} and take ${pct(CANNON.takes)} increased All DMG. [Manipulated] can be stacked up to max ${CANNON.most} times.`,
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
		"t5-light": t5Light({ speed: 100 }, ({ speed }) => `ATK Spd +${pct(share(speed))}`),
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
					fight.hit(self, BOLT.blow);
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
						...self.perks.has("s2-dark") && { pace: 1 + share(PERKS$14.fieldSpeed) },
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
var HAVOC = { blow: BLOW * 1.3 };
/** Each of the four blows of his fist fight (his attack's animation): his attack about as hard over time as Havoc's. */
var FIST$3 = { blow: BLOW * .76 };
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
	words: `Reduces All DMG taken by ${pct(1 - ARMOR$1.taken)} and the duration of CC by ${pct(1 - ARMOR$1.held)}. Upon every Skill use, creates [Authority of the Demon God] that absorbs ${healed("wizard", ARMOR$1.shield)} DMG for ${ARMOR$1.lasts} sec. Gains immunity to CC for the duration of [Authority of the Demon God].`
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
			words: `Attacks the target and nearby enemies ${STORM.hits} times, dealing a total of ${dmg("wizard", STORM.blow * STORM.hits)} M.DMG and leaving a [Shadow of Death]. [Shadow of Death] deals ${dmg("wizard", SHADOW.each * SHADOW.lasts)} M.DMG and reduces the target's Heal Rate by ${pct(1 - SHADOW.heals)} over ${SHADOW.lasts} sec.`,
			icon: "🌪️",
			art: art$13(0),
			move: "storm",
			cooldown: 13,
			cost: 2
		},
		{
			name: "Annihilation Wave",
			about: `A blow that stuns the boss for ${WAVE.stun} seconds, and a blow more. Used, this slot holds [Annihilation Surge].`,
			words: `Attacks frontal enemies within range 2 times. The first attack deals ${dmg("wizard", WAVE.blow)} M.DMG and inflicts Stun for ${WAVE.stun} sec. The second attack deals ${dmg("wizard", WAVE.blow)} M.DMG and draws in hit targets in front of self. After use, the Skill changes to [Annihilation Surge].`,
			icon: "🌊",
			art: art$13(1),
			move: "wave",
			cooldown: 13,
			cost: 3
		},
		{
			name: "Doomsday",
			about: `${DOOMSDAY.hits} blows, the last knocking the boss down for ${DOOMSDAY.down} seconds and leaving [Pain of Doom] on it for ${PAIN.lasts}: each blow of his on it meanwhile deals more.`,
			words: `Attacks nearby enemies ${DOOMSDAY.hits} times, dealing ${dmg("wizard", DOOMSDAY.blow)} M.DMG each, and draws them in front of self. The last hit deals ${dmg("wizard", DOOMSDAY.last)} more M.DMG, knocks down hit targets for ${DOOMSDAY.down} sec, and leaves [Pain of Doom] that lasts for ${PAIN.lasts} sec. Each time Lucikiel attacks targets inflicted with [Pain of Doom] with a normal or Skill attack, he deals additional ${dmg("wizard", PAIN.blow)} M.DMG.`,
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
					fight.hit(self, HAVOC.blow);
				},
				attack() {
					fight.hit(self, FIST$3.blow);
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
var ARROW = { blow: BLOW * 1.3 };
/** Her arrow when she draws it as her attack's animation has it (quicker than as written in code): her attack about as hard over time. */
var DRAWN$1 = { blow: BLOW * 1.06 };
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
	most: 3
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
	words: `Upon attacking, increases ATK by ${num(MOON.atk)} and Crit Chance by ${MOON.crit} for ${MOON.lasts} sec. This effect stacks up to ${MOON.most} times.`
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
			words: `Shoots ${RAIN.arrows} arrows to random enemies and deals a total of ${dmg("archer", RAIN.blow * RAIN.arrows)} P.DMG.`,
			icon: "🏹",
			art: art$12(0),
			move: "rain",
			cooldown: 8,
			cost: 3
		},
		{
			name: "Rush",
			about: `${RUSH.arrows} arrows that launch at the boss.`,
			words: `Upon attacking, summons ${RUSH.arrows} arrows that launch towards the enemy. Each arrow deals ${dmg("archer", RUSH.blow)} P.DMG.`,
			icon: "💨",
			art: art$12(1),
			move: "rush",
			cooldown: 6,
			cost: 1
		},
		{
			name: "Moonlight Flash",
			about: `An arrow the harder the more of the boss’s health is left, knocking it down for ${FLASH.down} seconds, and a blow more through its defense.`,
			words: `Fires an arrow in a straight line, dealing P.DMG to all enemies in range based on the target's remaining HP. Deals a maximum of ${dmg("archer", FLASH.most)} P.DMG and knocks down the target. Against Bosses, deals additional ${dmg("archer", FLASH.boss)} P.DMG that ignores DEF.`,
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
				crit: share(MOON.crit * moon),
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
				arrow: () => loose(ARROW.blow),
				attack: () => loose(DRAWN$1.blow),
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
var SNIPE = { blow: BLOW * 1.3 };
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
			words: `Deals a total of ${dmg("mechanic", ELIMINATE.blow * ELIMINATE.shots)} P.DMG to enemies in front over ${ELIMINATE.shots} times and leaves ${ELIMINATE.marks} 'Hunting Dog's Fang Marks' for ${FANG.lasts} sec. Hunting Dog's Fang Mark stacks up to max ${FANG.most} times.`,
			icon: "🔫",
			art: art$11(0),
			move: "eliminate",
			cooldown: 10,
			cost: 2
		},
		{
			name: "Struggle is Meaningless.",
			about: `${STRUGGLE.shots} shots, then a Frost Bullet that freezes the boss for ${STRUGGLE.freeze} seconds and leaves a freezing area under it for ${STRUGGLE.area}: every ${STRUGGLE.every} seconds it strikes, with a ${pct(STRUGGLE.chance)} chance to freeze the boss for ${STRUGGLE.chilled}.`,
			words: `Attacks a random enemy ${STRUGGLE.shots} times and deals a total of ${dmg("mechanic", STRUGGLE.blow * STRUGGLE.shots)} P.DMG. Shoots a Frost Bullet that deals ${dmg("mechanic", STRUGGLE.frost)} P.DMG to target and surrounding enemies, freezing them for ${STRUGGLE.freeze} sec. The special Frost Bullet creates a freezing area for ${STRUGGLE.area} seconds that deals ${dmg("mechanic", STRUGGLE.chill)} P.DMG every ${STRUGGLE.every} sec, with a ${pct(STRUGGLE.chance)} chance to freeze for ${STRUGGLE.chilled} sec.`,
			icon: "❄️",
			art: art$11(1),
			move: "struggle",
			cooldown: 15,
			cost: 3
		},
		{
			name: "Even Gods shall Die.",
			about: `He focuses, then a laser, harder for each [Hunting Dog’s Fang Mark] on the boss (all of them spent), and ${pct(GODS.focus - 1)} harder for his focus.`,
			words: `Takes position and focuses to shoot a laser, dealing ${dmg("mechanic", GODS.blow)} P.DMG to frontal enemies within range, and consumes target's stack of Hunting Dog's Fang Mark to deal additional ${dmg("mechanic", GODS.each)} P.DMG per each stack. Depending on the focusing time, the effect's range increases, and DMG is increased up to max ${pct(GODS.focus - 1)}. Once the focus is completed, knocks back the enemy far away.`,
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
					fight.hit(self, SNIPE.blow);
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
var CHIME = { blow: BLOW * 1.3 };
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
	words: `Upon using the skill, next ${CLOCK.attacks} attacks deal additional ${dmg("mechanic", CLOCK.blow)} M.DMG with a ${pct(CLOCK.chance)} chance to petrify the target for ${CLOCK.petrify} sec. This effect activates every ${CLOCK.every} sec.`
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
			words: `Deals ${dmg("mechanic", FRACTURE.blow)} M.DMG to enemies in a straight line, and inflicts Petrify for ${FRACTURE.petrify} sec.`,
			icon: "⌛",
			art: art$10(0),
			move: "fracture",
			cooldown: 7,
			cost: 2
		},
		{
			name: "Time Fragments",
			about: `${FRAGMENTS.hits} blows. ${pct(FRAGMENTS.chance)} of the time, it is ready again at once and costs nothing the next time.`,
			words: `Attacks random enemies ${FRAGMENTS.hits} times, dealing a total of ${dmg("mechanic", FRAGMENTS.blow * FRAGMENTS.hits)} M.DMG. With ${pct(FRAGMENTS.chance)} chance, 'Time Fragments' cooldown resets and consumes no mana for the next single activation.`,
			icon: "🧩",
			art: art$10(1),
			move: "fragments",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Time Distortion",
			about: `A blow; every ally +${DISTORTION.speed} attack speed for ${DISTORTION.lasts} seconds, and what is left of every ally’s cooldowns halved.`,
			words: `Deals ${dmg("mechanic", DISTORTION.blow)} M.DMG to all enemies and increases all allies' ATK Spd by ${DISTORTION.speed} for ${DISTORTION.lasts} sec. All allies' skill cooldown is reduced by ${pct(DISTORTION.cooldowns)}. 'Time Distortion' is not affected by skill cooldown reduction.`,
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
					fight.hit(self, CHIME.blow);
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
							pace: 1 + share(DISTORTION.speed),
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
var HEW = { blow: BLOW * 1.2 };
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
	most: 5
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
	words: `Upon attacking, weakens enemy P.DEF by ${num(ARMOR.defense)} for ${ARMOR.lasts} sec. Can be stacked up to ${ARMOR.most} times max.`
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
			words: `Deals ${dmg("knight", COLLISION.blow)} P.DMG and knocks down the enemy for ${COLLISION.down} sec.`,
			icon: "💥",
			art: art$9(0),
			move: "collision",
			cooldown: 12,
			cost: 3
		},
		{
			name: "Headbutt",
			about: `A dash and a blow: the boss’s attacks ${pct(HEADBUTT.speed / POINTS)} slower for ${HEADBUTT.slowed} seconds.`,
			words: `Dashes toward the enemy and deals ${dmg("knight", HEADBUTT.blow)} P.DMG, knocking them back. Hit enemy's Attack Spd is reduced by ${pct(HEADBUTT.speed / POINTS)} for ${HEADBUTT.slowed} sec.`,
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
			fight.hit(self, HEW.blow);
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
var TALON = { blow: BLOW * 1.2 };
/** Each of the four blows of her fist fight (her attack's animation): her attack about as hard over time as her talons'. */
var FIST$2 = { blow: BLOW * .78 };
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
	words: `Every ${nth(TORNADO$1.every)} normal attack has a ${pct(TORNADO$1.chance)} chance to deal additional ${dmg("warrior", TORNADO$1.blow)} P.DMG to the target. The target takes ${pct(TORNADO$1.takes - 1)} increased P.DMG for ${TORNADO$1.lasts} sec and is knocked down for ${TORNADO$1.down} sec.`
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
			words: `Dashes toward the enemy 2 times, dealing ${dmg("warrior", WINDS.blow * CODED.winds.lands.length)} P.DMG to enemies in range, knocking them down for ${WINDS.down} sec. If the target is not a Hero, deals additional ${dmg("warrior", WINDS.boss * CODED.winds.lands.length)} P.DMG.`,
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
			words: `Flies up and strikes ${dmg("warrior", DIVE.blow)} P.DMG to enemies in range. Knocked down enemies take ${pct(DIVE.downed - 1)} increased DMG. If the target is not a Hero, deals additional ${dmg("warrior", DIVE.boss)} P.DMG.`,
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
				pace: 1 + share(PERKS$8.speed),
				shown: WHIRLED
			});
		};
		return {
			lands: {
				talon: () => attack(TALON.blow),
				attack: () => attack(FIST$2.blow),
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
var SHOT = { blow: BLOW * 1.3 };
/** Her arrow when she draws it as her attack's animation has it (quicker than as written in code): her attack about as hard over time. */
var DRAWN = { blow: BLOW * 1.06 };
/** Focus Shot!'s arrow, and how many times as hard it is focused (she always focuses as long as she can). */
var FOCUS = {
	blow: indexed("archer", 179237),
	focused: 2
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
			about: `An arrow, focused on as long as she can (its DMG doubled).`,
			words: `Taking up a stance, focuses for a while and deals ${dmg("archer", FOCUS.blow)} P.DMG to enemies in a straight line. If the target is a dragon, inflicts Stun for 3 sec. The longer she focuses, DMG and Stun duration are increased by 100%.`,
			icon: "🎯",
			art: art$7(0),
			move: "focus",
			cooldown: 9,
			cost: 2
		},
		{
			name: "Wipeout!",
			about: "A great arrow at the boss.",
			words: `Deals ${dmg("archer", WIPEOUT.blow)} P.DMG to target enemy and other enemies in range. If the target is a Dragon, deals extra DMG that ignores DEF.`,
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
				shot: () => loose(SHOT.blow),
				attack: () => loose(DRAWN.blow),
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
						...self.perks.has("s3-light") && { pace: 1 + share(PERKS$7.speed) },
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
var MAW = { blow: BLOW * 1.2 };
/** His fist as his attack's animation has it (four blows, quicker than as written in code): his attack about as hard over time. */
var FIST$1 = { blow: BLOW * .76 };
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
			words: `Draws enemies towards the target and deals ${dmg("knight", CLAW.blow)} M.DMG. Deals ${dmg("knight", CLAW.after)} M.DMG around the target after 1 sec and stuns them for ${CLAW.stun} sec. Reduces ATK Spd of hit enemies by ${CLAW.speed} for ${CLAW.slowed} sec.`,
			icon: "⚡",
			art: art$6(0),
			move: "lightning",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Obsidian Roar",
			about: `Every ally +${num(ROAR$1.more)} ATK, P.DEF and M.DEF for ${ROAR$1.lasts} seconds; a blow, and the boss’s ATK ${pct(ROAR$1.weaker)} lower meanwhile.`,
			words: `Increases ATK, P.DEF, and M.DEF of all allies by ${num(ROAR$1.more)} for ${ROAR$1.lasts} sec. Deals ${dmg("knight", ROAR$1.blow)} M.DMG to all enemies and reduces their ATK by ${pct(ROAR$1.weaker)} for ${ROAR$1.lasts} sec.`,
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
			words: `Deals a total of ${dmg("knight", BREATH.blow * CODED.breath.lands.length)} M.DMG to enemies within a large area around the target over 6 times and reduces their M.DEF by ${pct(BREATH.weaker)} for ${BREATH.lasts} sec. Each hit stuns the enemy for ${BREATH.stun} sec.`,
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
				maw: () => attack(MAW.blow),
				attack: () => attack(FIST$1.blow),
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
var DRAIN = { blow: BLOW * 1.2 };
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
			words: `Deals ${dmg("assassin", SWEET.blow)} P.DMG to all enemies and steals HP equal to ${pct(SWEET.steals)} of DMG dealt. Reduces Cooldown of [Sweet Blood] by ${SWEET.sooner} sec on each hit, and gains 1 stack of [Sweet Blood]. [Sweet Blood] can be stacked up to ${SWEET.most} times, and using the skill with ${SWEET.most} stacks of [Sweet Blood] grants additional hits and removes [Sweet Blood] stacks.`,
			icon: "🩸",
			art: art$5(0),
			move: "sweet",
			cooldown: 5,
			cost: 2
		},
		{
			name: "Soaking Blood",
			about: `For ${SOAK.lasts} seconds nothing touches her and she can’t be knocked down; after ${SOAK.after}, a blow on the boss that steals ${pct(SOAK.steals)} of what it deals (a blow more for every ${SOAK.per} stacks of it).`,
			words: `Dispels all negative effects and gains immunity to all CCs, P.DMG, and M.DMG for ${SOAK.lasts} sec. Inflicts 1 stack of [Soaking Blood] on all enemies, and additional 1 stack upon attacking a target with [Soaking Blood]. [Soaking Blood] can be stacked up to ${SOAK.most} times. Deals ${dmg("assassin", SOAK.blow)} P.DMG to enemies with [Soaking Blood] stacks after ${SOAK.after} sec, and steals HP equal to ${pct(SOAK.steals)} of the DMG dealt. For every ${SOAK.per} stack(s) of [Soaking Blood], hit count increases by 1 and removes [Soaking Blood] stacks upon attacking.`,
			icon: "🛡️",
			art: art$5(1),
			move: "soak",
			cooldown: 35,
			cost: 2
		},
		{
			name: "Blood Liberation",
			about: `For ${LIBERATION.lasts} seconds, every second a blow and a blow more.`,
			words: `Deals ${dmg("assassin", LIBERATION.blow)} P.DMG to all enemies every ${LIBERATION.every} sec for ${LIBERATION.lasts} sec. Each hit of [Blood Liberation] causes an additional hit on 1 random enemy.`,
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
					pace: 1 + share(PERION.speed * greed),
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
				drain: () => attack(DRAIN.blow),
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
var THRUST = { blow: BLOW * 1.2 };
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
	words: `Stacks [Endurance] every second. [Endurance] cannot be dispelled, and when stacked ${GATEKEEPER.most} times, deals ${dmg("knight", GATEKEEPER.blow)} P.DMG, ignoring DEF on nearby enemies and reduces ATK of affected enemies by ${pct(GATEKEEPER.weaker)} for ${GATEKEEPER.lasts} second(s). A successful block grants 1 additional [Endurance] stack. This effect is activated only once every ${GATEKEEPER.every} second(s).`
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
			words: `Deals ${dmg("knight", CUT.blow)} P.DMG to frontal enemies within range and knocks them down for ${CUT.down} sec, increasing P.Weakness of the affected targets by ${pct(CUT.weakness)} for ${CUT.lasts} sec.`,
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
			words: `Hits frontal enemies within range 3 times. First 2 hits deal ${dmg("knight", CREED.blow * 2)} P.DMG and stun enemies for ${CREED.stun} second(s) while the last hit attacks enemies in wider range 2 times, dealing ${dmg("knight", CREED.last)} P.DMG in total. The last hit stuns enemies for ${CREED.lastStun} seconds and leaves [Mark of Creed] on the enemies, damaging them for ${CREED.lasts} second(s). Targets with [Mark of Creed] take additional ${dmg("knight", CREED.mark)} P.DMG from allies excluding caster. Additional DMG effect is activated only once every ${CREED.every} second(s).`,
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
			lands: {
				thrust: () => fight.hit(self, THRUST.blow),
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
var CHOP = { blow: BLOW * 1.2 };
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
	most: 10
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
	words: `Upon attacking, increases ATK by ${num(ENRAGE.atk)} for ${ENRAGE.lasts} sec, and DMG to Non-Hero enemies by ${pct(ENRAGE.dmg)}. This effect can be stacked up to max ${ENRAGE.most} times.`
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
			words: `Deals ${dmg("warrior", SMASH.blow * CODED.smash.lands.length)} P.DMG to enemies within range, and the first attack knocks them down for ${SMASH.down} sec and reduces their ATK Spd by ${SMASH.speed} for ${SMASH.slowed} sec.`,
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
			words: `Deals ${dmg("warrior", VORTEX.blow * CODED.vortex.lands.length)} P.DMG to nearby enemies. If the target is not a Hero, deals P.DMG. The last attack freezes nearby enemies for ${VORTEX.freeze} sec. Gains immunity to CC for the duration of Skill.`,
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
				...fury && { crit: share(PERKS$3.fury.crit * rage) },
				...bracelet > 0 && rage >= most && { pen: bracelet },
				shown: RAGING
			});
		};
		/** A blow of his: with Enrage's Dark, he steals a share of what it deals for each stack. */
		const strike = (amount, counted = true) => {
			const before = self.dealt;
			const critical = fight.hit(self, amount, counted);
			if (self.perks.has("s4-dark") && rage > 0) fight.heal(self, (self.dealt - before) * share(PERKS$3.fury.lifesteal * rage));
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
				chop: () => chop(CHOP.blow),
				attack: () => chop(CHOP.blow),
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
							...self.perks.has("s2-dark") && { pace: 1 + share(PERKS$3.speed) },
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
var KATAR = { blow: BLOW * .65 };
/** Her katars as her attack's animation has it (four blows, quicker than as written in code): her attack about as hard over time. */
var FIST = { blow: BLOW * .7 };
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
	words: `Deals additional ${dmg("assassin", AMBUSH.blow)} P.DMG to the enemy and silences them for 1 sec upon a Critical Hit with the skill. If the target is not a Hero, deals additional ${dmg("assassin", AMBUSH.boss)} P.DMG that ignores DEF and reduces the target's ATK Spd by ${AMBUSH.speed} for ${AMBUSH.slowed} sec.`
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
			words: `Moves behind the enemy with the lowest P.DEF and increase their P.DMG taken by ${pct(SIGHTED.takes - 1)}, while knocking them down and inflicting ${dmg("assassin", SIGHTED.blow)} P.DMG. If in a Stealth state, stun said enemy for ${SIGHTED.stun} sec. If not, gain Stealth for ${STEALTH.lasts} sec. While in a Stealth State, Crit Rate and Dodge Rate rises by ${STEALTH.crit}.`,
			icon: "🎯",
			art: art$2(0),
			move: "sighted",
			cooldown: 8,
			cost: 2
		},
		{
			name: "Blade Tornado",
			about: `Three blows, each a stack of Bleed on the boss (in Stealth: it is healed ${pct(1 - TORNADO.heals)} less for ${TORNADO.lasts} seconds, her Stealth spent; else, Stealth).`,
			words: `Attacks nearby enemies 3 times and deals a total of ${dmg("assassin", TORNADO.blow * CODED.tornado.lands.length)} P.DMG, inflicting 1 stack of Bleed per each hit. If used in a Stealth state, target's heal rate is reduced by ${pct(1 - TORNADO.heals)}, and Stealth is dispelled. If not, turns into Stealth mode for ${STEALTH.lasts} sec. [Stealth] Crit Rate and Dodge Rate are increased by ${STEALTH.crit}.`,
			icon: "🌪️",
			art: art$2(1),
			move: "tornado",
			cooldown: 14,
			cost: 2
		},
		{
			name: "Whisper of Death",
			about: "Six blows and a seventh (out of Stealth: Stealth).",
			words: `Attacks random enemies 6 times and deals a total of ${dmg("assassin", WHISPER.blow * (CODED.whisper.lands.length - 1))} P.DMG, then deals one additional attack of ${dmg("assassin", WHISPER.last)} extra P.DMG. If used in Stealth state, dispels all enemies' buffs. If not, turns into Stealth mode for ${STEALTH.lasts} sec. [Stealth] Crit Rate and Dodge Rate are increased by ${STEALTH.crit}.`,
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
				crit: share(STEALTH.crit),
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
				katar: () => attack(KATAR.blow),
				attack: () => attack(FIST.blow),
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
var REND = { blow: BLOW * 1.2 };
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
	crit: share(GALICTA_POWER.crit),
	control: 1,
	shown: {
		name: "Power of Galicta",
		about: `Passive. +${GALICTA_POWER.crit} crit chance; with ${num(GALICTA_POWER.whole)} penetration or more, his blows go through all of the boss’s defense. A blow of his attack deals a blow more and leaves [Curse of Galicta] on the boss for ${GALICTA_POWER.lasts} seconds (not the blow more while it is on).`,
		icon: "🗡️",
		art: art$1(3)
	},
	words: `Rebel Klaus is not affected by Block stats, but his Crit Chance increases by ${GALICTA_POWER.crit}, and when his DEF Penetration reaches ${num(GALICTA_POWER.whole)} or above, all of his attacks ignore the target's DEF. Additionally, his normal attack deal additional ${dmg("warrior", GALICTA_POWER.blow)} P.DMG to all enemies and inflict [Curse of Galicta] upon them for ${GALICTA_POWER.lasts} sec. If the target is already inflicted with [Curse of Galicta], the target won't take additional DMG.`
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
			words: `Deals ${dmg("warrior", DETERMINED.blow)} P.DMG to frontal enemies within range and inflicts Stun for ${DETERMINED.stun} sec. If the target is a boss, deals additional ${dmg("warrior", DETERMINED.boss)} P.DMG.`,
			icon: "⚔️",
			art: art$1(0),
			move: "determined",
			cooldown: 7,
			cost: 3
		},
		{
			name: "Indomitable Will",
			about: `A blow, and [Indomitable Will] for ${WILL.lasts} seconds: ATK Spd +${WILL.speed}, and what knocks him down holds him ${pct(WILL.held)} as long.`,
			words: `Deals ${dmg("warrior", WILL.blow)} P.DMG to nearby enemies, entering into the irremoveable state [Indomitable Will] for ${WILL.lasts} sec. While in [Indomitable Will] state, ATK Spd is increased by ${WILL.speed} and the duration of CC inflicted upon self is reduced by ${pct(1 - WILL.held)}.`,
			icon: "🔥",
			art: art$1(1),
			move: "indomitable",
			cooldown: 18,
			cost: 2
		},
		{
			name: "Perish.",
			about: `Blows on the boss one after another, and a last that knocks it down for ${PERISH.down} seconds.`,
			words: `Attacks a random enemy 6 times, dealing ${dmg("warrior", PERISH.blow)} P.DMG each hit. Afterward, delivers an additional attack that deals ${dmg("warrior", PERISH.last)} P.DMG to nearby enemies and knocks them down for ${PERISH.down} sec.`,
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
			strike(REND.blow);
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
var CORRUPT = { blow: BLOW * .6 };
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
				words: `Attacks frontal enemies in a straight line 2 times, dealing ${dmg("warrior", JUDGE.blow)} P.DMG each and preventing enemies from recovering Mana for 2 seconds. [Dark Lord] Additionally attacks enemies in a wide range 1 time, dealing ${dmg("warrior", JUDGE.lord)} P.DMG and knocking them down for ${JUDGE.down} seconds. Requires ${FALLEN.needs[0]} or more stacks of [Dark Energy] for use.`,
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
				words: `Explodes darkness and attacks frontal enemies in a straight line 3 times, dealing ${dmg("warrior", RUIN.blow)} P.DMG each and knocking them away for ${RUIN.down} seconds. [Dark Lord] Deals ${dmg("warrior", RUIN.lord)} P.DMG to 1 enemy furthest away and pulls them in front of self, exploding darkness afterward. Can be used with ${FALLEN.needs[1]} or more stacks of [Dark Energy].`,
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
				words: `Dispels negative effects from self and enters into an irremovable [Dark Lord] state for ${ADVENT.lasts} sec, dealing ${dmg("warrior", ADVENT.blow)} P.DMG to nearby enemies in a circular range of self. During [Dark Lord] state, all Skills are enhanced, gains immunity to CC, and normal attacks deal additional ${dmg("warrior", ADVENT.blowMore)} P.DMG each hit. Requires ${FALLEN.needs[2]} or more stacks of [Dark Energy] for use. Upon use, consumes all stacks to increase own ATK, and DEF Penetration by ${ADVENT.pen} per stack.`,
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
						strike(CORRUPT.blow * harder);
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
var SIM_VERSION = "b8b93ab4769a";
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
var STEP_SECONDS = TICK;
var MOST_TICKS = Math.ceil(232 / TICK) + 1;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
var MOST_INPUTS = 2e4;
var MOST_STAGE = 8;
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
		const perks = Array.isArray(hero.perks) ? hero.perks.filter((id) => typeof id === "string") : [];
		const ut = hero.ut && typeof hero.ut.skill === "number" && typeof hero.ut.tier === "number" ? {
			skill: hero.ut.skill,
			tier: hero.ut.tier
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
			ut
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
export { BOSS_IDS, MOST_INPUTS, MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, SIM_VERSION, STEP_SECONDS, TM_HEROES, TM_SET_INFO, TM_SKILLS, UNIQUE_WEAPON_HEROES, readInputs, replay, startRaid, tmPerkStats, uniqueTreasureText, uniqueWeaponText };
