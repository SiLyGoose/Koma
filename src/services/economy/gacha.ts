import { CONFIG } from '../../config.js';
import { MULTI_PULLS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { newCopyId } from '../../lib/game/copies.js';
import { gearEffects } from '../../lib/game/equipment.js';
import { rollPulls, topChance } from '../../lib/game/gacha.js';
import { pullCost } from '../../perks/index.js';
import type { ItemCopyDoc, ItemDef, MemberDoc } from '../../types.js';
import { resolveGear } from '../gear.js';
import { isDuplicateKey, recordLedger, ensureMember } from './shared.js';

/*
 * Gacha pulls: paying, pity, the unique-treasure guarantee, and handing out item copies.
 */

export type PullResult =
  | {
      ok: true;
      item: ItemDef;
      isNew: boolean;
      count: number;
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
  | { ok: false; balance: number; cost: number; tokens: number };

/** Gives the member a new copy of an item. `count` is how many copies of it they now have. */
async function addCopy(guildId: string, userId: string, itemId: string): Promise<{ copy: ItemCopyDoc; count: number }> {
  const { items } = collections();
  for (let attempt = 0; ; attempt++) {
    const copy: ItemCopyDoc = { _id: newCopyId(), guildId, userId, itemId, level: 0, obtainedAt: new Date() };
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
}

export type MultiPullResult =
  | {
      ok: true;
      /** In the order they were pulled. */
      pulls: PulledItem[];
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
  | { ok: false; balance: number; cost: number; tokens: number };

/**
 * Pulls `times` items in one go, paid for together. The member's komaTokens pay for as many of the
 * pulls as they cover, one token each, and points pay for the rest. Each pull counts toward pity in
 * order, so a top-tier item part way through starts the count again for the pulls after it. Either
 * every pull is made and paid for, or nothing is.
 */
async function pullMany(guildId: string, userId: string, times: number): Promise<MultiPullResult> {
  const { members, items, ledger } = collections();
  await ensureMember(guildId, userId);

  // Equipped gear can discount each pull.
  let member = await members.findOne({ guildId, userId });
  const cost = pullCost(CONFIG.gacha.cost, gearEffects(await resolveGear(guildId, userId, member?.equipment), userId));

  // Pity only counts while it is in effect (turned on, and the top tier can actually be pulled),
  // so pulls made before an admin switches it on don't build up a guarantee.
  const { hardPity } = CONFIG.gacha.pity;
  const pityOn = hardPity > 0 && topChance(1) > 0;

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
      { $inc: { points: -total, tokens: -tokensUsed, totalPulls: times, ...(pityOn ? { pity: times } : {}) } },
      { returnDocument: 'after' },
    );
    if (debited) break;
    member = await members.findOne({ guildId, userId });
    if ((member?.tokens ?? 0) === tokens) break; // the tokens were right: it's the points that fall short
  }
  if (!debited) return { ok: false, balance: member?.points ?? 0, cost: total, tokens: member?.tokens ?? 0 };

  // Roll every pull in order, counting pity as we go.
  const counted = pityOn ? (debited.pity ?? times) : 0; // the counter after paying, counting all of these pulls
  // The guarantee: after someone else's treasure, the member's next treasure is their own.
  const wasGuaranteed = debited.guaranteed ?? false;
  const { items: rolled, counter, guaranteed } = rollPulls(counted - times, times, pityOn, undefined, {
    userId,
    guaranteed: wasGuaranteed,
  });
  // The payment counted every pull; take back what the resets undo. Subtracting (instead of
  // setting the counter) keeps any pull that was counted at the same moment.
  const pityReset = pityOn ? counter - counted : 0;

  // What these pulls have added to the pity counter so far, so a failure can undo exactly that.
  let pityChange = pityOn ? times : 0;
  let guaranteeChanged = false;
  const pulls: PulledItem[] = [];
  const addedIds: string[] = [];
  try {
    if (pityReset !== 0) {
      await members.updateOne({ guildId, userId }, { $inc: { pity: pityReset } });
      pityChange += pityReset;
    }
    if (guaranteed !== wasGuaranteed) {
      await members.updateOne({ guildId, userId }, { $set: { guaranteed } });
      guaranteeChanged = true;
    }
    // Items the member has had before: every earlier pull and sale is in the ledger with its item, so
    // one they have since sold still counts. (This batch's entries aren't written until below.)
    const hadBefore = new Set(
      // `$exists` matches the partial index's filter, so the query is allowed to use it.
      await ledger.distinct('itemId', {
        guildId,
        userId,
        itemId: { $exists: true, $in: [...new Set(rolled.map((item) => item.id))] },
      }),
    );
    for (const item of rolled) {
      const owned = await addCopy(guildId, userId, item.id);
      addedIds.push(owned.copy._id);
      pulls.push({ item, isNew: owned.count === 1 && !hadBefore.has(item.id), count: owned.count });
    }
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
        $inc: { points: total, tokens: tokensUsed, totalPulls: -times, ...(pityChange !== 0 ? { pity: -pityChange } : {}) },
        ...(guaranteeChanged ? { $set: { guaranteed: wasGuaranteed } } : {}),
      },
    );
    throw err;
  }

  await recordLedger(
    rolled.map((item, i) =>
      i < tokensUsed
        ? { guildId, userId, delta: 0, tokenDelta: -1, reason: 'gacha_token' as const, itemId: item.id }
        : { guildId, userId, delta: -cost, reason: 'gacha' as const, itemId: item.id },
    ),
  );
  return {
    ok: true,
    pulls,
    balance: debited.points,
    cost: total,
    baseCost: CONFIG.gacha.cost * (times - tokensUsed),
    tokensUsed,
    tokens: debited.tokens ?? 0,
    pity: pityOn ? { count: counter, hardPity } : null,
  };
}

/** One pull. */
export async function pullGacha(guildId: string, userId: string): Promise<PullResult> {
  const result = await pullMany(guildId, userId, 1);
  if (!result.ok) return result;
  const [pull] = result.pulls as [PulledItem];
  return {
    ok: true,
    item: pull.item,
    isNew: pull.isNew,
    count: pull.count,
    balance: result.balance,
    cost: result.cost,
    baseCost: result.baseCost,
    tokensUsed: result.tokensUsed,
    tokens: result.tokens,
    pity: result.pity,
  };
}

/** A multi pull: MULTI_PULLS pulls, paid for together. */
export async function pullMulti(guildId: string, userId: string): Promise<MultiPullResult> {
  return pullMany(guildId, userId, MULTI_PULLS);
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
