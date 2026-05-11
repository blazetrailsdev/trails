import { describe, it } from "vitest";

describe("HotCompatibilityTest", () => {
  it.skip("insert after remove_column", () => {
    // PERMANENT-SKIP: pre-1.0 scope (see scripts/api-compare/unported-files.ts) — migration/compatibility shims not yet ported
  });
  it.skip("update after remove_column", () => {
    // PERMANENT-SKIP: pre-1.0 scope (see scripts/api-compare/unported-files.ts) — migration/compatibility shims not yet ported
  });
  it.skip("cleans up after prepared statement failure in a transaction", () => {
    // PERMANENT-SKIP: pre-1.0 scope (see scripts/api-compare/unported-files.ts) — migration/compatibility shims not yet ported
  });
  it.skip("cleans up after prepared statement failure in nested transactions", () => {
    // PERMANENT-SKIP: pre-1.0 scope (see scripts/api-compare/unported-files.ts) — migration/compatibility shims not yet ported
  });
});
