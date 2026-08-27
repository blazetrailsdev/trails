import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

const TABLE_NAME = "things";
const LOGGED_QUERY = `SELECT relpersistence FROM pg_class WHERE relname = '${TABLE_NAME}'`;
const LOGGED = "p";
const UNLOGGED = "u";
const TEMPORARY = "t";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;
  let previousCreateUnlogged: boolean;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    previousCreateUnlogged = PostgreSQLAdapter.createUnloggedTables;
    PostgreSQLAdapter.createUnloggedTables = false;
  });

  afterEach(async () => {
    await connection.execute(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
    PostgreSQLAdapter.createUnloggedTables = previousCreateUnlogged;
  });

  describe("UnloggedTablesTest", () => {
    it("logged by default", async () => {
      await connection.createTable(TABLE_NAME, () => {});
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(LOGGED);
    });

    it("unlogged in test environment when unlogged setting enabled", async () => {
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.createTable(TABLE_NAME, () => {});
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(UNLOGGED);
    });

    it("not included in schema dump", async () => {
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.createTable(TABLE_NAME, () => {});
      const output = await SchemaDumper.dumpTableSchema(connection, TABLE_NAME);
      expect(output).not.toMatch(/unlogged/i);
    });

    it("not changed in change table", async () => {
      await connection.createTable(TABLE_NAME, () => {});
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.changeTable(TABLE_NAME, async (t) => {
        await t.column("name", "string");
      });
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(LOGGED);
    });

    it("gracefully handles temporary tables", async () => {
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.createTable(TABLE_NAME, { temporary: true }, () => {});
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(TEMPORARY);
    });
  });
});
