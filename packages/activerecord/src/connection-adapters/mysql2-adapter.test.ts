import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { Base, transaction, registerModel, loadBelongsTo, loadHasMany } from "../index.js";

/**
 * These tests require a running MySQL instance. They will be skipped if
 * the connection fails.
 *
 * Set MYSQL_TEST_URL to a connection string, or the tests will default to:
 *   mysql://root@localhost:3306/rails_js_test
 *
 * To set up:
 *   mysql -u root -e "CREATE DATABASE rails_js_test"
 */
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL ?? "mysql://root@localhost:3306/rails_js_test";

let mysqlAvailable = false;

async function checkMysql(): Promise<boolean> {
  try {
    const conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    await conn.query("SELECT 1");
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

mysqlAvailable = await checkMysql();

const describeIfMysql = mysqlAvailable ? describe : describe.skip;

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;

  // Tables touched by any test in this suite. Dropped on BOTH sides of
  // each test so a crash that skips afterEach can't poison the next
  // run (which was causing intermittent CI failures with
  // ER_TABLE_EXISTS_ERROR on leftover `users`).
  const TRACKED_TABLES = [
    "books",
    "authors",
    "users",
    "items",
    "accounts",
    "products",
    "posts",
    "widgets",
    "bind_param_items",
    "exec_test_tbl",
  ];
  const TRACKED_VIEWS = ["recent_widgets"];

  // Drop via a dedicated mysql2 connection (not the adapter's pool) so
  // `SET FOREIGN_KEY_CHECKS = 0` stays in scope for every subsequent
  // DROP on the same connection. Going through the adapter would take
  // a fresh pool connection per exec() and the SET would only apply
  // to the first call. FK checks matter here because the shared
  // test-adapter (packages/activerecord/src/test-adapter.ts) creates
  // users/posts/etc. BEFORE this file runs and may add FK constraints
  // that block a plain DROP TABLE, leaving leftovers that poison the
  // very first test of each CI run.
  const dropTrackedObjects = async (): Promise<void> => {
    const conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const view of TRACKED_VIEWS) {
        try {
          await conn.query(`DROP VIEW IF EXISTS \`${view}\``);
        } catch {
          /* ignore */
        }
      }
      for (const tbl of TRACKED_TABLES) {
        try {
          await conn.query(`DROP TABLE IF EXISTS \`${tbl}\``);
        } catch {
          /* ignore */
        }
      }
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    } finally {
      await conn.end();
    }
  };

  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    // Defensive pre-test cleanup: a previous run that crashed without
    // hitting afterEach could leave tables behind.
    await dropTrackedObjects();
  });

  afterEach(async () => {
    await dropTrackedObjects();
    await adapter.close();
  });

  // -- Basic adapter operations --
  describe("raw SQL execution", () => {
    it("creates tables and inserts data", async () => {
      await adapter.exec("CREATE TABLE `users` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT)");
      await adapter.executeMutation("INSERT INTO `users` (`name`) VALUES ('Alice')");
      const rows = await adapter.execute("SELECT * FROM `users`");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("returns last insert id for INSERT", async () => {
      await adapter.exec("CREATE TABLE `items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT)");
      const id1 = await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('A')");
      const id2 = await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('B')");
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("returns affected rows for UPDATE", async () => {
      await adapter.exec(
        "CREATE TABLE `items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT, `active` INT DEFAULT 1)",
      );
      await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('A')");
      await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('B')");
      const affected = await adapter.executeMutation("UPDATE `items` SET `active` = 0");
      expect(affected).toBe(2);
    });

    it("returns affected rows for DELETE", async () => {
      await adapter.exec("CREATE TABLE `items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT)");
      await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('A')");
      await adapter.executeMutation("INSERT INTO `items` (`name`) VALUES ('B')");
      const deleted = await adapter.executeMutation("DELETE FROM `items` WHERE `name` = 'A'");
      expect(deleted).toBe(1);
    });

    it("supports parameterized queries", async () => {
      await adapter.exec(
        "CREATE TABLE `items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT, `price` INT)",
      );
      await adapter.executeMutation("INSERT INTO `items` (`name`, `price`) VALUES ('A', 10)");
      await adapter.executeMutation("INSERT INTO `items` (`name`, `price`) VALUES ('B', 20)");
      await adapter.executeMutation("INSERT INTO `items` (`name`, `price`) VALUES ('C', 30)");

      const rows = await adapter.execute("SELECT * FROM `items` WHERE `price` > ?", [15]);
      expect(rows).toHaveLength(2);
    });
  });

  // -- Transactions --
  describe("transactions", () => {
    beforeEach(async () => {
      await adapter.exec(
        "CREATE TABLE `accounts` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` TEXT, `balance` INT)",
      );
    });

    it("commits on success", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Alice', 100)",
      );
      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Bob', 200)",
      );
      await adapter.commit();

      const rows = await adapter.execute("SELECT * FROM `accounts`");
      expect(rows).toHaveLength(2);
    });

    it("rolls back on failure", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Alice', 100)",
      );
      await adapter.rollback();

      const rows = await adapter.execute("SELECT * FROM `accounts`");
      expect(rows).toHaveLength(0);
    });

    it("savepoints allow partial rollback", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Alice', 100)",
      );

      await adapter.createSavepoint("sp1");
      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Bob', 200)",
      );
      await adapter.rollbackToSavepoint("sp1");

      await adapter.executeMutation(
        "INSERT INTO `accounts` (`name`, `balance`) VALUES ('Charlie', 300)",
      );
      await adapter.commit();

      const rows = await adapter.execute("SELECT * FROM `accounts`");
      expect(rows).toHaveLength(2);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Alice");
      expect(names).toContain("Charlie");
      expect(names).not.toContain("Bob");
    });

    it("tracks inTransaction state", async () => {
      expect(adapter.inTransaction).toBe(false);
      await adapter.beginTransaction();
      expect(adapter.inTransaction).toBe(true);
      await adapter.commit();
      expect(adapter.inTransaction).toBe(false);
    });
  });

  // -- ActiveRecord Base with real MySQL --
  describe("Base integration", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("age", "integer");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE \`users\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` TEXT,
          \`email\` TEXT,
          \`age\` INT
        )
      `);
      User.adapter = adapter;
    });

    it("creates and retrieves records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      expect(user.id).toBe(1);
      expect(user.isPersisted()).toBe(true);

      const found = await User.find(1);
      expect(found.name).toBe("Alice");
      expect(found.email).toBe("alice@test.com");
      expect(found.age).toBe(30);
    });

    it("updates records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.update({ name: "Alicia", age: 31 });

      const found = await User.find(user.id);
      expect(found.name).toBe("Alicia");
      expect(found.age).toBe(31);
    });

    it("destroys records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.destroy();

      expect(user.isDestroyed()).toBe(true);
      await expect(User.find(1)).rejects.toThrow("not found");
    });

    it("findBy returns null for no match", async () => {
      const found = await User.findBy({ name: "Nobody" });
      expect(found).toBeNull();
    });

    it("handles null values correctly", async () => {
      const user = await User.create({
        name: "Alice",
        email: null,
        age: null,
      });

      const found = await User.find(user.id);
      expect(found.email).toBeNull();
      expect(found.age).toBeNull();
    });
  });

  // -- Relation with real MySQL --
  describe("Relation integration", () => {
    class Product extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
        this.attribute("category", "string");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE \`products\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` TEXT,
          \`price\` INT,
          \`category\` TEXT
        )
      `);
      Product.adapter = adapter;
      await Product.create({ name: "Apple", price: 1, category: "fruit" });
      await Product.create({ name: "Banana", price: 2, category: "fruit" });
      await Product.create({ name: "Carrot", price: 3, category: "vegetable" });
      await Product.create({ name: "Date", price: 4, category: "fruit" });
      await Product.create({ name: "Eggplant", price: 5, category: "vegetable" });
    });

    it("all() returns all records", async () => {
      const products = await Product.all().toArray();
      expect(products).toHaveLength(5);
    });

    it("where filters correctly", async () => {
      const fruits = await Product.where({ category: "fruit" }).toArray();
      expect(fruits).toHaveLength(3);
    });

    it("exists", async () => {
      expect(await Product.where({ category: "fruit" }).exists()).toBe(true);
      expect(await Product.where({ category: "meat" }).exists()).toBe(false);
    });

    it("deleteAll with where", async () => {
      const deleted = await Product.where({ category: "vegetable" }).deleteAll();
      expect(deleted).toBe(2);
      expect(await Product.all().count()).toBe(3);
    });

    it("updateAll with where", async () => {
      await Product.where({ category: "fruit" }).updateAll({ price: 99 });
      const apple = await Product.find(1);
      expect(apple.price).toBe(99);
    });
  });

  // -- Transaction integration --
  describe("transaction integration", () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("balance", "integer", { default: 0 });
      }
    }

    beforeEach(async () => {
      // InnoDB is required for transactions
      await adapter.exec(`
        CREATE TABLE \`accounts\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` TEXT,
          \`balance\` INT DEFAULT 0
        ) ENGINE=InnoDB
      `);
      Account.adapter = adapter;
    });

    it("commits on success", async () => {
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });
        await Account.create({ name: "Bob", balance: 200 });
      });

      expect(await Account.all().count()).toBe(2);
    });

    it("actually rolls back on failure", async () => {
      await Account.create({ name: "Existing", balance: 50 });

      try {
        await transaction(Account, async () => {
          await Account.create({ name: "Alice", balance: 100 });
          throw new Error("Boom");
        });
      } catch {
        // expected
      }

      const count = await Account.all().count();
      expect(count).toBe(1);
    });
  });

  // -- Associations with real MySQL --
  describe("associations integration", () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE \`authors\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` TEXT
        )
      `);
      await adapter.exec(`
        CREATE TABLE \`books\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`title\` TEXT,
          \`author_id\` INT
        )
      `);
      Author.adapter = adapter;
      Book.adapter = adapter;
      registerModel(Author);
      registerModel(Book);
    });

    it("belongsTo loads parent from real DB", async () => {
      const author = await Author.create({ name: "Tolkien" });
      const book = await Book.create({
        title: "The Hobbit",
        author_id: author.id,
      });

      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Tolkien");
    });

    it("hasMany loads children from real DB", async () => {
      const author = await Author.create({ name: "Tolkien" });
      await Book.create({ title: "The Hobbit", author_id: author.id });
      await Book.create({ title: "The Silmarillion", author_id: author.id });
      await Book.create({ title: "Other Book", author_id: 999 });

      const books = await loadHasMany(author, "books", {});
      expect(books).toHaveLength(2);
    });
  });

  // -- Basic exec/query tests --
  describe("basic exec and query", () => {
    it("exec runs DDL statements", async () => {
      await adapter.exec(
        "CREATE TABLE `exec_test_tbl` (`id` INT AUTO_INCREMENT PRIMARY KEY, `val` INT)",
      );
      const rows = await adapter.execute("SELECT * FROM `exec_test_tbl`");
      expect(rows).toHaveLength(0);
    });

    afterEach(async () => {
      try {
        await adapter.exec("DROP TABLE IF EXISTS `exec_test_tbl`");
      } catch {
        // ignore
      }
    });

    it("execute returns rows from query", async () => {
      const rows = await adapter.execute("SELECT 1 AS num");
      expect(rows).toHaveLength(1);
      expect(rows[0].num).toBe(1);
    });
  });

  describe("schema introspection", () => {
    beforeEach(async () => {
      await adapter.exec("DROP VIEW IF EXISTS `recent_widgets`");
      await adapter.exec("DROP TABLE IF EXISTS `widgets`");
      await adapter.exec(
        "CREATE TABLE `widgets` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(255) NOT NULL, `owner` VARCHAR(255))",
      );
      await adapter.exec("CREATE INDEX `widgets_on_owner` ON `widgets` (`owner`)");
      await adapter.exec(
        "CREATE VIEW `recent_widgets` AS SELECT id, name FROM widgets ORDER BY id DESC",
      );
    });

    afterEach(async () => {
      await adapter.exec("DROP VIEW IF EXISTS `recent_widgets`");
      await adapter.exec("DROP TABLE IF EXISTS `widgets`");
    });

    it("tables() lists BASE TABLEs only", async () => {
      const tables = await adapter.tables();
      expect(tables).toContain("widgets");
      expect(tables).not.toContain("recent_widgets");
    });

    it("views() lists views only", async () => {
      const views = await adapter.views();
      expect(views).toContain("recent_widgets");
      expect(views).not.toContain("widgets");
    });

    it("dataSources() is deduped tables + views", async () => {
      const sources = await adapter.dataSources();
      expect(sources).toContain("widgets");
      expect(sources).toContain("recent_widgets");
      expect(new Set(sources).size).toBe(sources.length);
    });

    it("tableExists() / viewExists() distinguish tables and views", async () => {
      expect(await adapter.tableExists("widgets")).toBe(true);
      expect(await adapter.tableExists("recent_widgets")).toBe(false);
      expect(await adapter.viewExists("recent_widgets")).toBe(true);
      expect(await adapter.viewExists("widgets")).toBe(false);
      expect(await adapter.dataSourceExists("recent_widgets")).toBe(true);
      expect(await adapter.dataSourceExists("nonexistent")).toBe(false);
    });

    it("primaryKey() returns the pk column name", async () => {
      expect(await adapter.primaryKey("widgets")).toBe("id");
    });

    it("rejects three-part identifiers instead of silently truncating", async () => {
      // MySQL doesn't have a nested catalog concept, so `a.b.c` is
      // invalid input. The prior behavior silently took the first two
      // parts, which pointed introspection at a completely different
      // table. Fail loudly instead.
      await expect(adapter.tableExists("a.b.c")).rejects.toThrow(/Invalid MySQL identifier/);
    });

    it("rejects identifiers with empty segments", async () => {
      // Regex tokenization happily dropped `.widgets`, `a..b`, and
      // `db.widgets.` as if they were valid. A whole-string parser
      // now catches each as malformed — critical because those shapes
      // would otherwise resolve to different tables than the caller
      // thinks.
      await expect(adapter.tableExists(".widgets")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("a..b")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("db.widgets.")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("")).rejects.toThrow(/Invalid MySQL identifier/);
    });

    it("rejects unquoted identifiers containing whitespace", async () => {
      // MySQL only permits whitespace inside backtick-quoted
      // identifiers. Unquoted variants like 'db .widgets' or
      // 'db. widgets' or 'wid gets' would previously have been
      // silently accepted (producing lookups for bogus names like
      // ' widgets'); now they throw.
      await expect(adapter.tableExists("db .widgets")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("db. widgets")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("wid gets")).rejects.toThrow(/Invalid MySQL identifier/);
      // But whitespace INSIDE a backtick-quoted identifier is valid
      // — MySQL permits it and we must too.
      // (No DB-side assertion here, just ensure it doesn't throw.)
      expect(await adapter.tableExists("`not a real table`")).toBe(false);
    });

    it("rejects empty *quoted* identifiers", async () => {
      // Quoted tokens lex fine (``, `a`.``, ``.widgets all match the
      // parser's quoted-token rule) but unquote to an empty string —
      // which would break COALESCE(?, database()) and silently scan
      // the wrong catalog. Validate non-empty after unquoting.
      await expect(adapter.tableExists("``")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("``.widgets")).rejects.toThrow(/Invalid MySQL identifier/);
      await expect(adapter.tableExists("`db`.``")).rejects.toThrow(/Invalid MySQL identifier/);
    });

    it("introspection accepts schema-qualified names", async () => {
      // The implementation takes `schema.table` via parseMysqlName and
      // routes through COALESCE(?, database()). Exercise that path so
      // an accidental ordinal_position/seq_in_index swap or a missing
      // ORDER BY change doesn't silently break qualified callers.
      const rows = (await adapter.execute("SELECT DATABASE() AS db")) as Array<{
        db?: string;
        DB?: string;
      }>;
      const dbName = String(rows[0].db ?? rows[0].DB);
      expect(await adapter.tableExists(`${dbName}.widgets`)).toBe(true);
      expect(await adapter.tableExists(`\`${dbName}\`.\`widgets\``)).toBe(true);
      expect(await adapter.primaryKey(`${dbName}.widgets`)).toBe("id");
      const cols = await adapter.columns(`${dbName}.widgets`);
      expect(cols.map((c) => c.name)).toEqual(["id", "name", "owner"]);
    });

    it("columns() returns column metadata for every column", async () => {
      const cols = await adapter.columns("widgets");
      expect(cols.map((c) => c.name)).toEqual(["id", "name", "owner"]);
      const idCol = cols.find((c) => c.name === "id");
      expect(idCol?.primaryKey).toBe(true);
      expect(idCol?.null).toBe(false);
      const nameCol = cols.find((c) => c.name === "name");
      expect(nameCol?.null).toBe(false);
      expect(nameCol?.sqlType?.startsWith("varchar")).toBe(true);
    });

    it("indexes() returns user-created indexes and skips PRIMARY", async () => {
      const idx = await adapter.indexes("widgets");
      expect(idx).toEqual([{ name: "widgets_on_owner", columns: ["owner"], unique: false }]);
    });

    it("indexes() represents MySQL 8+ functional indexes via their expression", async () => {
      // MySQL 8+ supports `CREATE INDEX ... ON t((expr))`; those rows
      // have NULL column_name in information_schema.statistics and the
      // expression in `expression`. Surfacing "null" as a column name
      // would poison SchemaCache; wrapping the expression in parens
      // matches Rails' IndexDefinition display.
      //
      // Gate on a DB-side probe rather than try/catching CREATE (a
      // blanket catch would also swallow permissions errors or a
      // genuine syntax regression) and rather than reaching into a
      // private adapter helper (couples the test to implementation
      // details). Query information_schema.columns for
      // STATISTICS.EXPRESSION directly — the column exists on MySQL
      // 8.0.13+, absent on older MySQL and on MariaDB.
      const capabilityRows = (await adapter.execute(
        `SELECT 1 AS one FROM information_schema.columns
           WHERE table_schema = 'information_schema'
           AND table_name = 'STATISTICS'
           AND column_name = 'EXPRESSION'
           LIMIT 1`,
      )) as Array<unknown>;
      if (capabilityRows.length === 0) return;

      await adapter.exec("CREATE INDEX `widgets_on_lower_name` ON `widgets` ((LOWER(`name`)))");
      const idx = await adapter.indexes("widgets");
      const functional = idx.find((i) => i.name === "widgets_on_lower_name");
      expect(functional).toBeDefined();
      // Either `(lower(`name`))` or similar — just assert it's parenthesized.
      expect(functional!.columns).toHaveLength(1);
      expect(functional!.columns[0].startsWith("(")).toBe(true);
      expect(functional!.columns[0]).not.toBe("null");
    });

    it("SchemaCache.addAll populates from MySQL", async () => {
      // Integration with Phase 5's dumpSchemaCache — MySQL now exposes
      // the full surface (dataSources/columns/primaryKey/indexes) the
      // capability guard requires.
      const { SchemaCache } = await import("./schema-cache.js");
      const cache = new SchemaCache();
      await cache.addAll(adapter);
      const cols = await cache.columns(adapter, "widgets");
      expect(cols?.map((c) => c.name)).toEqual(["id", "name", "owner"]);
      expect(await cache.primaryKeys(adapter, "widgets")).toBe("id");
    });
  });
});
