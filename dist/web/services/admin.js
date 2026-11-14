import { CONFIG, DEFAULTS } from '../../config.js';
import { CURRENCY_EMOJI, TEXT } from '../../constants/index.js';
import { formatValue, getPath, GROUPS, SPECS } from '../../lib/settings-spec.js';
import { changeSettings, isPrefixFromEnv } from '../../services/settings.js';
import { ApiError } from '../lib/errors.js';
export const settingsStore = { change: changeSettings, prefixFromEnv: isPrefixFromEnv };
/** The descriptions are written for Discord: its points emoji, in words here (a capital one, starting a sentence). */
function plain(text) {
    const words = text.replaceAll(CURRENCY_EMOJI, 'points');
    return words.charAt(0).toUpperCase() + words.slice(1);
}
export function adminService(deps) {
    const store = deps.settings ?? settingsStore;
    function setting(spec) {
        const value = getPath(CONFIG, spec.key);
        const fallback = getPath(DEFAULTS, spec.key);
        return {
            key: spec.key,
            group: spec.group,
            description: plain(spec.description),
            type: spec.type,
            ...(spec.min !== undefined && { min: spec.min }),
            ...(spec.max !== undefined && { max: spec.max }),
            ...(spec.percent && { percent: true }),
            ...(spec.multiplier && { multiplier: true }),
            ...(spec.expects !== undefined && { expects: spec.expects }),
            value,
            default: fallback,
            shown: formatValue(spec, value),
            defaultShown: formatValue(spec, fallback),
            ...(spec.key === 'prefix' && store.prefixFromEnv() && { locked: TEXT.config.prefixFromEnv }),
        };
    }
    const view = () => ({ groups: [...GROUPS], settings: SPECS.map(setting) });
    /** The settings after a change, or why it couldn't be made. */
    function answer(result) {
        if (result.ok)
            return { settings: view(), changed: [...result.results] };
        if (result.reason === 'forbidden')
            throw new ApiError('not_admin');
        throw new ApiError('invalid_setting', { problems: result.problems });
    }
    return {
        view,
        change: async (userId, changes) => answer(await store.change(userId, changes)),
    };
}
//# sourceMappingURL=admin.js.map