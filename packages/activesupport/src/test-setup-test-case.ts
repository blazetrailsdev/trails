/**
 * Suite-wide setup for every non-ActiveRecord package, mirroring what
 * `ActiveSupport::TestCase` mixes into every Rails test case
 * (activesupport/lib/active_support/test_case.rb:144). AR's own suite installs
 * the same hook from `activerecord/src/cases/helper.ts` (the port of
 * helper.rb), whose vitest project does not load this file.
 */
import { beforeEach } from "vitest";
import { beforeSetup } from "./testing/tagged-logging.js";

// `include ActiveSupport::Testing::TaggedLogging` (test_case.rb:144) — the
// module's `before_setup` logs the per-test heading; vitest's per-test hook is
// the receiver-less equivalent.
beforeEach(() => {
  beforeSetup();
});
