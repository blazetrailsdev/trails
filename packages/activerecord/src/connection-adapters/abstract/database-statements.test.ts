import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Rollback } from "../../errors.js";
import {
  buildFixtureSql,
  buildFixtureStatements,
  buildTruncateStatement,
  buildTruncateStatements,
  combineMultiStatements,
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
  typeCastedBinds,
  highPrecisionCurrentTimestamp,
  markTransactionWrittenIfWrite,
  isTransactionOpen,
  performQuery,
  preprocessQuery,
  select,
  sqlForInsert,
  arelFromRelation,
  extractTableRefFromInsertSql,
  defaultInsertValue,
  returningColumnValues,
  type DatabaseStatementsHost,
} from "./database-statements.js";
import { Result } from "../../result.js";
import type { Quoting } from "./quoting-interface.js";

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
      const host: DatabaseStatementsHost &
        Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName"> = {
        execute: async (sql: string) => {
          executed.push(sql);
        },
        transaction: async <T>(fn: (tx?: unknown) => Promise<T> | T) => {
          transactionUsed = true;
          await fn();
          return undefined;
        },
        quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
        quoteTableName: (n: string) => `"${n}"`,
        quoteColumnName: (n: string) => `"${n}"`,
      };

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

  describe("truncate / insertFixture quoter dispatch", () => {
    type QuoterHost = DatabaseStatementsHost &
      Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">;

    function makeHost(): {
      host: QuoterHost;
      executed: Array<{ sql: string; name?: string | null; receiver: unknown }>;
    } {
      const executed: Array<{ sql: string; name?: string | null; receiver: unknown }> = [];
      const host: QuoterHost = {
        async execute(sql: string, name?: string | null) {
          // captures `this` to verify receiver is preserved
          executed.push({ sql, name, receiver: this });
        },
        quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
        quoteTableName: (n: string) => `\`${n}\``,
        quoteColumnName: (n: string) => `\`${n}\``,
      };
      return { host, executed };
    }

    it("truncate dispatches quoteTableName via this and forwards name to execute", async () => {
      const { truncate } = await import("./database-statements.js");
      const { host, executed } = makeHost();
      await truncate.call(host, "users", "Custom Truncate");
      expect(executed).toEqual([
        { sql: "TRUNCATE TABLE `users`", name: "Custom Truncate", receiver: host },
      ]);
    });

    it("insertFixture dispatches quote/quoteTableName/quoteColumnName via this", async () => {
      const { insertFixture } = await import("./database-statements.js");
      const { host, executed } = makeHost();
      await insertFixture.call(host, { name: "Alice", id: 1 }, "users");
      expect(executed).toHaveLength(1);
      expect(executed[0]).toEqual({
        sql: "INSERT INTO `users` (`name`, `id`) VALUES ('Alice', 1)",
        name: "Fixture Insert",
        receiver: host,
      });
    });

    it("insertFixture uses emptyInsertStatementValue when no columns are present", async () => {
      const { insertFixture } = await import("./database-statements.js");
      const { host, executed } = makeHost();
      await insertFixture.call(host, {}, "users");
      expect(executed[0].sql).toBe("INSERT INTO `users` DEFAULT VALUES");
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

    it("with yaml fallback passes Temporal values through unchanged (not serialized to '{}')", () => {
      const instant = Temporal.Instant.from("2026-04-26T14:23:55Z");
      expect(withYamlFallback(instant)).toBe(instant);
      const pdt = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
      expect(withYamlFallback(pdt)).toBe(pdt);
    });

    it("typeCastedBinds converts Temporal values in valueForDatabase() results to SQL strings", () => {
      const instant = Temporal.Instant.from("2026-04-26T14:23:55.123456Z");
      const attrLike = { valueForDatabase: () => instant };
      expect(typeCastedBinds([attrLike])).toEqual(["2026-04-26 14:23:55.123456"]);
    });

    it("typeCastedBinds converts Temporal values in { value } bind objects to SQL strings", () => {
      const date = Temporal.PlainDate.from("2026-04-26");
      const bindLike = { value: date };
      expect(typeCastedBinds([bindLike])).toEqual(["2026-04-26"]);
    });

    it("typeCastedBinds passes non-Temporal primitives through unchanged", () => {
      expect(typeCastedBinds([42, "hello", null])).toEqual([42, "hello", null]);
    });

    it("high precision current timestamp returns Arel SQL literal", () => {
      const result = highPrecisionCurrentTimestamp();
      expect(result.toSql()).toBe("CURRENT_TIMESTAMP");
    });
  });
});

describe("performQuery", () => {
  it("raises NotImplementedError — subclasses must override", () => {
    expect(() => performQuery.call({} as DatabaseStatementsHost, null, "SELECT 1", [], [])).toThrow(
      /perform_query is not implemented/,
    );
  });
});

describe("preprocessQuery", () => {
  it("returns sql unchanged when no write guard or transaction", () => {
    const host: DatabaseStatementsHost = {};
    expect(preprocessQuery.call(host, "SELECT 1")).toBe("SELECT 1");
  });

  it("calls checkIfWriteQuery on the host", () => {
    let checked: string | undefined;
    const host: DatabaseStatementsHost = {
      checkIfWriteQuery(sql) {
        checked = sql;
      },
    };
    preprocessQuery.call(host, "DELETE FROM users");
    expect(checked).toBe("DELETE FROM users");
  });
});

describe("select", () => {
  it("delegates to internalExecQuery and returns a Result", async () => {
    const host: DatabaseStatementsHost = {
      async internalExecute(_sql, _name, _binds) {
        return [{ id: 1 }];
      },
    };
    const result = await select.call(host, "SELECT 1");
    expect(result).toBeInstanceOf(Result);
  });
});

describe("sqlForInsert", () => {
  it("returns sql and binds unchanged when adapter does not support RETURNING", () => {
    const host: DatabaseStatementsHost = { supportsInsertReturning: () => false };
    const [sql, binds] = sqlForInsert.call(host, "INSERT INTO t (x) VALUES (1)", "id", [], null);
    expect(sql).toBe("INSERT INTO t (x) VALUES (1)");
    expect(binds).toEqual([]);
  });

  it("appends RETURNING clause when pk is supplied and adapter supports it", () => {
    const host: DatabaseStatementsHost = {
      supportsInsertReturning: () => true,
      quoteColumnName: (c) => `"${c}"`,
    };
    const [sql] = sqlForInsert.call(host, "INSERT INTO t (x) VALUES (1)", "id", [], null);
    expect(sql).toBe(`INSERT INTO t (x) VALUES (1) RETURNING "id"`);
  });

  it("uses explicit returning list when provided", () => {
    const host: DatabaseStatementsHost = {
      supportsInsertReturning: () => true,
      quoteColumnName: (c) => `"${c}"`,
    };
    const [sql] = sqlForInsert.call(
      host,
      "INSERT INTO t (x) VALUES (1)",
      null,
      [],
      ["id", "created_at"],
    );
    expect(sql).toContain('RETURNING "id", "created_at"');
  });
});

describe("arelFromRelation", () => {
  it("returns non-relation values unchanged", () => {
    expect(arelFromRelation("some sql")).toBe("some sql");
    expect(arelFromRelation(null)).toBeNull();
  });

  it("calls .arel() on Relation-like objects", () => {
    const fakeAst = { type: "select" };
    const relation = { arel: () => fakeAst };
    expect(arelFromRelation(relation)).toBe(fakeAst);
  });
});

describe("extractTableRefFromInsertSql", () => {
  it("extracts unquoted table name", () => {
    const host = {} as DatabaseStatementsHost;
    expect(extractTableRefFromInsertSql.call(host, "INSERT INTO users (name) VALUES ('a')")).toBe(
      "users",
    );
  });

  it("extracts quoted table name", () => {
    const host = {} as DatabaseStatementsHost;
    expect(extractTableRefFromInsertSql.call(host, 'INSERT INTO "my_table" (x) VALUES (1)')).toBe(
      "my_table",
    );
  });

  it("returns null when no match", () => {
    const host = {} as DatabaseStatementsHost;
    expect(extractTableRefFromInsertSql.call(host, "SELECT 1")).toBeNull();
  });
});

describe("defaultInsertValue", () => {
  it("returns DEFAULT SQL literal", () => {
    const result = defaultInsertValue(null);
    expect(result.toSql()).toBe("DEFAULT");
  });
});

describe("returningColumnValues", () => {
  it("returns [first value of first row] from result", () => {
    const host: DatabaseStatementsHost = {};
    const result = new Result(["id"], [[42]]);
    expect(returningColumnValues.call(host, result)).toEqual([42]);
  });

  it("returns [undefined] for empty result", () => {
    const host: DatabaseStatementsHost = {};
    expect(returningColumnValues.call(host, Result.empty())).toEqual([undefined]);
  });
});

// ---------------------------------------------------------------------------
// Fixture / truncate builders
// ---------------------------------------------------------------------------

describe("buildFixtureSql / buildFixtureStatements / buildTruncateStatement(s) / combineMultiStatements", () => {
  type FixtureHost = DatabaseStatementsHost &
    Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName" | "quoteString">;

  function makeHost(quoter: { q?: (n: string) => string } = {}): FixtureHost {
    const q = quoter.q ?? ((n: string) => `"${n}"`);
    return {
      quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
      quoteTableName: q,
      quoteColumnName: q,
      quoteString: (s: string) => s.replace(/'/g, "''"),
    };
  }

  describe("buildTruncateStatement", () => {
    it("produces TRUNCATE TABLE with quoted name", () => {
      expect(buildTruncateStatement.call(makeHost(), "users")).toBe(`TRUNCATE TABLE "users"`);
    });

    it("uses adapter quoteTableName (backtick for MySQL)", () => {
      const host = makeHost({ q: (n) => `\`${n}\`` });
      expect(buildTruncateStatement.call(host, "orders")).toBe("TRUNCATE TABLE `orders`");
    });
  });

  describe("buildTruncateStatements", () => {
    it("maps each table name through buildTruncateStatement", () => {
      const result = buildTruncateStatements.call(makeHost(), ["users", "posts"]);
      expect(result).toEqual([`TRUNCATE TABLE "users"`, `TRUNCATE TABLE "posts"`]);
    });

    it("returns empty array for empty input", () => {
      expect(buildTruncateStatements.call(makeHost(), [])).toEqual([]);
    });
  });

  describe("combineMultiStatements", () => {
    it('joins statements with ";\\n"', () => {
      expect(combineMultiStatements(["SELECT 1", "SELECT 2"])).toBe("SELECT 1;\nSELECT 2");
    });

    it("returns single statement as-is (no trailing separator)", () => {
      expect(combineMultiStatements(["SELECT 1"])).toBe("SELECT 1");
    });

    it("returns empty string for empty array", () => {
      expect(combineMultiStatements([])).toBe("");
    });
  });

  describe("buildFixtureSql", () => {
    it("returns empty-insert placeholder for an empty fixtures array", () => {
      const sql = buildFixtureSql.call(makeHost(), [], "users");
      expect(sql).toMatch(/INSERT INTO "users"/);
      expect(sql).toMatch(/DEFAULT VALUES/);
    });

    it("single-row: includes only columns present in the fixture (no DEFAULT filler)", () => {
      const sql = buildFixtureSql.call(makeHost(), [{ name: "Alice", age: 30 }], "users");
      expect(sql).toContain('"name"');
      expect(sql).toContain('"age"');
      expect(sql).toContain("'Alice'");
      expect(sql).toContain("30");
      expect(sql).not.toContain("DEFAULT");
    });

    it("single-row: strips missing columns (DEFAULT-strip optimisation)", () => {
      // Two-column union but only one fixture row — missing column must be omitted
      const sql = buildFixtureSql.call(makeHost(), [{ name: "Alice" }], "users");
      expect(sql).toContain('"name"');
      expect(sql).not.toContain("DEFAULT");
    });

    it("multi-row: includes all union columns, using DEFAULT for missing entries", () => {
      const fixtures = [{ name: "Alice" }, { name: "Bob", age: 25 }];
      const sql = buildFixtureSql.call(makeHost(), fixtures, "users");
      expect(sql).toContain('"name"');
      expect(sql).toContain('"age"');
      expect(sql).toContain("'Alice'");
      expect(sql).toContain("'Bob'");
      expect(sql).toContain("25");
      expect(sql).toContain("DEFAULT");
    });

    it("uses adapter quoteTableName / quoteColumnName for identifier quoting", () => {
      const host = makeHost({ q: (n) => `\`${n}\`` });
      const sql = buildFixtureSql.call(host, [{ id: 1 }], "orders");
      expect(sql).toContain("`orders`");
      expect(sql).toContain("`id`");
    });

    it("uses adapter quote() for value escaping", () => {
      const host: FixtureHost = {
        quote: (v: unknown) => (typeof v === "string" ? `E'${v}'` : String(v)),
        quoteTableName: (n) => `"${n}"`,
        quoteColumnName: (n) => `"${n}"`,
        quoteString: (s) => s,
      };
      const sql = buildFixtureSql.call(host, [{ val: "x" }], "t");
      expect(sql).toContain("E'x'");
    });
  });

  describe("buildFixtureStatements", () => {
    it("returns one INSERT per non-empty table", () => {
      const host = makeHost();
      const result = buildFixtureStatements.call(host, {
        users: [{ name: "Alice" }],
        posts: [{ title: "Hi" }],
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('"users"');
      expect(result[1]).toContain('"posts"');
    });

    it("skips empty fixture arrays", () => {
      const result = buildFixtureStatements.call(makeHost(), {
        users: [{ name: "Alice" }],
        posts: [],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('"users"');
    });

    it("returns empty array when all fixture sets are empty", () => {
      expect(buildFixtureStatements.call(makeHost(), { users: [] })).toEqual([]);
    });
  });
});
