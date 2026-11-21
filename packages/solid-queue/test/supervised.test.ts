import { describe, it } from "vitest";

describe("SupervisedTest", () => {
  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (`fork`).
  it.skip("forked processes exit immediately, without running inherited at-exit hooks", () => {});
});
