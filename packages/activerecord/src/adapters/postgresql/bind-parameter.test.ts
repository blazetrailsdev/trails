/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bind_parameter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { PostgresAdapter } from "../postgres-adapter.js";

const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;

async function checkPg(): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

pgAvailable = await checkPg();
const describeIfPg = pgAvailable ? describe : describe.skip;

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlBindParameterTest", () => {
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
