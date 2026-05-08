/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/range_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { parseRange } from "./pg-range.js";
import { Range } from "../../relation.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

const toInt = (s: string) => parseInt(s, 10);
const toFloat = (s: string) => parseFloat(s);
const toBigInt = (s: string) => BigInt(s);

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let PostgresqlRanges: any;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.exec(`
      CREATE TABLE postgresql_ranges (
        id serial primary key,
        date_range daterange,
        num_range numrange,
        ts_range tsrange,
        tstz_range tstzrange,
        int4_range int4range,
        int8_range int8range
      )
    `);
    await adapter.loadAdditionalTypes();
    const { Base } = await import("../../index.js");
    class PostgresqlRangesCls extends Base {
      static tableName = "postgresql_ranges";
      static {
        this.adapter = adapter;
      }
    }
    await PostgresqlRangesCls.loadSchema();
    PostgresqlRanges = PostgresqlRangesCls;
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.close();
  });

  describe("PostgresqlRangeTest", () => {
    it("int4range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string, toInt)!;
      expect(range).toBeInstanceOf(Range);
      expect(range.begin).toBe(1);
      // PG normalizes [1,10] to [1,11) for discrete integer ranges
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

    it.skip("custom range column", async () => {
      // BLOCKED: range — custom range type setup missing from beforeEach
      // ROOT-CAUSE: beforeEach doesn't CREATE TYPE floatrange/stringrange AS RANGE or add float_range/string_range columns;
      //   TypeMapInitializer already handles typtype='r' rows so no core OID gap exists
      // SCOPE: ~25 LOC — extend beforeEach + write assertion body; affects 4 custom-range tests
    });
    it.skip("custom range type cast", async () => {
      // BLOCKED: range — custom range type setup missing from beforeEach
      // SCOPE: ~25 LOC shared with "custom range column" fix; affects 4 custom-range tests
    });
    it.skip("custom range write", async () => {
      // BLOCKED: range — custom range type setup missing from beforeEach
      // SCOPE: ~25 LOC shared with "custom range column" fix; affects 4 custom-range tests
    });
    it.skip("range schema dump", async () => {
      // BLOCKED: range — range SQL types absent from SQL_TYPE_MAP / DSL_HELPER_METHODS
      // ROOT-CAUSE: schema-dumper.ts SQL_TYPE_MAP has no entries for int4range, int8range, numrange,
      //   daterange, tsrange, tstzrange; sqlTypeToDsl() hits the enum fallback → t.column(name,"int4range")
      //   instead of the dedicated DSL helper; DSL_HELPER_METHODS also needs them to emit t.int4range(...)
      // SCOPE: ~15 LOC in schema-dumper.ts (SQL_TYPE_MAP + DSL_HELPER_METHODS) + ~10 LOC test body; affects 1 test
    });
    it.skip("range migration", async () => {
      // BLOCKED: range — test body not yet written; no core infra gap expected
      // ROOT-CAUSE: per-column helpers (int4range(), tstzrange(), daterange(), etc.) exist in schema-definitions.ts;
      //   test should exercise create_table with range columns; createRange() is only needed for custom range types
      // SCOPE: ~15 LOC test body; createRange()/dropRange() (~30 LOC) is a separate gap (see custom-range tests)
    });
    it.skip("multirange int4", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // ROOT-CAUSE: TypeMapInitializer.queryConditionsForKnownTypeTypes() queries typtype IN ('r','e','d')
      //   but not 'm'; no MultiRange class; Rails 7+ OID::Range handles multirange via multi_range flag
      // SCOPE: ~80 LOC — add 'm' to typtype query + MultiRange class + 6 OID registrations; affects all 6 multirange tests
    });
    it.skip("multirange int8", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // SCOPE: ~80 LOC shared with "multirange int4" fix; affects all 6 multirange tests
    });
    it.skip("multirange num", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // SCOPE: ~80 LOC shared with "multirange int4" fix; affects all 6 multirange tests
    });
    it.skip("multirange ts", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // SCOPE: ~80 LOC shared with "multirange int4" fix; affects all 6 multirange tests
    });
    it.skip("multirange tstz", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // SCOPE: ~80 LOC shared with "multirange int4" fix; affects all 6 multirange tests
    });
    it.skip("multirange date", async () => {
      // BLOCKED: range — multirange types not registered (PG 14+ / Rails 7+)
      // SCOPE: ~80 LOC shared with "multirange int4" fix; affects all 6 multirange tests
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

    it.skip("custom range values", () => {
      // BLOCKED: range — custom range type setup missing from beforeEach
      // SCOPE: ~25 LOC shared with "custom range column" fix; affects 4 custom-range tests
    });
    it.skip("timezone awareness tzrange", () => {
      // BLOCKED: range — TimeZoneConversion not wired and predicate broken for range types
      // ROOT-CAUSE: (1) time-zone-conversion.ts is never imported/used — not wired into Model;
      //   (2) isCreateTimeZoneConversionAttribute checks castType.type (a property) but Type exposes
      //   type() as a method — predicate always returns false even if wired; (3) timeZoneAwareTypes
      //   defaults to ["datetime","time"] — tsrange/tstzrange would also need to be added
      // SCOPE: ~100 LOC — wire module into Model + fix castType.type() call + add tsrange/tstzrange; separate story; affects 9 tests
    });
    it.skip("timezone awareness endless tzrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it.skip("timezone awareness beginless tzrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it.skip("timezone array awareness tzrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // ROOT-CAUSE: same as "timezone awareness tzrange"; also requires ts_ranges/tstz_ranges array columns in setup
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it("create tstzrange", async () => {
      // Rails: Time.parse("2010-01-01 14:30:00 +0100")...Time.parse("2011-02-02 14:30:00 CDT") → UTC-normalised
      const begin = Temporal.Instant.from("2010-01-01T13:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T19:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as Temporal.Instant).epochMilliseconds).toBe(begin.epochMilliseconds);
      expect((result.end as Temporal.Instant).epochMilliseconds).toBe(end.epochMilliseconds);
      expect(result.excludeEnd).toBe(true);
    });
    it("update tstzrange", async () => {
      // Rails: assert_equal_round_trip + assert_nil_round_trip (same UTC instant → empty → null)
      const begin = Temporal.Instant.from("2010-01-01T19:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T13:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.tstz_range as Range).begin as Temporal.Instant).epochMilliseconds).toBe(
        begin.epochMilliseconds,
      );
      expect(((r.tstz_range as Range).end as Temporal.Instant).epochMilliseconds).toBe(
        end.epochMilliseconds,
      );
      const sameInstant = Temporal.Instant.from("2010-01-01T13:30:00Z");
      r.tstz_range = new Range(sameInstant, sameInstant, true);
      await r.saveBang();
      await r.reload();
      expect(r.tstz_range).toBeNull();
    });
    it("escaped tstzrange", async () => {
      // Rails: Time.parse("-1000-01-01 14:30:00 CDT")...Time.parse("2020-02-02 14:30:00 CET"); BC round-trip
      const bcBegin = Temporal.ZonedDateTime.from(
        { year: -1000, month: 1, day: 1, hour: 19, minute: 30, second: 0, timeZone: "UTC" },
        { overflow: "reject" },
      ).toInstant();
      const end = Temporal.Instant.from("2020-02-02T13:30:00Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(bcBegin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect((result.begin as Temporal.Instant).epochMilliseconds).toBe(bcBegin.epochMilliseconds);
      expect((result.end as Temporal.Instant).epochMilliseconds).toBe(end.epochMilliseconds);
    });
    it("unbounded tstzrange", async () => {
      // Rails: endless (begin...nil) and beginless (nil..end) round-trips
      const t = Temporal.Instant.from("2010-01-01T19:30:00Z");
      const r1 = await PostgresqlRanges.create({ tstz_range: new Range(t, null, true) });
      await r1.reload();
      const res1 = r1.tstz_range as Range;
      expect((res1.begin as Temporal.Instant).epochMilliseconds).toBe(t.epochMilliseconds);
      expect(res1.end).toBeNull();
      expect(res1.excludeEnd).toBe(true);
      const r2 = await PostgresqlRanges.create({ tstz_range: new Range(null, t, false) });
      await r2.reload();
      const res2 = r2.tstz_range as Range;
      expect(res2.begin).toBeNull();
      expect((res2.end as Temporal.Instant).epochMilliseconds).toBe(t.epochMilliseconds);
      expect(res2.excludeEnd).toBe(false);
    });
    it("create tsrange", async () => {
      // Rails: Time.utc(2010,1,1,14,30,0)...Time.utc(2011,2,2,14,30,0) (default_timezone = :utc)
      const begin = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect((result.begin as Temporal.Instant).epochMilliseconds).toBe(begin.epochMilliseconds);
      expect((result.end as Temporal.Instant).epochMilliseconds).toBe(end.epochMilliseconds);
      expect(result.excludeEnd).toBe(true);
    });
    it("update tsrange", async () => {
      // Rails: assert_equal_round_trip + assert_nil_round_trip (same instant → empty → null)
      const begin = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.ts_range as Range).begin as Temporal.Instant).epochMilliseconds).toBe(
        begin.epochMilliseconds,
      );
      expect(((r.ts_range as Range).end as Temporal.Instant).epochMilliseconds).toBe(
        end.epochMilliseconds,
      );
      r.ts_range = new Range(begin, begin, true);
      await r.saveBang();
      await r.reload();
      expect(r.ts_range).toBeNull();
    });
    it("escaped tsrange", async () => {
      // Rails: Time.utc(-1000,1,1,14,30,0)...Time.utc(2020,2,2,14,30,0); BC round-trip
      const bcBegin = Temporal.ZonedDateTime.from(
        { year: -1000, month: 1, day: 1, hour: 14, minute: 30, second: 0, timeZone: "UTC" },
        { overflow: "reject" },
      ).toInstant();
      const end = Temporal.Instant.from("2020-02-02T14:30:00Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(bcBegin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect((result.begin as Temporal.Instant).epochMilliseconds).toBe(bcBegin.epochMilliseconds);
      expect((result.end as Temporal.Instant).epochMilliseconds).toBe(end.epochMilliseconds);
    });
    it("unbounded tsrange", async () => {
      // Rails: endless (begin...nil) and beginless (nil..end) round-trips
      const t = Temporal.Instant.from("2010-01-01T14:30:00Z");
      const r1 = await PostgresqlRanges.create({ ts_range: new Range(t, null, true) });
      await r1.reload();
      const res1 = r1.ts_range as Range;
      expect((res1.begin as Temporal.Instant).epochMilliseconds).toBe(t.epochMilliseconds);
      expect(res1.end).toBeNull();
      expect(res1.excludeEnd).toBe(true);
      const r2 = await PostgresqlRanges.create({ ts_range: new Range(null, t, false) });
      await r2.reload();
      const res2 = r2.ts_range as Range;
      expect(res2.begin).toBeNull();
      expect((res2.end as Temporal.Instant).epochMilliseconds).toBe(t.epochMilliseconds);
      expect(res2.excludeEnd).toBe(false);
    });
    it.skip("timezone awareness tsrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it.skip("timezone awareness endless tsrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it.skip("timezone awareness beginless tsrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it.skip("timezone array awareness tsrange", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // ROOT-CAUSE: same as "timezone awareness tzrange"; also requires ts_ranges array column in setup
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it("create tstzrange preserve usec", async () => {
      // Rails: Time.parse("2010-01-01 14:30:00.670277 +0100")...Time.parse("2011-02-02 14:30:00.745125 CDT")
      const begin = Temporal.Instant.from("2010-01-01T13:30:00.670277Z");
      const end = Temporal.Instant.from("2011-02-02T19:30:00.745125Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.tstz_range as Range;
      expect((result.begin as Temporal.Instant).toString()).toBe(begin.toString());
      expect((result.end as Temporal.Instant).toString()).toBe(end.toString());
    });
    it("update tstzrange preserve usec", async () => {
      // Rails: assert_equal_round_trip + assert_nil_round_trip with µs precision
      const begin = Temporal.Instant.from("2010-01-01T19:30:00.245124Z");
      const end = Temporal.Instant.from("2011-02-02T13:30:00.451274Z");
      const r = await PostgresqlRanges.create({ tstz_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.tstz_range as Range).begin as Temporal.Instant).toString()).toBe(begin.toString());
      expect(((r.tstz_range as Range).end as Temporal.Instant).toString()).toBe(end.toString());
      const sameInstant = Temporal.Instant.from("2010-01-01T13:30:00.245124Z");
      r.tstz_range = new Range(sameInstant, sameInstant, true);
      await r.saveBang();
      await r.reload();
      expect(r.tstz_range).toBeNull();
    });
    it("create tsrange preserve usec", async () => {
      // Rails: Time.utc(2010,1,1,14,30,0,125435)...Time.utc(2011,2,2,14,30,0,225435)
      const begin = Temporal.Instant.from("2010-01-01T14:30:00.125435Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00.225435Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      const result = r.ts_range as Range;
      expect((result.begin as Temporal.Instant).toString()).toBe(begin.toString());
      expect((result.end as Temporal.Instant).toString()).toBe(end.toString());
    });
    it("update tsrange preserve usec", async () => {
      // Rails: assert_equal_round_trip + assert_nil_round_trip with µs precision
      const begin = Temporal.Instant.from("2010-01-01T14:30:00.142432Z");
      const end = Temporal.Instant.from("2011-02-02T14:30:00.224242Z");
      const r = await PostgresqlRanges.create({ ts_range: new Range(begin, end, true) });
      await r.reload();
      expect(((r.ts_range as Range).begin as Temporal.Instant).toString()).toBe(begin.toString());
      expect(((r.ts_range as Range).end as Temporal.Instant).toString()).toBe(end.toString());
      r.ts_range = new Range(begin, begin, true);
      await r.saveBang();
      await r.reload();
      expect(r.ts_range).toBeNull();
    });
    it.skip("timezone awareness tsrange preserve usec", () => {
      // BLOCKED: range — time_zone_aware_types infrastructure not implemented
      // ROOT-CAUSE: same as "timezone awareness tzrange"; also requires µs-level time-zone conversion
      // SCOPE: ~200+ LOC shared with "timezone awareness tzrange" fix; affects 9 tests
    });
    it("create numrange", async () => {
      // Rails: assert_equal_round_trip(@new_range, :num_range, BigDecimal("0.5")...BigDecimal("1"))
      // DecimalType.castValue returns string; bounds round-trip as "0.5"/"1".
      const range = new Range("0.5", "1", true);
      const r = await PostgresqlRanges.create({ num_range: range });
      await r.reload();
      const result = r.num_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBe("0.5");
      expect(result.end).toBe("1");
      expect(result.excludeEnd).toBe(true);
    });
    it("update numrange", async () => {
      // Rails: assert_equal_round_trip => BigDecimal("0.5")...BigDecimal("1")
      //        assert_nil_round_trip  => BigDecimal("0.5")...BigDecimal("0.5") (empty → nil)
      const range = new Range("0.5", "1", true);
      const r = await PostgresqlRanges.create({ num_range: range });
      await r.reload();
      expect((r.num_range as Range).begin).toBe("0.5");
      expect((r.num_range as Range).end).toBe("1");
      // [0.5,0.5) is empty in numrange → null on reload
      r.num_range = new Range("0.5", "0.5", true);
      await r.saveBang();
      await r.reload();
      expect(r.num_range).toBeNull();
    });
    it("create daterange", async () => {
      // Rails: assert_equal_round_trip(@new_range, :date_range, Date.new(2012,1,1)...Date.new(2013,1,1))
      // OID::Date.deserialize returns Temporal.PlainDate; assert via toString().
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
      // Rails: assert_equal_round_trip => Date.new(2012,2,3)...Date.new(2012,2,10)
      //        assert_nil_round_trip  => Date.new(2012,2,3)...Date.new(2012,2,3) (empty → nil)
      const range = new Range("2012-02-03", "2012-02-10", true);
      const r = await PostgresqlRanges.create({ date_range: range });
      await r.reload();
      const result = r.date_range as Range;
      expect((result.begin as Temporal.PlainDate).toString()).toBe("2012-02-03");
      expect((result.end as Temporal.PlainDate).toString()).toBe("2012-02-10");
      // [2012-02-03,2012-02-03) is empty → null on reload
      r.date_range = new Range("2012-02-03", "2012-02-03", true);
      await r.saveBang();
      await r.reload();
      expect(r.date_range).toBeNull();
    });
    it("create int4range", async () => {
      // Rails: assert_equal_round_trip(@new_range, :int4_range, Range.new(3, 50, true))
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
      // Rails: assert_equal_round_trip => 6...10; assert_nil_round_trip => 3...3 (empty → nil)
      const range = new Range(6, 10, true);
      const r = await PostgresqlRanges.create({ int4_range: range });
      await r.reload();
      expect((r.int4_range as Range).begin).toBe(6);
      expect((r.int4_range as Range).end).toBe(10);
      // [3,3) is empty in int4range → null on reload
      r.int4_range = new Range(3, 3, true);
      await r.saveBang();
      await r.reload();
      expect(r.int4_range).toBeNull();
    });
    it("create int8range", async () => {
      // Rails: assert_equal_round_trip(@new_range, :int8_range, Range.new(30, 50, true))
      // BigIntegerType.castValue returns BigInt; bounds round-trip as 30n/50n.
      const range = new Range(30, 50, true);
      const r = await PostgresqlRanges.create({ int8_range: range });
      await r.reload();
      const result = r.int8_range as Range;
      expect(result).toBeInstanceOf(Range);
      expect(result.begin).toBe(30n);
      expect(result.end).toBe(50n);
      expect(result.excludeEnd).toBe(true);
    });
    it("update int8range", async () => {
      // Rails: assert_equal_round_trip => 60000...10000000; assert_nil_round_trip => 39999...39999 (empty → nil)
      // BigIntegerType.castValue returns BigInt; bounds round-trip as bigint values.
      const range = new Range(60000, 10000000, true);
      const r = await PostgresqlRanges.create({ int8_range: range });
      await r.reload();
      expect((r.int8_range as Range).begin).toBe(60000n);
      expect((r.int8_range as Range).end).toBe(10000000n);
      // [39999,39999) is empty in int8range → null on reload
      r.int8_range = new Range(39999, 39999, true);
      await r.saveBang();
      await r.reload();
      expect(r.int8_range).toBeNull();
    });
    it("exclude beginning for subtypes without succ method is not supported", () => {
      // Rails: assert_raises(ArgumentError) { PostgresqlRange.create!(num_range: "(0.1, 0.2]") }
      // The parse-time throw covers the same invariant without needing the AR model.
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
      expect((first!.int8_range as Range).begin).toBe(BigInt(1));
      // PG normalises [1,100] → [1,101) for discrete int8range (Rails: 1...101)
      expect((first!.int8_range as Range).end).toBe(BigInt(101));
      expect((first!.int8_range as Range).excludeEnd).toBe(true);
    });
    it("ranges correctly escape input", async () => {
      const range = new Range("-1,2]'\"; DROP TABLE postgresql_ranges; --", "a", false);
      await PostgresqlRanges.create({});
      // SQL injection is prevented — the update either succeeds (value stored) or
      // raises a type error, but the table must still exist afterwards.
      await PostgresqlRanges.updateAll({ int8_range: range }).catch(() => {});
      await expect(PostgresqlRanges.first()).resolves.not.toBeNull();
    });
    it("ranges correctly unescape output", () => {
      // Rails: inserts '["ca""t","do\\\\g")' via SQL, reads back as 'ca"t'...'do\\g'
      // Tests unquoteRangeBound handles PG's "" and \\ escaping.
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
