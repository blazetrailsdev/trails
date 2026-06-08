/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/create_unlogged_tables_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";

const TABLE_NAME = "things";
const LOGGED_QUERY = `SELECT relpersistence FROM pg_class WHERE relname = '${TABLE_NAME}'`;
const LOGGED = "p";
const UNLOGGED = "u";
const TEMPORARY = "t";

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

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
      // Rails: @connection.create_table(TABLE_NAME) {}
      await connection.createTable(TABLE_NAME, () => {});
      // Rails: assert_equal LOGGED, @connection.execute(LOGGED_QUERY).first[LOGGED_FIELD]
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(LOGGED);
    });

    it("unlogged in test environment when unlogged setting enabled", async () => {
      // Rails: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter.create_unlogged_tables = true
      PostgreSQLAdapter.createUnloggedTables = true;
      // Rails: @connection.create_table(TABLE_NAME) {}
      await connection.createTable(TABLE_NAME, () => {});
      // Rails: assert_equal UNLOGGED, @connection.execute(LOGGED_QUERY).first[LOGGED_FIELD]
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(UNLOGGED);
    });

    it("not included in schema dump", async () => {
      // Rails: create_unlogged_tables = true; create_table; assert_no_match(/unlogged/i, dump)
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.createTable(TABLE_NAME, () => {});
      const output = await SchemaDumper.dumpTableSchema(connection, TABLE_NAME);
      expect(output).not.toMatch(/unlogged/i);
    });

    it("not changed in change table", async () => {
      // Rails: create table (logged), set createUnloggedTables=true, change_table, still logged
      await connection.createTable(TABLE_NAME, () => {});
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.changeTable(TABLE_NAME, async (t) => {
        await t.column("name", "string");
      });
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(LOGGED);
    });

    it("gracefully handles temporary tables", async () => {
      // Rails: create_table(TABLE_NAME, temporary: true) — must not produce TEMPORARY UNLOGGED
      PostgreSQLAdapter.createUnloggedTables = true;
      await connection.createTable(TABLE_NAME, { temporary: true }, () => {});
      // Temporary tables are already unlogged (relpersistence = 't')
      const rows = (await connection.execute(LOGGED_QUERY)) as Array<Record<string, string>>;
      expect(rows[0]["relpersistence"]).toBe(TEMPORARY);
    });
  });
});
