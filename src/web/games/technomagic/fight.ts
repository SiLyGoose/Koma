import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { startRaid, type LiveRaid, type Run } from '../../../../vendor/technomagic-sim.mjs';
import type { TurnInput } from './protocol.js';

/*
 * A room's fight as the room runs it (room.ts): the sim's raid, stepped on to where the room's clock has got with what
 * the players did before each step. The room asks a Fights for one and needn't know where it runs: in a worker thread
 * (workerFights: every room's fight in one thread beside the bot's, so a fight's steps never hold up Discord or the
 * site), or right here (localFights: the tests, which step it by a clock of their own).
 */

/** A press, before the step it counts at. */
export type Press = Omit<TurnInput, 'tick'>;

/**
 * What a room asks of its fight before a step: a press as it is (a skill, a hero's Auto turned over, giving up); or
 * the Auto of each of `fighters` turned on (`on`), off, or (without it) on unless each is on already, by how the fight
 * stands as the presses before it in the same step leave it.
 */
export type Intent = Press | { kind: 'autos'; fighters: readonly number[]; on?: boolean };

/** How far a fight has got: its steps, how it ended (null: it hasn't), and the presses it took and checksums it made since it was last asked. */
export interface Progress {
  tick: number;
  result: 'won' | 'lost' | null;
  inputs: TurnInput[];
  sums: number[];
}

/** A fight being run. */
export interface FightEngine {
  /** Steps it on to step `due` (no further than it ends), the intents waiting for the next step (with `intents` after them) before it. */
  advance(due: number, intents: readonly Intent[]): Promise<Progress>;
  /** Done with it. */
  close(): void;
}

/** Where a room's fights are run: a fight from a run (a string: why the run makes no sense to the sim). */
export interface Fights {
  start(run: Run): Promise<FightEngine | string>;
}

/** A raid stepped on, with what the room asks of it before each step: what each FightEngine runs. */
export class FightRunner {
  private readonly pending: Intent[] = [];
  private summed = 0;

  constructor(private readonly raid: LiveRaid) {}

  advance(due: number, intents: readonly Intent[]): Progress {
    this.pending.push(...intents);
    const inputs: TurnInput[] = [];
    while (this.raid.tick < due && !this.raid.result) {
      inputs.push(...this.take());
      this.raid.step();
    }
    const sums = this.raid.sums.slice(this.summed);
    this.summed = this.raid.sums.length;
    return { tick: this.raid.tick, result: this.raid.result, inputs, sums };
  }

  /** What is waiting, as the raid takes it before its next step: each Auto worked out by how the presses before it leave it. */
  private take(): TurnInput[] {
    const autos = this.raid.autos();
    const taken: TurnInput[] = [];
    const press = (one: Press): void => {
      if (this.raid.input(one)) taken.push({ ...one, tick: this.raid.tick });
    };
    for (const intent of this.pending.splice(0)) {
      if (intent.kind !== 'autos') {
        if (intent.kind === 'auto' && intent.fighter !== undefined) autos[intent.fighter] = !autos[intent.fighter];
        press(intent);
        continue;
      }
      const on = intent.on ?? !intent.fighters.every((fighter) => autos[fighter]);
      for (const fighter of intent.fighters) {
        if (autos[fighter] === on) continue;
        autos[fighter] = on;
        press({ kind: 'auto', fighter });
      }
    }
    return taken;
  }
}

/** A fight's runner, from a run (a string: why the run makes no sense to the sim). */
export function runnerFor(run: Run): FightRunner | string {
  const raid = startRaid(run);
  return typeof raid === 'string' ? raid : new FightRunner(raid);
}

/** Fights run right here, as they are asked (the tests'). */
export const localFights: Fights = {
  async start(run) {
    const runner = runnerFor(run);
    if (typeof runner === 'string') return runner;
    return { advance: async (due, intents) => runner.advance(due, intents), close: () => {} };
  },
};

/** What the bot asks of its worker (./fight-worker.ts): a fight started, stepped on, or done with. */
export type WorkerRequest = { kind: 'start'; fight: number; run: Run } | { kind: 'advance'; fight: number; due: number; intents: readonly Intent[] } | { kind: 'close'; fight: number };
/** What it answers: a fight started (or why not), how far one has got, one done with, or that what was asked failed (`error`). */
export type WorkerReply = { kind: 'started'; error: string | null } | { kind: 'progress'; progress: Progress } | { kind: 'closed' } | { kind: 'failed'; error: string };
/** Each, with the number of the ask (its answer comes back with it). */
export type WorkerAsk = WorkerRequest & { ask: number };
export type WorkerAnswer = WorkerReply & { ask: number };

/**
 * Every room's fights in one worker thread (./fight-worker.ts, as this file is: .ts under tsx, .js once built),
 * started the first time it is wanted. Should it stop, every fight in it fails (its room ends it) and the next one
 * starts another.
 */
function makeWorkerFights(): Fights {
  let worker: Worker | null = null;
  let asks = 0;
  let fights = 0;
  const waiting = new Map<number, { done: (answer: WorkerAnswer) => void; failed: (error: Error) => void }>();

  function thread(): Worker {
    if (worker) return worker;
    const made = new Worker(new URL(`./fight-worker${extname(fileURLToPath(import.meta.url))}`, import.meta.url));
    made.on('message', (answer: WorkerAnswer) => {
      const asked = waiting.get(answer.ask);
      waiting.delete(answer.ask);
      if (waiting.size === 0) made.unref();
      asked?.done(answer);
    });
    const stopped = (error: Error): void => {
      if (worker === made) worker = null;
      for (const asked of waiting.values()) asked.failed(error);
      waiting.clear();
    };
    made.on('error', stopped);
    made.on('exit', (code) => stopped(new Error(`The fights' worker stopped (${code})`)));
    worker = made;
    return made;
  }

  /** Asks the worker something: it keeps the bot going until it answers (and nothing more, once it has). */
  const ask = (message: WorkerRequest): Promise<WorkerAnswer> =>
    new Promise((done, failed) => {
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
      if (started.kind !== 'started') throw new Error(started.kind === 'failed' ? started.error : 'Unexpected answer');
      if (started.error) return started.error;
      return {
        async advance(due, intents) {
          const answer = await ask({ kind: 'advance', fight, due, intents });
          if (answer.kind !== 'progress') throw new Error(answer.kind === 'failed' ? answer.error : 'Unexpected answer');
          return answer.progress;
        },
        close() {
          if (worker) void ask({ kind: 'close', fight }).catch(() => {});
        },
      };
    },
  };
}

export const workerFights: Fights = makeWorkerFights();
