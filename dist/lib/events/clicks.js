/*
 * Keeps mashing a button from paying: each player's presses count at most once every `gapMs`
 * (CLICK_GAP_MS). A press that comes too soon after their last one that counted is ignored, and
 * doesn't push their next one back, so pressing steadily at that pace always counts.
 */
export class ClickGate {
    gapMs;
    last = new Map();
    constructor(gapMs) {
        this.gapMs = gapMs;
    }
    /** True if this press by `userId` counts: their first, or at least gapMs after their last one that counted. */
    admit(userId, nowMs = Date.now()) {
        const last = this.last.get(userId);
        if (last !== undefined && nowMs - last < this.gapMs)
            return false;
        this.last.set(userId, nowMs);
        return true;
    }
}
//# sourceMappingURL=clicks.js.map