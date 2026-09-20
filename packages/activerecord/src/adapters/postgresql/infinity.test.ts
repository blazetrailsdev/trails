import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, leasePgAdapter, PostgreSQLAdapter } from "./test-helper.js";
import { BigDecimal } from "@blazetrails/ruby-compat";
import { Range } from "../../index.js";
import { setZone } from "@blazetrails/activesupport";
import { withTransactionalFixtures } from "../../test-fixtures/with-transactional-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = await leasePgAdapter();
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_infinities`);
    await adapter.execute(`
      CREATE TABLE postgresql_infinities (
        id serial primary key,
        "float" double precision,
        datetime timestamp,
        date date
      )
    `);
  });
  afterAll(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_infinities`);
  });
  withTransactionalFixtures(() => adapter);

  async function modelClass() {
    const { Base } = await import("../../index.js");
    class PostgresqlInfinity extends Base {
      static tableName = "postgresql_infinities";
      static {
        this.attribute("id", "integer");
      }
    }
    await PostgresqlInfinity.loadSchema();
    return PostgresqlInfinity;
  }

  describe("PostgresqlInfinityTest", () => {
    it("type casting infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({ float: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.float).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting string on a float column", async () => {
      const M = await modelClass();
      let record = new (M as any)({ float: "Infinity" });
      expect(record.float).toBe(Number.POSITIVE_INFINITY);
      record = new (M as any)({ float: "-Infinity" });
      expect(record.float).toBe(Number.NEGATIVE_INFINITY);
      record = new (M as any)({ float: "NaN" });
      expect(Number.isNaN(record.float)).toBeTruthy();
    });

    it("updateColumns with infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await record.updateColumns({ float: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.float).toBe(Number.POSITIVE_INFINITY);
    });

    it("update_all with infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await (M as any).updateAll({ float: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.float).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting infinity on a datetime column", async () => {
      const M = await modelClass();
      let record = await (M as any).create({ datetime: "infinity" });
      await record.reload();
      expect(record.datetime).toBe(Number.POSITIVE_INFINITY);

      record = await (M as any).create({ datetime: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.datetime).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting infinity on a date column", async () => {
      const M = await modelClass();
      let record = await (M as any).create({ date: "infinity" });
      await record.reload();
      expect(record.date).toBe(Number.POSITIVE_INFINITY);

      record = await (M as any).create({ date: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.date).toBe(Number.POSITIVE_INFINITY);
    });

    it("update_all with infinity on a datetime column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await (M as any).updateAll({ datetime: Number.POSITIVE_INFINITY });
      await record.reload();
      expect(record.datetime).toBe(Number.POSITIVE_INFINITY);
    });

    it("assigning 'infinity' on a datetime column with TZ aware attributes", async () => {
      try {
        setZone("Pacific Time (US & Canada)");
        const { Base } = await import("../../index.js");
        class PostgresqlInfinity extends Base {
          static tableName = "postgresql_infinities";
          static timeZoneAwareAttributes = true;
          static {
            this.attribute("id", "integer");
          }
        }
        await PostgresqlInfinity.loadSchema();

        let record = await (PostgresqlInfinity as any).create({ datetime: "infinity" });
        expect(record.datetime).toBe(Number.POSITIVE_INFINITY);
        expect((await record.reload()).datetime).toBe(record.datetime);

        record = await (PostgresqlInfinity as any).create({ datetime: Number.POSITIVE_INFINITY });
        expect(record.datetime).toBe(Number.POSITIVE_INFINITY);
        expect((await record.reload()).datetime).toBe(record.datetime);

        record = await (PostgresqlInfinity as any).create({ datetime: BigDecimal.INFINITY });
        const datetime = (record.datetime as BigDecimal).toF();
        expect(datetime).toEqual(Number.POSITIVE_INFINITY);
        expect((await record.reload()).datetime).toEqual(datetime);
      } finally {
        setZone(null);
      }
    });

    it("where clause with infinite range on a datetime column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({ datetime: "2020-01-01 00:00:00" });

      const string = (M as any).where({ datetime: new Range("-infinity", "infinity") });
      expect((await string.take()).id).toBe(record.id);

      const infinity = (M as any).where({
        datetime: new Range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      });
      expect((await infinity.take()).id).toBe(record.id);

      expect(infinity.toSql()).toBe(string.toSql());
    });

    it("where clause with infinite range on a date column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({ date: "2020-01-01" });

      const string = (M as any).where({ date: new Range("-infinity", "infinity") });
      expect((await string.take()).id).toBe(record.id);

      const infinity = (M as any).where({
        date: new Range(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      });
      expect((await infinity.take()).id).toBe(record.id);

      expect(infinity.toSql()).toBe(string.toSql());
    });
  });
});
