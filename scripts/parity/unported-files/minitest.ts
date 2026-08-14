/**
 * Entries scoped to `package: "minitest"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 *
 * trails ports the assertion surface ActiveSupport itself raises, rescues and
 * re-exports (`Minitest::Assertion`, `Skip`, `UnexpectedError`,
 * `UnexpectedWarning`, `BacktraceFilter`, the reporter stack) into
 * `packages/activesupport/src/testing/assertions.ts`. The rest of the gem is
 * runner plumbing vitest fills — no port intended.
 */

import type { UnportedFile } from "./types.js";

const RUNNER_PLUMBING =
  "minitest runner plumbing — vitest fills this role in trails; the ported " +
  "slice is the assertion/reporter surface ActiveSupport raises and rescues " +
  "(activesupport/src/testing/assertions.ts). No port intended.";

// Leading "/" anchors each pattern to a path boundary: the bare basename
// `test.rb` is a substring of `../minitest.rb`, which would take the gem's own
// seat out of the comparison.
export const MINITEST_UNPORTED_FILES: UnportedFile[] = [
  "/autorun.rb",
  "/benchmark.rb",
  "/compress.rb",
  "/error_on_warning.rb",
  "/expectations.rb",
  "/hell.rb",
  "/manual_plugins.rb",
  "/mock.rb",
  "/parallel.rb",
  "/pride.rb",
  "/pride_plugin.rb",
  "/spec.rb",
  "/test.rb",
  "/test_task.rb",
  "/unit.rb",
].map((pattern) => ({ pattern, package: "minitest", reason: RUNNER_PLUMBING }));
