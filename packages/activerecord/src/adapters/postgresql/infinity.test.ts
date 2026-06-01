/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/infinity_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { Range } from "../../index.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../../test-helpers/with-transactional-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_infinities`);
    await defineSchema(adapter, {});
    await adapter.exec(`
      CREATE TABLE postgresql_infinities (
        id serial primary key,
        "float" double precision,
        datetime timestamp,
        date date
      )
    `);
  });
  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS postgresql_infinities`);
    await adapter.close();
  });
  withTransactionalFixtures(() => adapter);

  async function modelClass() {
    const { Base } = await import("../../index.js");
    const a = adapter;
    class PostgresqlInfinity extends Base {
      static tableName = "postgresql_infinities";
      static {
        this.adapter = a;
      }
    }
    await PostgresqlInfinity.loadSchema();
    return PostgresqlInfinity;
  }

  describe("PostgresqlInfinityTest", () => {
    it("type casting infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({ float: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).float).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting string on a float column", async () => {
      const M = await modelClass();
      let record = new (M as any)({ float: "Infinity" });
      expect(record.float).toBe(Number.POSITIVE_INFINITY);
      record = new (M as any)({ float: "-Infinity" });
      expect(record.float).toBe(Number.NEGATIVE_INFINITY);
      record = new (M as any)({ float: "NaN" });
      expect(Number.isNaN(record.float)).toBe(true);
    });

    it("updateColumns with infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await (record as any).updateColumns({ float: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).float).toBe(Number.POSITIVE_INFINITY);
    });

    it("update_all with infinity on a float column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await (M as any).updateAll({ float: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).float).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting infinity on a datetime column", async () => {
      const M = await modelClass();
      let record = await (M as any).create({ datetime: "infinity" });
      await (record as any).reload();
      expect((record as any).datetime).toBe(Number.POSITIVE_INFINITY);

      record = await (M as any).create({ datetime: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).datetime).toBe(Number.POSITIVE_INFINITY);
    });

    it("type casting infinity on a date column", async () => {
      const M = await modelClass();
      let record = await (M as any).create({ date: "infinity" });
      await (record as any).reload();
      expect((record as any).date).toBe(Number.POSITIVE_INFINITY);

      record = await (M as any).create({ date: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).date).toBe(Number.POSITIVE_INFINITY);
    });

    it("update_all with infinity on a datetime column", async () => {
      const M = await modelClass();
      const record = await (M as any).create({});
      await (M as any).updateAll({ datetime: Number.POSITIVE_INFINITY });
      await (record as any).reload();
      expect((record as any).datetime).toBe(Number.POSITIVE_INFINITY);
    });

    it.skip("assigning 'infinity' on a datetime column with TZ aware attributes", () => {
      // BLOCKED: type — missing InTimeZone test helper + Base.timeZoneAwareAttributes /
      // reset_column_information lifecycle. Sentinels already unified; this
      // gap is purely about TZ-aware type wrapping + per-block time-zone state.
      // SCOPE: ~80 LOC — InTimeZone helper + TimeZoneConverter integration test plumbing
    });

    it("where clause with infinite range on a datetime column", async () => {
      const M = await modelClass();
      const created = await (M as any).create({ datetime: "2020-01-01 00:00:00" });
      const found = await (M as any).where({ datetime: new Range(-Infinity, Infinity) }).take();
      expect(found.id).toBe(created.id);
    });

    it("where clause with infinite range on a date column", async () => {
      const M = await modelClass();
      const created = await (M as any).create({ date: "2020-01-01" });
      const found = await (M as any).where({ date: new Range(-Infinity, Infinity) }).take();
      expect(found.id).toBe(created.id);
    });
  });
});
