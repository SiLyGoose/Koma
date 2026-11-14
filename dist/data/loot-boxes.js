/** King's Raid's words for its loot (ITEM_DESC2). */
export const LOOT_BOX_ABOUT = 'A reward obtained from Dispatch Battle.';
/** Each dragon as King's Raid's Dispatch Battle Loot names it: its code, its name and its icon. */
const DRAGON_BOXES = {
    temeraire: { code: 'RED', name: 'Fire Dragon', icon: 'BOX_DRAGON_RED' },
    scalaxia: { code: 'BLUE', name: 'Frost Dragon', icon: 'BOX_DRAGON_ICE' },
    zyrrkinoth: { code: 'GREEN', name: 'Poison Dragon', icon: 'BOX_DRAGON_GREEN' },
    armarta: { code: 'BLACK', name: 'Black Dragon', icon: 'BOX_DRAGON_BLACK' },
};
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
/** A dragon's Normal stage as King's Raid's tier and stage: 1 to 10 are T3 to T7, two each; 11 to 20, T8's 1 to 10. */
const normalTier = (stage) => (stage <= 10 ? { tier: 3 + Math.floor((stage - 1) / 2), at: ((stage - 1) % 2) + 1 } : { tier: 8, at: stage - 10 });
/**
 * Each TechnoMagic Raid boss as King's Raid's Dispatch Battle Loot names it: its code, and its name; and its box's picture
 * where it isn't its code's (`icon`: Ascalon's BOX_NONIDENTIFIED_TECHNOMAGIC_ASCALON is named in the playtest but not
 * drawn in any of its atlases, so his boxes show Siegfried's).
 */
const TM_BOXES = {
    galgoria: { code: 'GARGORIA', name: 'Galgoria' },
    siegfried: { code: 'SIEGFRIED', name: 'Siegfried' },
    ascalon: { code: 'ASCALON', name: 'Ascalon', icon: 'BOX_NONIDENTIFIED_TECHNOMAGIC_SIEGFRIED' },
};
export const LOOT_BOXES = [
    ...Object.entries(TM_BOXES).flatMap(([boss, tm]) => range(9).map((stage) => ({
        id: `DISPATCH_REWARD_BOX_${tm.code}_RAID_GRADE_${stage}_NEW`,
        name: `${tm.name} Raid Stage ${stage} Dispatch Battle Loot`,
        raid: 'technomagic',
        boss,
        mode: 'hard',
        stage,
        icon: tm.icon ?? `BOX_NONIDENTIFIED_TECHNOMAGIC_${tm.code}`,
    }))),
    ...Object.entries(DRAGON_BOXES).flatMap(([boss, dragon]) => [
        ...range(10).map((stage) => ({ id: `DISPATCH_REWARD_BOX_RAID_HARD_${dragon.code}_${stage}`, name: `${dragon.name} Hard Mode Stage ${stage} Dispatch Battle Loot`, raid: 'dragon', boss, mode: 'hard', stage, icon: dragon.icon })),
        ...range(20).map((stage) => {
            const { tier, at } = normalTier(stage);
            return { id: `DISPATCH_REWARD_BOX_RAID_${dragon.code}_T${tier}_${at}`, name: `${dragon.name} T${tier} Stage ${at} Dispatch Battle Loot`, raid: 'dragon', boss, mode: 'normal', stage, icon: dragon.icon };
        }),
    ]),
];
export const LOOT_BOXES_BY_ID = new Map(LOOT_BOXES.map((box) => [box.id, box]));
/** The box a win against `boss` in `mode` at `stage` gives (undefined: none is so). */
export const lootBoxOf = (boss, mode, stage) => LOOT_BOXES.find((box) => box.boss === boss && box.mode === mode && box.stage === stage);
//# sourceMappingURL=loot-boxes.js.map