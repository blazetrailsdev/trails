// `fixtures()` is the sole public fixture surface. Its implementation lives in
// `use-fixtures.js` alongside the module-private `useFixtures` engine it
// composes (the engine and its former `useHandlerFixtures` wrapper are no longer
// exported); this module re-exports it as the Rails-faithful entry point.
export { fixtures } from "./use-fixtures.js";
