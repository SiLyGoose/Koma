import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOADOUTS, TEXT } from '../src/constants/index.js';
import {
  activeLoadoutOf,
  checkLoadoutName,
  findLoadout,
  loadoutCopyIds,
  loadoutName,
  loadoutsOf,
  LOADOUT_NUMBERS,
  type LoadoutFields,
} from '../src/lib/game/loadouts.js';
import { refinePlan } from '../src/lib/game/refine.js';

const member: LoadoutFields = {
  activeLoadout: 2,
  equipment: { weapon: 'w-active', armor: null },
  loadouts: {
    '1': { name: 'Raid Tank', equipment: { weapon: 'w-tank', armor: 'a-tank' } },
    // A stale copy left on the active loadout is ignored: its gear is `equipment`.
    '2': { name: 'Robber', equipment: { weapon: 'stale' } },
  },
};

test('loadouts: numbered 1 to LOADOUTS.count, loadout 1 active when nothing (or nonsense) is stored', () => {
  assert.deepEqual(LOADOUT_NUMBERS, Array.from({ length: LOADOUTS.count }, (_, i) => i + 1));
  assert.equal(activeLoadoutOf(null), 1);
  assert.equal(activeLoadoutOf({}), 1);
  assert.equal(activeLoadoutOf({ activeLoadout: 99 }), 1);
  assert.equal(activeLoadoutOf({ activeLoadout: null }), 1);
  assert.equal(activeLoadoutOf(member), 2);
});

test('loadouts: unnamed ones get "Loadout <n>", and the active one holds what is worn', () => {
  assert.equal(loadoutName(member, 1), 'Raid Tank');
  assert.equal(loadoutName(member, 3), 'Loadout 3');
  assert.equal(loadoutName({ loadouts: { '3': { name: null } } }, 3), 'Loadout 3');

  const views = loadoutsOf(member);
  assert.deepEqual(views.map((view) => [view.number, view.name, view.active]), [
    [1, 'Raid Tank', false],
    [2, 'Robber', true],
    [3, 'Loadout 3', false],
  ]);
  assert.deepEqual(views[1]?.equipment, { weapon: 'w-active', armor: null });
  assert.equal(views[2]?.equipment, null);
  // A member who never touched loadouts has their gear in loadout 1.
  assert.deepEqual(loadoutsOf({ equipment: { weapon: 'w' } })[0]?.equipment, { weapon: 'w' });
});

test('loadouts: every copy in any loadout is kept from selling and refining, but not stale ones', () => {
  assert.deepEqual([...loadoutCopyIds(member)].sort(), ['a-tank', 'w-active', 'w-tank']);
  assert.deepEqual([...loadoutCopyIds(null)], []);
});

test('findLoadout: by number, exact name, or a part of a name that points to just one', () => {
  const views = loadoutsOf(member);
  assert.deepEqual(findLoadout(views, '3'), { kind: 'found', number: 3 });
  assert.deepEqual(findLoadout(views, '4'), { kind: 'none' });
  assert.deepEqual(findLoadout(views, 'raid tank'), { kind: 'found', number: 1 });
  assert.deepEqual(findLoadout(views, 'ROBBER'), { kind: 'found', number: 2 });
  assert.deepEqual(findLoadout(views, 'tank'), { kind: 'found', number: 1 });
  assert.deepEqual(findLoadout(views, 'loadout 3'), { kind: 'found', number: 3 });
  assert.deepEqual(findLoadout(views, 'nope'), { kind: 'none' });
  assert.deepEqual(findLoadout(views, '  '), { kind: 'none' });
  const twins = loadoutsOf({ loadouts: { '1': { name: 'Rob A' }, '2': { name: 'Rob B' } } });
  assert.deepEqual(findLoadout(twins, 'rob'), { kind: 'ambiguous', names: ['Rob A', 'Rob B'] });
});

test('checkLoadoutName: tidies spaces, and empty (or the default itself) means the default name', () => {
  assert.deepEqual(checkLoadoutName(member, 3, '  Gacha   Luck '), { ok: true, name: 'Gacha Luck' });
  assert.deepEqual(checkLoadoutName(member, 3, ''), { ok: true, name: null });
  assert.deepEqual(checkLoadoutName(member, 3, 'Loadout 3'), { ok: true, name: null });
  // Renaming a loadout to its own current name is fine.
  assert.deepEqual(checkLoadoutName(member, 1, 'raid tank'), { ok: true, name: 'raid tank' });
});

test('checkLoadoutName: refuses long names, markdown and mentions, names without letters, command words and clashes', () => {
  assert.deepEqual(checkLoadoutName(member, 3, 'x'.repeat(LOADOUTS.maxNameLength + 1)), { ok: false, reason: 'too_long' });
  assert.ok(checkLoadoutName(member, 3, 'x'.repeat(LOADOUTS.maxNameLength)).ok);
  for (const bad of ['**bold**', '@everyone', '<@123>', '`code`', 'a_b', 'spoiler||']) {
    assert.deepEqual(checkLoadoutName(member, 3, bad), { ok: false, reason: 'bad_characters' }, bad);
  }
  assert.deepEqual(checkLoadoutName(member, 3, '42'), { ok: false, reason: 'no_letters' });
  assert.deepEqual(checkLoadoutName(member, 3, '!!!'), { ok: false, reason: 'no_letters' });
  assert.deepEqual(checkLoadoutName(member, 3, 'List'), { ok: false, reason: 'reserved' });
  assert.deepEqual(checkLoadoutName(member, 3, 'rename'), { ok: false, reason: 'reserved' });
  assert.deepEqual(checkLoadoutName(member, 3, 'Raid-Tank'), { ok: false, reason: 'taken', number: 1 });
  // Another loadout's default name is taken too, or switching by it would be ambiguous.
  assert.deepEqual(checkLoadoutName(member, 1, 'Loadout 3'), { ok: false, reason: 'taken', number: 3 });
  assert.ok(checkLoadoutName(member, 3, "Tank's Rock & Roll!").ok);
});

test('refine plan: raises a copy saved in a loadout over a better loose one, and never uses one up', () => {
  const at = (n: number) => new Date(2026, 0, n);
  const copy = (_id: string, level: number, obtained: number) => ({ _id, level, obtainedAt: at(obtained) });
  const saved = copy('saved', 2, 1);
  const best = copy('best', 4, 2);
  const spare = copy('spare', 1, 3);

  const plan = refinePlan([best, saved, spare], new Set(), new Set(['saved']));
  assert.ok(plan.ok);
  assert.equal(plan.target._id, 'saved');
  assert.equal(plan.fodder._id, 'spare');

  // Worn beats saved, and a saved copy is never the one used up.
  const worn = refinePlan([saved, best, spare], new Set(['best']), new Set(['best', 'saved']));
  assert.ok(worn.ok);
  assert.equal(worn.target._id, 'best');
  assert.equal(worn.fodder._id, 'spare');
  assert.deepEqual(refinePlan([saved, best], new Set(['best']), new Set(['best', 'saved'])), { ok: false, reason: 'no_duplicate', level: 4 });
});

test('loadout text: the switch message names the gear, or explains an empty loadout', () => {
  assert.equal(TEXT.loadout.switched('k!', 'Robber', ['Starfall Blade', 'Frog']), "Switched to **Robber**. You're now wearing **Starfall Blade**, **Frog**.");
  assert.match(TEXT.loadout.switched('k!', 'Loadout 3', []), /empty/);
});

test('loadout buttons: one for every loadout not in use, empty or not, named after it', async () => {
  const { buttonRows } = await import('../src/commands/loadout.js');
  const view = (number: number, name: string, active: boolean, gear = {}) => ({ number, name, active, equipment: null, gear });
  const buttons = (rows: ReturnType<typeof buttonRows>) =>
    rows.flatMap((row) => row.toJSON().components).map((b) => [(b as { custom_id: string }).custom_id, (b as { label: string }).label]);

  // Brand new member: the two empty loadouts still get buttons.
  assert.deepEqual(buttons(buttonRows([view(1, 'Loadout 1', true), view(2, 'Loadout 2', false), view(3, 'Loadout 3', false)])), [
    ['loadout_switch_2', 'Loadout 2'],
    ['loadout_switch_3', 'Loadout 3'],
  ]);
  assert.deepEqual(buttons(buttonRows([view(1, 'Tank', false, { armor: 'wooden-shield' }), view(2, 'Robber', true), view(3, 'Loadout 3', false)])), [
    ['loadout_switch_1', 'Tank'],
    ['loadout_switch_3', 'Loadout 3'],
  ]);
});
