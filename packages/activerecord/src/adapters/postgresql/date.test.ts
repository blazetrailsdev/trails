/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/date_test.rb
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

  describe("PostgresqlDateTest", () => {
    it.skip("date column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("date default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("date type cast", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("date infinity", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("date before epoch", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("bc date", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("bc date leap year", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
    it.skip("bc date year zero", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in date
      // ROOT-CAUSE: adapters/postgresql/date.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/date.ts; affects ~10–47 tests in date.test.ts
    });
  });
});
