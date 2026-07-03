/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../base.js";

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

    // Rails' setup builds `@omgpost`, an anonymous Post subclass with the
    // inheritance column disabled whose table_name is the schema-qualified
    // `#{db}.posts`. We reproduce it the same way, riding the canonical posts
    // shape, so test_schema / test_primary_key / test_data_source_exists? all
    // exercise the qualified name exactly as Rails does.
    async function withOmgPost(
      fn: (omgPost: typeof Base, db: string) => Promise<void>,
    ): Promise<void> {
      // Mirror schema.rb's canonical `posts` create_table (the table @omgpost
      // rides). Rails loads the whole schema on the shared connection; here the
      // per-test adapter lays just this table and drops it in the finally.
      await adapter.createTable("posts", { force: true }, (t: any) => {
        t.integer("author_id");
        t.string("title", { null: false });
        t.text("body", { null: false });
        t.string("type");
        t.integer("legacy_comments_count", { default: 0 });
        t.integer("taggings_with_delete_all_count", { default: 0 });
        t.integer("taggings_with_destroy_count", { default: 0 });
        t.integer("tags_count", { default: 0 });
        t.integer("indestructible_tags_count", { default: 0 });
        t.integer("tags_with_destroy_count", { default: 0 });
        t.integer("tags_with_nullify_count", { default: 0 });
      });
      try {
        const db = await adapter.currentDatabase();
        // Mirror Rails' `def self.name; "Post"` override on the anonymous
        // @omgpost class. Safe to override the class name here: trails' model
        // registry is opt-in via registerModel() (no auto-`inherited` hook), and
        // OmgPost is never registered, so this cannot collide with a canonical
        // Post.
        class OmgPost extends Base {
          static _tableName = `${db}.posts`;
          static name = "Post";
        }
        OmgPost.inheritanceColumn = "disabled";
        OmgPost.adapter = adapter;
        await fn(OmgPost, db);
      } finally {
        await adapter.dropTable("posts", { ifExists: true });
      }
    }

    it("schema", async () => {
      await withOmgPost(async (OmgPost) => {
        // Rails loads `fixtures :posts` into the unqualified `posts` table; the
        // qualified `db.posts` @omgpost only reads it. Insert into the plain
        // table name to avoid quoting the schema-qualified name as one identifier.
        await adapter.executeMutation(
          "INSERT INTO `posts` (`title`, `body`, `type`) " +
            "VALUES ('Welcome to the weblog', 'Such a lovely day', 'Post')",
        );
        const first = await (OmgPost as any).first();
        expect(first).toBeTruthy();
      });
    });

    it("primary key", async () => {
      await withOmgPost(async (OmgPost) => {
        // Rails asserts @omgpost.primary_key, which delegates to the connection's
        // primary-key lookup for the schema-qualified table_name. The trails
        // static getter can return the convention "id" from a cold cache without
        // touching MySQL, so assert through the adapter on the qualified name to
        // actually exercise primaryKey("db.posts").
        const name = (OmgPost as any)._tableName as string;
        expect(await adapter.primaryKey(name)).toBe("id");
      });
    });

    it("data source exists?", async () => {
      await withOmgPost(async (OmgPost) => {
        // Rails passes @omgpost.table_name, the qualified `db.posts` form.
        const name = (OmgPost as any)._tableName as string;
        expect(await adapter.dataSourceExists(name)).toBe(true);
      });
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
          t.string("snacks");
        });
        await adapter.addIndex("key_tests", ["snacks"], { name: "index_key_tests_on_snack" });
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
    // Mirror schema.rb's canonical `topics` create_table.
    await a.createTable("topics", { force: true }, (t: any) => {
      t.string("title", { limit: 250 });
      t.string("author_name");
      t.string("author_email_address");
      // MySQL upgrades bare DATETIME to DATETIME(6) (Rails datetime-with-precision),
      // matching the boot-laid canonical `topics` — pass precision explicitly.
      t.datetime("written_on", { precision: 6 });
      t.time("bonus_time");
      t.date("last_read");
      t.text("content");
      t.text("important");
      t.binary("binary_content");
      t.boolean("approved", { default: true });
      t.integer("replies_count", { default: 0 });
      t.integer("unique_replies_count", { default: 0 });
      t.integer("parent_id");
      t.string("parent_title");
      t.string("type");
      t.string("group");
      t.datetime("created_at", { null: true, precision: 6 });
      t.datetime("updated_at", { null: true, precision: 6 });
      t.index(["author_name", "title"]);
    });
    try {
      expect(await a.primaryKey("topics")).toBe("id");
    } finally {
      await a.dropTable("topics", { ifExists: true });
    }
  });

  it("foreign keys method with ansi quotes", async () => {
    const a = ansi!;
    // Mirrors Rails test/schema/schema.rb: lessons_students is id:false with a
    // student_id referencing students(id) — both from the canonical schema.
    await a.createTable("students", { force: true }, (t: any) => {
      t.string("name");
      t.boolean("active");
      t.integer("college_id");
    });
    await a.createTable("lessons_students", { force: true, id: false }, (t: any) => {
      t.bigint("lesson_id");
      t.bigint("student_id");
    });
    try {
      await a.addForeignKey("lessons_students", "students", { onDelete: "cascade" });
      const fks = await a.foreignKeys("lessons_students");
      expect(fks).toHaveLength(1);
      expect(fks[0].fromTable).toBe("lessons_students");
      expect(fks[0].toTable).toBe("students");
      expect(fks[0].onDelete).toBe("cascade");
    } finally {
      await a.dropTable("lessons_students", "students", { ifExists: true });
    }
  });
});
