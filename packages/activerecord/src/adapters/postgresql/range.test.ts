import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { parseRange } from "./pg-range.js";
import { Range } from "../../relation.js";
import { Base } from "../../index.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone, TimeZone, setZone, BigDecimal } from "@blazetrails/activesupport";
import { fixtures } from "../../test-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const toInt = (s: string) => parseInt(s, 10);
const toFloat = (s: string) => parseFloat(s);
const toBigInt = (s: string) => BigInt(s);

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let PostgresqlRanges: any;
  let PostgresqlRangesTz: any;

  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.dropRange("floatrange", { ifExists: true });
    await adapter.dropRange("stringrange", { ifExists: true });
    await adapter.createRange("floatrange", { subtype: "float8", subtypeDiff: "float8mi" });
    await adapter.createRange("stringrange", { subtype: "varchar" });
    await adapter.exec(`
      CREATE TABLE postgresql_ranges (
        id serial primary key,
        date_range daterange,
        num_range numrange,
        ts_range tsrange,
        tstz_range tstzrange,
        ts_ranges tsrange[],
        tstz_ranges tstzrange[],
        int4_range int4range,
        int8_range int8range,
        float_range floatrange,
        string_range stringrange
      )
    `);
    await adapter.loadAdditionalTypes();
    class PostgresqlRangesCls extends Base {
      static tableName = "postgresql_ranges";
      static {
        this.attribute("id", "integer");
      }
    }
    void PostgresqlRangesCls.resetColumnInformation();
    await PostgresqlRangesCls.loadSchema();
    PostgresqlRanges = PostgresqlRangesCls;

    class PostgresqlRangesTzCls extends Base {
      static tableName = "postgresql_ranges";
      static timeZoneAwareAttributes = true;
      static timeZoneAwareTypes = [...Base.timeZoneAwareTypes, "tsrange", "tstzrange"];
      static {
        this.attribute("id", "integer");
      }
    }
    await PostgresqlRangesTzCls.loadSchema();
    PostgresqlRangesTz = PostgresqlRangesTzCls;
  });
  afterEach(() => {
    setZone(null);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.dropRange("floatrange", { ifExists: true });
    await adapter.dropRange("stringrange", { ifExists: true });
  });

  describe("PostgresqlRangeTest", () => {
    it("int4range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range).toBeInstanceOf(Range);
      expect(range.begin).toBe(1);
      expect(range.end).toBe(11);
      expect(range.excludeEnd).toBe(true);
    });

    it("int4range default", async () => {
      const rows = await adapter.execute(
        `INSERT INTO postgresql_ranges DEFAULT VALUES RETURNING int4_range`,
      );
      expect(rows[0].int4_range).toBeNull();
    });

    it("int4range type cast", async () => {
      const range = parseRange("[1,10)", toInt)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(10);
      expect(range.excludeEnd).toBe(true);
    });

    it("int4range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(10);
    });

    it("int4range where", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT * FROM postgresql_ranges WHERE int4_range @> 5`);
      expect(rows).toHaveLength(1);
    });

    it("int4range contains", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT * FROM postgresql_ranges WHERE int4_range @> 5`);
      expect(rows).toHaveLength(1);
      const notContained = await adapter.execute(
        `SELECT * FROM postgresql_ranges WHERE int4_range @> 15`,
      );
      expect(notContained).toHaveLength(0);
    });

    it("int4range empty", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('empty')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt);
      expect(range).toBeNull();
    });

    it("int4range infinity", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[,]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range.begin).toBeNull();
      expect(range.end).toBeNull();
    });

    it("int8range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100]')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int8_range as string, toBigInt)!;
      expect(range.begin).toBe(10n);
    });

    it("int8range type cast", async () => {
      const range = parseRange("[10,100)", toBigInt)!;
      expect(range.begin).toBe(10n);
      expect(range.end).toBe(100n);
    });

    it("int8range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100)')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      expect(rows[0].int8_range).toBeDefined();
    });

    it("numrange column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (num_range) VALUES ('[0.1,0.2]')`);
      const rows = await adapter.execute(`SELECT num_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].num_range as string, toFloat)!;
      expect(range.begin).toBeCloseTo(0.1);
      expect(range.end).toBeCloseTo(0.2);
      expect(range.excludeEnd).toBe(false);
    });

    it("numrange type cast", async () => {
      const range = parseRange("[0.1,0.2)", toFloat)!;
      expect(range.begin).toBeCloseTo(0.1);
      expect(range.end).toBeCloseTo(0.2);
      expect(range.excludeEnd).toBe(true);
    });

    it("numrange write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (num_range) VALUES ('[0.1,0.2]')`);
      const rows = await adapter.execute(`SELECT num_range FROM postgresql_ranges`);
      expect(rows[0].num_range).toBeDefined();
    });

    it("tsrange column", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (ts_range) VALUES ('[2010-01-01 14:30,2011-01-01 14:30]')`,
      );
      const rows = await adapter.execute(`SELECT ts_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].ts_range as string)!;
      expect(range.begin as string).toContain("2010-01-01");
      expect(range.end as string).toContain("2011-01-01");
    });

    it("tsrange type cast", async () => {
      const range = parseRange('["2010-01-01 14:30:00","2011-01-01 14:30:00")')!;
      expect(range.begin as string).toContain("2010-01-01");
      expect(range.excludeEnd).toBe(true);
    });

    it("tsrange write", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (ts_range) VALUES ('[2010-01-01,2011-01-01)')`,
      );
      const rows = await adapter.execute(`SELECT ts_range FROM postgresql_ranges`);
      expect(rows[0].ts_range).toBeDefined();
    });

    it("tstzrange column", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (tstz_range) VALUES ('[2010-01-01 14:30+00,2011-01-01 14:30+00]')`,
      );
      const rows = await adapter.execute(`SELECT tstz_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].tstz_range as string)!;
      expect(range.begin as string).toContain("2010-01-01");
    });

    it("tstzrange type cast", async () => {
      const range = parseRange('["2010-01-01 14:30:00+00","2011-01-01 14:30:00+00")')!;
      expect(range.begin as string).toContain("2010-01-01");
    });

    it("tstzrange write", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (tstz_range) VALUES ('[2010-01-01+00,2011-01-01+00)')`,
      );
      const rows = await adapter.execute(`SELECT tstz_range FROM postgresql_ranges`);
      expect(rows[0].tstz_range).toBeDefined();
    });

    it("daterange column", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (date_range) VALUES ('[2012-01-02,2012-01-04]')`,
      );
      const rows = await adapter.execute(`SELECT date_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].date_range as string)!;
      expect(range.begin).toBe("2012-01-02");
    });

    it("daterange type cast", async () => {
      const range = parseRange("[2012-01-02,2012-01-04)")!;
      expect(range.begin).toBe("2012-01-02");
      expect(range.end).toBe("2012-01-04");
    });

    it("daterange write", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_ranges (date_range) VALUES ('[2012-01-02,2012-01-04)')`,
      );
      const rows = await adapter.execute(`SELECT date_range FROM postgresql_ranges`);
      expect(rows[0].date_range).toBeDefined();
    });

    it("custom range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (float_range) VALUES ('[0.5,0.7]')`);
      const rows = await adapter.execute(`SELECT float_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].float_range as string, toFloat)!;
      expect(range).toBeInstanceOf(Range);
      expect(range.begin).toBeCloseTo(0.5);
      expect(range.end).toBeCloseTo(0.7);
      expect(range.excludeEnd).toBe(false);
    });
    it("custom range type cast", () => {
      const range = parseRange("[0.5,0.7)", toFloat)!;
      expect(range.begin).toBeCloseTo(0.5);
      expect(range.end).toBeCloseTo(0.7);
      expect(range.excludeEnd).toBe(true);
    });
    it("custom range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (float_range) VALUES ('[0.5,0.7)')`);
      const rows = await adapter.execute(`SELECT float_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].float_range as string, toFloat)!;
      expect(range.begin).toBeCloseTo(0.5);
      expect(range.end).toBeCloseTo(0.7);
      expect(range.excludeEnd).toBe(true);
    });
    it("custom range ORM round-trip", async () => {
      const r = await PostgresqlRanges.create({ float_range: new Range(0.5, 0.9, true) });
      await r.reload();
      const result = r.float_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBeCloseTo(0.5);
      expect(result.end).toBeCloseTo(0.9);
      expect(result.excludeEnd).toBe(true);
    });
    it("range schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_ranges");
      expect(output).toContain(
        '# Could not dump table "postgresql_ranges" because of following StandardError',
      );
      expect(output).toContain("#   Unknown type 'floatrange' for column 'float_range'");
      expect(output).not.toContain('t.column("float_range"');
      expect(output).not.toContain('t.int4range("int4_range"');
    });
    it("range migration", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS range_migration_test`);
      try {
        await adapter.createTable("range_migration_test", (t: any) => {
          t.int4range("i4");
          t.int8range("i8");
          t.numrange("num");
          t.daterange("dr");
          t.tsrange("tsr");
          t.tstzrange("tstzr");
          t.column("fr", "floatrange");
        });
        const cols = await adapter.columns("range_migration_test");
        const names = cols.map((c: any) => c.name);
        expect(names).toContain("i4");
        expect(names).toContain("i8");
        expect(names).toContain("fr");
      } finally {
        await adapter.dropTable("range_migration_test", { ifExists: true });
      }
    });
    it("range intersection", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) * int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string, toInt)!;
      expect(range.begin).toBe(5);
      expect(range.end).toBe(10);
    });

    it("range union", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) + int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string, toInt)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(15);
    });

    it("range difference", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) - int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string, toInt)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(5);
    });

    it("range adjacent", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,5) -|- int4range(5,10) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range overlaps", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) && int4range(5,15) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range strictly left of", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,5) << int4range(10,15) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range strictly right of", async () => {
      const rows = await adapter.execute(`SELECT int4range(10,15) >> int4range(1,5) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range does not extend left of", async () => {
      const rows = await adapter.execute(`SELECT int4range(5,10) &> int4range(1,5) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range does not extend right of", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,5) &< int4range(5,10) as r`);
      expect(rows[0].r).toBe(true);
    });

    it("range upper bound", async () => {
      const rows = await adapter.execute(`SELECT upper(int4range(1,10)) as r`);
      expect(rows[0].r).toBe(10);
    });

    it("range lower bound", async () => {
      const rows = await adapter.execute(`SELECT lower(int4range(1,10)) as r`);
      expect(rows[0].r).toBe(1);
    });

    it("data type of range types", () => {
      const int4 = parseRange("[1,10)", toInt)!;
      expect(int4).toBeInstanceOf(Range);
      expect(int4.begin).toBe(1);

      const empty = parseRange("empty");
      expect(empty).toBeNull();
    });

    it("int4range values", () => {
      const r = parseRange("[1,10)", toInt)!;
      expect(r.begin).toBe(1);
      expect(r.end).toBe(10);
      expect(r.excludeEnd).toBe(true);
    });

    it("int8range values", () => {
      const r = parseRange("[10,100)", toBigInt)!;
      expect(r.begin).toBe(10n);
      expect(r.end).toBe(100n);
    });

    it("daterange values", () => {
      const r = parseRange("[2012-01-02,2012-01-05)")!;
      expect(r.begin).toBe("2012-01-02");
      expect(r.end).toBe("2012-01-05");
    });

    it("numrange values", () => {
      const r = parseRange("[0.1,0.2]", toFloat)!;
      expect(r.begin).toBeCloseTo(0.1);
      expect(r.end).toBeCloseTo(0.2);
      expect(r.excludeEnd).toBe(false);
    });

    it("tsrange values", () => {
      const r = parseRange('["2010-01-01 14:30:00","2011-01-01 14:30:00")')!;
      expect(r.begin as string).toContain("2010-01-01");
      expect(r.end as string).toContain("2011-01-01");
    });

    it("tstzrange values", () => {
      const r = parseRange('["2010-01-01 14:30:00+00","2011-01-01 14:30:00+00")')!;
      expect(r.begin as string).toContain("2010-01-01");
    });

    it("custom range values", () => {
      expect(parseRange("[0.5,0.7]", toFloat)!.excludeEnd).toBe(false);
      expect(parseRange("[0.5,0.7)", toFloat)!.excludeEnd).toBe(true);
      const endless = parseRange("[0.5,)", toFloat)!;
      expect(endless.begin).toBeCloseTo(0.5);
      expect(endless.end).toBeNull();
      const infinite = parseRange("[,]", toFloat)!;
      expect(infinite.begin).toBeNull();
      expect(infinite.end).toBeNull();
      expect(parseRange("empty", toFloat)).toBeNull();
    });
    it("timezone awareness tzrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ tstz_range: new Range(timeString, timeString, false) });
      const range1 = r.tstz_range as Range;
      expect(range1.begin).toBeInstanceOf(TimeWithZone);
      expect((range1.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.begin as TimeWithZone).timeZone.name).toBe(zone.name);

      await r.saveBang();
      await r.reload();
      const range2 = r.tstz_range as Range;
      expect(range2.begin).toBeInstanceOf(TimeWithZone);
      expect((range2.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.begin as TimeWithZone).timeZone.name).toBe(zone.name);
    });
    it("timezone awareness endless tzrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ tstz_range: new Range(timeString, null, true) });
      const range1 = r.tstz_range as Range;
      expect(range1.begin).toBeInstanceOf(TimeWithZone);
      expect((range1.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect(range1.end).toBeNull();

      await r.saveBang();
      await r.reload();
      const range2 = r.tstz_range as Range;
      expect(range2.begin).toBeInstanceOf(TimeWithZone);
      expect((range2.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect(range2.end).toBeNull();
    });
    it("timezone awareness beginless tzrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ tstz_range: new Range(null, timeString, false) });
      const range1 = r.tstz_range as Range;
      expect(range1.begin).toBeNull();
      expect(range1.end).toBeInstanceOf(TimeWithZone);
      expect((range1.end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.end as TimeWithZone).timeZone.name).toBe(zone.name);

      await r.saveBang();
      await r.reload();
      const range2 = r.tstz_range as Range;
      expect(range2.begin).toBeNull();
      expect(range2.end).toBeInstanceOf(TimeWithZone);
      expect((range2.end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.end as TimeWithZone).timeZone.name).toBe(zone.name);
    });
    it("timezone array awareness tzrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);

      const fromStr = "2020-06-15T10:00:00-07:00";
      const toStr = "2020-06-15T11:00:00-07:00";
      const fromInstant = Temporal.Instant.from(fromStr);
      const toInstant = Temporal.Instant.from(toStr);

      const ranges = [
        new Range(fromStr, toStr, true),
        new Range(fromStr, toStr, false),
        new Range(fromStr, null, true),
        new Range(null, toStr, false),
      ];
      const r = new PostgresqlRangesTz({ tstz_ranges: ranges });
      const pre = r.tstz_ranges as Range[];
      expect(pre[0].begin).toBeInstanceOf(TimeWithZone);
      expect((pre[0].begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((pre[0].begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        fromInstant.epochMilliseconds,
      );

      await r.saveBang();
      await r.reload();
      const post = r.tstz_ranges as Range[];
      expect(post).toHaveLength(4);
      expect(post[0].begin).toBeInstanceOf(TimeWithZone);
      expect((post[0].begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((post[0].begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        fromInstant.epochMilliseconds,
      );
      expect((post[0].end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        toInstant.epochMilliseconds,
      );
      expect(post[2].begin).toBeInstanceOf(TimeWithZone);
      expect(post[2].end).toBeNull();
      expect(post[3].begin).toBeNull();
      expect(post[3].end).toBeInstanceOf(TimeWithZone);
    });
    it("create tstzrange", async () => {
      const begin = Temporal.Instant.from("2010-01-01T13:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T19:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as RubyTime).toF() * 1000).toBe(begin.epochMilliseconds);
      expect((result.end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
      expect(result.excludeEnd).toBe(true);
    });
    it("update tstzrange", async () => {
      const begin = Temporal.Instant.from("2010-01-01T19:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T13:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.tstz_range as Range).begin as RubyTime).toF() * 1000).toBe(
        begin.epochMilliseconds,
      );
      expect(((r.tstz_range as Range).end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
      const sameInstant = Temporal.Instant.from("2010-01-01T13:30:00Z");
      r.tstz_range = new Range(sameInstant, sameInstant, true);
      await r.saveBang();
      await r.reload();
      expect(r.tstz_range).toBeNull();
    });
    it("escaped tstzrange", async () => {
      const bcBegin = Temporal.ZonedDateTime.from(
        { year: -1000, month: 1, day: 1, hour: 19, minute: 30, second: 0, timeZone: "UTC" },
        { overflow: "reject" },
      ).toInstant();
      const end = Temporal.Instant.from("2020-02-02T13:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(bcBegin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect((result.begin as RubyTime).toF() * 1000).toBe(bcBegin.epochMilliseconds);
      expect((result.end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
    });
    it("unbounded tstzrange", async () => {
      const t = Temporal.Instant.from("2010-01-01T19:30:00Z");
      const r1 = await PostgresqlRanges.create({ tstz_range: new Range(t, null, true) });
      await r1.reload();
      const res1 = r1.tstz_range as Range;
      expect((res1.begin as RubyTime).toF() * 1000).toBe(t.epochMilliseconds);
      expect(res1.end).toBeNull();
      expect(res1.excludeEnd).toBe(true);
      const r2 = await PostgresqlRanges.create({ tstz_range: new Range(null, t, false) });
      await r2.reload();
      const res2 = r2.tstz_range as Range;
      expect(res2.begin).toBeNull();
      expect((res2.end as RubyTime).toF() * 1000).toBe(t.epochMilliseconds);
      expect(res2.excludeEnd).toBe(false);
    });
    it("create tsrange", async () => {
      const begin = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as RubyTime).toF() * 1000).toBe(begin.epochMilliseconds);
      expect((result.end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
      expect(result.excludeEnd).toBe(true);
    });
    it("update tsrange", async () => {
      const begin = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.ts_range as Range).begin as RubyTime).toF() * 1000).toBe(begin.epochMilliseconds);
      expect(((r.ts_range as Range).end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
      r.ts_range = new Range(begin, begin, true);
      await r.saveBang();
      await r.reload();
      expect(r.ts_range).toBeNull();
    });
    it("escaped tsrange", async () => {
      const bcBegin = Temporal.ZonedDateTime.from(
        { year: -1000, month: 1, day: 1, hour: 14, minute: 30, second: 0, timeZone: "UTC" },
        { overflow: "reject" },
      ).toInstant();
      const end = Temporal.Instant.from("2020-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(bcBegin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect((result.begin as RubyTime).toF() * 1000).toBe(bcBegin.epochMilliseconds);
      expect((result.end as RubyTime).toF() * 1000).toBe(end.epochMilliseconds);
    });
    it("unbounded tsrange", async () => {
      const t = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const r1 = await PostgresqlRanges.create({ ts_range: new Range(t, null, true) });
      await r1.reload();
      const res1 = r1.ts_range as Range;
      expect((res1.begin as RubyTime).toF() * 1000).toBe(t.epochMilliseconds);
      expect(res1.end).toBeNull();
      expect(res1.excludeEnd).toBe(true);
      const r2 = await PostgresqlRanges.create({ ts_range: new Range(null, t, false) });
      await r2.reload();
      const res2 = r2.ts_range as Range;
      expect(res2.begin).toBeNull();
      expect((res2.end as RubyTime).toF() * 1000).toBe(t.epochMilliseconds);
      expect(res2.excludeEnd).toBe(false);
    });
    it("timezone awareness tsrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ ts_range: new Range(timeString, timeString, false) });
      const range1 = r.ts_range as Range;
      expect(range1.begin).toBeInstanceOf(TimeWithZone);
      expect((range1.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.begin as TimeWithZone).timeZone.name).toBe(zone.name);

      await r.saveBang();
      await r.reload();
      const range2 = r.ts_range as Range;
      expect(range2.begin).toBeInstanceOf(TimeWithZone);
      expect((range2.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.begin as TimeWithZone).timeZone.name).toBe(zone.name);
    });
    it("timezone awareness endless tsrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ ts_range: new Range(timeString, null, true) });
      const range1 = r.ts_range as Range;
      expect(range1.begin).toBeInstanceOf(TimeWithZone);
      expect((range1.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect(range1.end).toBeNull();

      await r.saveBang();
      await r.reload();
      const range2 = r.ts_range as Range;
      expect(range2.begin).toBeInstanceOf(TimeWithZone);
      expect((range2.begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect(range2.end).toBeNull();
    });
    it("timezone awareness beginless tsrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2020-06-15T10:00:00-07:00";
      const instant = Temporal.Instant.from(timeString);

      const r = new PostgresqlRangesTz({ ts_range: new Range(null, timeString, false) });
      const range1 = r.ts_range as Range;
      expect(range1.begin).toBeNull();
      expect(range1.end).toBeInstanceOf(TimeWithZone);
      expect((range1.end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range1.end as TimeWithZone).timeZone.name).toBe(zone.name);

      await r.saveBang();
      await r.reload();
      const range2 = r.ts_range as Range;
      expect(range2.begin).toBeNull();
      expect(range2.end).toBeInstanceOf(TimeWithZone);
      expect((range2.end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        instant.epochMilliseconds,
      );
      expect((range2.end as TimeWithZone).timeZone.name).toBe(zone.name);
    });
    it("timezone array awareness tsrange", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);

      const fromStr = "2020-06-15T10:00:00-07:00";
      const toStr = "2020-06-15T11:00:00-07:00";
      const fromInstant = Temporal.Instant.from(fromStr);
      const toInstant = Temporal.Instant.from(toStr);

      const ranges = [
        new Range(fromStr, toStr, true),
        new Range(fromStr, toStr, false),
        new Range(fromStr, null, true),
        new Range(null, toStr, false),
      ];
      const r = new PostgresqlRangesTz({ ts_ranges: ranges });
      const pre = r.ts_ranges as Range[];
      expect(pre[0].begin).toBeInstanceOf(TimeWithZone);
      expect((pre[0].begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((pre[0].begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        fromInstant.epochMilliseconds,
      );

      await r.saveBang();
      await r.reload();
      const post = r.ts_ranges as Range[];
      expect(post).toHaveLength(4);
      expect(post[0].begin).toBeInstanceOf(TimeWithZone);
      expect((post[0].begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((post[0].begin as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        fromInstant.epochMilliseconds,
      );
      expect((post[0].end as TimeWithZone).utc().toTime().epochMilliseconds).toBe(
        toInstant.epochMilliseconds,
      );
      expect(post[2].begin).toBeInstanceOf(TimeWithZone);
      expect(post[2].end).toBeNull();
      expect(post[3].begin).toBeNull();
      expect(post[3].end).toBeInstanceOf(TimeWithZone);
    });
    it("create tstzrange preserve usec", async () => {
      const begin = Temporal.Instant.from("2010-01-01T13:30:00.670277Z");
      const end = Temporal.Instant.from("2011-02-02T19:30:00.745125Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect((result.begin as RubyTime).getutc().xmlschema(9)).toBe(
        begin.toString({ fractionalSecondDigits: 9 }),
      );
      expect((result.end as RubyTime).getutc().xmlschema(9)).toBe(
        end.toString({ fractionalSecondDigits: 9 }),
      );
    });
    it("update tstzrange preserve usec", async () => {
      const begin = Temporal.Instant.from("2010-01-01T19:30:00.245124Z");
      const end = Temporal.Instant.from("2011-02-02T13:30:00.451274Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.tstz_range as Range).begin as RubyTime).getutc().xmlschema(9)).toBe(
        begin.toString({ fractionalSecondDigits: 9 }),
      );
      expect(((r.tstz_range as Range).end as RubyTime).getutc().xmlschema(9)).toBe(
        end.toString({ fractionalSecondDigits: 9 }),
      );
      const sameInstant = Temporal.Instant.from("2010-01-01T13:30:00.245124Z");
      r.tstz_range = new Range(sameInstant, sameInstant, true);
      await r.saveBang();
      await r.reload();
      expect(r.tstz_range).toBeNull();
    });
    it("create tsrange preserve usec", async () => {
      const begin = Temporal.Instant.from("2010-01-01T14:30:00.125435Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00.225435Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect((result.begin as RubyTime).getutc().xmlschema(9)).toBe(
        begin.toString({ fractionalSecondDigits: 9 }),
      );
      expect((result.end as RubyTime).getutc().xmlschema(9)).toBe(
        end.toString({ fractionalSecondDigits: 9 }),
      );
    });
    it("update tsrange preserve usec", async () => {
      const begin = Temporal.Instant.from("2010-01-01T14:30:00.142432Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00.224242Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.ts_range as Range).begin as RubyTime).getutc().xmlschema(9)).toBe(
        begin.toString({ fractionalSecondDigits: 9 }),
      );
      expect(((r.ts_range as Range).end as RubyTime).getutc().xmlschema(9)).toBe(
        end.toString({ fractionalSecondDigits: 9 }),
      );
      r.ts_range = new Range(begin, begin, true);
      await r.saveBang();
      await r.reload();
      expect(r.ts_range).toBeNull();
    });
    it("timezone awareness tsrange preserve usec", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      const timeString = "2017-09-26T07:30:59.132451-07:00";
      const instant = Temporal.Instant.from(timeString);
      expect(instant.toString()).toContain(".132451");

      const r = new PostgresqlRangesTz({ ts_range: new Range(timeString, timeString, false) });
      const range1 = r.ts_range as Range;
      expect(range1.begin).toBeInstanceOf(TimeWithZone);
      expect((range1.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((range1.begin as TimeWithZone).utc().toTime().toInstant().toString()).toBe(
        instant.toString(),
      );

      await r.saveBang();
      await r.reload();
      const range2 = r.ts_range as Range;
      expect(range2.begin).toBeInstanceOf(TimeWithZone);
      expect((range2.begin as TimeWithZone).timeZone.name).toBe(zone.name);
      expect((range2.begin as TimeWithZone).utc().toTime().toInstant().toString()).toBe(
        instant.toString(),
      );
    });
    it("create numrange", async () => {
      const range = new Range("0.5", "1", true);
      const r = await PostgresqlRanges.create({ num_range: range });
      await r.reload();
      const result = r.num_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as BigDecimal).toString("F")).toBe("0.5");
      expect((result.end as BigDecimal).toString("F")).toBe("1.0");
      expect(result.excludeEnd).toBe(true);
    });
    it("update numrange", async () => {
      const range = new Range("0.5", "1", true);
      const r = await PostgresqlRanges.create({ num_range: range });
      await r.reload();
      expect(((r.num_range as Range).begin as BigDecimal).toString("F")).toBe("0.5");
      expect(((r.num_range as Range).end as BigDecimal).toString("F")).toBe("1.0");
      r.num_range = new Range("0.5", "0.5", true);
      await r.saveBang();
      await r.reload();
      expect(r.num_range).toBeNull();
    });
    it("create daterange", async () => {
      const range = new Range("2012-01-01", "2013-01-01", true);
      const r = await PostgresqlRanges.create({ date_range: range });
      await r.reload();
      const result = r.date_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as Temporal.PlainDate).toString()).toBe("2012-01-01");
      expect((result.end as Temporal.PlainDate).toString()).toBe("2013-01-01");
      expect(result.excludeEnd).toBe(true);
    });
    it("update daterange", async () => {
      const range = new Range("2012-02-03", "2012-02-10", true);
      const r = await PostgresqlRanges.create({ date_range: range });
      await r.reload();
      const result = r.date_range as Range;
      expect((result.begin as Temporal.PlainDate).toString()).toBe("2012-02-03");
      expect((result.end as Temporal.PlainDate).toString()).toBe("2012-02-10");
      r.date_range = new Range("2012-02-03", "2012-02-03", true);
      await r.saveBang();
      await r.reload();
      expect(r.date_range).toBeNull();
    });
    it("create int4range", async () => {
      const range = new Range(3, 50, true);
      const r = await PostgresqlRanges.create({ int4_range: range });
      await r.reload();
      const result = r.int4_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBe(3);
      expect(result.end).toBe(50);
      expect(result.excludeEnd).toBe(true);
    });
    it("update int4range", async () => {
      const range = new Range(6, 10, true);
      const r = await PostgresqlRanges.create({ int4_range: range });
      await r.reload();
      expect((r.int4_range as Range).begin).toBe(6);
      expect((r.int4_range as Range).end).toBe(10);
      r.int4_range = new Range(3, 3, true);
      await r.saveBang();
      await r.reload();
      expect(r.int4_range).toBeNull();
    });
    it("create int8range", async () => {
      const range = new Range(30, 50, true);
      const r = await PostgresqlRanges.create({ int8_range: range });
      await r.reload();
      const result = r.int8_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBe(30);
      expect(result.end).toBe(50);
      expect(result.excludeEnd).toBe(true);
    });
    it("update int8range", async () => {
      const range = new Range(60000, 10000000, true);
      const r = await PostgresqlRanges.create({ int8_range: range });
      await r.reload();
      expect((r.int8_range as Range).begin).toBe(60000);
      expect((r.int8_range as Range).end).toBe(10000000);
      r.int8_range = new Range(39999, 39999, true);
      await r.saveBang();
      await r.reload();
      expect(r.int8_range).toBeNull();
    });
    it("exclude beginning for subtypes without succ method is not supported", () => {
      expect(() => parseRange("(0.1,0.2]", toFloat)).toThrow();
      expect(() => parseRange("(1,10]", toInt)).toThrow();
      expect(() => parseRange("(2012-01-02,2012-01-04]")).toThrow();
    });
    it("where by attribute with range", async () => {
      const range = new Range(1, 100, false);
      const record = await PostgresqlRanges.create({ int4_range: range });
      const found = await PostgresqlRanges.where({ int4_range: range }).take();
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
    });
    it("where by attribute with range in array", async () => {
      const range = new Range(1, 100, false);
      const record = await PostgresqlRanges.create({ int4_range: range });
      const found = await PostgresqlRanges.where({ int4_range: [range] }).take();
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
    });
    it("update all with ranges", async () => {
      await PostgresqlRanges.create({});
      await PostgresqlRanges.updateAll({ int8_range: new Range(1, 100, false) });
      const first = await PostgresqlRanges.first();
      expect(first!.int8_range).toBeInstanceOf(Range);
      expect((first!.int8_range as Range).begin).toBe(1);
      expect((first!.int8_range as Range).end).toBe(101);
      expect((first!.int8_range as Range).excludeEnd).toBe(true);
    });
    it("ranges correctly escape input", async () => {
      const range = new Range("-1,2]'\"; DROP TABLE postgresql_ranges; --", "a", false);
      await PostgresqlRanges.create({});
      await PostgresqlRanges.updateAll({ int8_range: range }).catch(() => {});
      await expect(PostgresqlRanges.first()).resolves.not.toBeNull();
    });
    it("ranges correctly unescape output", () => {
      const r = parseRange('["ca""t","do\\\\g")')!;
      expect(r.begin).toBe('ca"t');
      expect(r.end).toBe("do\\g");
      expect(r.excludeEnd).toBe(true);
    });

    it("infinity values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('(,)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range.begin).toBeNull();
      expect(range.end).toBeNull();
    });

    it("endless range values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBeNull();
    });

    it("empty string range values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('empty')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt);
      expect(range).toBeNull();
    });
  });
});
