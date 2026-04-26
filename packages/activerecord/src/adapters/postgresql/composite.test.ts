/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/composite_test.rb
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

  describe("PostgresqlCompositeTest", () => {
    it.skip("column", async () => {
      // Requires postgresql_composites table fixture with composite type.
    });
    it.skip("composite value", async () => {
      // Requires postgresql_composites table fixture with composite type.
    });
    it.skip("composite mapping", async () => {
      // Requires composite type registered in PostgreSQL and postgresql_composites fixture.
    });
    it.skip("composite write", async () => {
      // Requires postgresql_composites table fixture with composite type.
    });
  });

  describe("PostgresqlCompositeWithCustomOidTest", () => {
    it.skip("composite mapping", async () => {
      // Requires custom OID composite type fixture. PG-only.
    });
  });
});
