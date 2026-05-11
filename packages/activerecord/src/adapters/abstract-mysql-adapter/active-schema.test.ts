/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { captureSql } from "../../testing/sql-capture.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("ActiveSchemaTest", () => {
    it.skip("add index", () => {
      // BLOCKED: adapter-mysql — addIndex stub in abstract-mysql-adapter.ts does nothing (no-op body)
      // ROOT-CAUSE: AbstractMysqlAdapter#addIndex at connection-adapters/abstract-mysql-adapter.ts:550 is a void stub;
      //   needs to build+emit the CREATE INDEX SQL via MysqlSchemaCreation
      // SCOPE: ~30–60 LOC in abstract-mysql-adapter.ts addIndex; unblocks ~10 addIndex sub-tests
    });
    it.skip("index in create", () => {
      // BLOCKED: adapter-mysql — createTable callback form needed + index-in-create emission
      // ROOT-CAUSE: MySQL createTable does not wire up inline INDEX clauses from TableDefinition.index()
      // SCOPE: Slot B (mysql DDL parity)
    });
    it.skip("index in bulk change", () => {
      // BLOCKED: adapter-mysql — changeTable bulk-mode not implemented for MySQL
      // ROOT-CAUSE: AbstractMysqlAdapter bulk change_table path missing
      // SCOPE: Slot B (mysql DDL parity)
    });
    it("drop table", async () => {
      const sqls = await captureSql(() => adapter.dropTable("people"));
      expect(sqls[0]).toBe("DROP TABLE `people`");
    });
    it.skip("drop tables", () => {
      // BLOCKED: adapter-mysql — multi-table DROP TABLE emits N separate statements instead of one
      // ROOT-CAUSE: abstract/schema-statements.ts#dropTable loops over tableNames calling executeMutation
      //   once per table; Rails MySQL emits "DROP TABLE `a`, `b`" in a single statement
      // SCOPE: ~10 LOC override on AbstractMysqlAdapter to join names into one DROP TABLE call
    });
    it.skip("create mysql database with encoding", () => {
      // BLOCKED: adapter-mysql — createDatabase not implemented
      // ROOT-CAUSE: AbstractMysqlAdapter#createDatabase method missing
      // SCOPE: Slot B (mysql DDL parity)
    });
    it.skip("recreate mysql database with encoding", () => {
      // BLOCKED: adapter-mysql — recreateDatabase not implemented
      // ROOT-CAUSE: AbstractMysqlAdapter#recreateDatabase method missing
      // SCOPE: Slot B (mysql DDL parity)
    });
    it.skip("add column", () => {
      // BLOCKED: adapter-mysql — SQL type case mismatch
      // ROOT-CAUSE: abstract/schema-creation.ts#typeToSql emits uppercase "VARCHAR(255)" but Rails MySQL
      //   uses lowercase "varchar(255)" from nativeDatabaseTypes
      // SCOPE: ~10 LOC in MysqlSchemaCreation to override typeToSql using nativeDatabaseTypes; Slot B
    });
    it.skip("add column with limit", () => {
      // BLOCKED: adapter-mysql — SQL type case mismatch (same as "add column")
      // ROOT-CAUSE: typeToSql emits "VARCHAR(32)" not "varchar(32)"
      // SCOPE: same fix as "add column"; Slot B
    });
    it("drop table with specific database", async () => {
      const sqls = await captureSql(() => adapter.dropTable("otherdb.people"));
      expect(sqls[0]).toBe("DROP TABLE `otherdb`.`people`");
    });
    it.skip("drop tables with specific database", () => {
      // BLOCKED: adapter-mysql — multi-table DROP TABLE emits N separate statements (same as "drop tables")
      // ROOT-CAUSE: same as "drop tables" — needs single-statement override on AbstractMysqlAdapter
      // SCOPE: same fix as "drop tables"; Slot B
    });
    it.skip("add timestamps", () => {
      // BLOCKED: adapter-mysql — SQL type case mismatch for datetime column
      // ROOT-CAUSE: addTimestamps calls addColumn with "datetime" type → typeToSql emits "DATETIME(6)"
      //   but Rails MySQL emits "datetime"; also requires a real table (with_real_execute scope)
      // SCOPE: Slot B (mysql DDL parity + typeToSql fix)
    });
    it.skip("remove timestamps", () => {
      // BLOCKED: adapter-mysql — requires a real table (with_real_execute scope) and datetime type fix
      // ROOT-CAUSE: needs live table for add/remove; also datetime type case gap
      // SCOPE: Slot B
    });
    it.skip("indexes in create", () => {
      // BLOCKED: adapter-mysql — createTable TEMPORARY + AS SELECT not implemented
      // ROOT-CAUSE: createTable options.temporary and options.as not wired in MysqlSchemaCreation
      // SCOPE: Slot B (mysql DDL parity)
    });
  });
});
