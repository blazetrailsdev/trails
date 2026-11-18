import type { AssertionReceipt } from "../assertion-receipts.js";

const ASYNC_GEM_REASON =
  'configuration_test.rb:299-305 — the `require "async"` LoadError arm of `ensure_fiber_workers_have_required_dependency` (configuration.rb:136-143) has no npm analogue and is not ported (packages/solid-queue/CLAUDE.md, "`FiberPool` inlines the `async` gem")';

export const solidQueue: Record<string, AssertionReceipt[]> = {
  "solid-queue:unit/configuration_test.rb › ConfigurationTest › validate configuration": [
    { kind: "expects", value: "s:require", as: null, reason: ASYNC_GEM_REASON },
    { kind: "assert_not", value: null, as: null, reason: ASYNC_GEM_REASON },
    { kind: "assert_match", value: null, as: null, reason: ASYNC_GEM_REASON },
  ],
};
