import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mysql from "mysql2/promise";
import { MysqlAdapter } from "./mysql-adapter.js";
import {
  Base,
  Relation,
  Migration,
  transaction,
  savepoint,
  registerModel,
  loadBelongsTo,
  loadHasMany,
} from "../index.js";

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

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;

  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });

  afterEach(async () => {
    try {
      await adapter.exec("DROP TABLE IF EXISTS `books`");
      await adapter.exec("DROP TABLE IF EXISTS `authors`");
      await adapter.exec("DROP TABLE IF EXISTS `users`");
      await adapter.exec("DROP TABLE IF EXISTS `items`");
      await adapter.exec("DROP TABLE IF EXISTS `accounts`");
      await adapter.exec("DROP TABLE IF EXISTS `products`");
      await adapter.exec("DROP TABLE IF EXISTS `posts`");
      await adapter.exec("DROP TABLE IF EXISTS `bind_param_items`");
      await adapter.exec("DROP TABLE IF EXISTS `exec_test_tbl`");
    } catch {
      // ignore cleanup errors
    }
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
      expect(found.readAttribute("name")).toBe("Alice");
      expect(found.readAttribute("email")).toBe("alice@test.com");
      expect(found.readAttribute("age")).toBe(30);
    });

    it("updates records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.update({ name: "Alicia", age: 31 });

      const found = await User.find(user.id);
      expect(found.readAttribute("name")).toBe("Alicia");
      expect(found.readAttribute("age")).toBe(31);
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
      expect(found.readAttribute("email")).toBeNull();
      expect(found.readAttribute("age")).toBeNull();
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

    it("count", async () => {
      expect(await Product.all().count()).toBe(5);
      expect(await Product.where({ category: "fruit" }).count()).toBe(3);
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
      expect(apple.readAttribute("price")).toBe(99);
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
      expect(loaded!.readAttribute("name")).toBe("Tolkien");
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

  // -- Rails: mysql2_adapter_test.rb --
  describe("Mysql2AdapterTest", () => {
    it.skip("connection error", () => {});
    it.skip("reconnection error", () => {});
    it.skip("mysql2 default prepared statements", () => {});
    it.skip("exec query with prepared statements", () => {});
    it.skip("exec query nothing raises with no result queries", () => {});
    it.skip("database exists returns false if database does not exist", () => {});
    it.skip("database exists returns true when the database exists", () => {});
    it.skip("columns for distinct zero orders", () => {});
    it.skip("columns for distinct one order", () => {});
    it.skip("columns for distinct few orders", () => {});
    it.skip("columns for distinct with case", () => {});
    it.skip("columns for distinct blank not nil orders", () => {});
    it.skip("columns for distinct with arel order", () => {});
    it.skip("errors for bigint fks on integer pk table in alter table", () => {});
    it.skip("errors for multiple fks on mismatched types for pk table in alter table", () => {});
    it.skip("errors for bigint fks on integer pk table in create table", () => {});
    it.skip("errors for integer fks on bigint pk table in create table", () => {});
    it.skip("errors for bigint fks on string pk table in create table", () => {});
    it.skip("read timeout exception", () => {});
    it.skip("statement timeout error codes", () => {});
    it.skip("database timezone changes synced to connection", () => {});
    it.skip("warnings do not change returned value of exec update", () => {});
    it.skip("warnings do not change returned value of exec delete", () => {});
  });

  // -- Rails: check_constraint_quoting_test.rb --
  describe("CheckConstraintQuotingTest", () => {
    it.skip("check constraint no duplicate expression quoting", () => {});
  });

  // -- Rails: abstract_mysql_adapter/connection_test.rb --
  describe("ConnectionTest", () => {
    it.skip("bad connection", () => {});
    it.skip("no automatic reconnection after timeout", () => {});
    it.skip("successful reconnection after timeout with manual reconnect", () => {});
    it.skip("successful reconnection after timeout with verify", () => {});
    it.skip("execute after disconnect reconnects", () => {});
    it.skip("quote after disconnect reconnects", () => {});
    it.skip("active after disconnect", () => {});
    it.skip("wait timeout as string", () => {});
    it.skip("wait timeout as url", () => {});

    it("character set connection is configured", async () => {
      const rows = await adapter.execute("SHOW VARIABLES LIKE 'character_set_connection'");
      expect(rows).toHaveLength(1);
      expect(rows[0].Value).toBeDefined();
    });

    it.skip("collation connection is configured", () => {});
    it.skip("mysql default in strict mode", () => {});
    it.skip("mysql strict mode disabled", () => {});
    it.skip("mysql strict mode specified default", () => {});
    it.skip("mysql sql mode variable overrides strict mode", () => {});
    it.skip("passing arbitrary flags to adapter", () => {});
    it.skip("passing flags by array to adapter", () => {});
    it.skip("mysql set session variable", () => {});
    it.skip("mysql set session variable to default", () => {});
    it.skip("logs name show variable", () => {});
    it.skip("logs name rename column for alter", () => {});
    it.skip("get and release advisory lock", () => {});
    it.skip("release non existent advisory lock", () => {});
    it.skip("version string", () => {});
    it.skip("version string with mariadb", () => {});
    it.skip("version string invalid", () => {});
    it.skip("lock free", () => {});
  });

  // -- Rails: abstract_mysql_adapter/active_schema_test.rb --
  describe("ActiveSchemaTest", () => {
    it.skip("add index", () => {});
    it.skip("index in create", () => {});
    it.skip("index in bulk change", () => {});
    it.skip("drop table", () => {});
    it.skip("drop tables", () => {});
    it.skip("create mysql database with encoding", () => {});
    it.skip("recreate mysql database with encoding", () => {});
    it.skip("add column", () => {});
    it.skip("add column with limit", () => {});
    it.skip("drop table with specific database", () => {});
    it.skip("drop tables with specific database", () => {});
    it.skip("add timestamps", () => {});
    it.skip("remove timestamps", () => {});
    it.skip("indexes in create", () => {});
  });

  // -- Rails: abstract_mysql_adapter/adapter_prevent_writes_test.rb --
  describe("AdapterPreventWritesTest", () => {
    it.skip("errors when an insert query is called while preventing writes", () => {});
    it.skip("errors when an update query is called while preventing writes", () => {});
    it.skip("errors when a delete query is called while preventing writes", () => {});
    it.skip("errors when a replace query is called while preventing writes", () => {});
    it.skip("doesnt error when a select query is called while preventing writes", () => {});
    it.skip("doesnt error when a show query is called while preventing writes", () => {});
    it.skip("doesnt error when a set query is called while preventing writes", () => {});
    it.skip("doesnt error when a describe query is called while preventing writes", () => {});
    it.skip("doesnt error when a desc query is called while preventing writes", () => {});
    it.skip("doesnt error when a read query with leading chars is called while preventing writes", () => {});
    it.skip("doesnt error when a use query is called while preventing writes", () => {});
    it.skip("doesnt error when a kill query is called while preventing writes", () => {});
  });

  // -- Rails: abstract_mysql_adapter/bind_parameter_test.rb --
  describe("BindParameterTest", () => {
    beforeEach(async () => {
      await adapter.exec(
        "CREATE TABLE `bind_param_items` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(255), `value` INT)",
      );
    });

    afterEach(async () => {
      try {
        await adapter.exec("DROP TABLE IF EXISTS `bind_param_items`");
      } catch {
        // ignore
      }
    });

    it("create question marks", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["test?item", 42],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items`");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("test?item");
      expect(rows[0].value).toBe(42);
    });

    it("update question marks", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["original", 1],
      );
      await adapter.executeMutation("UPDATE `bind_param_items` SET `name` = ? WHERE `value` = ?", [
        "updated?name",
        1,
      ]);
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `value` = ?", [1]);
      expect(rows[0].name).toBe("updated?name");
    });

    it.skip("update null bytes", () => {});
    it.skip("create null bytes", () => {});

    it("where with string for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["hello", 1],
      );
      const rows = await adapter.execute("SELECT * FROM `bind_param_items` WHERE `name` = ?", [
        "hello",
      ]);
      expect(rows).toHaveLength(1);
    });

    it("where with integer for string column using bind parameters", async () => {
      await adapter.executeMutation(
        "INSERT INTO `bind_param_items` (`name`, `value`) VALUES (?, ?)",
        ["123", 1],
      );
      const rows = await adapter.execute(
        "SELECT * FROM `bind_param_items` WHERE `name` = ?",
        [123],
      );
      expect(rows).toHaveLength(1);
    });

    it.skip("where with float for string column using bind parameters", () => {});
    it.skip("where with boolean for string column using bind parameters", () => {});
    it.skip("where with decimal for string column using bind parameters", () => {});
    it.skip("where with rational for string column using bind parameters", () => {});
  });

  // -- Rails: abstract_mysql_adapter/warnings_test.rb --
  describe("WarningsTest", () => {
    it.skip("db_warnings_action :raise on warning", () => {});
    it.skip("db_warnings_action :ignore on warning", () => {});
    it.skip("db_warnings_action :log on warning", () => {});
    it.skip("db_warnings_action :report on warning", () => {});
    it.skip("db_warnings_action custom proc on warning", () => {});
    it.skip("db_warnings_action allows a list of warnings to ignore", () => {});
    it.skip("db_warnings_action allows a list of codes to ignore", () => {});
    it.skip("db_warnings_action ignores note level warnings", () => {});
    it.skip("db_warnings_action handles when warning_count does not match returned warnings", () => {});
  });

  // -- Rails: abstract_mysql_adapter/table_options_test.rb --
  describe("TableOptionsTest", () => {
    it.skip("table options with ENGINE", () => {});
    it.skip("table options with ROW_FORMAT", () => {});
    it.skip("table options with CHARSET", () => {});
    it.skip("table options with COLLATE", () => {});
    it.skip("charset and collation options", () => {});
    it.skip("charset and partitioned table options", () => {});
    it.skip("schema dump works with NO_TABLE_OPTIONS sql mode", () => {});
    it.skip("new migrations do not contain default ENGINE=InnoDB option", () => {});
    it.skip("legacy migrations contain default ENGINE=InnoDB option", () => {});
  });

  // -- Rails: abstract_mysql_adapter/schema_test.rb --
  describe("SchemaTest", () => {
    it.skip("float limits", () => {});
    it.skip("schema", () => {});
    it.skip("primary key", () => {});
    it.skip("data source exists", () => {});
    it.skip("data source exists?", () => {});
    it.skip("data source exists wrong schema", () => {});
    it.skip("dump indexes", () => {});
    it.skip("drop temporary table", () => {});
    it.skip("primary key method with ansi quotes", () => {});
    it.skip("foreign keys method with ansi quotes", () => {});
  });

  // -- Rails: abstract_mysql_adapter/quoting_test.rb --
  describe("QuotingTest", () => {
    it.skip("cast bound integer", () => {});
    it.skip("cast bound big decimal", () => {});
    it.skip("cast bound rational", () => {});
    it.skip("cast bound true", () => {});
    it.skip("cast bound false", () => {});
    it.skip("quote string", () => {});
    it.skip("quote column name", () => {});
    it.skip("quote table name", () => {});
  });

  // -- Rails: abstract_mysql_adapter/charset_collation_test.rb --
  describe("CharsetCollationTest", () => {
    it.skip("string column with charset and collation", () => {});
    it.skip("text column with charset and collation", () => {});
    it.skip("add column with charset and collation", () => {});
    it.skip("change column with charset and collation", () => {});
    it.skip("change column doesn't preserve collation for string to binary types", () => {});
    it.skip("change column doesn't preserve collation for string to non-string types", () => {});
    it.skip("change column preserves collation for string to text", () => {});
    it.skip("schema dump includes collation", () => {});
  });

  // -- Rails: abstract_mysql_adapter/case_sensitivity_test.rb --
  describe("CaseSensitivityTest", () => {
    it.skip("columns include collation different from table", () => {});
    it.skip("case sensitive", () => {});
    it.skip("case insensitive comparison for ci column", () => {});
    it.skip("case insensitive comparison for cs column", () => {});
    it.skip("case sensitive comparison for ci column", () => {});
    it.skip("case sensitive comparison for cs column", () => {});
    it.skip("case sensitive comparison for binary column", () => {});
  });

  // -- Rails: abstract_mysql_adapter/mysql_boolean_test.rb --
  describe("MysqlBooleanTest", () => {
    it.skip("column type with emulated booleans", () => {});
    it.skip("column type without emulated booleans", () => {});
    it.skip("type casting with emulated booleans", () => {});
    it.skip("type casting without emulated booleans", () => {});
    it.skip("with booleans stored as 1 and 0", () => {});
    it.skip("with booleans stored as t", () => {});
  });

  // -- Rails: abstract_mysql_adapter/unsigned_type_test.rb --
  describe("UnsignedTypeTest", () => {
    it.skip("unsigned int max value is in range", () => {});
    it.skip("minus value is out of range", () => {});
    it.skip("schema definition can use unsigned as the type", () => {});
    it.skip("deprecate unsigned_float and unsigned_decimal", () => {});
    it.skip("schema dump includes unsigned option", () => {});
  });

  // -- Rails: abstract_mysql_adapter/transaction_test.rb --
  describe("TransactionTest", () => {
    it.skip("raises Deadlocked when a deadlock is encountered", () => {});
    it.skip("raises LockWaitTimeout when lock wait timeout exceeded", () => {});
    it.skip("raises StatementTimeout when statement timeout exceeded", () => {});
    it.skip("raises QueryCanceled when canceling statement due to user request", () => {});
    it.skip("reconnect preserves isolation level", () => {});
  });

  // -- Rails: abstract_mysql_adapter/optimizer_hints_test.rb --
  describe("OptimizerHintsTest", () => {
    it.skip("optimizer hints", () => {});
    it.skip("optimizer hints with count subquery", () => {});
    it.skip("optimizer hints is sanitized", () => {});
    it.skip("optimizer hints with unscope", () => {});
    it.skip("optimizer hints with or", () => {});
  });

  // -- Rails: abstract_mysql_adapter/mysql_explain_test.rb --
  describe("MysqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it.skip("explain with eager loading", () => {});
    it.skip("explain with options as symbol", () => {});
    it.skip("explain with options as strings", () => {});
    it.skip("explain options with eager loading", () => {});
  });

  // -- Rails: abstract_mysql_adapter/virtual_column_test.rb --
  describe("VirtualColumnTest", () => {
    it.skip("virtual column", () => {});
    it.skip("stored column", () => {});
    it.skip("change table", () => {});
    it.skip("schema dumping", () => {});
  });

  // -- Rails: abstract_mysql_adapter/mysql_enum_test.rb --
  describe("MysqlEnumTest", () => {
    it.skip("should not be unsigned", () => {});
    it.skip("should not be bigint", () => {});
    it.skip("schema dumping", () => {});
    it.skip("enum with attribute", () => {});
  });

  // -- Rails: abstract_mysql_adapter/auto_increment_test.rb --
  describe("AutoIncrementTest", () => {
    it.skip("auto increment without primary key", () => {});
    it.skip("auto increment with composite primary key", () => {});
    it.skip("auto increment false with custom primary key", () => {});
    it.skip("auto increment false with create table", () => {});
  });

  // -- Rails: abstract_mysql_adapter/sp_test.rb --
  describe("StoredProcedureTest", () => {
    it.skip("multi results", () => {});
    it.skip("multi results from select one", () => {});
    it.skip("multi results from find by sql", () => {});
  });

  // -- Rails: abstract_mysql_adapter/set_test.rb --
  describe("SetTest", () => {
    it.skip("should not be unsigned", () => {});
    it.skip("should not be bigint", () => {});
    it.skip("schema dumping", () => {});
  });

  // -- Rails: abstract_mysql_adapter/schema_migrations_test.rb --
  describe("SchemaMigrationsTest", () => {
    it.skip("renaming index on foreign key", () => {});
    it.skip("initializes schema migrations for encoding utf8mb4", () => {});
    it.skip("initializes internal metadata for encoding utf8mb4", () => {});
  });

  // -- Rails: abstract_mysql_adapter/nested_deadlock_test.rb --
  describe("NestedDeadlockTest", () => {
    it.skip("deadlock correctly raises Deadlocked inside nested SavepointTransaction", () => {});
    it.skip("rollback exception is swallowed after a rollback", () => {});
    it.skip("deadlock inside nested SavepointTransaction is recoverable", () => {});
  });

  // -- Rails: abstract_mysql_adapter/sql_types_test.rb --
  describe("SqlTypesTest", () => {
    it.skip("binary types", () => {});
  });

  // -- Rails: abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb --
  describe("CountDeletedRowsWithLockTest", () => {
    it.skip("delete and create in different threads synchronize correctly", () => {});
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
});
