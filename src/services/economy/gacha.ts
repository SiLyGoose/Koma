import { rollKrOptions } from '../../data/kr-gear.js';
import { grantReward } from '../mail.js';
import { CONFIG } from '../../config.js';
import { MULTI_MIN_STARS, MULTI_PULLS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { newCopyId } from '../../lib/game/items/copies.js';
import { limitedWindow } from '../../lib/game/items/banner.js';
import { gearEffects } from '../../lib/game/items/equipment.js';
import { bannerWeights, guaranteeChoices, pulledLevel, rollPulls, topChance } from '../../lib/game/items/gacha.js';
import { rollUtOptions } from '../../lib/game/technomagic.js';
import { extraPullChance, pullCost } from '../../perks/index.js';
import type { BannerId, ItemCopyDoc, ItemDef, KrOption, MemberDoc, TmPotential } from '../../types.js';
import { heroOnly } from '../../lib/game/heroes.js';
import { resolveGear } from '../items/gear.js';
import { isDuplicateKey, recordLedger, ensureMember } from './shared.js';

/*
 * Gacha pulls on any banner: paying, pity, the guarantee (the member's own treasure on the standard
 * banner, a featured item on the limited one, or the item they picked: any exclusive treasure on the
 * standard banner, any unique weapon or treasure on the Hero Item one; lib/game/items/gacha.ts
 * guaranteeTargets), a multi pull's minimum tier, and handing out item copies.
 */

/** Why a pull wasn't made: not enough to pay for it, or the limited banner isn't open. Nothing was spent. */
export type PullRefusal = { ok: false; reason: 'too_poor' | 'closed'; balance: number; cost: number; tokens: number };

/** The member fields each banner keeps its pity count, its guarantee and the item picked for it in. */
const PITY_FIELD = { standard: 'pity', limited: 'limitedPity', hero: 'heroPity' } as const satisfies Record<BannerId, keyof MemberDoc>;
const GUARANTEE_FIELD = { standard: 'guaranteed', limited: 'limitedGuaranteed', hero: 'heroGuaranteed' } as const satisfies Record<BannerId, keyof MemberDoc>;
const PICK_FIELD = { standard: 'guaranteedPick', limited: 'limitedPick', hero: 'heroPick' } as const satisfies Record<BannerId, keyof MemberDoc>;

/** Where a banner's pity and guarantee stand for a member. */
export const pityCount = (member: MemberDoc | null, banner: BannerId): number => member?.[PITY_FIELD[banner]] ?? 0;
export const isGuaranteed = (member: MemberDoc | null, banner: BannerId): boolean => member?.[GUARANTEE_FIELD[banner]] ?? false;
const pityInc = (banner: BannerId, by: number) => ({ [PITY_FIELD[banner]]: by });
const guaranteeSet = (banner: BannerId, guaranteed: boolean) => ({ [GUARANTEE_FIELD[banner]]: guaranteed });
/** The item they picked for a banner's guarantee to give, when it still can (see guaranteeChoices): null for none. */
export const guaranteePick = (member: MemberDoc | null, userId: string, banner: BannerId): string | null => {
  const pick = member?.[PICK_FIELD[banner]];
  return pick !== undefined && guaranteeChoices(userId, banner).some((item) => item.id === pick) ? pick : null;
};

/**
 * Picks the item a banner's guarantee gives the member (`itemId` null: any of them again). False when
 * the guarantee can't give that item (it isn't one of guaranteeChoices), and nothing is changed.
 */
export async function setGuaranteePick(guildId: string, userId: string, banner: BannerId, itemId: string | null): Promise<boolean> {
  if (itemId !== null && !guaranteeChoices(userId, banner).some((item) => item.id === itemId)) return false;
  const field = PICK_FIELD[banner];
  await ensureMember(guildId, userId);
  await collections().members.updateOne({ guildId, userId }, itemId === null ? { $unset: { [field]: '' } } : { $set: { [field]: itemId } });
  return true;
}

/** Where a member's pity and guarantee stand on a banner, for showing them without pulling. */
export async function getPity(guildId: string, userId: string, banner: BannerId): Promise<{ count: number; guaranteed: boolean }> {
  const member = await collections().members.findOne({ guildId, userId });
  return { count: pityCount(member, banner), guaranteed: isGuaranteed(member, banner) };
}

export type PullResult =
  | {
      ok: true;
      item: ItemDef;
      isNew: boolean;
      count: number;
      /** How far the new copy came refined (1: R1). */
      level: number;
      /** The second item the pull gave for nothing (Pot of Greed), when it did. */
      extra: PulledItem | null;
      balance: number;
      cost: number;
      baseCost: number;
      /** komaTokens this pull used (0 or 1), and how many the member has left. */
      tokensUsed: number;
      tokens: number;
      /**
       * Where the member is on the pity counter after this pull (0 right after a top-tier item),
       * and the pull that is guaranteed. Null when pity isn't in effect (turned off, or the tier
       * can't be pulled).
       */
      pity: { count: number; hardPity: number } | null;
    }
  | PullRefusal;

/**
 * Gives the member a new copy of an item (locked when it's 4★): at `level` stars (unless said, a hero's gear's 0★, King's
 * Raid's, and the members' own gear's 1★), with `tmPotentials` (a unique treasure's options) when given. `count` is how many
 * copies of it they now have.
 */
export async function addCopy(guildId: string, userId: string, itemId: string, made: { level?: number; tmPotentials?: TmPotential[]; options?: KrOption[] } = {}): Promise<{ copy: ItemCopyDoc; count: number }> {
  const { items } = collections();
  const item = ITEMS_BY_ID.get(itemId);
  const locked = item?.stars === 4;
  const level = made.level ?? (item && heroOnly(item) ? 0 : 1);
  for (let attempt = 0; ; attempt++) {
    const copy: ItemCopyDoc = { _id: newCopyId(), guildId, userId, itemId, level, obtainedAt: new Date(), ...(locked && { locked }), ...(made.tmPotentials && { tmPotentials: made.tmPotentials }), ...(made.options && made.options.length > 0 && { options: made.options }) };
    try {
      await items.insertOne(copy);
      return { copy, count: await items.countDocuments({ guildId, userId, itemId }) };
    } catch (err) {
      // A random id colliding is practically impossible, but a retry costs nothing.
      if (isDuplicateKey(err) && attempt < 2) continue;
      throw err;
    }
  }
}

/** One pull inside a multi pull. */
export interface PulledItem {
  item: ItemDef;
  /** True when it is the first copy of this item the member has ever owned (selling one doesn't make it new again). */
  isNew: boolean;
  /** How many copies of the item they own after this pull. */
  count: number;
  /** How far the new copy came refined (1: R1). */
  level: number;
}

export type MultiPullResult =
  | {
      ok: true;
      /** In the order they were pulled. */
      pulls: PulledItem[];
      /** The items the pulls gave on top for nothing (Pot of Greed), in order. They were not paid for and count for no pity. */
      extras: PulledItem[];
      balance: number;
      /** What all the pulls cost together in points, after gear (pulls paid with komaTokens cost none). */
      cost: number;
      /** What the pulls paid with points would have cost without gear. */
      baseCost: number;
      /** How many of the pulls were paid with komaTokens (always the first ones), and how many the member has left. */
      tokensUsed: number;
      tokens: number;
      pity: { count: number; hardPity: number } | null;
    }
  | PullRefusal;

/**
 * Pulls `times` items in one go from `banner`, paid for together. The member's komaTokens pay for as many of the
 * pulls as they cover, one token each, and points pay for the rest. Each pull counts toward pity in
 * order, so a top-tier item part way through starts the count again for the pulls after it. Either
 * every pull is made and paid for, or nothing is. The limited banner only takes pulls while it is open.
 */
async function pullMany(guildId: string, userId: string, times: number, banner: BannerId): Promise<MultiPullResult> {
  const { members, items, ledger } = collections();
  await ensureMember(guildId, userId);

  // Equipped gear can change what each pull costs, and give a pull a second item.
  let member = await members.findOne({ guildId, userId });
  if (banner === 'limited' && !limitedWindow(CONFIG.gacha.limited).open) {
    return { ok: false, reason: 'closed', balance: member?.points ?? 0, cost: 0, tokens: member?.tokens ?? 0 };
  }
  const gear = gearEffects(await resolveGear(guildId, userId, member?.equipment), userId);
  const cost = pullCost(CONFIG.gacha.cost, gear);

  // Pity only counts while it is in effect (turned on, and the top tier can actually be pulled),
  // so pulls made before an admin switches it on don't build up a guarantee.
  const { hardPity } = CONFIG.gacha.pity;
  const pityOn = hardPity > 0 && topChance(1, bannerWeights(banner)) > 0;

  // Take the payment first (tokens, then points for the rest), only if the member can afford all of
  // it. The same update counts these pulls toward pity, and what it returns tells us which pulls
  // these are since their last top-tier item, so pulls at the same moment can never be given the
  // same numbers. If their tokens changed in between (spent or won at that moment), it is worked out again.
  let debited: MemberDoc | null = null;
  let tokensUsed = 0;
  let total = 0;
  for (let attempt = 0; attempt < 3 && !debited; attempt++) {
    const tokens = member?.tokens ?? 0;
    tokensUsed = Math.min(tokens, times);
    total = cost * (times - tokensUsed);
    debited = await members.findOneAndUpdate(
      { guildId, userId, points: { $gte: total }, ...(tokensUsed > 0 ? { tokens: { $gte: tokensUsed } } : {}) },
      // Only what was actually spent: an $inc by -0 on a field the member doesn't have yet saves it as -0 (shown as "-0").
      {
        $inc: {
          ...(total > 0 ? { points: -total } : {}),
          ...(tokensUsed > 0 ? { tokens: -tokensUsed } : {}),
          totalPulls: times,
          ...(pityOn ? pityInc(banner, times) : {}),
        },
      },
      { returnDocument: 'after' },
    );
    if (debited) break;
    member = await members.findOne({ guildId, userId });
    if ((member?.tokens ?? 0) === tokens) break; // the tokens were right: it's the points that fall short
  }
  if (!debited) return { ok: false, reason: 'too_poor', balance: member?.points ?? 0, cost: total, tokens: member?.tokens ?? 0 };

  // Roll every pull in order, counting pity as we go.
  const counted = pityOn ? (debited[PITY_FIELD[banner]] ?? times) : 0; // the counter after paying, counting all of these pulls
  // The guarantee: after someone else's treasure, the member's next treasure is their own (on the
  // limited banner: after an item that isn't featured, the next is).
  const wasGuaranteed = isGuaranteed(debited, banner);
  // A multi pull promises at least one MULTI_MIN_STARS item; a single pull promises nothing.
  const { items: rolled, extras: rolledExtras, counter, guaranteed } = rollPulls(
    counted - times,
    times,
    pityOn,
    undefined,
    { userId, guaranteed: wasGuaranteed, banner, extraChance: extraPullChance(gear), pick: guaranteePick(debited, userId, banner) ?? undefined },
    times > 1 ? MULTI_MIN_STARS : 1,
  );
  // The payment counted every pull; take back what the resets undo. Subtracting (instead of
  // setting the counter) keeps any pull that was counted at the same moment.
  const pityReset = pityOn ? counter - counted : 0;

  // What these pulls have added to the pity counter so far, so a failure can undo exactly that.
  let pityChange = pityOn ? times : 0;
  let guaranteeChanged = false;
  const pulls: PulledItem[] = [];
  const extras: PulledItem[] = [];
  const addedIds: string[] = [];
  try {
    if (pityReset !== 0) {
      await members.updateOne({ guildId, userId }, { $inc: pityInc(banner, pityReset) });
      pityChange += pityReset;
    }
    if (guaranteed !== wasGuaranteed) {
      await members.updateOne({ guildId, userId }, { $set: guaranteeSet(banner, guaranteed) });
      guaranteeChanged = true;
    }
    // Items the member has had before: every earlier pull and sale is in the ledger with its item, so
    // one they have since sold still counts. (This batch's entries aren't written until below.)
    const hadBefore = new Set(
      // `$exists` matches the partial index's filter, so the query is allowed to use it.
      await ledger.distinct('itemId', {
        guildId,
        userId,
        itemId: { $exists: true, $in: [...new Set([...rolled, ...rolledExtras].map((item) => item.id))] },
      }),
    );
    // (A unique weapon now and then comes refined, and a unique treasure with its options: pulledLevel, rollUtOptions.)
    const give = async (item: ItemDef): Promise<PulledItem> => {
      // (A reward, no copy: a selector to the mailbox, a rune to their runes: services/mail.ts grantReward.)
      if (item.grant) {
        await grantReward(guildId, userId, item);
        return { item, isNew: !hadBefore.has(item.id), count: 1, level: 1 };
      }
      const level = pulledLevel(item);
      // (King's Raid's hero gear: its options rolled now.)
      const owned = await addCopy(guildId, userId, item.id, { level, ...(item.uniqueTreasure && { tmPotentials: rollUtOptions() }), ...(item.kr && { options: rollKrOptions(item.kr) }) });
      addedIds.push(owned.copy._id);
      return { item, isNew: owned.count === 1 && !hadBefore.has(item.id), count: owned.count, level };
    };
    for (const item of rolled) pulls.push(await give(item));
    for (const item of rolledExtras) extras.push(await give(item));
  } catch (err) {
    // Could not hand everything over, so take back the copies already given and refund it all.
    if (addedIds.length > 0) {
      try {
        await items.deleteMany({ _id: { $in: addedIds } });
      } catch (deleteErr) {
        console.error('Could not remove the copies of a failed pull:', deleteErr);
      }
    }
    await members.updateOne(
      { guildId, userId },
      {
        $inc: { points: total, tokens: tokensUsed, totalPulls: -times, ...(pityChange !== 0 ? pityInc(banner, -pityChange) : {}) },
        ...(guaranteeChanged ? { $set: guaranteeSet(banner, wasGuaranteed) } : {}),
      },
    );
    throw err;
  }

  await recordLedger([
    ...rolled.map((item, i) =>
      i < tokensUsed
        ? { guildId, userId, delta: 0, tokenDelta: -1, reason: 'gacha_token' as const, itemId: item.id, banner }
        : { guildId, userId, delta: -cost, reason: 'gacha' as const, itemId: item.id, banner },
    ),
    ...rolledExtras.map((item) => ({ guildId, userId, delta: 0, reason: 'gacha_bonus' as const, itemId: item.id, banner })),
  ]);
  return {
    ok: true,
    pulls,
    extras,
    balance: debited.points,
    cost: total,
    baseCost: CONFIG.gacha.cost * (times - tokensUsed),
    tokensUsed,
    tokens: debited.tokens ?? 0,
    pity: pityOn ? { count: counter, hardPity } : null,
  };
}

/** One pull, from the standard banner unless told otherwise. */
export async function pullGacha(guildId: string, userId: string, banner: BannerId = 'standard'): Promise<PullResult> {
  const result = await pullMany(guildId, userId, 1, banner);
  if (!result.ok) return result;
  const [pull] = result.pulls as [PulledItem];
  return {
    ok: true,
    item: pull.item,
    isNew: pull.isNew,
    count: pull.count,
    level: pull.level,
    extra: result.extras[0] ?? null,
    balance: result.balance,
    cost: result.cost,
    baseCost: result.baseCost,
    tokensUsed: result.tokensUsed,
    tokens: result.tokens,
    pity: result.pity,
  };
}

/** A multi pull: MULTI_PULLS pulls, paid for together, from the standard banner unless told otherwise. */
export async function pullMulti(guildId: string, userId: string, banner: BannerId = 'standard'): Promise<MultiPullResult> {
  return pullMany(guildId, userId, MULTI_PULLS, banner);
}

/**
 * Gives a member komaTokens (free pulls). The ledger records it under `reason` with 0 points.
 * Never throws for the ledger; a failed update does throw.
 */
export async function giveTokens(guildId: string, userId: string, amount: number, reason: 'raid_tokens'): Promise<number> {
  await ensureMember(guildId, userId);
  const after = await collections().members.findOneAndUpdate({ guildId, userId }, { $inc: { tokens: amount } }, { returnDocument: 'after' });
  await recordLedger([{ guildId, userId, delta: 0, tokenDelta: amount, reason }]);
  return after?.tokens ?? amount;
}
