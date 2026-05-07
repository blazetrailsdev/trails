/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/partitions_test.rb
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

  describe("PostgresqlPartitionsTest", () => {
    it.skip("partition table", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in partitions
      // ROOT-CAUSE: adapters/postgresql/partitions.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/partitions.ts; affects ~10–47 tests in partitions.test.ts
    });
    it.skip("partitions table exists", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in partitions
      // ROOT-CAUSE: adapters/postgresql/partitions.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/partitions.ts; affects ~10–47 tests in partitions.test.ts
    });
  });
});
