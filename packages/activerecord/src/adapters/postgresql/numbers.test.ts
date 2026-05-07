/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/numbers_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLNumberTest", () => {
    it.skip("numeric column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("numeric default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("numeric type cast", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("numeric nan", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("numeric infinity", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("data type", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("values", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("reassigning infinity does not mark record as changed", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("reassigning nan does not mark record as changed", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
    });
    it.skip("update", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in numbers
      // ROOT-CAUSE: adapters/postgresql/numbers.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/numbers.ts; affects ~10–47 tests in numbers.test.ts
      /* TODO: needs imports from original file */
    });
  });
});
