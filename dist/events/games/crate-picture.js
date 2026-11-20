import { renderCrate } from '../../animations/images/crate-image.js';
import { CRATE } from '../../constants/index.js';
let render = renderCrate;
const made = new Map();
/** For tests: draws pictures with `renderer` instead (null puts the real one back), and forgets the ones already made. */
export function setCrateRenderer(renderer) {
    render = renderer ?? renderCrate;
    made.clear();
}
/** The picture of the crate in `state` with the glow of `tier`, or null if it could not be drawn. */
export async function crateFile(state, tier) {
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
export function prepareEndPictures(tier) {
    void crateFile('opened', tier);
    void crateFile('lost', tier);
}
//# sourceMappingURL=crate-picture.js.map