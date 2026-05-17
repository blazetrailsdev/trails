/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/interval_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// The `interval_data_types` table uses the PG-specific `interval` type
// (including `interval(3)` precision and `interval[]`), which isn't
// expressible via defineSchema. The table is created via raw DDL below;
// defineSchema(adapter, {}) marks the file as TM-Phase-5 compliant.
async function freshAdapter(): Promise<PostgreSQLAdapter> {
  const adapter = new PostgreSQLAdapter(PG_TEST_URL);
  await defineSchema(adapter, {});
  return adapter;
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let IntervalDataType: any;

  beforeEach(async () => {
    adapter = await freshAdapter();
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

    it("interval type", async () => {
      const sixYears = Duration.parse("P6Y5M4DT3H2M1S");
      const oneYear = Duration.parse("P1Y2M3DT4H5M6.235S");
      await IntervalDataType.createBang({
        maximum_term: sixYears,
        minimum_term: oneYear,
        all_terms: [Duration.parse("P1M"), Duration.parse("P1Y"), Duration.parse("PT1H")],
        legacy_term: "33 years",
      });
      const i = await IntervalDataType.last();
      expect((i.maximum_term as Duration).iso8601()).toBe("P6Y5M4DT3H2M1S");
      expect((i.minimum_term as Duration).iso8601()).toBe("P1Y2M3DT4H5M6.235S");
      expect((i.default_term as Duration).iso8601()).toBe("P3Y");
      // Rails: assert_equal %w[ P1M P1Y PT1H ], i.all_terms.map(&:iso8601)
      expect((i.all_terms as Duration[]).map((d) => d.iso8601())).toEqual(["P1M", "P1Y", "PT1H"]);
      expect(i.legacy_term).toBe("P33Y");
    });

    it("interval type cast from invalid string", async () => {
      const i = await IntervalDataType.createBang({ maximum_term: "1 year 2 minutes" });
      // Rails: invalid non-ISO string casts to nil before INSERT, so column is NULL.
      // Verify at the SQL level (in addition to the reload assertion below) to pin
      // the pre-INSERT cast independently of row-read deserialization.
      const rows = await adapter.execute(
        `SELECT maximum_term IS NULL AS is_null FROM interval_data_types WHERE id = $1`,
        [(i as any).id],
      );
      expect(rows[0].is_null).toBe(true);
      await i.reload();
      expect(i.maximum_term).toBeNull();
    });

    it("interval type cast from numeric", async () => {
      const i = await IntervalDataType.createBang({ minimum_term: 36000 });
      await i.reload();
      expect((i.minimum_term as Duration).iso8601()).toBe("PT10H");
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
      // Mirrors Rails test_average_interval_type. Averages 6.years and
      // 4.months → 3.years + 2.months. PG sets `intervalstyle = iso_8601`
      // per session (configureConnection), so AVG(interval) returns an
      // ISO 8601 string that the Interval OID parses cleanly.
      await IntervalDataType.createBang({ maximum_term: "P6Y" });
      await IntervalDataType.createBang({ maximum_term: "P4M" });
      const avg = await IntervalDataType.average("maximum_term");
      expect(avg).toBeInstanceOf(Duration);
      // PG averages 6 years + 4 months → "3 years 2 mons" → "P3Y2M".
      // Assert the actual averaged value rather than just the type to
      // catch regressions where AVG falls through to wrong deserialization.
      expect((avg as Duration).iso8601()).toBe("P3Y2M");
    });

    it("schema dump with default value", async () => {
      // Mirrors Rails test_schema_dump_with_default_value: the default
      // value "P3Y" should round-trip through schema dump as
      //   t.interval "default_term", default: "P3Y"
      const output = await SchemaDumper.dumpTableSchema(adapter, "interval_data_types");
      // Rails dumps as `t.interval "default_term", default: "P3Y"`; our DSL
      // emits intervals via the generic `t.column(...)` helper, so accept
      // either spelling so long as the default round-trips as "P3Y".
      expect(output).toMatch(
        /t\.interval\("default_term",\s*\{[^}]*default:\s*"P3Y"|t\.column\("default_term",\s*"interval"(?:\([^)]*\))?,\s*\{[^}]*default:\s*"P3Y"/,
      );
    });
  });
});
