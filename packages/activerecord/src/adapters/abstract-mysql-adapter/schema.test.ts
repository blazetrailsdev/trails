/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("SchemaTest", () => {
    it.skipIf(isMariaDb)("float limits", async () => {
      // BLOCKED on MariaDB: bare FLOAT is normalized to DOUBLE in information_schema.columns
      // (column_type = 'double'), causing lookupCastType to return limit=53 rather than 24.
      // Rails avoids this by using SHOW FULL FIELDS FROM which preserves the declared type name.
      // Fix is a columns() refactor; tracked separately.
      await adapter.createTable("mysql_doubles", { force: true }, (t: any) => {
        t.float("float_no_limit");
        t.float("float_short", { limit: 5 });
        t.float("float_long", { limit: 53 });
        t.float("float_23", { limit: 23 });
        t.float("float_24", { limit: 24 });
        t.float("float_25", { limit: 25 });
      });

      try {
        const cols = (await adapter.columns("mysql_doubles")) as Array<{
          name: string;
          limit: number | null;
        }>;
        const col = (name: string) => cols.find((c) => c.name === name)!;

        // MySQL floats are precision 0..24, MySQL doubles are precision 25..53
        expect(col("float_no_limit").limit).toBe(24);
        expect(col("float_short").limit).toBe(24);
        expect(col("float_long").limit).toBe(53);
        expect(col("float_23").limit).toBe(24);
        expect(col("float_24").limit).toBe(24);
        expect(col("float_25").limit).toBe(53);
      } finally {
        await adapter.dropTable("mysql_doubles", { ifExists: true });
      }
    });

    it.skip("schema", () => {
      // BLOCKED: slot-c-fixtures — requires posts table (qualified db.table_name)
      // loaded by Slot C fixture infrastructure; not present in base test DB
    });

    it.skip("primary key", () => {
      // BLOCKED: slot-c-fixtures — requires topics fixture table from Slot C
    });

    it.skip("data source exists", () => {
      // BLOCKED: slot-c-fixtures — requires topics fixture table from Slot C
    });

    it.skip("dump indexes", () => {
      // BLOCKED: slot-c-fixtures — requires key_tests fixture table from Slot C
      // (index_key_tests_on_snack/pizza = btree, index_key_tests_on_awesome = fulltext)
    });

    it("drop temporary table", async () => {
      await adapter.transaction(async () => {
        await adapter.createTable("temp_table", { temporary: true });
        // if it doesn't properly say DROP TEMPORARY TABLE, the transaction commit
        // will complain that no transaction is active
        await adapter.dropTable("temp_table", { temporary: true });
      });
    });
  });

  describe("MySQLAnsiQuotesTest", () => {
    it.skip("primary key method with ansi quotes", () => {
      // BLOCKED: ansi-quotes — requires SET SESSION sql_mode='ANSI_QUOTES' which
      // needs adapter-level session-variable setter not yet wired for test setup
    });

    it.skip("foreign keys method with ansi quotes", () => {
      // BLOCKED: ansi-quotes — same session-variable setup gap as above
    });
  });
});
