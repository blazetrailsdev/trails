import { describe, it } from "vitest";

describe("AdapterLeasingTest", () => {
  it.skip("in use?", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in adapter-leasing
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for AdapterLeasingTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in adapter-leasing.test.ts
  });
  it.skip("lease twice", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in adapter-leasing
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for AdapterLeasingTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in adapter-leasing.test.ts
  });
  it.skip("expire mutates in use", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in adapter-leasing
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for AdapterLeasingTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in adapter-leasing.test.ts
  });
  it.skip("close", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in adapter-leasing
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for AdapterLeasingTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in adapter-leasing.test.ts
  });
});
