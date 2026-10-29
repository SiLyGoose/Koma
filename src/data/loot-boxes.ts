import type { RaidMode } from '../protocol/technomagic.js';

/*
 * King's Raid's Dispatch Battle Loot (its ItemTable's DISPATCH_REWARD_BOX_*, from the CBT2 playtest's tables): one box for each
 * raid, boss, mode and stage, what a won background raid (services/tm-batches.ts) gives in place of its rewards. Its mail
 * carries the batch's boxes; claimed, they're held (MemberDoc.lootBoxes) in the site's Inventory's Others until opened, each
 * giving what a win at its stage gives (services/loot-boxes.ts). Each is named and pictured as King's Raid has it: the
 * Galgoria Raid's boxes are its Unidentified Technomagic Gear box, each dragon's its own (the site's public/kr/items/<icon>.webp).
 * A dragon's Normal stages are King's Raid's T3 Stage 1 to T7 Stage 2, then T8 Stage 1 to 10.
 */

export interface LootBoxDef {
  /** King's Raid's item code. */
  id: string;
  name: string;
  raid: 'technomagic' | 'dragon';
  boss: string;
  mode: RaidMode;
  stage: number;
  /** King's Raid's icon (its item atlas's sprite). */
  icon: string;
}

/** King's Raid's words for its loot (ITEM_DESC2). */
export const LOOT_BOX_ABOUT = 'A reward obtained from Dispatch Battle.';

/** Each dragon as King's Raid's Dispatch Battle Loot names it: its code, its name and its icon. */
const DRAGON_BOXES: Readonly<Record<string, { code: string; name: string; icon: string }>> = {
  temeraire: { code: 'RED', name: 'Fire Dragon', icon: 'BOX_DRAGON_RED' },
  scalaxia: { code: 'BLUE', name: 'Frost Dragon', icon: 'BOX_DRAGON_ICE' },
  zyrrkinoth: { code: 'GREEN', name: 'Poison Dragon', icon: 'BOX_DRAGON_GREEN' },
  armarta: { code: 'BLACK', name: 'Black Dragon', icon: 'BOX_DRAGON_BLACK' },
};

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** A dragon's Normal stage as King's Raid's tier and stage: 1 to 10 are T3 to T7, two each; 11 to 20, T8's 1 to 10. */
const normalTier = (stage: number): { tier: number; at: number } => (stage <= 10 ? { tier: 3 + Math.floor((stage - 1) / 2), at: ((stage - 1) % 2) + 1 } : { tier: 8, at: stage - 10 });

export const LOOT_BOXES: readonly LootBoxDef[] = [
  ...range(9).map(
    (stage): LootBoxDef => ({
      id: `DISPATCH_REWARD_BOX_GARGORIA_RAID_GRADE_${stage}_NEW`,
      name: `Galgoria Raid Stage ${stage} Dispatch Battle Loot`,
      raid: 'technomagic',
      boss: 'galgoria',
      mode: 'hard',
      stage,
      icon: 'BOX_NONIDENTIFIED_TECHNOMAGIC_GARGORIA',
    }),
  ),
  ...Object.entries(DRAGON_BOXES).flatMap(([boss, dragon]) => [
    ...range(10).map((stage): LootBoxDef => ({ id: `DISPATCH_REWARD_BOX_RAID_HARD_${dragon.code}_${stage}`, name: `${dragon.name} Hard Mode Stage ${stage} Dispatch Battle Loot`, raid: 'dragon', boss, mode: 'hard', stage, icon: dragon.icon })),
    ...range(20).map((stage): LootBoxDef => {
      const { tier, at } = normalTier(stage);
      return { id: `DISPATCH_REWARD_BOX_RAID_${dragon.code}_T${tier}_${at}`, name: `${dragon.name} T${tier} Stage ${at} Dispatch Battle Loot`, raid: 'dragon', boss, mode: 'normal', stage, icon: dragon.icon };
    }),
  ]),
];

export const LOOT_BOXES_BY_ID: ReadonlyMap<string, LootBoxDef> = new Map(LOOT_BOXES.map((box) => [box.id, box]));

/** The box a win against `boss` in `mode` at `stage` gives (undefined: none is so). */
export const lootBoxOf = (boss: string, mode: RaidMode, stage: number): LootBoxDef | undefined => LOOT_BOXES.find((box) => box.boss === boss && box.mode === mode && box.stage === stage);
