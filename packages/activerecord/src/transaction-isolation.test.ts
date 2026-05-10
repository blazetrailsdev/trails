import { describe, it } from "vitest";

describe("TransactionIsolationUnsupportedTest", () => {
  it.skip("setting the isolation level raises an error", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
});

describe("TransactionIsolationTest", () => {
  it.skip("read uncommitted", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
  it.skip("read committed", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
  it.skip("repeatable read", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
  it.skip("serializable", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
  it.skip("setting isolation when joining a transaction raises an error", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
  it.skip("setting isolation when starting a nested transaction raises error", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/excluded-files.ts) — gvl
  });
});
