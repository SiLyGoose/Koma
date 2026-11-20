import { randomUUID } from 'node:crypto';
import { CONFIG } from '../../config.js';
import { POKER_TABLE } from '../../constants/index.js';
import { collections } from '../../db.js';
import { ensureMember } from '../economy/index.js';
import { addVaultLoss } from '../vault.js';
/** Best effort, like the ledger of every other game: a failure is logged and never undoes a completed action. */
async function recordLedger(entries) {
    if (entries.length === 0)
        return;
    const createdAt = new Date();
    try {
        await collections().ledger.insertMany(entries.map((entry) => ({ ...entry, createdAt })));
    }
    catch (err) {
        console.error('Failed to write ledger entries:', err);
    }
}
/** The seats this process has taken chips for and not paid back out yet, so a shutdown can pay them. */
const live = new Set();
const leaseEnd = () => new Date(Date.now() + POKER_TABLE.leaseMs);
/** Takes `amount` from a member's balance and seats it at the table `tableKey` as chips. */
export async function buyIn(guildId, userId, tableKey, amount) {
    const { minBuyIn, maxBuyIn } = CONFIG.poker;
    if (!Number.isSafeInteger(amount) || amount < minBuyIn || amount > maxBuyIn)
        return { ok: false, reason: 'out_of_range', min: minBuyIn, max: maxBuyIn };
    await ensureMember(guildId, userId);
    const { members, pokerSeats } = collections();
    const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: amount } }, { $inc: { points: -amount } }, { returnDocument: 'after' });
    if (!charged) {
        const latest = await members.findOne({ guildId, userId });
        return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
    }
    const seatId = randomUUID();
    try {
        await pokerSeats.insertOne({ _id: seatId, guildId, userId, tableKey, chips: amount, boughtIn: amount, leaseUntil: leaseEnd(), createdAt: new Date() });
    }
    catch (err) {
        // Nothing says the chips are at a table, so give the points back.
        await members.updateOne({ guildId, userId }, { $inc: { points: amount } });
        throw err;
    }
    live.add(seatId);
    await recordLedger([{ guildId, userId, delta: -amount, reason: 'poker_buyin' }]);
    return { ok: true, seatId, chips: amount, balance: charged.points };
}
/** Saves a seat's chips, after a hand. */
export async function saveChips(seatId, chips) {
    await collections().pokerSeats.updateOne({ _id: seatId }, { $set: { chips: Math.max(0, Math.round(chips)), leaseUntil: leaseEnd() } });
}
/**
 * Pays a seat's chips back into its member's balance and frees it. Null when it was already paid
 * (by the sweeper, or another call). If paying fails the seat is put back, already out of lease, so
 * the sweeper pays it later.
 */
export async function cashOut(seatId) {
    const { members, pokerSeats } = collections();
    const doc = await pokerSeats.findOneAndDelete({ _id: seatId });
    live.delete(seatId);
    if (!doc)
        return null;
    const amount = Math.max(0, doc.chips);
    try {
        await ensureMember(doc.guildId, doc.userId);
        const paid = await members.findOneAndUpdate({ guildId: doc.guildId, userId: doc.userId }, { $inc: { points: amount } }, { returnDocument: 'after' });
        if (!paid)
            throw new Error(`Member ${doc.userId} not found while cashing out poker chips`);
        if (amount > 0)
            await recordLedger([{ guildId: doc.guildId, userId: doc.userId, delta: amount, reason: 'poker_cashout' }]);
        return { amount, balance: paid.points };
    }
    catch (err) {
        console.error(`Could not cash out ${amount} poker chips for ${doc.userId}; leaving them for the sweeper:`, err);
        try {
            await pokerSeats.insertOne({ ...doc, leaseUntil: new Date(0) });
        }
        catch (restoreErr) {
            console.error(`Could not put poker seat ${seatId} back for the sweeper:`, restoreErr);
        }
        throw err;
    }
}
/** Pushes the lease of every seat at a table forward. Called every POKER_TABLE.heartbeatMs while the table is played. */
export async function renewSeats(tableKey) {
    await collections().pokerSeats.updateMany({ tableKey }, { $set: { leaseUntil: leaseEnd() } });
}
/** What a member has won off the poker bots on `day` (dayKey), net: negative when they lost to them. */
export async function botWinnings(guildId, userId, day) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { pokerBots: 1 } });
    return member?.pokerBots?.day === day ? member.pokerBots.net : 0;
}
/** Adds `amount` (negative: a loss) to what a member has won off the poker bots on `day`, starting the day afresh when what's stored is another day's. */
export async function addBotWinnings(guildId, userId, day, amount) {
    if (amount === 0)
        return;
    const { members } = collections();
    for (let attempt = 0; attempt < 3; attempt++) {
        if ((await members.updateOne({ guildId, userId, 'pokerBots.day': day }, { $inc: { 'pokerBots.net': amount } })).matchedCount > 0)
            return;
        // Another day's (or none): only set if it still is, so two tables at once can't both start the day.
        if ((await members.updateOne({ guildId, userId, 'pokerBots.day': { $ne: day } }, { $set: { pokerBots: { day, net: amount } } })).matchedCount > 0)
            return;
    }
}
/** Puts points into a server's vault: the rake, and what the bots won. */
export async function houseTake(guildId, amount) {
    if (amount > 0)
        await addVaultLoss(guildId, amount);
}
/**
 * Cashes out every seat whose lease has run out, and returns how many. These belong to tables that
 * aren't being played any more; a live table keeps its seats' leases well ahead of now.
 */
export async function sweepSeats(now = new Date()) {
    const { pokerSeats } = collections();
    let paid = 0;
    for (;;) {
        const doc = await pokerSeats.findOne({ leaseUntil: { $lt: now } });
        if (!doc)
            break;
        try {
            if (await cashOut(doc._id))
                paid++;
        }
        catch {
            // cashOut logged it and put it back for the next sweep; stop so one failure isn't retried in a tight loop.
            break;
        }
    }
    return paid;
}
/** Runs the sweep now and then every POKER_TABLE.sweepMs. Returns a function that stops it. */
export function startPokerSweeper() {
    const run = async () => {
        try {
            const count = await sweepSeats();
            if (count > 0)
                console.log(`Cashed out ${count} poker seat(s) left at tables that stopped.`);
        }
        catch (err) {
            console.error('The poker seat sweep failed:', err);
        }
    };
    void run();
    const timer = setInterval(() => void run(), POKER_TABLE.sweepMs);
    timer.unref();
    return () => clearInterval(timer);
}
/** For a shutdown: cashes out every seat of this process's tables, so they don't wait for the sweeper. */
export async function cashOutLiveSeats() {
    for (const seatId of [...live]) {
        try {
            await cashOut(seatId);
        }
        catch {
            // Logged in cashOut; the sweeper pays it after the restart.
        }
    }
}
//# sourceMappingURL=poker.js.map