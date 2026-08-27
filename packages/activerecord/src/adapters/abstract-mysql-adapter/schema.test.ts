/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";
import { Base } from "../../base.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("SchemaTest", () => {
    it("float limits", async () => {
      // On MariaDB a bare FLOAT is normalized to DOUBLE in information_schema.columns
      // (column_type = 'double'); columns() recovers the declared type via SHOW FULL
      // FIELDS FROM (as Rails does) so the 0..24 vs 25..53 float-limit split holds.
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
      // Rails' schema load lays the canonical `posts` @omgpost rides
      // (schema_test.rb:19-20 reads `Post.table_name`); trails' per-worker boot
      // lays the same canonical schema, so ride it rather than re-laying it.
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
        try {
          const first = await (OmgPost as any).first();
          expect(first).toBeTruthy();
        } finally {
          await adapter.executeMutation(
            "DELETE FROM `posts` WHERE `title` = 'Welcome to the weblog'",
          );
        }
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
    });

    it("drop temporary table", async () => {
      await adapter.transaction(async () => {
        await adapter.createTable("temp_table", { temporary: true });
        // if it doesn't properly say DROP TEMPORARY TABLE, the transaction commit
        // will complain that no transaction is active
        //
        // So the drop IS the assertion and stays here; the table is
        // session-scoped either way and cannot strand.
        // eslint-disable-next-line blazetrails/require-table-teardown
        await adapter.dropTable("temp_table", { temporary: true });
      });
    });
  });
});

// Top-level suite mirrors Rails: MysqlAnsiQuotesTest is a separate test class
// (not nested inside SchemaTest's module).
describeIfMysqlAdapter("MySQLAnsiQuotesTest", () => {
  // The one adapter in this file that stays self-built rather than riding
  // leaseMysqlAdapter(): sql_mode='ANSI_QUOTES' must not leak onto the shared
  // leased connection the other suites (and every later test in this worker)
  // run on. Rails likewise reconfigures a connection in-test from the primary
  // config. Applying the variable in the pool init SQL (the newClient hook)
  // makes it stick across every checked-out connection, where Rails gets away
  // with a single `execute("SET SESSION sql_mode='ANSI_QUOTES'")` because it
  // has exactly one leased connection to set it on.
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
    // Rails reads the canonical `topics` its schema load laid; trails'
    // per-worker boot lays the same table, so read it in place.
    expect(await a.primaryKey("topics")).toBe("id");
  });

  it("foreign keys method with ansi quotes", async () => {
    const a = ansi!;
    // Rails' schema.rb:715-726 lays `lessons_students` / `students` AND the
    // `add_foreign_key :lessons_students, :students, on_delete: :cascade,
    // deferrable: :immediate` this reads, so schema_test.rb:125-128 is a bare
    // read. trails' canonical schema lays the two tables but not the FK
    // (`canonical-schema.ts:1074`), so it is added and taken back off here
    // until `lessons-students-canonical-foreign-key` closes that gap; then
    // this reverts to the bare read.
    await a.addForeignKey("lessons_students", "students", { onDelete: "cascade" });
    try {
      const fks = await a.foreignKeys("lessons_students");
      expect(fks).toHaveLength(1);
      expect(fks[0].fromTable).toBe("lessons_students");
      expect(fks[0].toTable).toBe("students");
      expect(fks[0].onDelete).toBe("cascade");
    } finally {
      await a.removeForeignKey("lessons_students", "students");
    }
  });
});
