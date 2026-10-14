import type { UnportedFile } from "./types.js";

const GEM_ADAPTER =
  "a thin shim over a Ruby gem's client with no Node counterpart; a port would be empty seats.";

export const ACTIVEJOB_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "queue_adapters/backburner_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/delayed_job_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/queue_classic_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/resque_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/sidekiq_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/sneakers_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    pattern: "queue_adapters/sucker_punch_adapter.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    testFile: "cases/delayed_job_adapter_test.rb",
    package: "activejob",
    reason: GEM_ADAPTER,
  },
  {
    testFile: "integration/queuing_test.rb",
    package: "activejob",
    reason: "the integration suite exists to drive the gem adapters (test/support/integration/).",
  },
  {
    testFile: "cases/adapter_test.rb",
    tests: ["sucker_punch adapter should be deprecated", "sucker_punch check_adapter should warn"],
    reason: GEM_ADAPTER,
  },
];
