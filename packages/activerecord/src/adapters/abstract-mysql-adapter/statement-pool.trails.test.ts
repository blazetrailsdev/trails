/**
 * Trails-only. Rails ships a statement_pool_test.rb for postgresql/ and
 * sqlite3/ but none for mysql, so every test name below is trails prose, not a
 * Rails name. Subject under test is `Mysql2StatementPool`, our subclass of the
 * port of `AbstractMysqlAdapter::StatementPool`
 * (activerecord/lib/active_record/connection_adapters/abstract_mysql_adapter.rb).
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  let originalPreparedStatements: boolean;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    originalPreparedStatements = adapter.preparedStatements;
    adapter.disconnectBang();
    adapter.preparedStatements = true;
  });
  afterEach(() => {
    adapter.preparedStatements = originalPreparedStatements;
    adapter.disconnectBang();
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
        await pool.setMaxSize(1);
        await adapter.execute("SELECT ? AS s", ["a"]);
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
      }
    });

    it("statementLimit = 0 is unsupported and raises on the first prepare", async () => {
      const adapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, statementLimit: 0 });
      adapter.preparedStatements = true;
      await adapter.beginDbTransaction();
      try {
        // Rails does not branch on the limit at the call site, and its pool has
        // no zero-limit case either: `while 0 <= cache.size` runs on the empty
        // cache and `nil.last` raises (statement_pool.rb:31-33). So a
        // `statement_limit` of 0 is unsupported rather than a caching switch.
        await expect(adapter.execute("SELECT ? AS n", [1])).rejects.toThrow();
      } finally {
        await adapter.rollback();
        await adapter.close();
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
      const closable = new Mysql2Adapter(MYSQL_TEST_URL);
      closable.preparedStatements = true;
      await closable.beginDbTransaction();
      await closable.execute("SELECT ? AS n", [1]);
      const pool = closable._statementPoolForTest()!;
      await closable.rollback();
      await closable.close();
      expect(() => pool.clear()).not.toThrow();
    });

    it("reads statementLimit from the config hash (database.yml shape)", async () => {
      const configured = new Mysql2Adapter({ uri: MYSQL_TEST_URL, statementLimit: 7 });
      expect(configured.buildStatementPool().maxSize).toBe(7);
      await configured.close();
    });

    it("reads preparedStatements from the config hash", async () => {
      const configured = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        preparedStatements: false,
      });
      expect(configured.preparedStatements).toBe(false);
      await configured.close();
    });

    it("passes a non-boolean preparedStatements config through as Rails does", async () => {
      // abstract_adapter.rb:159 pipes the config through
      // `type_cast_config_to_boolean`, which maps the string `"false"` to
      // `false` and returns everything else UNCHANGED (abstract_adapter.rb:65-71).
      const cast = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        preparedStatements: "false" as unknown as boolean,
      });
      try {
        expect(cast.preparedStatements).toBe(false);
      } finally {
        await cast.close();
      }
      // `0` survives the cast and is truthy in Ruby, so
      // `prepared_statements?` (abstract_adapter.rb:234-235) answers true.
      const zero = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        preparedStatements: 0 as unknown as boolean,
      });
      try {
        expect(zero.preparedStatements).toBe(true);
      } finally {
        await zero.close();
      }

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        (adapter2 as unknown as { preparedStatements: unknown }).preparedStatements = "true";
        expect(adapter2.preparedStatements).toBe(true);
      } finally {
        await adapter2.close();
      }
    });

    it("clearCacheBang drops cached plans on the active connection", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT ? AS n", [1]);
        await adapter.execute("SELECT ? AS s", ["a"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(2);
        adapter.clearCacheBang();
        expect(pool.length).toBe(0);
        expect(adapter._statementPoolForTest()).toBe(pool);
      } finally {
        await adapter.rollback();
      }
    });
  });
});
