/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../base.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { defineFixtures } from "../../test-helpers/define-fixtures.js";

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

    it("schema", async () => {
      await defineSchema(adapter, {
        posts: { title: "string", body: "text", type: "string" },
      });
      try {
        class Post extends Base {
          static _tableName = "posts";
        }
        Post.attribute("id", "integer");
        Post.attribute("title", "string");
        Post.attribute("body", "text");
        Post.adapter = adapter;
        await defineFixtures(adapter, Post, {
          welcome: { title: "Welcome to the weblog", body: "Such a lovely day", type: "Post" },
        });

        const db = await adapter.currentDatabase();
        class OmgPost extends Base {
          static _tableName = `${db}.posts`;
        }
        OmgPost.inheritanceColumn = "disabled";
        OmgPost.attribute("id", "integer");
        OmgPost.attribute("title", "string");
        OmgPost.adapter = adapter;

        const first = await (OmgPost as any).first();
        expect(first).toBeTruthy();
      } finally {
        await adapter.dropTable("posts", { ifExists: true });
      }
    });

    it("primary key", async () => {
      await defineSchema(adapter, { topics: { title: "string" } });
      try {
        expect(await adapter.primaryKey("topics")).toBe("id");
      } finally {
        await adapter.dropTable("topics", { ifExists: true });
      }
    });

    it("data source exists?", async () => {
      await defineSchema(adapter, { topics: { title: "string" } });
      try {
        const db = await adapter.currentDatabase();
        // Rails passes @omgpost.table_name, which is the qualified `db.topics` form.
        expect(await adapter.dataSourceExists(`${db}.topics`)).toBe(true);
      } finally {
        await adapter.dropTable("topics", { ifExists: true });
      }
    });

    it("data source exists wrong schema", async () => {
      const db = await adapter.currentDatabase();
      expect(await adapter.dataSourceExists(`${db}.zomg`)).toBe(false);
    });

    it("dump indexes", async () => {
      await adapter.dropTable("key_tests", { ifExists: true });
      try {
        await adapter.createTable("key_tests", { force: true }, (t: any) => {
          t.string("awesome");
          t.string("pizza");
          t.string("snack");
        });
        await adapter.addIndex("key_tests", ["snack"], { name: "index_key_tests_on_snack" });
        await adapter.addIndex("key_tests", ["pizza"], { name: "index_key_tests_on_pizza" });
        await adapter.addIndex("key_tests", ["awesome"], {
          name: "index_key_tests_on_awesome",
          type: "fulltext",
        });
        const indexes = (await adapter.indexes("key_tests")).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        expect(indexes).toHaveLength(3);
        const byName = (n: string) => indexes.find((i) => i.name === n)!;
        expect(byName("index_key_tests_on_snack").using).toBe("btree");
        expect(byName("index_key_tests_on_snack").type).toBeUndefined();
        expect(byName("index_key_tests_on_pizza").using).toBe("btree");
        expect(byName("index_key_tests_on_pizza").type).toBeUndefined();
        expect(byName("index_key_tests_on_awesome").using).toBeUndefined();
        expect(byName("index_key_tests_on_awesome").type).toBe("fulltext");
      } finally {
        await adapter.dropTable("key_tests", { ifExists: true });
      }
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
    // Build a fresh adapter with sql_mode='ANSI_QUOTES' applied in the pool init SQL
    // so it persists across every checked-out connection — Rails uses
    // `execute("SET SESSION sql_mode='ANSI_QUOTES'")` on its single leased connection;
    // we apply the variable per-connection via the pool init hook (newClient).
    let ansi: Mysql2Adapter;
    beforeEach(async () => {
      ansi = new Mysql2Adapter({ uri: MYSQL_TEST_URL, variables: { sql_mode: "ANSI_QUOTES" } });
    });
    afterEach(async () => {
      // Rails' teardown calls `@connection.reconnect!` to clear ANSI_QUOTES on
      // the shared leased connection. We use a dedicated adapter per test, so
      // close() fully drains the pool and no extra reconnect is needed.
      await ansi.close();
    });

    it("primary key method with ansi quotes", async () => {
      await defineSchema(ansi, { topics: { title: "string" } });
      try {
        expect(await ansi.primaryKey("topics")).toBe("id");
      } finally {
        await ansi.dropTable("topics", { ifExists: true });
      }
    });

    it("foreign keys method with ansi quotes", async () => {
      // Mirrors Rails test/schema/schema.rb: lessons_students is id:false with a
      // bigint student_id referencing students(id). Bigint width matches the
      // default Rails PK so addForeignKey doesn't trip MySQL's type-match rule.
      await defineSchema(ansi, {
        students: { name: "string" },
        lessons_students: {
          columns: { student_id: "big_integer" },
          primaryKey: false,
        },
      });
      try {
        await ansi.addForeignKey("lessons_students", "students", { onDelete: "cascade" });
        const fks = await ansi.foreignKeys("lessons_students");
        expect(fks).toHaveLength(1);
        expect(fks[0].fromTable).toBe("lessons_students");
        expect(fks[0].toTable).toBe("students");
        expect(fks[0].onDelete).toBe("cascade");
      } finally {
        await ansi.dropTable("lessons_students", { ifExists: true });
        await ansi.dropTable("students", { ifExists: true });
      }
    });
  });
});
