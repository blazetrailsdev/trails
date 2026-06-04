/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/interval_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { Column as PostgreSQLColumn } from "../../connection-adapters/postgresql/column.js";

// Rails: class IntervalDataType < ActiveRecord::Base
//   attribute :legacy_term, :string
class IntervalDataType extends Base {
  static {
    this.tableName = "interval_data_types";
    this.attribute("legacy_term", "string");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let adapter: PostgreSQLAdapter;
  let columnMax: PostgreSQLColumn;
  let columnMin: PostgreSQLColumn;

  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
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
    IntervalDataType.resetColumnInformation();
    await IntervalDataType.loadSchema();
    const hash = IntervalDataType.columnsHash() as unknown as Record<string, PostgreSQLColumn>;
    columnMax = hash["maximum_term"];
    columnMin = hash["minimum_term"];
    // Rails setup assertions
    expect(columnMax).toBeInstanceOf(PostgreSQLColumn);
    expect(columnMin).toBeInstanceOf(PostgreSQLColumn);
    expect(columnMax.precision).toBeNull();
    expect(columnMin.precision).toBe(3);
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS interval_data_types`);
    IntervalDataType.resetColumnInformation();
  });

  describe("PostgresqlIntervalTest", () => {
    it("column", async () => {
      expect(columnMax.type).toBe("interval");
      expect(columnMin.type).toBe("interval");
      expect(columnMax.sqlType).toBe("interval");
      expect(columnMin.sqlType).toBe("interval(3)");
    });

    it("interval type", async () => {
      await IntervalDataType.createBang({
        maximum_term: Duration.parse("P6Y5M4DT3H2M1S"),
        minimum_term: Duration.parse("P1Y2M3DT4H5M6.235S"),
        all_terms: [Duration.parse("P1M"), Duration.parse("P1Y"), Duration.parse("PT1H")],
        legacy_term: "33 years",
      });
      const i = await IntervalDataType.lastBang();
      expect((i.maximum_term as Duration).iso8601()).toBe("P6Y5M4DT3H2M1S");
      expect((i.minimum_term as Duration).iso8601()).toBe("P1Y2M3DT4H5M6.235S");
      expect((i.default_term as Duration).iso8601()).toBe("P3Y");
      expect((i.all_terms as Duration[]).map((d) => d.iso8601())).toEqual(["P1M", "P1Y", "PT1H"]);
      expect(i.legacy_term).toBe("P33Y");
    });

    it("interval type cast from invalid string", async () => {
      const i = await IntervalDataType.createBang({ maximum_term: "1 year 2 minutes" });
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
      await IntervalDataType.createBang([
        { maximum_term: Duration.parse("P6Y") },
        { maximum_term: Duration.parse("P4M") },
      ]);
      const avg = await IntervalDataType.average("maximum_term");
      expect(avg).toBeInstanceOf(Duration);
      expect((avg as Duration).iso8601()).toBe("P3Y2M");
    });

    it("schema dump with default value", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "interval_data_types");
      expect(output).toMatch(
        /t\.interval\("default_term",\s*\{[^}]*default:\s*"P3Y"|t\.column\("default_term",\s*"interval"(?:\([^)]*\))?,\s*\{[^}]*default:\s*"P3Y"/,
      );
    });
  });
});
