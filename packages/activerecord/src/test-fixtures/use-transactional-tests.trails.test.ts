import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base } from "../base.js";
import { useTransactionalTests } from "./use-transactional-tests.js";
import { adapterType } from "../test-adapter.js";

const conn = () => Base.connection;

describe("useTransactionalTests — DML isolation", () => {
  useTransactionalTests();

  beforeAll(async () => {
    await conn().createTable("txn_smoke_users", { force: true }, (t) => {
      t.string("name");
    });
  });

  afterAll(async () => {
    await conn().dropTable("txn_smoke_users", { ifExists: true });
  });

  it("inserts a row that is visible within the same test", async () => {
    await conn().executeMutation(`INSERT INTO txn_smoke_users (id, name) VALUES (1, 'alice')`);
    const rows = await conn().execute(`SELECT * FROM txn_smoke_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees no rows — previous insert was rolled back in afterEach", async () => {
    const rows = await conn().execute(`SELECT * FROM txn_smoke_users`);
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(adapterType === "mysql")(
  "useTransactionalTests — DDL isolation (PG + SQLite)",
  () => {
    useTransactionalTests();

    it("creates a DDL table that is visible within the same test", async () => {
      await conn().executeMutation(
        `CREATE TABLE txn_smoke_ddl (id INTEGER PRIMARY KEY, label TEXT)`,
      );
      const rows = await conn().execute(`SELECT 1 AS ok FROM txn_smoke_ddl`);
      expect(rows).toHaveLength(0);
    });

    it("table does not exist because DDL was rolled back in afterEach", async () => {
      await expect(conn().execute(`SELECT 1 AS ok FROM txn_smoke_ddl`)).rejects.toThrow();
    });
  },
);
