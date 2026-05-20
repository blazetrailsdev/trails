/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bind_parameter_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../../test-helpers/with-transactional-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    // `dropExisting: true` makes this file repeatable against a
    // non-empty PG test DB — a prior aborted run could leave `bind_test`
    // behind, and the per-adapter signature cache starts empty in a
    // fresh process, so defineSchema would otherwise try CREATE TABLE
    // over an existing table.
    await defineSchema(adapter, { bind_test: { name: "string" } }, { dropExisting: true });
    await adapter.executeMutation(`INSERT INTO "bind_test" ("name") VALUES ('hello')`);
  });

  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "bind_test"`).catch(() => {});
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter);

  describe("BindParameterTest", () => {
    it("where with string for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, ["hello"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("hello");
    });

    it("where with integer for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, [123]);
      expect(rows).toHaveLength(0);
    });

    it("where with float for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, [1.5]);
      expect(rows).toHaveLength(0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, [true]);
      expect(rows).toHaveLength(0);
    });

    it("where with decimal for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, [99.99]);
      expect(rows).toHaveLength(0);
    });

    it("where with rational for string column using bind parameters", async () => {
      const rows = await adapter.execute(`SELECT * FROM "bind_test" WHERE "name" = ?`, [0.3333]);
      expect(rows).toHaveLength(0);
    });
  });
});
