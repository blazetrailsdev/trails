import { describe, it } from "vitest";

// Mirrors vendor/rails/actionpack/test/dispatch/debug_locks_test.rb.
// The test exercises DebugLocks against a live autoload interlock —
// blocked until upstream supports are ported.

describe("DebugLocksTest", () => {
  it.skip("test_render_threads_status", () => {
    // BLOCKED: ActiveSupport::Dependencies.interlock
    // ROOT-CAUSE: action-dispatch/middleware/debug-locks.ts#DebugLocks.interlock
    // — interlock + Concurrent::CountDownLatch equivalents are not ported, so
    //   the test cannot block one thread sharing the interlock while the
    //   request is served.
    // SCOPE: ~80 LOC port of activesupport Dependencies.interlock +
    //   CountDownLatch equivalent; affects ~1 test.
  });
});
