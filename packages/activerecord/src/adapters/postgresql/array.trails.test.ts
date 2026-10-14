import { Rational } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

fixtures([]);

describeIfPg("PostgresqlArrayTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.execute(`
      CREATE TABLE pg_arrays (
        id serial primary key,
        datetimes timestamp(6)[]
      )
    `);
    await adapter.loadAdditionalTypes();
  });
  afterEach(async () => {
    await adapter.schemaCache.clearDataSourceCacheBang("pg_arrays");
  });
  afterAll(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`).catch(() => {});
  });

  it("schema dump renders non-empty array defaults via the element type", async () => {
    await adapter.execute(`DROP TABLE IF EXISTS pg_array_defaults`);
    await adapter.execute(`
      CREATE TABLE pg_array_defaults (
        id serial primary key,
        ints integer[] DEFAULT '{4,4,2}',
        flags boolean[] DEFAULT '{true,false}',
        nums numeric(10,2)[] DEFAULT '{1.5,2.5}'
      )
    `);
    await adapter.loadAdditionalTypes();
    try {
      const output = await dumpTableSchema("pg_array_defaults");
      const line = (name: string) => output.split("\n").find((l) => l.includes(`"${name}"`))!;
      expect(line("ints")).toMatch(/default: \[4, 4, 2\]/);
      expect(line("flags")).toMatch(/default: \[true, false\]/);
      expect(line("nums")).toMatch(/default: \["1\.5", "2\.5"\]/);
    } finally {
      await adapter.execute(`DROP TABLE IF EXISTS pg_array_defaults`).catch(() => {});
    }
  });

  describe("array datetime inline-quoting (trails)", () => {
    it("inlines a proleptic-year datetime[] element as a quoted_date BC literal", async () => {
      class PgArrays extends Base {
        declare datetimes: RubyTime[];
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const bc = Temporal.Instant.from("-000042-03-15T12:34:56.123456Z");
      const record = await PgArrays.create({
        datetimes: [RubyTime.at(new Rational(bc.epochNanoseconds, 1_000_000_000n))],
      });
      await record.reload();
      expect(record.datetimes).toHaveLength(1);
      expect(record.datetimes[0].toR().cmp(new Rational(bc.epochNanoseconds, 1_000_000_000n))).toBe(
        0,
      );
    });
  });
});
