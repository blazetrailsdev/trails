// `fixtures()` is the sole public fixture surface. Its implementation lives in
// `../test-fixtures.js` (Rails: `lib/active_record/test_fixtures.rb`) alongside
// the module-private `useFixtures` engine it composes; this module re-exports
// it as the entry point. The 331 call sites that import this shim are
// repointed at `../test-fixtures.js` by the `repoint-fixtures-entry-point`
// story, which then deletes this file.
export { fixtures } from "../test-fixtures.js";
