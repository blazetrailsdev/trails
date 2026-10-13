import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, leasePgAdapter, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describeIfPg("PostgresqlInfinityTest (trails)", () => {
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
  fixtures([]);

  async function modelClass() {
    const { Base } = await import("../../index.js");
    class PostgresqlInfinity extends Base {
      declare float: number;
      static tableName = "postgresql_infinities";
      static {
        this.attribute("id", "integer");
      }
    }
    await PostgresqlInfinity.loadSchema();
    return PostgresqlInfinity;
  }

  it("updateColumns with infinity on a float column", async () => {
    const M = await modelClass();
    const record = await M.create({});
    await record.updateColumns({ float: Number.POSITIVE_INFINITY });
    await record.reload();
    expect(record.float).toBe(Number.POSITIVE_INFINITY);
  });
});
