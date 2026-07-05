import { setupHandlerSuite } from "./setup-handler-suite.js";

// `fixtures()` is the sole public fixture surface. Its implementation lives in
// `use-fixtures.js` alongside the module-private `useFixtures` engine it
// composes (the engine and its former `useHandlerFixtures` wrapper are no longer
// exported); this module re-exports it as the Rails-faithful entry point.
export { fixtures } from "./use-fixtures.js";

/**
 * Rails-faithful alias for {@link setupHandlerSuite}.
 *
 * Mirrors Rails' `setup_fixtures` — bootstraps the connection handler once per
 * worker and shields shared-DB tables from the global reset. Use when a file
 * needs the handler-suite wiring without declaring fixtures in the same call.
 *
 * @internal
 */
export function setupFixtures(): void {
  setupHandlerSuite();
}
