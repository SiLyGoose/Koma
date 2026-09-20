import { findSpec, validateValue } from './settings-spec.js';

/** Environment variables (.env) that decide where the command prefix comes from. */
export const ENV_MODE_VAR = 'ENV';
export const ENV_PREFIX_VAR = 'DS_PREFIX';

/** The value of ENV that makes the bot use the prefix from .env (any letter case). */
export const LOCAL_MODE = 'LOCAL';

export type PrefixSource = { source: 'env'; prefix: string } | { source: 'database' };

/**
 * Where the command prefix comes from.
 *
 *   ENV=LOCAL           the prefix is DS_PREFIX from .env. It is required in this mode. The
 *                       prefix stored in MongoDB is ignored and can't be changed with k!config.
 *   anything else       (PROD, empty, not set at all...) the prefix is the `prefix` setting in
 *                       MongoDB, which k!config can change.
 *
 * Throws with a message saying what to fix if LOCAL is on but DS_PREFIX is missing or invalid.
 */
export function resolvePrefixSource(env: Record<string, string | undefined>): PrefixSource {
  const mode = env[ENV_MODE_VAR]?.trim().toUpperCase();
  if (mode !== LOCAL_MODE) return { source: 'database' };

  const prefix = env[ENV_PREFIX_VAR]?.trim();
  if (!prefix) {
    throw new Error(
      `${ENV_MODE_VAR} is ${LOCAL_MODE}, so the command prefix is read from .env, but ${ENV_PREFIX_VAR} is missing or empty. ` +
        `Add ${ENV_PREFIX_VAR}=... to your .env file, or remove ${ENV_MODE_VAR}=${LOCAL_MODE} to use the prefix stored in MongoDB.`,
    );
  }

  const spec = findSpec('prefix');
  const problem = spec ? validateValue(spec, prefix) : null;
  if (problem) throw new Error(`${ENV_PREFIX_VAR} in .env ${problem} (got "${prefix}").`);

  return { source: 'env', prefix };
}
