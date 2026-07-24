/**
 * Default vitest worker count for the AR DB suite.
 *
 * Its own module because vitest.config.ts imports it while loading the config,
 * before any workspace package is built — so it must not pull in
 * `@blazetrails/activesupport` (which ar-db-slots.ts does, for the OS adapter).
 */
export const DEFAULT_FORKS = 6;

export interface ForkCountEnv {
  TRAILS_TEST_FORKS?: string | undefined;
  AR_DB_FORKS?: string | undefined;
}

export function resolveForkCount(env: ForkCountEnv, hostCap: number | null): number {
  const n = parseInt(env.TRAILS_TEST_FORKS ?? env.AR_DB_FORKS ?? "", 10);
  const requested = Number.isFinite(n) && n > 0 ? n : DEFAULT_FORKS;
  return hostCap === null ? requested : Math.min(requested, hostCap);
}
