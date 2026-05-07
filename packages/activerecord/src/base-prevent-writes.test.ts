import { describe, it } from "vitest";

describe("BasePreventWritesTest", () => {
  it.skip("creating a record raises if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("updating a record raises if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("deleting a record raises if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("selecting a record does not raise if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: abstract-adapter.ts#execute (read path) does not check preventingWrites — only mutation path does
    // SCOPE: ~20 LOC in abstract-adapter.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("an explain query does not raise if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: abstract-adapter.ts#execute (read/explain path) does not check preventingWrites — only mutation path does
    // SCOPE: ~20 LOC in abstract-adapter.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("an empty transaction does not raise if preventing writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("preventing writes applies to all connections in block", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
  it.skip("current_preventing_writes", () => {
    // BLOCKED: relation — preventingWrites guard not wired into all query paths
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts#executeMutation missing preventingWrites check for some query types
    // SCOPE: ~20 LOC in relation.ts; affects ~5–8 tests in base-prevent-writes.test.ts
  });
});
