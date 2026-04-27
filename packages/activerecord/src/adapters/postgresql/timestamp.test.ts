/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/timestamp_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
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
      // Rails' Column#default is nil for expression defaults; the SQL
      // expression itself lives in #default_function (postgresql/column.rb).
      expect(col!.defaultFunction).toContain("now");
    });

    it("timestamp type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-06-15 14:30:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Temporal.PlainDateTime);
      expect((rows[0].val as Temporal.PlainDateTime).year).toBe(2023);
    });

    it("timestamp with time zone", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_timestamps" ("occurred_at") VALUES ('2023-06-15 14:30:00+00')`,
      );
      const rows = await adapter.execute(
        `SELECT "occurred_at" FROM "postgresql_timestamps" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].occurred_at).toBeInstanceOf(Temporal.Instant);
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
      expect(rows[0].val).toBeInstanceOf(Temporal.PlainDateTime);
      expect((rows[0].val as Temporal.PlainDateTime).year).toBe(1969);
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
      expect(col!.defaultFunction).toBeTruthy();
    });

    it("datetime type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 10:00:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Temporal.PlainDateTime);
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
    it("adds column as timestamp", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
      try {
        await adapter.exec(`CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`);
        await adapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime");
        const rows = await adapter.execute(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
        );
        expect(rows[0]?.data_type).toBe("timestamp without time zone");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
      }
    });

    it("adds column as timestamptz if datetime type changed", async () => {
      class TimestamptzAdapter extends PostgreSQLAdapter {
        static override datetimeType: "timestamp" | "timestamptz" = "timestamptz";
      }
      const tzAdapter = new TimestamptzAdapter(PG_TEST_URL);
      try {
        await tzAdapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        await tzAdapter.exec(
          `CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`,
        );
        await tzAdapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime");
        const rows = await tzAdapter.execute(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
        );
        expect(rows[0]?.data_type).toBe("timestamp with time zone");
      } finally {
        await tzAdapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        await tzAdapter.close();
      }
    });

    it.skip("adds column as custom type", async () => {
      // Requires creating a custom enum type and patching NATIVE_DATABASE_TYPES
    });
  });
});
