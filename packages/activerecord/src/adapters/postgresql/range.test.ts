/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/range_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";
import { parseRange } from "./pg-range.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.execute(`
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
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_ranges`);
    await adapter.close();
  });

  describe("PostgresqlRangeTest", () => {
    it("int4range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.begin).toBe("1");
      expect(range.end).toBe("11");
      expect(range.excludeEnd).toBe(true);
    });

    it("int4range default", async () => {
      const rows = await adapter.execute(
        `INSERT INTO postgresql_ranges DEFAULT VALUES RETURNING int4_range`,
      );
      expect(rows[0].int4_range).toBeNull();
    });

    it("int4range type cast", async () => {
      const range = parseRange("[1,10)");
      expect(range.begin).toBe("1");
      expect(range.end).toBe("10");
      expect(range.excludeBegin).toBe(false);
      expect(range.excludeEnd).toBe(true);
    });

    it("int4range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.begin).toBe("1");
      expect(range.end).toBe("10");
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
      const range = parseRange(rows[0].int4_range as string);
      expect(range.empty).toBe(true);
    });

    it("int4range infinity", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[,]')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.begin).toBeNull();
      expect(range.end).toBeNull();
    });

    it("int8range column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100]')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int8_range as string);
      expect(range.begin).toBe("10");
    });

    it("int8range type cast", async () => {
      const range = parseRange("[10,100)");
      expect(range.begin).toBe("10");
      expect(range.end).toBe("100");
    });

    it("int8range write", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int8_range) VALUES ('[10,100)')`);
      const rows = await adapter.execute(`SELECT int8_range FROM postgresql_ranges`);
      expect(rows[0].int8_range).toBeDefined();
    });

    it("numrange column", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (num_range) VALUES ('[0.1,0.2]')`);
      const rows = await adapter.execute(`SELECT num_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].num_range as string);
      expect(range.begin).toBe("0.1");
      expect(range.end).toBe("0.2");
      expect(range.excludeEnd).toBe(false);
    });

    it("numrange type cast", async () => {
      const range = parseRange("[0.1,0.2)");
      expect(range.begin).toBe("0.1");
      expect(range.end).toBe("0.2");
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
      const range = parseRange(rows[0].ts_range as string);
      expect(range.begin).toContain("2010-01-01");
      expect(range.end).toContain("2011-01-01");
    });

    it("tsrange type cast", async () => {
      const range = parseRange('["2010-01-01 14:30:00","2011-01-01 14:30:00")');
      expect(range.begin).toContain("2010-01-01");
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
      const range = parseRange(rows[0].tstz_range as string);
      expect(range.begin).toContain("2010-01-01");
    });

    it("tstzrange type cast", async () => {
      const range = parseRange('["2010-01-01 14:30:00+00","2011-01-01 14:30:00+00")');
      expect(range.begin).toContain("2010-01-01");
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
      const range = parseRange(rows[0].date_range as string);
      expect(range.begin).toBe("2012-01-02");
    });

    it("daterange type cast", async () => {
      const range = parseRange("[2012-01-02,2012-01-04)");
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
      /* needs custom range type creation */
    });
    it.skip("custom range type cast", async () => {
      /* needs custom range type */
    });
    it.skip("custom range write", async () => {
      /* needs custom range type */
    });
    it.skip("range schema dump", async () => {
      /* needs schema dumper */
    });
    it.skip("range migration", async () => {
      /* needs migration API */
    });
    it.skip("multirange int4", async () => {
      /* needs PG 14+ multirange support */
    });
    it.skip("multirange int8", async () => {
      /* needs PG 14+ multirange support */
    });
    it.skip("multirange num", async () => {
      /* needs PG 14+ multirange support */
    });
    it.skip("multirange ts", async () => {
      /* needs PG 14+ multirange support */
    });
    it.skip("multirange tstz", async () => {
      /* needs PG 14+ multirange support */
    });
    it.skip("multirange date", async () => {
      /* needs PG 14+ multirange support */
    });

    it("range intersection", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) * int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string);
      expect(range.begin).toBe("5");
      expect(range.end).toBe("10");
    });

    it("range union", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) + int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string);
      expect(range.begin).toBe("1");
      expect(range.end).toBe("15");
    });

    it("range difference", async () => {
      const rows = await adapter.execute(`SELECT int4range(1,10) - int4range(5,15) as r`);
      const range = parseRange(rows[0].r as string);
      expect(range.begin).toBe("1");
      expect(range.end).toBe("5");
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
      const int4 = parseRange("[1,10)");
      expect(int4.empty).toBe(false);
      expect(int4.begin).toBe("1");

      const empty = parseRange("empty");
      expect(empty.empty).toBe(true);
    });

    it("int4range values", () => {
      const r = parseRange("[1,10)");
      expect(r.begin).toBe("1");
      expect(r.end).toBe("10");
      expect(r.excludeBegin).toBe(false);
      expect(r.excludeEnd).toBe(true);
    });

    it("int8range values", () => {
      const r = parseRange("[10,100)");
      expect(r.begin).toBe("10");
      expect(r.end).toBe("100");
    });

    it("daterange values", () => {
      const r = parseRange("[2012-01-02,2012-01-05)");
      expect(r.begin).toBe("2012-01-02");
      expect(r.end).toBe("2012-01-05");
    });

    it("numrange values", () => {
      const r = parseRange("[0.1,0.2]");
      expect(r.begin).toBe("0.1");
      expect(r.end).toBe("0.2");
      expect(r.excludeEnd).toBe(false);
    });

    it("tsrange values", () => {
      const r = parseRange('["2010-01-01 14:30:00","2011-01-01 14:30:00")');
      expect(r.begin).toContain("2010-01-01");
      expect(r.end).toContain("2011-01-01");
    });

    it("tstzrange values", () => {
      const r = parseRange('["2010-01-01 14:30:00+00","2011-01-01 14:30:00+00")');
      expect(r.begin).toContain("2010-01-01");
    });

    it.skip("custom range values", () => {
      /* needs custom range type */
    });
    it.skip("timezone awareness tzrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone awareness endless tzrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone awareness beginless tzrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone array awareness tzrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("create tstzrange", () => {
      /* needs Base model */
    });
    it.skip("update tstzrange", () => {
      /* needs Base model */
    });
    it.skip("escaped tstzrange", () => {
      /* needs Base model */
    });
    it.skip("unbounded tstzrange", () => {
      /* needs Base model */
    });
    it.skip("create tsrange", () => {
      /* needs Base model */
    });
    it.skip("update tsrange", () => {
      /* needs Base model */
    });
    it.skip("escaped tsrange", () => {
      /* needs Base model */
    });
    it.skip("unbounded tsrange", () => {
      /* needs Base model */
    });
    it.skip("timezone awareness tsrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone awareness endless tsrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone awareness beginless tsrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("timezone array awareness tsrange", () => {
      /* needs timezone infrastructure */
    });
    it.skip("create tstzrange preserve usec", () => {
      /* needs Base model */
    });
    it.skip("update tstzrange preserve usec", () => {
      /* needs Base model */
    });
    it.skip("create tsrange preserve usec", () => {
      /* needs Base model */
    });
    it.skip("update tsrange preserve usec", () => {
      /* needs Base model */
    });
    it.skip("timezone awareness tsrange preserve usec", () => {
      /* needs timezone infrastructure */
    });
    it.skip("create numrange", () => {
      /* needs Base model */
    });
    it.skip("update numrange", () => {
      /* needs Base model */
    });
    it.skip("create daterange", () => {
      /* needs Base model */
    });
    it.skip("update daterange", () => {
      /* needs Base model */
    });
    it.skip("create int4range", () => {
      /* needs Base model */
    });
    it.skip("update int4range", () => {
      /* needs Base model */
    });
    it.skip("create int8range", () => {
      /* needs Base model */
    });
    it.skip("update int8range", () => {
      /* needs Base model */
    });
    it.skip("exclude beginning for subtypes without succ method is not supported", () => {
      /* needs Base model + error handling */
    });
    it.skip("where by attribute with range", () => {
      /* needs Base model with range where */
    });
    it.skip("where by attribute with range in array", () => {
      /* needs Base model with range array where */
    });
    it.skip("update all with ranges", () => {
      /* needs update_all with range */
    });
    it.skip("ranges correctly escape input", () => {
      /* needs Base model */
    });
    it.skip("ranges correctly unescape output", () => {
      /* needs Base model */
    });

    it("infinity values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('(,)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.begin).toBeNull();
      expect(range.end).toBeNull();
    });

    it("endless range values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('[1,)')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.begin).toBe("1");
      expect(range.end).toBeNull();
    });

    it("empty string range values", async () => {
      await adapter.execute(`INSERT INTO postgresql_ranges (int4_range) VALUES ('empty')`);
      const rows = await adapter.execute(`SELECT int4_range FROM postgresql_ranges`);
      const range = parseRange(rows[0].int4_range as string);
      expect(range.empty).toBe(true);
    });
  });
});
