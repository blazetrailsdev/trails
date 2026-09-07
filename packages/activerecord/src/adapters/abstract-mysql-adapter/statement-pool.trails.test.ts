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
        await adapter.internalExecQuery("SELECT ? AS n", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT ? AS n", "SQL", [2], { prepare: true });
        const pool = adapter._statements!;
        expect(pool).toBeDefined();
        expect(pool.length).toBe(1);

        await adapter.internalExecQuery("SELECT ? AS s", "SQL", ["a"], { prepare: true });
        expect(pool.length).toBe(2);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });

    it("statement pool max evicts LRU via unprepare", async () => {
      const adapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, statementLimit: 1 });
      adapter.preparedStatements = true;
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery("SELECT ? AS n", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT ? AS s", "SQL", ["a"], { prepare: true });
        expect(adapter._statements!.length).toBe(1);
      } finally {
        await adapter.rollbackDbTransaction();
        await adapter.close();
      }
    });

    it("statementLimit = 0 is unsupported and raises on the first prepare", async () => {
      const adapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, statementLimit: 0 });
      adapter.preparedStatements = true;
      await adapter.beginDbTransaction();
      try {
        await expect(
          adapter.internalExecQuery("SELECT ? AS n", "SQL", [1], { prepare: true }),
        ).rejects.toThrow();
      } finally {
        await adapter.rollbackDbTransaction();
        await adapter.close();
      }
    });

    it("executeMutation caches the plan for INSERT (reuses on repeat)", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS \`sp_mut\``);
      await adapter.execute(
        `CREATE TABLE \`sp_mut\` (\`id\` INT AUTO_INCREMENT PRIMARY KEY, \`name\` VARCHAR(32))`,
      );
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery(
          `INSERT INTO \`sp_mut\` (\`name\`) VALUES (?)`,
          "SQL",
          ["a"],
          {
            prepare: true,
          },
        );
        await adapter.internalExecQuery(
          `INSERT INTO \`sp_mut\` (\`name\`) VALUES (?)`,
          "SQL",
          ["b"],
          {
            prepare: true,
          },
        );
        const pool = adapter._statements!;
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollbackDbTransaction();
        await adapter.execute(`DROP TABLE IF EXISTS \`sp_mut\``);
      }
    });

    it("dealloc does not raise on inactive connection", async () => {
      const closable = new Mysql2Adapter(MYSQL_TEST_URL);
      closable.preparedStatements = true;
      await closable.beginDbTransaction();
      await closable.internalExecQuery("SELECT ? AS n", "SQL", [1], { prepare: true });
      const pool = closable._statements!;
      await closable.rollbackDbTransaction();
      await closable.close();
      expect(() => pool.clear()).not.toThrow();
    });

    it("reads statementLimit from the config hash (database.yml shape)", async () => {
      const configured = new Mysql2Adapter({ uri: MYSQL_TEST_URL, statementLimit: 7 });
      const pool = configured.buildStatementPool();
      expect((pool as unknown as { _statementLimit: number })._statementLimit).toBe(7);
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
      const cast = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        preparedStatements: "false" as unknown as boolean,
      });
      try {
        expect(cast.preparedStatements).toBe(false);
      } finally {
        await cast.close();
      }
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
        await adapter.internalExecQuery("SELECT ? AS n", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT ? AS s", "SQL", ["a"], { prepare: true });
        const pool = adapter._statements!;
        expect(pool.length).toBe(2);
        await adapter.clearCacheBang();
        expect(pool.length).toBe(0);
        expect(adapter._statements).toBe(pool);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });
  });
});
