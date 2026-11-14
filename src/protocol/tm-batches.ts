/* Background raids on the raid's page: what the bot's GET /api/tm-batches (and its POSTs) say. */

/** A batch of background raids, as the page shows it (times in ms since 1970). */
export interface TmBatchView {
  id: string;
  raid: 'technomagic' | 'dragon';
  boss: string;
  /** Its boss's name, and where it fought: "Galgoria, stage 5", a dragon's "Temeraire, Hard 7". */
  bossName: string;
  where: string;
  mode: 'hard' | 'normal';
  stage: number;
  /** The lineup: each hero's id, and whether it is in the Sub Team. */
  heroes: { id: string; sub?: boolean }[];
  /** How many runs were asked for, are over, won and lost, and the points they cost. */
  count: number;
  done: number;
  won: number;
  lost: number;
  spent: number;
  /** Running, or over (and why: every run fought, stopped, out of points, their heroes gone, or one couldn't be fought). */
  state: 'running' | 'done';
  end: 'finished' | 'stopped' | 'too_poor' | 'no_heroes' | 'failed' | null;
  /** The run being fought: when it began and when it is over (and paid). */
  current: { startedAt: number; endsAt: number } | null;
  startedAt: number;
  endedAt: number | null;
}

/** GET /api/tm-batches: their batch running, or their last (null: none ever); what a run costs, the most a batch takes, their points, and the bot's clock. */
export interface TmBatchesView {
  batch: TmBatchView | null;
  price: number;
  most: number;
  balance: number;
  now: number;
}

/** POST /api/tm-batches/start: the raid, its boss, mode and stage, the lineup, and how many runs (1 to `most`). */
export interface TmBatchStart {
  raid: 'technomagic' | 'dragon';
  boss: string;
  mode: 'hard' | 'normal';
  stage: number;
  heroes: { id: string; sub?: boolean }[];
  count: number;
}
