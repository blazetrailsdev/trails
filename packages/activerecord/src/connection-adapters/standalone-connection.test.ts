import { describe, it } from "vitest";

describe("StandaloneConnectionTest", () => {
  it.skip("can query", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in standalone-connection
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for StandaloneConnectionTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in standalone-connection.test.ts
  });
  it.skip("async fallback", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in standalone-connection
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for StandaloneConnectionTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in standalone-connection.test.ts
  });
  it.skip("can throw away", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in standalone-connection
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for StandaloneConnectionTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in standalone-connection.test.ts
  });
  it.skip("can close", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in standalone-connection
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for StandaloneConnectionTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in standalone-connection.test.ts
  });
});
