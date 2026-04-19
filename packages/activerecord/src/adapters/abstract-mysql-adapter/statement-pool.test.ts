/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/statement_pool_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    adapter.preparedStatements = true;
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("StatementPoolTest", () => {
    it("statement pool tracks distinct prepared queries", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT ? AS n", [1]);
        await adapter.execute("SELECT ? AS n", [2]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool).toBeDefined();
        expect(pool.length).toBe(1);

        await adapter.execute("SELECT ? AS s", ["a"]);
        expect(pool.length).toBe(2);
      } finally {
        await adapter.rollback();
      }
    });

    it("statement pool max evicts LRU via unprepare", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT ? AS n", [1]);
        const pool = adapter._statementPoolForTest()!;
        // Rails' matching test sets statement_limit = 1 and asserts
        // LRU eviction. With one cached statement, setMaxSize(1) just
        // records the new limit; eviction happens on the next insert
        // via our Mysql2StatementPool#dealloc (conn.unprepare).
        pool.setMaxSize(1);
        await adapter.execute("SELECT ? AS s", ["a"]);
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
      }
    });

    it("statementLimit config resizes the active pool", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT ? AS n", [1]);
        await adapter.execute("SELECT ? AS s", ["a"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(2);
        adapter.statementLimit = 1;
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
      }
    });

    it("statementLimit = 0 disables named prepared statements", async () => {
      adapter.statementLimit = 0;
      await adapter.beginDbTransaction();
      try {
        // Query still runs — just via `conn.query` (text protocol)
        // instead of `conn.execute` (binary prepared). No pool is
        // created because `_shouldPrepare` short-circuits, so we'd
        // otherwise leak unbounded server-side PREPAREs. Rails'
        // StatementPool#set is likewise a no-op at limit=0.
        const rows = await adapter.execute("SELECT ? AS n", [1]);
        expect(rows[0]).toBeDefined();
        expect(adapter._statementPoolForTest()).toBeUndefined();
      } finally {
        await adapter.rollback();
      }
    });

    it("executeMutation caches the plan for INSERT (reuses on repeat)", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS \`sp_mut\``);
      await adapter.exec(
        `CREATE TABLE \`sp_mut\` (\`id\` INT AUTO_INCREMENT PRIMARY KEY, \`name\` VARCHAR(32))`,
      );
      await adapter.beginDbTransaction();
      try {
        await adapter.executeMutation(`INSERT INTO \`sp_mut\` (\`name\`) VALUES (?)`, ["a"]);
        await adapter.executeMutation(`INSERT INTO \`sp_mut\` (\`name\`) VALUES (?)`, ["b"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
        await adapter.exec(`DROP TABLE IF EXISTS \`sp_mut\``);
      }
    });

    it("dealloc does not raise on inactive connection", async () => {
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT ? AS n", [1]);
      const pool = adapter._statementPoolForTest()!;
      await adapter.rollback();
      await adapter.close();
      expect(() => pool.clear()).not.toThrow();
    });
  });
});
