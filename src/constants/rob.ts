/*
 * Robbing: the lock that keeps two robs from racing, and the rob titles.
 *
 * Rob titles: each rob picks one at random from the matching list. Add as many as you like, but
 * keep at least one in each list.
 */

/**
 * The lock taken on a victim while a rob on them runs (see services/economy/rob.ts), so two
 * robbers can't act on the same victim at the same moment. A second robber waits for it: every
 * `retryMs` they look again, for at most `attempts` looks, then are told to try again. `holdMs` is
 * how long a lock lasts if the bot stops before it is released; a rob takes well under a second.
 */
export const ROB_LOCK = { holdMs: 15_000, retryMs: 100, attempts: 50 } as const;

/**
 * Bubble Beam (Piplup, perks/bubble-beam.ts): how much of the wearer's slip chance counts when
 * the wearer is the one robbing (0.5: half as likely). As the victim, it counts in full.
 */
export const BUBBLE_BEAM_ROBBER_SHARE = 0.5;

export const SUCCESS_TITLES: readonly string[] = ['IT\'S A STICKUP!', 'THEY\'VE BEEN SLIMED!', 'EMPTY THY POCKETS WANKAH'];

export const FAILURE_TITLES: readonly string[] = ['L+Ratio', 'Your XP was too low', 'You\'re washed..'];
