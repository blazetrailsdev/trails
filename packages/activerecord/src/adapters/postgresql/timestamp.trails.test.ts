import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { DateTime as OidDateTime } from "../../connection-adapters/postgresql/oid/date-time.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

describeIfPg("PostgreSQLAdapter OID::DateTime", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  for (const [name, literal, year] of [
    ["a BC timestamp literal", "0002-12-25 00:00:00 BC", -1],
    ["a BC leap-year timestamp literal", "0005-02-29 00:00:00 BC", -4],
    ["a BC year-zero timestamp literal", "0001-04-07 00:00:00 BC", 0],
  ] as const) {
    it(`casts and re-quotes ${name}`, async () => {
      const oidType = new OidDateTime();
      const instant = oidType.castValue(literal) as RubyTime;
      expect(instant.year).toBe(year);

      const serialized = adapter.quotedDate(instant);
      expect(serialized).toBe(literal);

      const rows = await adapter.execute(`SELECT '${serialized}'::timestamp AS val`);
      const roundTripped = rows[0].val as RubyTime;
      expect(roundTripped).toBeInstanceOf(RubyTime);
      expect(roundTripped.toI()).toBe(instant.toI());
    });
  }
});

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
    await adapter.execute(`
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
    await adapter.execute(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
  });

  describe("PostgreSQLTimestampTest", () => {
    it("timestamp column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
      expect(col!.sqlType).toBe("timestamp without time zone");
    });

    it("timestamp default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col).toBeDefined();
      expect(col!.defaultFunction).toContain("now");
    });

    it("timestamp type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-06-15 14:30:00' AS val");
      expect(rows[0].val).toBeInstanceOf(RubyTime);
      expect((rows[0].val as RubyTime).getutc().year).toBe(2023);
    });

    it("timestamp with time zone", async () => {
      const id = await adapter.insert(
        `INSERT INTO "postgresql_timestamps" ("occurred_at") VALUES ('2023-06-15 14:30:00+00')`,
      );
      const rows = (
        await adapter.execQuery(
          `SELECT "occurred_at" FROM "postgresql_timestamps" WHERE "id" = $1`,
          "SQL",
          [id],
        )
      ).toArray();
      expect(rows[0].occurred_at).toBeInstanceOf(RubyTime);
    });

    it("timestamp precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
      expect(col!.precision).toBe(3);
    });

    it("timestamp infinity", async () => {
      const rows = await adapter.execute("SELECT 'infinity'::timestamp AS val");
      expect(rows[0].val).toBeDefined();
    });

    it("timestamp before epoch", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '1969-12-31 23:59:59' AS val");
      expect(rows[0].val).toBeInstanceOf(RubyTime);
      expect((rows[0].val as RubyTime).getutc().year).toBe(1969);
    });

    it("timestamp schema dump", async () => {
      const output = await dumpTableSchema("postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime\s*\("created_at"/);
    });

    it("datetime column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
    });

    it("datetime default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col!.defaultFunction).toBeTruthy();
    });

    it("datetime type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 10:00:00' AS val");
      expect(rows[0].val).toBeInstanceOf(RubyTime);
    });

    it("datetime precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
      expect(col!.precision).toBe(3);
    });

    it("datetime schema dump", async () => {
      const output = await dumpTableSchema("postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime/);
    });
  });
});
