import { parentPort, workerData } from 'node:worker_threads';
import { cometGif } from './comet-image.js';
for (const { stars, pull } of workerData) {
    // A copy, so its memory can be handed over instead of copied again.
    const gif = new Uint8Array(cometGif(stars, pull));
    parentPort?.postMessage({ stars, pull, gif }, [gif.buffer]);
}
//# sourceMappingURL=comet-worker.js.map