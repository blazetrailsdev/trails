import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_CONFIG } from "./test-helper.js";
import { DateTime as OidDateTime } from "../../../../lib/connection-adapters/postgresql/oid/date-time.js";
import { fixtures } from "../../../support/use-fixtures.js";
import { Base } from "../../../../lib/index.js";
import { dumpTableSchema } from "../../../support/schema-dumping-helper.js";

describeIfPg("PostgreSQLAdapter OID::DateTime", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
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
  fixtures([]);

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("PostgreSQLTimestampTest", () => {
    it("timestamp column", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_without_precision");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
      expect(col!.sqlType).toBe("timestamp without time zone");
    });

    it("timestamp default", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_function");
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
        `INSERT INTO "defaults" ("fixed_time_with_time_zone") VALUES ('2023-06-15 14:30:00+00')`,
      );
      const rows = (
        await adapter.execQuery(
          `SELECT "fixed_time_with_time_zone" FROM "defaults" WHERE "id" = $1`,
          "SQL",
          [id],
        )
      ).toArray();
      expect(rows[0].fixed_time_with_time_zone).toBeInstanceOf(RubyTime);
    });

    it("timestamp precision", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_with_precision_0");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
      expect(col!.precision).toBe(0);
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
      const output = await dumpTableSchema("defaults");
      expect(output).toContain("defaults");
      expect(output).toMatch(/t\.datetime\s*\("modified_time_without_precision"/);
    });

    it("datetime column", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_without_precision");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
    });

    it("datetime default", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_function");
      expect(col!.defaultFunction).toBeTruthy();
    });

    it("datetime type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 10:00:00' AS val");
      expect(rows[0].val).toBeInstanceOf(RubyTime);
    });

    it("datetime precision", async () => {
      const cols = await adapter.columns("defaults");
      const col = cols.find((c) => c.name === "modified_time_with_precision_0");
      expect(col).toBeDefined();
      expect(col!.precision).toBe(0);
    });

    it("datetime schema dump", async () => {
      const output = await dumpTableSchema("defaults");
      expect(output).toContain("defaults");
      expect(output).toMatch(/t\.datetime/);
    });
  });
});
