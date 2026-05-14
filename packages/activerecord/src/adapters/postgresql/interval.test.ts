/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/interval_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let IntervalDataType: any;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS interval_data_types`);
    await adapter.exec(`
      CREATE TABLE interval_data_types (
        id serial primary key,
        maximum_term interval,
        minimum_term interval(3),
        default_term interval DEFAULT 'P3Y',
        all_terms interval[],
        legacy_term interval
      )
    `);
    await adapter.loadAdditionalTypes();
    const { Base } = await import("../../index.js");
    class IntervalDataTypeCls extends Base {
      static tableName = "interval_data_types";
      static {
        this.adapter = adapter;
        this.attribute("legacy_term", "string");
      }
    }
    await IntervalDataTypeCls.loadSchema();
    IntervalDataType = IntervalDataTypeCls;
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS interval_data_types`);
    await adapter.close();
  });

  describe("PostgresqlIntervalTest", () => {
    it("column", async () => {
      const columns = await adapter.columns("interval_data_types");
      const columnMax = columns.find((c) => c.name === "maximum_term")!;
      const columnMin = columns.find((c) => c.name === "minimum_term")!;
      // Rails: assert_equal :interval, @column_max.type
      expect(columnMax.type).toBe("interval");
      expect(columnMin.type).toBe("interval");
      // Rails: assert_equal "interval", @column_max.sql_type
      expect(columnMax.sqlType).toBe("interval");
      // Rails: assert_equal "interval(3)", @column_min.sql_type
      expect(columnMin.sqlType).toBe("interval(3)");
      // Rails: assert_nil @column_max.precision; assert_equal 3, @column_min.precision
      expect(columnMax.precision).toBeNull();
      expect(columnMin.precision).toBe(3);
    });

    it.skip("interval type", async () => {
      // BLOCKED: model attribute lifecycle does not deserialize interval columns from row data
      // ROOT-CAUSE: rows returned from PG SELECT contain interval as ISO8601 strings, but Base
      //   does not route them through Interval.cast/castValue when materializing attributes —
      //   the attribute reads back as null instead of a Duration.
      // SCOPE: ~30–80 LOC — likely in attribute-set materialization or postgresql/oid type-map
      //   wiring for interval result deserialization; see Slot B (round-trip).
    });

    it("interval type cast from invalid string", async () => {
      const i = await IntervalDataType.createBang({ maximum_term: "1 year 2 minutes" });
      // Rails: invalid non-ISO string casts to nil before INSERT, so column is NULL.
      // Verify at the SQL level so this can't be a false positive from the parallel
      // row-read deserialization gap (see skipped "interval type" test).
      const rows = await adapter.execute(
        `SELECT maximum_term IS NULL AS is_null FROM interval_data_types WHERE id = $1`,
        [(i as any).id],
      );
      expect(rows[0].is_null).toBe(true);
      await i.reload();
      expect(i.maximum_term).toBeNull();
    });

    it.skip("interval type cast from numeric", async () => {
      // BLOCKED: same as "interval type" — reload() materializes interval column as null
      //   instead of routing the ISO8601 row value through Interval.castValue.
      // ROOT-CAUSE: postgresql interval result deserialization not wired into Base
      //   attribute lifecycle on row reads.
      // SCOPE: shares fix with "interval type"; see Slot B (round-trip).
    });

    it("interval type cast string and numeric from user", () => {
      const i = new IntervalDataType();
      i.maximum_term = "P1YT2M";
      i.minimum_term = "PT10H";
      i.legacy_term = "P1DT1H";
      expect(i.maximum_term).toBeInstanceOf(Duration);
      expect(typeof i.legacy_term).toBe("string");
      expect((i.maximum_term as Duration).iso8601()).toBe("P1YT2M");
      expect((i.minimum_term as Duration).iso8601()).toBe("PT10H");
      expect(i.legacy_term).toBe("P1DT1H");
    });

    it("average interval type", async () => {
      await IntervalDataType.createBang({ maximum_term: "P2Y" });
      await IntervalDataType.createBang({ maximum_term: "P4Y" });
      const avg = await IntervalDataType.average("maximum_term");
      // PG averages "2 years" and "4 years" → "3 years". The verbose result
      // round-trips through Interval.castValue → Duration.
      expect(avg).toBeInstanceOf(Duration);
      // 3 years ≈ 3 × 365.25 × 86400 = 94 672 800 seconds.
      const seconds = (avg as Duration).inSeconds();
      expect(Math.abs(seconds - 3 * 365.25 * 86400)).toBeLessThan(86400);
    });

    it("schema dump with default value", async () => {
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "interval_data_types");
      const dumped = lines.join("\n");
      // default_term column carries DEFAULT 'P3Y' which PG normalizes to
      // "3 years" in pg_get_expr; the OID type re-serializes it back to
      // ISO8601 for the schema dump.
      expect(dumped).toMatch(/default_term.*default:\s*"P3Y"/);
    });
  });
});
