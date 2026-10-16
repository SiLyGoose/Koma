import { parentPort } from 'node:worker_threads';
import { runnerFor, type FightRunner, type WorkerAsk, type WorkerReply } from './fight.js';

/*
 * The worker thread every room's fight runs in (./fight.ts's workerFights): it starts each fight it is asked to, steps
 * it on as its room asks, and answers each ask with the number it came with. It loads the sim and nothing else of the bot.
 */

const port = parentPort;
if (!port) throw new Error('fight-worker.ts runs as a worker thread');

const fights = new Map<number, FightRunner>();

port.on('message', (asked: WorkerAsk) => {
  const answer = (reply: WorkerReply): void => port.postMessage({ ...reply, ask: asked.ask });
  try {
    switch (asked.kind) {
      case 'start': {
        const runner = runnerFor(asked.run);
        if (typeof runner === 'string') return answer({ kind: 'started', error: runner });
        fights.set(asked.fight, runner);
        return answer({ kind: 'started', error: null });
      }
      case 'advance': {
        const runner = fights.get(asked.fight);
        if (!runner) return answer({ kind: 'failed', error: `No fight ${asked.fight}` });
        return answer({ kind: 'progress', progress: runner.advance(asked.due, asked.intents) });
      }
      case 'close':
        fights.delete(asked.fight);
        return answer({ kind: 'closed' });
    }
  } catch (err) {
    // (The fight it was about is no more: its room ends it.)
    fights.delete(asked.fight);
    answer({ kind: 'failed', error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
