import { describe, it, expect } from "vitest";
import { Rollback } from "../../errors.js";
import {
  toSql,
  toSqlAndBinds,
  cacheableQuery,
  isWriteQuery,
  explain,
  transaction,
  transactionIsolationLevels,
  beginDbTransaction,
  beginIsolatedDbTransaction,
  commitDbTransaction,
  execRollbackDbTransaction,
  execRestartDbTransaction,
  resetIsolationLevel,
  rollbackToSavepoint,
  defaultSequenceName,
  emptyInsertStatementValue,
  sanitizeLimit,
  withYamlFallback,
  highPrecisionCurrentTimestamp,
  markTransactionWrittenIfWrite,
  isTransactionOpen,
  type DatabaseStatementsHost,
} from "./database-statements.js";

describe("DatabaseStatements", () => {
  describe("toSql", () => {
    it("returns string SQL unchanged", () => {
      expect(toSql("SELECT 1")).toBe("SELECT 1");
    });

    it("calls toSql on arel objects", () => {
      const arel = { toSql: () => "SELECT * FROM users" };
      expect(toSql(arel)).toBe("SELECT * FROM users");
    });

    it("unwraps ast property", () => {
      const arel = { ast: { toSql: () => "SELECT 1" } };
      expect(toSql(arel)).toBe("SELECT 1");
    });
  });

  describe("toSqlAndBinds", () => {
    it("returns string SQL with binds and defaults", () => {
      const [sql, binds, preparable, allowRetry] = toSqlAndBinds("SELECT 1");
      expect(sql).toBe("SELECT 1");
      expect(binds).toEqual([]);
      expect(preparable).toBeNull();
      expect(allowRetry).toBe(false);
    });

    it("passes through provided binds", () => {
      const [, binds] = toSqlAndBinds("SELECT ?", [42]);
      expect(binds).toEqual([42]);
    });
  });

  describe("cacheableQuery", () => {
    it("returns query object and binds", () => {
      const klass = { query: (sql: string) => ({ sql }) };
      const [queryObj, binds] = cacheableQuery.call(undefined, klass, "SELECT 1");
      expect((queryObj as any).sql).toBe("SELECT 1");
      expect(binds).toEqual([]);
    });
  });

  describe("transaction", () => {
    it("wraps block in begin/commit on success", async () => {
      const calls: string[] = [];
      const host: DatabaseStatementsHost = {
        beginDbTransaction: async () => {
          calls.push("begin");
        },
        commitDbTransaction: async () => {
          calls.push("commit");
        },
        rollbackDbTransaction: async () => {
          calls.push("rollback");
        },
      };

      const result = await transaction.call(host, async () => {
        calls.push("body");
        return 42;
      });
      expect(result).toBe(42);
      expect(calls).toEqual(["begin", "body", "commit"]);
    });

    it("catches Rollback errors and returns undefined", async () => {
      const host: DatabaseStatementsHost = {
        beginDbTransaction: async () => {},
        commitDbTransaction: async () => {},
        rollbackDbTransaction: async () => {},
      };
      const result = await transaction.call(host, async () => {
        throw new Rollback();
      });
      expect(result).toBeUndefined();
    });
  });

  describe("isWriteQuery", () => {
    it("raises not implemented", () => {
      expect(() => isWriteQuery("INSERT INTO x")).toThrow();
    });
  });

  describe("explain", () => {
    it("raises not implemented", () => {
      expect(() => explain("SELECT 1")).toThrow();
    });
  });

  describe("transaction isolation", () => {
    it("transaction isolation levels", () => {
      const levels = transactionIsolationLevels();
      expect(levels.read_uncommitted).toBe("READ UNCOMMITTED");
      expect(levels.read_committed).toBe("READ COMMITTED");
      expect(levels.repeatable_read).toBe("REPEATABLE READ");
      expect(levels.serializable).toBe("SERIALIZABLE");
    });

    it("begin isolated db transaction raises by default", async () => {
      await expect(beginIsolatedDbTransaction.call(undefined, "serializable")).rejects.toThrow(
        "adapter does not support setting transaction isolation",
      );
    });
  });

  describe("transaction lifecycle no-ops", () => {
    it("begin db transaction is a no-op", async () => {
      await expect(beginDbTransaction()).resolves.toBeUndefined();
    });

    it("commit db transaction is a no-op", async () => {
      await expect(commitDbTransaction()).resolves.toBeUndefined();
    });

    it("exec rollback db transaction is a no-op", async () => {
      await expect(execRollbackDbTransaction()).resolves.toBeUndefined();
    });

    it("exec restart db transaction is a no-op", async () => {
      await expect(execRestartDbTransaction()).resolves.toBeUndefined();
    });

    it("reset isolation level is a no-op", () => {
      expect(resetIsolationLevel()).toBeUndefined();
    });
  });

  describe("rollback to savepoint", () => {
    it("delegates to execRollbackToSavepoint on host", async () => {
      let savedName: string | undefined;
      const host = {
        execRollbackToSavepoint: async (name?: string) => {
          savedName = name;
        },
      } as unknown as DatabaseStatementsHost;
      await rollbackToSavepoint.call(host, "sp1");
      expect(savedName).toBe("sp1");
    });
  });

  describe("mark transaction written if write", () => {
    it("sets written on open transaction for write queries", () => {
      const txn = { open: true, written: false };
      const host: DatabaseStatementsHost = {
        currentTransaction: () => txn,
        isWriteQuery: () => true,
      };
      markTransactionWrittenIfWrite.call(host, "INSERT INTO x");
      expect(txn.written).toBe(true);
    });

    it("does not set written for read queries", () => {
      const txn = { open: true, written: false };
      const host: DatabaseStatementsHost = {
        currentTransaction: () => txn,
        isWriteQuery: () => false,
      };
      markTransactionWrittenIfWrite.call(host, "SELECT 1");
      expect(txn.written).toBe(false);
    });
  });

  describe("is transaction open", () => {
    it("returns true when transaction is open", () => {
      const host: DatabaseStatementsHost = {
        currentTransaction: () => ({ open: true }),
      };
      expect(isTransactionOpen.call(host)).toBe(true);
    });

    it("returns false when no transaction", () => {
      const host: DatabaseStatementsHost = {
        currentTransaction: () => ({ open: false }),
      };
      expect(isTransactionOpen.call(host)).toBe(false);
    });
  });

  describe("internalExecQuery", () => {
    it("throws when binds provided without internalExecute", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        execute: async () => [],
      } as unknown as DatabaseStatementsHost;
      await expect(internalExecQuery.call(host, "SELECT ?", "SQL", [1])).rejects.toThrow(
        "internalExecQuery requires internalExecute",
      );
    });

    it("delegates to internalExecute when available", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        internalExecute: async () => ({ rows: [[1]] }),
      } as unknown as DatabaseStatementsHost;
      const result = await internalExecQuery.call(host, "SELECT 1", "SQL");
      expect((result as any).rows).toEqual([[1]]);
    });

    it("normalizes execute fallback result", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        execute: async () => [{ id: 1 }],
      } as unknown as DatabaseStatementsHost;
      const result = await internalExecQuery.call(host, "SELECT 1", "SQL");
      expect((result as any).rows).toEqual([[1]]);
    });
  });

  describe("insertFixturesSet", () => {
    it("executes deletes and inserts wrapped in transaction", async () => {
      const executed: string[] = [];
      let transactionUsed = false;
      const { insertFixturesSet } = await import("./database-statements.js");
      const host = {
        execute: async (sql: string) => {
          executed.push(sql);
        },
        transaction: async (fn: (tx?: unknown) => Promise<void> | void) => {
          transactionUsed = true;
          await fn();
          return undefined;
        },
      } as unknown as DatabaseStatementsHost;

      await insertFixturesSet.call(
        host,
        {
          users: [{ name: "Alice" }],
        },
        ["old_table"],
      );

      expect(transactionUsed).toBe(true);
      expect(executed[0]).toMatch(/DELETE FROM/);
      expect(executed[1]).toMatch(/INSERT INTO/);
    });
  });

  describe("utility methods", () => {
    it("default sequence name returns null", () => {
      expect(defaultSequenceName("users", "id")).toBeNull();
    });

    it("empty insert statement value", () => {
      expect(emptyInsertStatementValue()).toBe("DEFAULT VALUES");
    });

    it("sanitize limit with integer", () => {
      expect(sanitizeLimit(10)).toBe(10);
    });

    it("sanitize limit with string integer", () => {
      expect(sanitizeLimit("10")).toBe(10);
    });

    it("sanitize limit with invalid value", () => {
      expect(() => sanitizeLimit("abc")).toThrow(TypeError);
    });

    it("with yaml fallback passes scalar through", () => {
      expect(withYamlFallback("hello")).toBe("hello");
      expect(withYamlFallback(42)).toBe(42);
      expect(withYamlFallback(null)).toBeNull();
    });

    it("with yaml fallback converts objects to JSON", () => {
      expect(withYamlFallback({ a: 1 })).toBe('{"a":1}');
      expect(withYamlFallback([1, 2])).toBe("[1,2]");
    });

    it("high precision current timestamp returns Arel SQL literal", () => {
      const result = highPrecisionCurrentTimestamp();
      expect(result.toSql()).toBe("CURRENT_TIMESTAMP");
    });
  });
});
