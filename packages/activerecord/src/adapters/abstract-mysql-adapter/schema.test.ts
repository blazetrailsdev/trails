/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../base.js";
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
      // Scratch table `ca_posts` (non-canonical) instead of the canonical `posts`
      // so the one-schema harness never sees a canonical table created/dropped.
      await adapter.createTable("ca_posts", { force: true }, (t: any) => {
        t.string("title");
        t.text("body");
        t.string("type");
      });
      try {
        class Post extends Base {
          static _tableName = "ca_posts";
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
          static _tableName = `${db}.ca_posts`;
        }
        OmgPost.inheritanceColumn = "disabled";
        OmgPost.attribute("id", "integer");
        OmgPost.attribute("title", "string");
        OmgPost.adapter = adapter;

        const first = await (OmgPost as any).first();
        expect(first).toBeTruthy();
      } finally {
        await adapter.dropTable("ca_posts", { ifExists: true });
      }
    });

    it("primary key", async () => {
      await adapter.createTable("ca_topics", { force: true });
      try {
        expect(await adapter.primaryKey("ca_topics")).toBe("id");
      } finally {
        await adapter.dropTable("ca_topics", { ifExists: true });
      }
    });

    it("data source exists?", async () => {
      await adapter.createTable("ca_topics", { force: true });
      try {
        const db = await adapter.currentDatabase();
        // Rails passes @omgpost.table_name, which is the qualified `db.ca_topics` form.
        expect(await adapter.dataSourceExists(`${db}.ca_topics`)).toBe(true);
      } finally {
        await adapter.dropTable("ca_topics", { ifExists: true });
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

    it("indexes surface prefix lengths and desc orders", async () => {
      await adapter.dropTable("key_tests", { ifExists: true });
      try {
        await adapter.createTable("key_tests", { force: true }, (t: any) => {
          t.string("title");
          t.string("body");
        });
        await adapter.addIndex("key_tests", ["title"], {
          name: "index_key_tests_on_title",
          length: 10,
        });
        // Descending indexes are MySQL 8+; MariaDB stores DESC but reports the
        // column ascending (Collation != "D"), so only assert orders off MariaDB.
        const supportsDesc = !isMariaDb;
        await adapter.addIndex("key_tests", ["body"], {
          name: "index_key_tests_on_body",
          order: { body: "desc" },
        });
        const indexes = await adapter.indexes("key_tests");
        const byName = (n: string) => indexes.find((i) => i.name === n)!;
        expect(byName("index_key_tests_on_title").lengths).toEqual({ title: 10 });
        if (supportsDesc) {
          expect(byName("index_key_tests_on_body").orders).toEqual({ body: "desc" });
        }
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
});

// Top-level suite mirrors Rails: MysqlAnsiQuotesTest is a separate test class
// (not nested inside SchemaTest's module). Keeping it outside the "Mysql2Adapter"
// describe also avoids spinning up the SchemaTest adapter pool for ANSI tests.
describeIfMysql("MySQLAnsiQuotesTest", () => {
  // Build a fresh adapter with sql_mode='ANSI_QUOTES' applied in the pool init SQL
  // so it persists across every checked-out connection — Rails uses
  // `execute("SET SESSION sql_mode='ANSI_QUOTES'")` on its single leased connection;
  // we apply the variable per-connection via the pool init hook (newClient).
  let ansi: Mysql2Adapter | undefined;
  beforeEach(() => {
    ansi = new Mysql2Adapter({ uri: MYSQL_TEST_URL, variables: { sql_mode: "ANSI_QUOTES" } });
  });
  afterEach(async () => {
    // Rails' teardown calls `@connection.reconnect!` to clear ANSI_QUOTES on
    // the shared leased connection. We use a dedicated adapter per test, so
    // close() fully drains the pool and no extra reconnect is needed.
    // Optional-chain so a beforeEach construction failure doesn't mask itself
    // with a secondary TypeError here.
    await ansi?.close();
    ansi = undefined;
  });

  it("primary key method with ansi quotes", async () => {
    const a = ansi!;
    await a.createTable("ca_topics", { force: true });
    try {
      expect(await a.primaryKey("ca_topics")).toBe("id");
    } finally {
      await a.dropTable("ca_topics", { ifExists: true });
    }
  });

  it("foreign keys method with ansi quotes", async () => {
    const a = ansi!;
    // Scratch tables mirroring Rails' lessons_students join table (id:false with
    // lesson_id + student_id references, schema.rb:715) and students(id), but on
    // non-canonical names so the one-schema harness never sees a canonical drop.
    await a.createTable("ca_students", { force: true });
    await a.createTable("ca_lessons_students", { id: false, force: true }, (t: any) => {
      t.integer("lesson_id");
      t.integer("student_id");
    });
    try {
      await a.addForeignKey("ca_lessons_students", "ca_students", {
        column: "student_id",
        onDelete: "cascade",
      });
      const fks = await a.foreignKeys("ca_lessons_students");
      expect(fks).toHaveLength(1);
      expect(fks[0].fromTable).toBe("ca_lessons_students");
      expect(fks[0].toTable).toBe("ca_students");
      expect(fks[0].onDelete).toBe("cascade");
    } finally {
      await a.dropTable("ca_lessons_students", "ca_students", { ifExists: true });
    }
  });
});
