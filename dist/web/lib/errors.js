const STATUS = {
    bad_request: 400,
    no_login: 404,
    not_logged_in: 401,
    not_member: 403,
    not_admin: 403,
    invalid_setting: 400,
    discord_failed: 502,
    not_found: 404,
    not_playing: 409,
    busy: 409,
    maxed: 409,
    no_duplicate: 409,
    no_stones: 409,
    bad_material: 409,
    too_poor: 409,
    nothing_to_sell: 409,
    owned: 409,
    not_owned: 409,
    no_refreshes: 409,
    closed: 409,
    wrong_slot: 409,
    wrong_hero: 409,
    wrong_class: 409,
    no_socket: 409,
    wrong_part: 409,
    no_rune: 409,
    no_fragments: 409,
    no_option: 409,
    claimed: 409,
    bad_pick: 409,
    duplicate: 409,
    no_main_treasure: 409,
    too_many_points: 409,
    perk_locked: 409,
    no_gems: 409,
    no_crystals: 409,
    no_reports: 409,
    not_restorable: 409,
    not_open: 409,
    already_open: 409,
    bad_level: 400,
    no_blood: 409,
    no_void: 409,
    storage_full: 409,
    storage_maxed: 409,
    socketed: 409,
    no_tickets: 409,
    no_piece: 400,
    pending: 409,
    loadout_locked: 409,
    no_scroll: 409,
    scrolls_maxed: 409,
    nothing_worn: 409,
    empty: 409,
    too_long: 409,
    bad_name: 409,
    not_enough: 409,
    name_too_long: 409,
    name_bad_characters: 409,
    name_no_letters: 409,
    name_reserved: 409,
    name_taken: 409,
    // Background raids (services/tm-batches.ts): one running already, or in a raid's fight; or what was asked makes no sense.
    running: 409,
    fighting: 409,
    locked: 409,
    bad_count: 400,
    boss: 400,
    mode: 400,
    heroes: 400,
    team_full: 400,
};
/** Thrown by a service, controller or middleware when the site's request can't be done. */
export class ApiError extends Error {
    code;
    detail;
    /** `detail`, if any, is answered beside the code (invalid_setting's `problems`). */
    constructor(code, detail) {
        super(code);
        this.code = code;
        this.detail = detail;
    }
    get status() {
        return STATUS[this.code];
    }
}
//# sourceMappingURL=errors.js.map