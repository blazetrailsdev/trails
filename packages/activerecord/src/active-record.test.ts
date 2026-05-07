import { describe, it } from "vitest";

describe("ActiveRecordTest", () => {
  it.skip(".disconnect_all! closes all connections", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in active-record
    // ROOT-CAUSE: connection-adapters/abstract/connection-pool.ts or abstract/connection-handler.ts missing Rails parity for ActiveRecordTest
    // SCOPE: ~50–100 LOC fix in connection-adapters/abstract/connection-pool.ts; affects ~10–24 tests in active-record.test.ts
  });
});
