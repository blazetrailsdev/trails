import { describe, it } from "vitest";

describe("TestDisconnectedAdapter", () => {
  it.skip("reconnects to execute statements when disconnected", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — in_memory_db
    // Rails wraps this entire test in `unless in_memory_db?`; with :memory: SQLite it
    // never runs. The TS suite always uses :memory:, so this test can never execute.
  });
});
