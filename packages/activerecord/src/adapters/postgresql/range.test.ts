import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { RangeType } from "../../connection-adapters/postgresql/oid/range.js";
import { Range } from "../../relation.js";
import { Base } from "../../index.js";
import { defaultTimezone } from "../../active-record.js";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { inTimeZone } from "../../cases/helper.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeZone, setZone, zone, BigDecimal } from "@blazetrails/activesupport";
import { BigIntegerType, FloatType, IntegerType, StringType } from "@blazetrails/activemodel";
import { Date as OidDate } from "../../connection-adapters/postgresql/oid/date.js";
import { Decimal } from "../../connection-adapters/postgresql/oid/decimal.js";
import { Timestamp } from "../../connection-adapters/postgresql/oid/timestamp.js";
import { TimestampWithTimeZone } from "../../connection-adapters/postgresql/oid/timestamp-with-time-zone.js";
import { fixtures } from "../../test-fixtures.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const int4Range = new RangeType(new IntegerType(), "int4range");
const int8Range = new RangeType(new BigIntegerType(), "int8range");
const numRange = new RangeType(new Decimal(), "numrange");
const floatRange = new RangeType(new FloatType(), "floatrange");
const dateRange = new RangeType(new OidDate(), "daterange");
const tsRange = new RangeType(new Timestamp(), "tsrange");
const tstzRange = new RangeType(new TimestampWithTimeZone(), "tstzrange");
const stringRange = new RangeType(new StringType(), "stringrange");

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let PostgresqlRanges: any;
  let PostgresqlRangesTz: any;

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.execute(`DROP TYPE IF EXISTS floatrange`);
    await adapter.execute(`DROP TYPE IF EXISTS stringrange`);
    await adapter.execute(`
      CREATE TYPE floatrange AS RANGE (
          subtype = float8,
          subtype_diff = float8mi
      )
    `);
    await adapter.execute(`
      CREATE TYPE stringrange AS RANGE (
          subtype = varchar
      )
    `);
    await adapter.execute(`
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
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.execute(`DROP TYPE IF EXISTS floatrange`);
    await adapter.execute(`DROP TYPE IF EXISTS stringrange`);
  });

  describe("PostgresqlRangeTest", () => {
    it("int4range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = int4Range.castValue(rows[0].int4_range as string)!;
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
      const range = int4Range.castValue("[1,10)")!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(10);
      expect(range.excludeEnd).toBe(true);
    });

    it("int4range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = int4Range.castValue(rows[0].int4_range as string)!;
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
      const range = int4Range.castValue(rows[0].int4_range as string);
      expect(range).toBeNull();
    });

    it("int4range infinity", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[,]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = int4Range.castValue(rows[0].int4_range as string)!;
      expect(range.begin).toBe(-Infinity);
      expect(range.end).toBe(Infinity);
    });

    it("int8range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100]')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      const range = int8Range.castValue(rows[0].int8_range as string)!;
      expect(range.begin).toBe(10);
    });

    it("int8range type cast", async () => {
      const range = int8Range.castValue("[10,100)")!;
      expect(range.begin).toBe(10);
      expect(range.end).toBe(100);
    });

    it("int8range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100)')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      expect(rows[0].int8_range).toBeDefined();
    });

    it("numrange column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (num_range) VALUES ('[0.1,0.2]')`);
      const rows = await adapter.execute(`SELECT num_range FROM postgresql_ranges`);
      const range = numRange.castValue(rows[0].num_range as string)!;
      expect((range.begin as BigDecimal).toString("F")).toBe("0.1");
      expect((range.end as BigDecimal).toString("F")).toBe("0.2");
      expect(range.excludeEnd).toBe(false);
    });

    it("numrange type cast", async () => {
      const range = numRange.castValue("[0.1,0.2)")!;
      expect((range.begin as BigDecimal).toString("F")).toBe("0.1");
      expect((range.end as BigDecimal).toString("F")).toBe("0.2");
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
      const range = tsRange.castValue(rows[0].ts_range as string)!;
      expect((range.begin as RubyTime).toS()).toContain("2010-01-01");
      expect((range.end as RubyTime).toS()).toContain("2011-01-01");
    });

    it("tsrange type cast", async () => {
      const range = tsRange.castValue('["2010-01-01 14:30:00","2011-01-01 14:30:00")')!;
      expect((range.begin as RubyTime).toS()).toContain("2010-01-01");
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
      const range = tstzRange.castValue(rows[0].tstz_range as string)!;
      expect((range.begin as RubyTime).toS()).toContain("2010-01-01");
    });

    it("tstzrange type cast", async () => {
      const range = tstzRange.castValue('["2010-01-01 14:30:00+00","2011-01-01 14:30:00+00")')!;
      expect((range.begin as RubyTime).toS()).toContain("2010-01-01");
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
      const range = dateRange.castValue(rows[0].date_range as string)!;
      expect((range.begin as Temporal.PlainDate).toString()).toBe("2012-01-02");
    });

    it("daterange type cast", async () => {
      const range = dateRange.castValue("[2012-01-02,2012-01-04)")!;
      expect((range.begin as Temporal.PlainDate).toString()).toBe("2012-01-02");
      expect((range.end as Temporal.PlainDate).toString()).toBe("2012-01-04");
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
      const range = floatRange.castValue(rows[0].float_range as string)!;
      expect(range).toBeInstanceOf(Range);
      expect(range.begin).toBeCloseTo(0.5);
      expect(range.end).toBeCloseTo(0.7);
      expect(range.excludeEnd).toBe(false);
    });
    it("custom range type cast", () => {
      const range = floatRange.castValue("[0.5,0.7)")!;
      expect(range.begin).toBeCloseTo(0.5);
      expect(range.end).toBeCloseTo(0.7);
      expect(range.excludeEnd).toBe(true);
    });
    it("custom range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (float_range) VALUES ('[0.5,0.7)')`);
      const rows = await adapter.execute(`SELECT float_range FROM postgresql_ranges`);
      const range = floatRange.castValue(rows[0].float_range as string)!;
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
      const output = await dumpTableSchema(adapter, "postgresql_ranges");
      expect(output).toContain(
        '# Could not dump table "postgresql_ranges" because of following StandardError',
      );
      expect(output).toContain("#   Unknown type 'floatrange' for column 'float_range'");
      expect(output).not.toContain('t.column("float_range"');
      expect(output).not.toContain('t.int4range("int4_range"');
    });
    it("range migration", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS range_migration_test`);
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
      const range = int4Range.castValue(rows[0].r as string)!;
      expect(range.begin).toBe(5);
      expect(range.end).toBe(10);
    });

    it("range union", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) + int4range(5,15) as r`);
      const range = int4Range.castValue(rows[0].r as string)!;
      expect(range.begin).toBe(1);
      expect(range.end).toBe(15);
    });

    it("range difference", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) - int4range(5,15) as r`);
      const range = int4Range.castValue(rows[0].r as string)!;
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

    describe("Rails range_test.rb", () => {
      let connection: PostgreSQLAdapter;
      let newRange: any;
      let firstRange: any;
      let secondRange: any;
      let thirdRange: any;
      let fourthRange: any;
      let emptyRange: any;

      const insertRange = async (values: Record<string, unknown>) => {
        await connection.execute(`
          INSERT INTO postgresql_ranges (
            id,
            date_range,
            num_range,
            ts_range,
            tstz_range,
            int4_range,
            int8_range,
            float_range
          ) VALUES (
            ${values.id},
            '${values.date_range}',
            '${values.num_range}',
            '${values.ts_range}',
            '${values.tstz_range}',
            '${values.int4_range}',
            '${values.int8_range}',
            '${values.float_range}'
          )
        `);
      };

      const roundTrip = async (range: any, attribute: string, value: unknown) => {
        range[attribute] = value;
        expect(await range.save()).toBeTruthy();
        expect(await range.reload()).toBeTruthy();
      };

      const assertEqualRoundTrip = async (range: any, attribute: string, value: unknown) => {
        await roundTrip(range, attribute, value);
        expect(range[attribute]).toEqual(value);
      };

      const assertNilRoundTrip = async (range: any, attribute: string, value: unknown) => {
        await roundTrip(range, attribute, value);
        expect(range[attribute]).toBeNull();
      };

      beforeEach(async () => {
        connection = adapter;
        await insertRange({
          id: 101,
          date_range: "[''2012-01-02'', ''2012-01-04'']",
          num_range: "[0.1, 0.2]",
          ts_range: "[''2010-01-01 14:30'', ''2011-01-01 14:30'']",
          tstz_range: "[''2010-01-01 14:30:00+05'', ''2011-01-01 14:30:00-03'']",
          int4_range: "[1, 10]",
          int8_range: "[10, 100]",
          float_range: "[0.5, 0.7]",
        });

        await insertRange({
          id: 102,
          date_range: "[''2012-01-02'', ''2012-01-04'')",
          num_range: "[0.1, 0.2)",
          ts_range: "[''2010-01-01 14:30'', ''2011-01-01 14:30'')",
          tstz_range: "[''2010-01-01 14:30:00+05'', ''2011-01-01 14:30:00-03'')",
          int4_range: "[1, 10)",
          int8_range: "[10, 100)",
          float_range: "[0.5, 0.7)",
        });

        await insertRange({
          id: 103,
          date_range: "[''2012-01-02'',]",
          num_range: "[0.1,]",
          ts_range: "[''2010-01-01 14:30'',]",
          tstz_range: "[''2010-01-01 14:30:00+05'',]",
          int4_range: "[1,]",
          int8_range: "[10,]",
          float_range: "[0.5,]",
        });

        await insertRange({
          id: 104,
          date_range: "[,]",
          num_range: "[,]",
          ts_range: "[,]",
          tstz_range: "[,]",
          int4_range: "[,]",
          int8_range: "[,]",
          float_range: "[,]",
        });

        await insertRange({
          id: 105,
          date_range: "[''2012-01-02'', ''2012-01-02'')",
          num_range: "[0.1, 0.1)",
          ts_range: "[''2010-01-01 14:30'', ''2010-01-01 14:30'')",
          tstz_range: "[''2010-01-01 14:30:00+05'', ''2010-01-01 06:30:00-03'')",
          int4_range: "[1, 1)",
          int8_range: "[10, 10)",
          float_range: "[0.5, 0.5)",
        });

        newRange = new PostgresqlRanges();
        firstRange = await PostgresqlRanges.find(101);
        secondRange = await PostgresqlRanges.find(102);
        thirdRange = await PostgresqlRanges.find(103);
        fourthRange = await PostgresqlRanges.find(104);
        emptyRange = await PostgresqlRanges.find(105);
      });

      it("data type of range types", () => {
        expect(firstRange.columnForAttribute("date_range").type).toEqual("daterange");
        expect(firstRange.columnForAttribute("num_range").type).toEqual("numrange");
        expect(firstRange.columnForAttribute("ts_range").type).toEqual("tsrange");
        expect(firstRange.columnForAttribute("tstz_range").type).toEqual("tstzrange");
        expect(firstRange.columnForAttribute("int4_range").type).toEqual("int4range");
        expect(firstRange.columnForAttribute("int8_range").type).toEqual("int8range");
      });

      it("int4range values", () => {
        expect(firstRange.int4_range).toEqual(new Range(1, 11, true));
        expect(secondRange.int4_range).toEqual(new Range(1, 10, true));
        expect(thirdRange.int4_range).toEqual(new Range(1, Infinity, true));
        expect(fourthRange.int4_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.int4_range).toBeNull();
      });

      it("int8range values", () => {
        expect(firstRange.int8_range).toEqual(new Range(10, 101, true));
        expect(secondRange.int8_range).toEqual(new Range(10, 100, true));
        expect(thirdRange.int8_range).toEqual(new Range(10, Infinity, true));
        expect(fourthRange.int8_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.int8_range).toBeNull();
      });

      it.skip("daterange values", () => {
        // BLOCKED: port-bug — an endless daterange reads back with a null end instead of Infinity (postgresql-endless-daterange-end-reads-null)
        expect(firstRange.date_range).toEqual(
          new Range(
            Temporal.PlainDate.from("2012-01-02"),
            Temporal.PlainDate.from("2012-01-05"),
            true,
          ),
        );
        expect(secondRange.date_range).toEqual(
          new Range(
            Temporal.PlainDate.from("2012-01-02"),
            Temporal.PlainDate.from("2012-01-04"),
            true,
          ),
        );
        expect(thirdRange.date_range).toEqual(
          new Range<unknown>(Temporal.PlainDate.from("2012-01-02"), Infinity, true),
        );
        expect(fourthRange.date_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.date_range).toBeNull();
      });

      it("numrange values", () => {
        expect(firstRange.num_range).toEqual(
          new Range(new BigDecimal("0.1"), new BigDecimal("0.2")),
        );
        expect(secondRange.num_range).toEqual(
          new Range(new BigDecimal("0.1"), new BigDecimal("0.2"), true),
        );
        expect(thirdRange.num_range).toEqual(
          new Range(new BigDecimal("0.1"), new BigDecimal("Infinity"), true),
        );
        expect(fourthRange.num_range).toEqual(
          new Range(new BigDecimal("-Infinity"), new BigDecimal("Infinity"), true),
        );
        expect(emptyRange.num_range).toBeNull();
      });

      it("tsrange values", () => {
        const tz = defaultTimezone();
        expect(firstRange.ts_range).toEqual(
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), RubyTime[tz](2011, 1, 1, 14, 30, 0)),
        );
        expect(secondRange.ts_range).toEqual(
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), RubyTime[tz](2011, 1, 1, 14, 30, 0), true),
        );
        expect(thirdRange.ts_range).toEqual(
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), null, true),
        );
        expect(fourthRange.ts_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.ts_range).toBeNull();
      });

      it("tstzrange values", () => {
        expect(firstRange.tstz_range).toEqual(
          new Range(
            RubyTime.parse("2010-01-01 09:30:00 UTC"),
            RubyTime.parse("2011-01-01 17:30:00 UTC"),
          ),
        );
        expect(secondRange.tstz_range).toEqual(
          new Range(
            RubyTime.parse("2010-01-01 09:30:00 UTC"),
            RubyTime.parse("2011-01-01 17:30:00 UTC"),
            true,
          ),
        );
        expect(thirdRange.tstz_range).toEqual(
          new Range(RubyTime.parse("2010-01-01 09:30:00 UTC"), null, true),
        );
        expect(fourthRange.tstz_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.tstz_range).toBeNull();
      });

      it("custom range values", () => {
        expect(firstRange.float_range).toEqual(new Range(0.5, 0.7));
        expect(secondRange.float_range).toEqual(new Range(0.5, 0.7, true));
        expect(thirdRange.float_range).toEqual(new Range(0.5, Infinity, true));
        expect(fourthRange.float_range).toEqual(new Range(-Infinity, Infinity, true));
        expect(emptyRange.float_range).toBeNull();
      });

      it("timezone awareness tzrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ tstz_range: new Range(timeString, timeString) });
          expect(record.tstz_range).toEqual(new Range(time, time));
          expect(record.tstz_range.begin.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.tstz_range).toEqual(new Range(time, time));
          expect(record.tstz_range.begin.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone awareness endless tzrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ tstz_range: new Range(timeString, null, true) });
          expect(record.tstz_range).toEqual(new Range(time, null, true));
          expect(record.tstz_range.begin.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.tstz_range).toEqual(new Range(time, null, true));
          expect(record.tstz_range.begin.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone awareness beginless tzrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ tstz_range: new Range(null, timeString) });
          expect(record.tstz_range).toEqual(new Range(null, time));
          expect(record.tstz_range.end.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.tstz_range).toEqual(new Range(null, time));
          expect(record.tstz_range.end.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone array awareness tzrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();

          const fromTimeString = zone()!.now().toString();
          const fromTime = zone()!.parse(fromTimeString)!;
          const toTimeString = fromTime.advance({ hours: 1 }).toString();
          const toTime = zone()!.parse(toTimeString)!;

          const record = new PostgresqlRangesTz({
            tstz_ranges: [
              new Range(fromTimeString, toTimeString, true),
              new Range(fromTimeString, toTimeString),
              new Range(fromTimeString, null, true),
              new Range(null, toTimeString),
            ],
          });
          expect(record.tstz_ranges).toEqual([
            new Range(fromTime, toTime, true),
            new Range(fromTime, toTime),
            new Range(fromTime, null, true),
            new Range(null, toTime),
          ]);
          for (const range of record.tstz_ranges) {
            if (range.begin) expect(range.begin.timeZone).toEqual(TimeZone.find(tz));
            if (range.end) expect(range.end.timeZone).toEqual(TimeZone.find(tz));
          }

          await record.saveBang();
          await record.reload();

          expect(record.tstz_ranges).toEqual([
            new Range(fromTime, toTime, true),
            new Range(fromTime, toTime),
            new Range(fromTime, null, true),
            new Range(null, toTime),
          ]);
          for (const range of record.tstz_ranges) {
            if (range.begin) expect(range.begin.timeZone).toEqual(TimeZone.find(tz));
            if (range.end) expect(range.end.timeZone).toEqual(TimeZone.find(tz));
          }
        });
      });

      it("create tstzrange", async () => {
        const tstzrange = new Range(
          RubyTime.parse("2010-01-01 14:30:00 +0100"),
          RubyTime.parse("2011-02-02 14:30:00 CDT"),
          true,
        );
        await roundTrip(newRange, "tstz_range", tstzrange);
        expect(tstzrange).toEqual(newRange.tstz_range);
        expect(
          new Range(
            RubyTime.parse("2010-01-01 13:30:00 UTC"),
            RubyTime.parse("2011-02-02 19:30:00 UTC"),
            true,
          ),
        ).toEqual(newRange.tstz_range);
      });

      it("update tstzrange", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "tstz_range",
          new Range(
            RubyTime.parse("2010-01-01 14:30:00 CDT"),
            RubyTime.parse("2011-02-02 14:30:00 CET"),
            true,
          ),
        );
        await assertNilRoundTrip(
          firstRange,
          "tstz_range",
          new Range(
            RubyTime.parse("2010-01-01 14:30:00 +0100"),
            RubyTime.parse("2010-01-01 13:30:00 +0000"),
            true,
          ),
        );
      });

      it("escaped tstzrange", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "tstz_range",
          new Range(
            RubyTime.parse("-1000-01-01 14:30:00 CDT"),
            RubyTime.parse("2020-02-02 14:30:00 CET"),
            true,
          ),
        );
      });

      it("unbounded tstzrange", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "tstz_range",
          new Range(RubyTime.parse("2010-01-01 14:30:00 CDT"), null, true),
        );
        await assertEqualRoundTrip(
          firstRange,
          "tstz_range",
          new Range(null, RubyTime.parse("2010-01-01 14:30:00 CDT")),
        );
      });

      it("create tsrange", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          newRange,
          "ts_range",
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), RubyTime[tz](2011, 2, 2, 14, 30, 0), true),
        );
      });

      it("update tsrange", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          firstRange,
          "ts_range",
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), RubyTime[tz](2011, 2, 2, 14, 30, 0), true),
        );
        await assertNilRoundTrip(
          firstRange,
          "ts_range",
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), RubyTime[tz](2010, 1, 1, 14, 30, 0), true),
        );
      });

      it("escaped tsrange", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          firstRange,
          "ts_range",
          new Range(
            RubyTime[tz](-1000, 1, 1, 14, 30, 0),
            RubyTime[tz](2020, 2, 2, 14, 30, 0),
            true,
          ),
        );
      });

      it("unbounded tsrange", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          firstRange,
          "ts_range",
          new Range(RubyTime[tz](2010, 1, 1, 14, 30, 0), null, true),
        );
        await assertEqualRoundTrip(
          firstRange,
          "ts_range",
          new Range(null, RubyTime[tz](2010, 1, 1, 14, 30, 0)),
        );
      });

      it("timezone awareness tsrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ ts_range: new Range(timeString, timeString) });
          expect(record.ts_range).toEqual(new Range(time, time));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.ts_range).toEqual(new Range(time, time));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone awareness endless tsrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ ts_range: new Range(timeString, null, true) });
          expect(record.ts_range).toEqual(new Range(time, null, true));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.ts_range).toEqual(new Range(time, null, true));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone awareness beginless tsrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = zone()!.now().toString();
          const time = zone()!.parse(timeString)!;

          const record = new PostgresqlRangesTz({ ts_range: new Range(null, timeString) });
          expect(record.ts_range).toEqual(new Range(null, time));
          expect(record.ts_range.end.timeZone).toEqual(TimeZone.find(tz));

          await record.saveBang();
          await record.reload();

          expect(record.ts_range).toEqual(new Range(null, time));
          expect(record.ts_range.end.timeZone).toEqual(TimeZone.find(tz));
        });
      });

      it("timezone array awareness tsrange", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();

          const fromTimeString = zone()!.now().toString();
          const fromTime = zone()!.parse(fromTimeString)!;
          const toTimeString = fromTime.advance({ hours: 1 }).toString();
          const toTime = zone()!.parse(toTimeString)!;

          const record = new PostgresqlRangesTz({
            ts_ranges: [
              new Range(fromTimeString, toTimeString, true),
              new Range(fromTimeString, toTimeString),
              new Range(fromTimeString, null, true),
              new Range(null, toTimeString),
            ],
          });
          expect(record.ts_ranges).toEqual([
            new Range(fromTime, toTime, true),
            new Range(fromTime, toTime),
            new Range(fromTime, null, true),
            new Range(null, toTime),
          ]);
          for (const range of record.ts_ranges) {
            if (range.begin) expect(range.begin.timeZone).toEqual(TimeZone.find(tz));
            if (range.end) expect(range.end.timeZone).toEqual(TimeZone.find(tz));
          }

          await record.saveBang();
          await record.reload();

          expect(record.ts_ranges).toEqual([
            new Range(fromTime, toTime, true),
            new Range(fromTime, toTime),
            new Range(fromTime, null, true),
            new Range(null, toTime),
          ]);
          for (const range of record.ts_ranges) {
            if (range.begin) expect(range.begin.timeZone).toEqual(TimeZone.find(tz));
            if (range.end) expect(range.end.timeZone).toEqual(TimeZone.find(tz));
          }
        });
      });

      it("create tstzrange preserve usec", async () => {
        const tstzrange = new Range(
          RubyTime.parse("2010-01-01 14:30:00.670277 +0100"),
          RubyTime.parse("2011-02-02 14:30:00.745125 CDT"),
          true,
        );
        await roundTrip(newRange, "tstz_range", tstzrange);
        expect(tstzrange).toEqual(newRange.tstz_range);
        expect(
          new Range(
            RubyTime.parse("2010-01-01 13:30:00.670277 UTC"),
            RubyTime.parse("2011-02-02 19:30:00.745125 UTC"),
            true,
          ),
        ).toEqual(newRange.tstz_range);
      });

      it("update tstzrange preserve usec", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "tstz_range",
          new Range(
            RubyTime.parse("2010-01-01 14:30:00.245124 CDT"),
            RubyTime.parse("2011-02-02 14:30:00.451274 CET"),
            true,
          ),
        );
        await assertNilRoundTrip(
          firstRange,
          "tstz_range",
          new Range(
            RubyTime.parse("2010-01-01 14:30:00.245124 +0100"),
            RubyTime.parse("2010-01-01 13:30:00.245124 +0000"),
            true,
          ),
        );
      });

      it("create tsrange preserve usec", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          newRange,
          "ts_range",
          new Range(
            RubyTime[tz](2010, 1, 1, 14, 30, 0, 125435),
            RubyTime[tz](2011, 2, 2, 14, 30, 0, 225435),
            true,
          ),
        );
      });

      it("update tsrange preserve usec", async () => {
        const tz = defaultTimezone();
        await assertEqualRoundTrip(
          firstRange,
          "ts_range",
          new Range(
            RubyTime[tz](2010, 1, 1, 14, 30, 0, 142432),
            RubyTime[tz](2011, 2, 2, 14, 30, 0, 224242),
            true,
          ),
        );
        await assertNilRoundTrip(
          firstRange,
          "ts_range",
          new Range(
            RubyTime[tz](2010, 1, 1, 14, 30, 0, 142432),
            RubyTime[tz](2010, 1, 1, 14, 30, 0, 142432),
            true,
          ),
        );
      });

      it("timezone awareness tsrange preserve usec", async () => {
        const tz = "Pacific Time (US & Canada)";

        await inTimeZone(tz, async () => {
          void PostgresqlRangesTz.resetColumnInformation();
          await PostgresqlRangesTz.loadSchema();
          const timeString = "2017-09-26 07:30:59.132451 -0700";
          const time = zone()!.parse(timeString)!;
          expect(time.usec > 0).toBeTruthy();

          const record = new PostgresqlRangesTz({ ts_range: new Range(timeString, timeString) });
          expect(record.ts_range).toEqual(new Range(time, time));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));
          expect(record.ts_range.begin.usec).toEqual(time.usec);

          await record.saveBang();
          await record.reload();

          expect(record.ts_range).toEqual(new Range(time, time));
          expect(record.ts_range.begin.timeZone).toEqual(TimeZone.find(tz));
          expect(record.ts_range.begin.usec).toEqual(time.usec);
        });
      });

      it("create numrange", async () => {
        await assertEqualRoundTrip(
          newRange,
          "num_range",
          new Range(new BigDecimal("0.5"), new BigDecimal("1"), true),
        );
      });

      it("update numrange", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "num_range",
          new Range(new BigDecimal("0.5"), new BigDecimal("1"), true),
        );
        await assertNilRoundTrip(
          firstRange,
          "num_range",
          new Range(new BigDecimal("0.5"), new BigDecimal("0.5"), true),
        );
      });

      it("create daterange", async () => {
        await assertEqualRoundTrip(
          newRange,
          "date_range",
          new Range(
            Temporal.PlainDate.from("2012-01-01"),
            Temporal.PlainDate.from("2013-01-01"),
            true,
          ),
        );
      });

      it("update daterange", async () => {
        await assertEqualRoundTrip(
          firstRange,
          "date_range",
          new Range(
            Temporal.PlainDate.from("2012-02-03"),
            Temporal.PlainDate.from("2012-02-10"),
            true,
          ),
        );
        await assertNilRoundTrip(
          firstRange,
          "date_range",
          new Range(
            Temporal.PlainDate.from("2012-02-03"),
            Temporal.PlainDate.from("2012-02-03"),
            true,
          ),
        );
      });

      it("create int4range", async () => {
        await assertEqualRoundTrip(newRange, "int4_range", new Range(3, 50, true));
      });

      it("update int4range", async () => {
        await assertEqualRoundTrip(firstRange, "int4_range", new Range(6, 10, true));
        await assertNilRoundTrip(firstRange, "int4_range", new Range(3, 3, true));
      });

      it("create int8range", async () => {
        await assertEqualRoundTrip(newRange, "int8_range", new Range(30, 50, true));
      });

      it("update int8range", async () => {
        await assertEqualRoundTrip(firstRange, "int8_range", new Range(60000, 10000000, true));
        await assertNilRoundTrip(firstRange, "int8_range", new Range(39999, 39999, true));
      });

      it("exclude beginning for subtypes without succ method is not supported", async () => {
        await expect(PostgresqlRanges.createBang({ num_range: "(0.1, 0.2]" })).rejects.toThrow(
          ArgumentError,
        );
        await expect(PostgresqlRanges.createBang({ float_range: "(0.5, 0.7]" })).rejects.toThrow(
          ArgumentError,
        );
        await expect(PostgresqlRanges.createBang({ int4_range: "(1, 10]" })).rejects.toThrow(
          ArgumentError,
        );
        await expect(PostgresqlRanges.createBang({ int8_range: "(10, 100]" })).rejects.toThrow(
          ArgumentError,
        );
        await expect(
          PostgresqlRanges.createBang({ date_range: "('2012-01-02', '2012-01-04']" }),
        ).rejects.toThrow(ArgumentError);
        await expect(
          PostgresqlRanges.createBang({ ts_range: "('2010-01-01 14:30', '2011-01-01 14:30']" }),
        ).rejects.toThrow(ArgumentError);
        await expect(
          PostgresqlRanges.createBang({
            tstz_range: "('2010-01-01 14:30:00+05', '2011-01-01 14:30:00-03']",
          }),
        ).rejects.toThrow(ArgumentError);
      });

      it("where by attribute with range", async () => {
        const range = new Range(1, 100);
        const record = await PostgresqlRanges.createBang({ int4_range: range });
        expect((await PostgresqlRanges.where({ int4_range: range }).take()).id).toEqual(record.id);
      });

      it("where by attribute with range in array", async () => {
        const range = new Range(1, 100);
        const record = await PostgresqlRanges.createBang({ int4_range: range });
        expect((await PostgresqlRanges.where({ int4_range: [range] }).take()).id).toEqual(
          record.id,
        );
      });

      it("update all with ranges", async () => {
        await PostgresqlRanges.createBang();

        await PostgresqlRanges.updateAll({ int8_range: new Range(1, 100) });

        expect((await PostgresqlRanges.first()).int8_range).toEqual(new Range(1, 101, true));
      });

      it("ranges correctly escape input", async () => {
        const range = new Range("-1,2]'; DROP TABLE postgresql_ranges; --", "a");
        await PostgresqlRanges.updateAll({ int8_range: range });

        await expect(PostgresqlRanges.first()).resolves.not.toThrow();
      });

      it("ranges correctly unescape output", async () => {
        await connection.execute(`
          INSERT INTO postgresql_ranges (id, string_range)
          VALUES (106, '["ca""t","do\\\\g")')
        `);

        const escapedRange = await PostgresqlRanges.find(106);
        expect(escapedRange.string_range).toEqual(new Range('ca"t', "do\\g", true));
      });

      it("infinity values", async () => {
        await PostgresqlRanges.createBang({
          int4_range: new Range(1, Infinity),
          int8_range: new Range(-Infinity, 0),
          float_range: new Range(-Infinity, Infinity),
        });

        const record = await PostgresqlRanges.first();

        expect(record.int4_range).toEqual(new Range(1, Infinity, true));
        expect(record.int8_range).toEqual(new Range(-Infinity, 1, true));
        expect(record.float_range).toEqual(new Range(-Infinity, Infinity, true));
      });

      it("endless range values", async () => {
        let record = await PostgresqlRanges.createBang({
          int4_range: new Range(1, null),
          int8_range: new Range(10, null),
          float_range: new Range(0.5, null),
        });

        record = await PostgresqlRanges.find(record.id);

        expect(record.int4_range).toEqual(new Range(1, Infinity, true));
        expect(record.int8_range).toEqual(new Range(10, Infinity, true));
        expect(record.float_range).toEqual(new Range(0.5, Infinity, true));
      });

      it("empty string range values", async () => {
        let record = await PostgresqlRanges.createBang({
          int4_range: "",
          int8_range: "",
          float_range: "",
        });

        record = await PostgresqlRanges.find(record.id);

        expect(record.int4_range).toBeNull();
        expect(record.int8_range).toBeNull();
        expect(record.float_range).toBeNull();
      });
    });
  });
});
