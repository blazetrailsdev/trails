import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    adapter.preparedStatements = true;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close();
  });

  describe("StatementPoolTest", () => {
    it("statement pool", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT $1::int", "SQL", [2], { prepare: true });
        const pool = adapter._statements;
        expect(pool).toBeDefined();
        expect(pool.length).toBe(1);

        await adapter.internalExecQuery("SELECT $1::text", "SQL", ["a"], { prepare: true });
        expect(pool.length).toBe(2);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });

    it("statement pool max", async () => {
      const limited = new PostgreSQLAdapter({ connectionString: PG_TEST_URL, statementLimit: 1 });
      await limited.beginDbTransaction();
      try {
        await limited.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
        await limited.internalExecQuery("SELECT $1::text", "SQL", ["a"], { prepare: true });
        expect(limited._statements.length).toBe(1);
      } finally {
        await limited.rollbackDbTransaction();
        await limited.close();
      }
    });

    it("executeMutation caches the plan for INSERT (reuses on repeat)", async () => {
      await adapter.exec(
        `CREATE TABLE IF NOT EXISTS "sp_exec_mut" ("id" SERIAL PRIMARY KEY, "name" TEXT)`,
      );
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery(
          `INSERT INTO "sp_exec_mut" ("name") VALUES ($1)`,
          "SQL",
          ["a"],
          {
            prepare: true,
          },
        );
        await adapter.internalExecQuery(
          `INSERT INTO "sp_exec_mut" ("name") VALUES ($1)`,
          "SQL",
          ["b"],
          {
            prepare: true,
          },
        );
        const pool = adapter._statements;
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollbackDbTransaction();
        await adapter.exec(`DROP TABLE IF EXISTS "sp_exec_mut"`);
      }
    });

    it("statement pool clear", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT $1::text", "SQL", ["a"], { prepare: true });
        const pool = adapter._statements;
        expect(pool.length).toBe(2);
        await pool.clear();
        expect(pool.length).toBe(0);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });

    it("PreparedStatementCacheExpired is exported for txn-retry callers", async () => {
      const { PreparedStatementCacheExpired } = await import("../../errors.js");
      expect(new PreparedStatementCacheExpired("test").name).toBe("PreparedStatementCacheExpired");
    });

    it("reads statementLimit from the config hash (database.yml shape)", async () => {
      const configured = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        statementLimit: 7,
      });
      await configured.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
      const pool = configured._statements;
      expect((pool as unknown as { _statementLimit: number })._statementLimit).toBe(7);
      await configured.close();
    });

    it("reads preparedStatements from the config hash", async () => {
      const configured = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: false,
      });
      expect(configured.preparedStatements).toBe(false);
      await configured.close();
    });

    it("passes a non-boolean preparedStatements config through as Rails does", async () => {
      const cast = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: "false" as unknown as boolean,
      });
      try {
        expect(cast.preparedStatements).toBe(false);
      } finally {
        await cast.close();
      }
      const zero = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: 0 as unknown as boolean,
      });
      try {
        expect(zero.preparedStatements).toBe(true);
      } finally {
        await zero.close();
      }

      const adapter2 = new PostgreSQLAdapter(PG_TEST_URL);
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
        await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
        await adapter.internalExecQuery("SELECT $1::text", "SQL", ["a"], { prepare: true });
        const pool = adapter._statements;
        expect(pool.length).toBe(2);
        await adapter.clearCacheBang();
        expect(pool.length).toBe(0);
        expect(adapter._statements).toBe(pool);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });

    it("clearCacheBang clears the just-released txn pool when called post-rollback", async () => {
      await adapter.beginDbTransaction();
      await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
      await adapter.internalExecQuery("SELECT $1::text", "SQL", ["a"], { prepare: true });
      const pool = adapter._statements;
      expect(pool.length).toBe(2);
      await adapter.rollbackDbTransaction();
      expect(adapter._statements).toBe(pool);
      await adapter.clearCacheBang();
      expect(pool.length).toBe(0);
    });

    it("clearCacheBang resets the released-client pool even when a new txn is in progress", async () => {
      await adapter.beginDbTransaction();
      await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
      const failedPool = adapter._statements;
      expect(failedPool.length).toBe(1);
      await adapter.rollbackDbTransaction();
      await adapter.beginDbTransaction();
      try {
        await adapter.internalExecQuery("SELECT $1::int", "SQL", [2], { prepare: true });
        const newTxnPool = adapter._statements;
        expect(newTxnPool).toBe(failedPool);
        expect(newTxnPool.length).toBeGreaterThan(0);
        await adapter.clearCacheBang();
        expect(newTxnPool.length).toBe(0);
      } finally {
        await adapter.rollbackDbTransaction();
      }
    });
  });
});
