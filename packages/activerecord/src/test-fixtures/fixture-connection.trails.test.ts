import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { Base } from "../base.js";
import { leaseFixtureConnection } from "./fixture-connection.js";
import { setPermanentConnectionCheckout } from "../active-record.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";
import { adapterType } from "../test-adapter.js";

const conn = () => Base.leaseConnection();

describe("fixture connection source", () => {
  afterEach(() => {
    setPermanentConnectionCheckout(true);
  });

  it("leases without tripping permanentConnectionCheckout = disallowed", async () => {
    setPermanentConnectionCheckout("disallowed");

    await expect(leaseFixtureConnection()).resolves.toBeDefined();
  });

  it("resolves the same connection the pool holds", async () => {
    const leased = await leaseFixtureConnection();

    expect(leased).toBe(Base.connectionPool().activeConnection);
  });
});

describe("useTransactionalTests — DML isolation", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  beforeAll(async () => {
    await (
      await conn()
    ).createTable("txn_smoke_users", { force: true }, (t) => {
      t.string("name");
    });
  });

  afterAll(async () => {
    await (await conn()).dropTable("txn_smoke_users", { ifExists: true });
  });

  it("inserts a row that is visible within the same test", async () => {
    await (await conn()).execute(`INSERT INTO txn_smoke_users (id, name) VALUES (1, 'alice')`);
    const rows = (await (await conn()).selectAll(`SELECT * FROM txn_smoke_users`)).toArray();
    expect(rows).toHaveLength(1);
  });

  it("sees no rows — previous insert was rolled back in afterEach", async () => {
    const rows = (await (await conn()).selectAll(`SELECT * FROM txn_smoke_users`)).toArray();
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(adapterType === "mysql")(
  "useTransactionalTests — DDL isolation (PG + SQLite)",
  () => {
    withTransactionalFixtures(leaseFixtureConnection);

    it("creates a DDL table that is visible within the same test", async () => {
      await (
        await conn()
      ).execute(`CREATE TABLE txn_smoke_ddl (id INTEGER PRIMARY KEY, label TEXT)`);
      const rows = (await (await conn()).selectAll(`SELECT 1 AS ok FROM txn_smoke_ddl`)).toArray();
      expect(rows).toHaveLength(0);
    });

    it("table does not exist because DDL was rolled back in afterEach", async () => {
      await expect((await conn()).execute(`SELECT 1 AS ok FROM txn_smoke_ddl`)).rejects.toThrow();
    });
  },
);
