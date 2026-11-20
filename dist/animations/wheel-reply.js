import { TEXT, WHEEL_ANIMATION, WHEEL_IMAGE_NAME } from '../constants/index.js';
import { renderSpinningWheel, renderWheel, spinTurns } from './images/wheel-image.js';
import { playAnimation, stepsFor } from './play.js';
/** How many picture changes this spin takes: it lasts between minSeconds and maxSeconds, one change per frameMs. */
export function spinSteps() {
    return stepsFor(WHEEL_ANIMATION);
}
/**
 * Sends the result of a claim or rob that spun the wheel, as a short animation: first a
 * "spinning" message with the wheel picture, then the picture is swapped every
 * WHEEL_ANIMATION.frameMs (slowing down) until the wheel stops on the result and the message
 * becomes `embed`, the real result (see `playAnimation` for how failures and slow edits are handled).
 */
export async function replyWithWheel(ctx, embed, spin, options = {}) {
    await playAnimation(ctx, embed, () => {
        const steps = spinSteps();
        const turns = spinTurns(spin.slices.length, spin, steps);
        return {
            steps,
            frameMs: WHEEL_ANIMATION.frameMs,
            title: TEXT.wheel.spinningTitle,
            text: TEXT.wheel.spinning(ctx.user.toString()),
            imageName: WHEEL_IMAGE_NAME,
            frame: (step) => renderSpinningWheel(spin.slices, turns[step]),
            finish: () => renderWheel(spin.slices, spin),
        };
    }, options);
}
//# sourceMappingURL=wheel-reply.js.map