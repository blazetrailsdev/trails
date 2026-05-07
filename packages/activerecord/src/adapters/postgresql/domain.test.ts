/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/domain_test.rb
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

  describe("PostgresqlDomainTest", () => {
    it.skip("column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in domain
      // ROOT-CAUSE: adapters/postgresql/domain.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/domain.ts; affects ~10–47 tests in domain.test.ts
    });
    it.skip("domain type", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in domain
      // ROOT-CAUSE: adapters/postgresql/domain.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/domain.ts; affects ~10–47 tests in domain.test.ts
    });
    it.skip("domain acts like basetype", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in domain
      // ROOT-CAUSE: adapters/postgresql/domain.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/domain.ts; affects ~10–47 tests in domain.test.ts
    });
  });
});
