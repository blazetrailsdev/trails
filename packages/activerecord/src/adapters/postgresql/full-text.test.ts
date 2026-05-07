/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/full_text_test.rb
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

  describe("PostgresqlFullTextTest", () => {
    it.skip("tsvector column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in full-text
      // ROOT-CAUSE: adapters/postgresql/full-text.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/full-text.ts; affects ~10–47 tests in full-text.test.ts
    });
    it.skip("tsquery column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in full-text
      // ROOT-CAUSE: adapters/postgresql/full-text.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/full-text.ts; affects ~10–47 tests in full-text.test.ts
    });
    it.skip("full text search", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in full-text
      // ROOT-CAUSE: adapters/postgresql/full-text.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/full-text.ts; affects ~10–47 tests in full-text.test.ts
    });
    it.skip("update tsvector", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in full-text
      // ROOT-CAUSE: adapters/postgresql/full-text.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/full-text.ts; affects ~10–47 tests in full-text.test.ts
    });
  });
});
