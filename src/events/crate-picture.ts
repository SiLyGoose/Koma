import { renderCrate, type CrateState } from '../animations/images/crate-image.js';
import { CRATE } from '../constants/index.js';
import type { CrateTier } from '../lib/events/crate.js';

/*
 * The pictures that go with the point crate: the closed crate when it lands, and the open one (or
 * the ruin) when it ends. Drawing one takes a few seconds, so each is drawn once per state and
 * glow colour and kept (there are nine in all), and the ones the end of the crate will need are
 * started in the background while it is still open. A picture that can't be drawn is never fatal:
 * the crate just goes without it.
 */

/** A picture as Discord takes it: the file and the name the embed points at. */
export interface CrateFile {
  attachment: Buffer;
  name: string;
}

type Renderer = (state: CrateState, tier: CrateTier) => Promise<Buffer>;

let render: Renderer = renderCrate;
const made = new Map<string, Promise<Buffer | null>>();

/** For tests: draws pictures with `renderer` instead (null puts the real one back), and forgets the ones already made. */
export function setCrateRenderer(renderer: Renderer | null): void {
  render = renderer ?? renderCrate;
  made.clear();
}

/** The picture of the crate in `state` with the glow of `tier`, or null if it could not be drawn. */
export async function crateFile(state: CrateState, tier: CrateTier): Promise<CrateFile | null> {
  const key = `${state}:${tier}`;
  let pending = made.get(key);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => render(state, tier))
      .catch((err) => {
        console.error(`Could not draw the ${state} crate picture (${tier}):`, err);
        made.delete(key);
        return null;
      });
    made.set(key, pending);
  }
  const png = await pending;
  return png ? { attachment: png, name: CRATE.imageName } : null;
}

/** Starts drawing the pictures a crate of `tier` will need when it ends, so they are ready by then. */
export function prepareEndPictures(tier: CrateTier): void {
  void crateFile('opened', tier);
  void crateFile('lost', tier);
}
