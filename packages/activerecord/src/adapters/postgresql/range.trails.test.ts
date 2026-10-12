import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { RangeType } from "../../connection-adapters/postgresql/oid/range.js";
import { Range } from "../../relation.js";
import { Base } from "../../index.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { setZone, BigDecimal } from "@blazetrails/activesupport";
import { BigIntegerType, FloatType, IntegerType } from "@blazetrails/activemodel";
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

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let PostgresqlRanges: typeof Base;

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
  });
  afterEach(() => {
    setZone(null);
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.execute(`DROP TYPE IF EXISTS floatrange`);
    await adapter.execute(`DROP TYPE IF EXISTS stringrange`);
  });

  describe("range types (trails)", () => {
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
      const result = (r as unknown as { float_range: Range }).float_range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBeCloseTo(0.5);
      expect(result.end).toBeCloseTo(0.9);
      expect(result.excludeEnd).toBe(true);
    });
    it("range schema dump", async () => {
      const output = await dumpTableSchema("postgresql_ranges");
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
        await adapter.createTable("range_migration_test", (t) => {
          t.int4range("i4");
          t.int8range("i8");
          t.numrange("num");
          t.daterange("dr");
          t.tsrange("tsr");
          t.tstzrange("tstzr");
          t.column("fr", "floatrange");
        });
        const cols = await adapter.columns("range_migration_test");
        const names = cols.map((c) => c.name);
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
  });
});
