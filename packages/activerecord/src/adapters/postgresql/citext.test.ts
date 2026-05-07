/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/citext_test.rb
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

  describe("PostgresqlCitextTest", () => {
    it.skip("citext column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("citext default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("citext type cast", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("case insensitive where", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("case insensitive uniqueness", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("case insensitive comparison", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("citext schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("citext enabled", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("change table supports json", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("write", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("select case insensitive", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
    it.skip("case insensitiveness", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in citext
      // ROOT-CAUSE: adapters/postgresql/citext.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/citext.ts; affects ~10–47 tests in citext.test.ts
    });
  });
});
