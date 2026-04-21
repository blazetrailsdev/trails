/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";
import {
  InvalidForeignKey,
  NotNullViolation,
  RecordNotUnique,
  ValueTooLong,
} from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  // Rails: activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_adapter_test.rb
  // translate_exception tests. Matches the PG adapter's equivalent suite.
  describe("translate_exception", () => {
    beforeEach(async () => {
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_child`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_parent`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_uniq`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_notnull`);
      await adapter.executeMutation(`DROP TABLE IF EXISTS ex_long`);
    });

    it("translates ER_DUP_ENTRY to RecordNotUnique", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_uniq (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) UNIQUE)`,
      );
      await adapter.executeMutation(`INSERT INTO ex_uniq (name) VALUES ('Alice')`);
      await expect(
        adapter.executeMutation(`INSERT INTO ex_uniq (name) VALUES ('Alice')`),
      ).rejects.toBeInstanceOf(RecordNotUnique);
    });

    it("translates ER_NO_REFERENCED_ROW_2 to InvalidForeignKey", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_parent (id INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB`,
      );
      await adapter.executeMutation(
        `CREATE TABLE ex_child (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES ex_parent(id)) ENGINE=InnoDB`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO ex_child (parent_id) VALUES (999)`),
      ).rejects.toBeInstanceOf(InvalidForeignKey);
    });

    it("translates ER_NOT_NULL_VIOLATION to NotNullViolation", async () => {
      await adapter.executeMutation(
        `CREATE TABLE ex_notnull (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) NOT NULL)`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO ex_notnull (name) VALUES (NULL)`),
      ).rejects.toBeInstanceOf(NotNullViolation);
    });

    it("translates ER_DATA_TOO_LONG to ValueTooLong", async () => {
      // sql_mode is session-scoped, and our mysql2-adapter's pool checks
      // out / releases a connection per call — so a plain SET SESSION
      // wouldn't carry over to the CREATE + INSERT below. Pin a single
      // pool connection via beginTransaction so all three statements
      // run on the same session. (DDL in MySQL auto-commits, so the
      // table persists even though we roll back the transaction.)
      await adapter.beginTransaction();
      try {
        await adapter.executeMutation(
          `SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES')`,
        );
        await adapter.executeMutation(
          `CREATE TABLE ex_long (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(5))`,
        );
        await expect(
          adapter.executeMutation(`INSERT INTO ex_long (name) VALUES ('toolongvalue')`),
        ).rejects.toBeInstanceOf(ValueTooLong);
      } finally {
        await adapter.rollback();
      }
    });
  });

  describe("Mysql2AdapterTest", () => {
    it.skip("mysql2 default prepared statements", () => {});
    it.skip("exec query with prepared statements", () => {});
    it.skip("exec query nothing raises with no result queries", () => {});
    it.skip("database exists returns false if database does not exist", () => {});
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
});
