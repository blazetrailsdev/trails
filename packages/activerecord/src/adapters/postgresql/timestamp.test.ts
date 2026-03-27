/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/timestamp_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
    await adapter.exec(`
      CREATE TABLE "postgresql_timestamps" (
        "id" SERIAL PRIMARY KEY,
        "created_at" timestamp without time zone,
        "updated_at" timestamp without time zone DEFAULT NOW(),
        "occurred_at" timestamp with time zone,
        "precise_at" timestamp(3) without time zone
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
    await adapter.close();
  });

  describe("PostgreSQLTimestampTest", () => {
    it("timestamp column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("timestamp without time zone");
    });

    it("timestamp default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col).toBeDefined();
      expect(col!.default).toContain("now");
    });

    it("timestamp type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-06-15 14:30:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Date);
      expect((rows[0].val as Date).getFullYear()).toBe(2023);
    });

    it("timestamp with time zone", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_timestamps" ("occurred_at") VALUES ('2023-06-15 14:30:00+00')`,
      );
      const rows = await adapter.execute(
        `SELECT "occurred_at" FROM "postgresql_timestamps" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].occurred_at).toBeInstanceOf(Date);
    });

    it("timestamp precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
      expect(col!.type).toContain("timestamp");
    });

    it("timestamp infinity", async () => {
      const rows = await adapter.execute("SELECT 'infinity'::timestamp AS val");
      expect(rows[0].val).toBeDefined();
    });

    it("timestamp before epoch", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '1969-12-31 23:59:59' AS val");
      expect(rows[0].val).toBeInstanceOf(Date);
      expect((rows[0].val as Date).getFullYear()).toBe(1969);
    });

    it("timestamp schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime\s*\("created_at"/);
    });

    // Needs migration framework
    it.skip("timestamp migration", async () => {});

    it("datetime column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toContain("timestamp");
    });

    it("datetime default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col!.default).toBeTruthy();
    });

    it("datetime type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 10:00:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Date);
    });

    it("datetime precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
    });

    it("datetime schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime/);
    });

    // Needs Rails time zone support
    it.skip("timestamp with zone values with rails time zone support and no time zone set", () => {});
    it.skip("timestamp with zone values without rails time zone support", () => {});
  });

  describe("PostgreSQLTimestampWithAwareTypesTest", () => {
    it.skip("timestamp with zone values with rails time zone support and time zone set", () => {});
  });

  describe("PostgreSQLTimestampWithTimeZoneTest", () => {
    it.skip("timestamp with zone values with rails time zone support and timestamptz and no time zone set", () => {});
    it.skip("timestamp with zone values with rails time zone support and timestamptz and time zone set", () => {});
  });

  describe("PostgreSQLTimestampFixtureTest", () => {
    it.skip("group by date", () => {});
    it.skip("load infinity and beyond", async () => {});
    it.skip("save infinity and beyond", async () => {});
    it.skip("bc timestamp", () => {});
    it.skip("bc timestamp leap year", () => {});
    it.skip("bc timestamp year zero", () => {});
  });

  describe("PostgreSQLTimestampMigrationTest", () => {
    it.skip("adds column as timestamp", () => {});
    it.skip("adds column as timestamptz if datetime type changed", () => {});
    it.skip("adds column as custom type", () => {});
  });
});
