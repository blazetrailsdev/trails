/**
 * Default vitest worker count for the AR DB suite.
 *
 * Its own module because vitest.config.ts imports it while loading the config,
 * before any workspace package is built — so it must not pull in
 * `@blazetrails/activesupport` (which ar-db-slots.ts does, for the OS adapter).
 */
export const DEFAULT_FORKS = 6;
