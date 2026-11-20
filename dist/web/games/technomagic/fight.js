import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { replay, startRaid } from '../../../../vendor/technomagic-sim.mjs';
/** A raid stepped on, with what the room asks of it before each step: what each FightEngine runs. */
export class FightRunner {
    raid;
    pending = [];
    summed = 0;
    constructor(raid) {
        this.raid = raid;
    }
    advance(due, intents) {
        this.pending.push(...intents);
        const inputs = [];
        while (this.raid.tick < due && !this.raid.result) {
            inputs.push(...this.take());
            this.raid.step();
        }
        const sums = this.raid.sums.slice(this.summed);
        this.summed = this.raid.sums.length;
        // (Over: a karma run's outcome, from a sim that keeps one.)
        const karma = this.raid.result && typeof this.raid.karma === 'function' ? this.raid.karma() : null;
        return { tick: this.raid.tick, result: this.raid.result, inputs, sums, ...(karma && { karma }) };
    }
    /** What is waiting, as the raid takes it before its next step: each Auto worked out by how the presses before it leave it. */
    take() {
        const autos = this.raid.autos();
        const taken = [];
        const press = (one) => {
            if (this.raid.input(one))
                taken.push({ ...one, tick: this.raid.tick });
        };
        for (const intent of this.pending.splice(0)) {
            if (intent.kind !== 'autos') {
                if (intent.kind === 'auto' && intent.fighter !== undefined)
                    autos[intent.fighter] = !autos[intent.fighter];
                press(intent);
                continue;
            }
            const on = intent.on ?? !intent.fighters.every((fighter) => autos[fighter]);
            for (const fighter of intent.fighters) {
                if (autos[fighter] === on)
                    continue;
                autos[fighter] = on;
                press({ kind: 'auto', fighter });
            }
        }
        return taken;
    }
}
/** A fight's runner, from a run (a string: why the run makes no sense to the sim). */
export function runnerFor(run) {
    const raid = startRaid(run);
    return typeof raid === 'string' ? raid : new FightRunner(raid);
}
/** A fight fought out whole with no one pressing anything (every hero on Auto): how it went, or why it couldn't be. */
export function fightOut(run) {
    const played = replay(run, []);
    return played.result === 'invalid' ? (played.reason ?? 'invalid') : { result: played.result, ticks: played.ticks };
}
/** Fights run right here, as they are asked (the tests'). */
export const localFights = {
    async start(run) {
        const runner = runnerFor(run);
        if (typeof runner === 'string')
            return runner;
        return { advance: async (due, intents) => runner.advance(due, intents), close: () => { } };
    },
    fightOut: async (run) => fightOut(run),
};
/**
 * Every room's fights in one worker thread (./fight-worker.ts, as this file is: .ts under tsx, .js once built),
 * started the first time it is wanted. Should it stop, every fight in it fails (its room ends it) and the next one
 * starts another.
 */
function makeWorkerFights() {
    let worker = null;
    let asks = 0;
    let fights = 0;
    const waiting = new Map();
    function thread() {
        if (worker)
            return worker;
        const made = new Worker(new URL(`./fight-worker${extname(fileURLToPath(import.meta.url))}`, import.meta.url));
        made.on('message', (answer) => {
            const asked = waiting.get(answer.ask);
            waiting.delete(answer.ask);
            if (waiting.size === 0)
                made.unref();
            asked?.done(answer);
        });
        const stopped = (error) => {
            if (worker === made)
                worker = null;
            for (const asked of waiting.values())
                asked.failed(error);
            waiting.clear();
        };
        made.on('error', stopped);
        made.on('exit', (code) => stopped(new Error(`The fights' worker stopped (${code})`)));
        worker = made;
        return made;
    }
    /** Asks the worker something: it keeps the bot going until it answers (and nothing more, once it has). */
    const ask = (message) => new Promise((done, failed) => {
        const number = ++asks;
        const made = thread();
        waiting.set(number, { done, failed });
        made.ref();
        made.postMessage({ ...message, ask: number });
    });
    return {
        async start(run) {
            const fight = ++fights;
            const started = await ask({ kind: 'start', fight, run });
            if (started.kind !== 'started')
                throw new Error(started.kind === 'failed' ? started.error : 'Unexpected answer');
            if (started.error)
                return started.error;
            return {
                async advance(due, intents) {
                    const answer = await ask({ kind: 'advance', fight, due, intents });
                    if (answer.kind !== 'progress')
                        throw new Error(answer.kind === 'failed' ? answer.error : 'Unexpected answer');
                    return answer.progress;
                },
                close() {
                    if (worker)
                        void ask({ kind: 'close', fight }).catch(() => { });
                },
            };
        },
        async fightOut(run) {
            const answer = await ask({ kind: 'fight-out', run });
            if (answer.kind !== 'fought')
                throw new Error(answer.kind === 'failed' ? answer.error : 'Unexpected answer');
            return answer.fought;
        },
    };
}
export const workerFights = makeWorkerFights();
//# sourceMappingURL=fight.js.map