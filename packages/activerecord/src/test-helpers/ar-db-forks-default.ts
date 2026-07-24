/**
 * Default vitest worker count for the AR DB suite.
 *
 * Its own module because vitest.config.ts imports it while loading the config,
 * before any workspace package is built — so it must not pull in
 * `@blazetrails/activesupport` (which ar-db-slots.ts does, for the OS adapter).
 */
export const DEFAULT_FORKS = 6;

/** The env vars that request a worker count, in precedence order. */
export interface ForkCountEnv {
  TRAILS_TEST_FORKS?: string | undefined;
  AR_DB_FORKS?: string | undefined;
}

/**
 * Effective vitest worker count: `TRAILS_TEST_FORKS` > `AR_DB_FORKS` >
 * {@link DEFAULT_FORKS}, clamped to `hostCap`. Non-numeric or non-positive
 * (unset, "auto", "0") falls back to the default. A null `hostCap` means the
 * host core count is unknown, so the request goes unclamped.
 *
 * Both sides of the fork-count duplication call this: vitest.config.ts (for
 * `poolOptions.forks.maxForks`) and ar-db-slots.ts's `workerForkCount()` (for
 * the advisory-slot pool). They cannot share a module that imports
 * `@blazetrails/activesupport` — the config is loaded before any workspace
 * package is built — so the shared piece lives here, dependency-free, with
 * each side supplying its own host-core reading.
 */
export function resolveForkCount(env: ForkCountEnv, hostCap: number | null): number {
  const n = parseInt(env.TRAILS_TEST_FORKS ?? env.AR_DB_FORKS ?? "", 10);
  const requested = Number.isFinite(n) && n > 0 ? n : DEFAULT_FORKS;
  return hostCap === null ? requested : Math.min(requested, hostCap);
}
