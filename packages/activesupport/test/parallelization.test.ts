import { describe, it } from "vitest";

describe("ParallelizationTest", () => {
  // PERMANENT-SKIP: `Parallelization` forks its workers and the test kills one by pid; Node's `child_process.fork` starts a fresh process rather than copying the parent (CLAUDE.md, "Runtime facts Node does not expose", the `fork` bullet).
  it.skip("shutdown handles dead workers gracefully");
});
