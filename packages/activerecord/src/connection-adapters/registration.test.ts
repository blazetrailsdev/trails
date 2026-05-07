import { describe, it } from "vitest";

describe("RegistrationTest", () => {
  it.skip("#register registers a new database adapter and #resolve can find it and raises if it cannot", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in registration
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for RegistrationTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in registration.test.ts
  });
  it.skip("#register allows for symbol key", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in registration
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for RegistrationTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in registration.test.ts
  });
  it.skip("#resolve allows for symbol key", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in registration
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for RegistrationTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in registration.test.ts
  });
});

describe("RegistrationIsolatedTest", () => {
  it.skip("#resolve raises if the adapter is using the pre 7.2 adapter registration API", () => {
    // BLOCKED: connection-pool — connection pool / handler gap in registration
    // ROOT-CAUSE: connection-pool.ts or connection-handler.ts missing Rails parity for RegistrationIsolatedTest
    // SCOPE: ~50–100 LOC fix in connection-pool.ts; affects ~10–24 tests in registration.test.ts
  });
});
