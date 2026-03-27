/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bind_parameter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("BindParameterTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "bind_test"`);
      await adapter.exec(`
        CREATE TABLE "bind_test" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT
        )
      `);
      await adapter.executeMutation(`INSERT INTO "bind_test" ("name") VALUES ('hello')`);
    });

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
