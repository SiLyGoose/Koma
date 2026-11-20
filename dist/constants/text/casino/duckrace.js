import { DUCK_IDS, DUCK_RACE_TABLE, DUCKS } from '../../casino/duckrace.js';
const NAMES = DUCK_IDS.map((d) => DUCKS[d].name);
export const duckRaceText = {
    title: '🦆 Duck Race',
    /** What `k!duckrace` says, above the button to the site. `odds` is like "2.8" and `max` like "10,000". */
    intro: (odds, max) => `Race ducks on the Koma site, at a table with up to ${DUCK_RACE_TABLE.seats} players: put chips on ${NAMES.slice(0, -1).join(', ')} or ${NAMES.at(-1)}, and they race when the timer runs out. ` +
        `Every duck is as likely to win, and a bet on the winner pays ${odds} to 1.\n` +
        `Up to ${max} on the table a race.`,
    footer: 'Log in with Discord on the site. Your points are the same as here.',
    playButton: 'Play Duck Race',
    /** Without the web site, the duck race can't be played. */
    off: 'The duck race is played in the browser, and the web site is not set up on this bot yet.',
};
//# sourceMappingURL=duckrace.js.map