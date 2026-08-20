import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/activemodel";
import { Rollback, StatementInvalid } from "../../errors.js";
import {
  buildFixtureSql,
  buildFixtureStatements,
  buildTruncateStatement,
  buildTruncateStatements,
  combineMultiStatements,
  toSql,
  toSqlAndBinds,
  cacheableQuery,
  explain,
  transaction,
  transactionIsolationLevels,
  beginDbTransaction,
  beginDeferredTransaction,
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
  performQuery,
  preprocessQuery,
  select,
  sqlForInsert,
  arelFromRelation,
  extractTableRefFromInsertSql,
  defaultInsertValue,
  returningColumnValues,
  DatabaseStatements,
  type DatabaseStatementsHost,
} from "./database-statements.js";
import { Result } from "../../result.js";
import { ActiveRecord } from "../../ar-config.js";
import type { QueryTransformer } from "../../query-transformers.js";
import type { Quoting } from "./quoting.js";
import { fixtures } from "../../test-fixtures.js";
import { newSqlitePool } from "../../support/pooled-sqlite-adapter.js";

// Rails' DatabaseStatements host is an AbstractAdapter, whose @pool is a real
// ConnectionPool (abstract_adapter.rb:153), so the mock hosts below hold one
// rather than a two-member literal standing in for it.
const pool = newSqlitePool();

// Every AbstractAdapter mixes in `log`, the single `sql.active_record` payload
// producer (abstract_adapter.rb:1134). The bare host literals below stand in
// for an adapter, so they carry one too.
const log: NonNullable<DatabaseStatementsHost["log"]> = async (
  _sql,
  _name,
  _binds,
  _typeCastedBinds,
  _isAsync,
  block,
) => {
  try {
    return await block({ row_count: 0 });
  } catch (e) {
    if (e instanceof StatementInvalid) throw e.setQuery(_sql, _binds);
    throw e;
  }
};

// `typeCastedBinds` is likewise mixed in on every adapter by
// `include(AbstractAdapter, QuotingMixin)` (abstract-adapter.ts), so it is a
// required member of DatabaseStatementsHost rather than an optional one.
const typeCastedBinds: DatabaseStatementsHost["typeCastedBinds"] = (binds) => binds ?? [];

describe("DatabaseStatements", () => {
  // `to_sql` compiles through `Table.engine`'s connection (arel/nodes/node.rb:148-153),
  // so these Arel assertions need a connection, as Rails' do via helper.rb.
  fixtures({});
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
        log,
        pool,
        typeCastedBinds,
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
        log,
        pool,
        typeCastedBinds,
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

    // Rails' begin_deferred_transaction hands the level name straight to
    // begin_isolated_db_transaction (database_statements.rb:412-418) — it does
    // not map it through transaction_isolation_levels, and it does not let an
    // unknown level pass silently.
    it("begin deferred transaction forwards the isolation level name verbatim", async () => {
      const seen: string[] = [];
      const host = {
        beginIsolatedDbTransaction: async (isolation: string) => {
          seen.push(isolation);
        },
      };
      await beginDeferredTransaction.call(host as never, "read_committed");
      await beginDeferredTransaction.call(host as never, "bogus");
      expect(seen).toEqual(["read_committed", "bogus"]);
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
        log,
        pool,
        typeCastedBinds,
        currentTransaction: () => txn,
        isWriteQuery: () => true,
      };
      markTransactionWrittenIfWrite.call(host, "INSERT INTO x");
      expect(txn.written).toBe(true);
    });

    it("does not set written for read queries", () => {
      const txn = { open: true, written: false };
      const host: DatabaseStatementsHost = {
        log,
        pool,
        typeCastedBinds,
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
        log,
        pool,
        typeCastedBinds,
        currentTransaction: () => ({ open: true }),
      };
      expect(isTransactionOpen.call(host)).toBe(true);
    });

    it("returns false when no transaction", () => {
      const host: DatabaseStatementsHost = {
        log,
        pool,
        typeCastedBinds,
        currentTransaction: () => ({ open: false }),
      };
      expect(isTransactionOpen.call(host)).toBe(false);
    });
  });

  describe("internalExecQuery", () => {
    it("throws when binds provided without internalExecute", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        log,
        typeCastedBinds,
        execute: async () => [],
      } as unknown as DatabaseStatementsHost;
      await expect(internalExecQuery.call(host, "SELECT ?", "SQL", [1])).rejects.toThrow(
        "internalExecQuery requires internalExecute",
      );
    });

    it("delegates to internalExecute when available", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        log,
        typeCastedBinds,
        internalExecute: async () => ({ rows: [[1]] }),
      } as unknown as DatabaseStatementsHost;
      const result = await internalExecQuery.call(host, "SELECT 1", "SQL");
      expect((result as any).rows).toEqual([[1]]);
    });

    it("logs the query once and reports row_count off the yielded payload", async () => {
      const { rawExecute, rawExecQuery } = await import("./database-statements.js");
      const payloads: { row_count: number }[] = [];
      const host = {
        typeCastedBinds,
        log: async (
          sql: string,
          name: string | null | undefined,
          binds: unknown[],
          _tcBinds: unknown[],
          _isAsync: boolean,
          block: (payload: any) => Promise<unknown>,
        ) => {
          const payload = { sql, name, binds, row_count: 0 };
          payloads.push(payload);
          return block(payload);
        },
        withRawConnection: async (_opts: unknown, block: (conn: unknown) => Promise<unknown>) =>
          block(null),
        performQuery: (
          _conn: unknown,
          _sql: string,
          _binds: unknown[],
          _tcBinds: unknown[],
          options: { notificationPayload?: { row_count: number } },
        ) => {
          options.notificationPayload!.row_count = 2;
          return { rows: [[1], [2]], columns: ["id"] };
        },
        castResult: (raw: any) => new Result(raw.columns, raw.rows),
      } as unknown as DatabaseStatementsHost;
      host.rawExecute = rawExecute.bind(host) as DatabaseStatementsHost["rawExecute"];

      const result = await rawExecQuery.call(host, "SELECT id FROM t", "SQL", []);
      expect(result.length).toBe(2);
      expect(payloads.length).toBe(1);
      expect(payloads[0].row_count).toBe(2);
    });

    it("forwards prepare and async on to raw_execute", async () => {
      // Ruby's `raw_exec_query(...)` forwards EVERY argument, so `raw_execute`'s
      // `prepare:`/`async:` kwargs reach it (database_statements.rb:541-542,552)
      // — a FutureResult scheduled with `prepare: true` must not silently run
      // unprepared, nor lose the async flag off the instrumentation payload.
      const { rawExecute, rawExecQuery } = await import("./database-statements.js");
      let loggedAsync: boolean | undefined;
      let preparedWith: boolean | undefined;
      const host = {
        typeCastedBinds,
        log: async (
          _sql: string,
          _name: string | null | undefined,
          _binds: unknown[],
          _tcBinds: unknown[],
          isAsync: boolean,
          block: (payload: any) => Promise<unknown>,
        ) => {
          loggedAsync = isAsync;
          return block({ row_count: 0 });
        },
        withRawConnection: async (_opts: unknown, block: (conn: unknown) => Promise<unknown>) =>
          block(null),
        performQuery: (
          _conn: unknown,
          _sql: string,
          _binds: unknown[],
          _tcBinds: unknown[],
          options: { prepare?: boolean },
        ) => {
          preparedWith = options.prepare;
          return { rows: [[1]], columns: ["id"] };
        },
        castResult: (raw: any) => new Result(raw.columns, raw.rows),
      } as unknown as DatabaseStatementsHost;
      host.rawExecute = rawExecute.bind(host) as DatabaseStatementsHost["rawExecute"];

      await rawExecQuery.call(host, "SELECT id FROM t", "SQL", [], {
        prepare: true,
        async: true,
      });
      expect(preparedWith).toBe(true);
      expect(loggedAsync).toBe(true);
    });

    it("attaches sql and binds to a translated StatementInvalid via set_query", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      // Mirror internal_execute → raw_execute: with_raw_connection rejects with
      // an already translated StatementInvalid carrying no statement context,
      // and `log`'s rescue is what attaches the query (abstract_adapter.rb:1145).
      const host = {
        log,
        typeCastedBinds,
        internalExecute: async (sql: string, name: string | null, opts?: { binds?: unknown[] }) =>
          log(sql, name, opts?.binds ?? [], [], false, async () => {
            throw new StatementInvalid("duplicate key value violates unique constraint");
          }),
      } as unknown as DatabaseStatementsHost;
      const binds = [1, "x"];
      const err = await internalExecQuery
        .call(host, "INSERT INTO t (id, name) VALUES ($1, $2)", "SQL", binds)
        .then(
          () => null,
          (e) => e,
        );
      expect(err).toBeInstanceOf(StatementInvalid);
      expect(err.sql).toBe("INSERT INTO t (id, name) VALUES ($1, $2)");
      expect(err.binds).toEqual(binds);
    });

    it("does not overwrite sql and binds already set on a StatementInvalid", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        log,
        typeCastedBinds,
        internalExecute: async (sql: string, name: string | null, opts?: { binds?: unknown[] }) =>
          log(sql, name, opts?.binds ?? [], [], false, async () => {
            throw new StatementInvalid("boom", { sql: "ORIGINAL", binds: [99] });
          }),
      } as unknown as DatabaseStatementsHost;
      const err = await internalExecQuery.call(host, "OUTER SQL", "SQL", [1]).then(
        () => null,
        (e) => e,
      );
      expect(err.sql).toBe("ORIGINAL");
      expect(err.binds).toEqual([99]);
    });

    it("normalizes execute fallback result", async () => {
      const { internalExecQuery } = await import("./database-statements.js");
      const host = {
        log,
        typeCastedBinds,
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
        pool,
        typeCastedBinds,
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

    it("scopes disableReferentialIntegrity to the fixture tables and delete targets", async () => {
      const { insertFixturesSet } = await import("./database-statements.js");
      let scopedTables: string[] | undefined;
      const host: DatabaseStatementsHost &
        Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName"> = {
        pool,
        typeCastedBinds,
        execute: async () => {},
        transaction: async <T>(fn: (tx?: unknown) => Promise<T> | T) => {
          await fn();
          return undefined;
        },
        disableReferentialIntegrity: async (fn: () => Promise<void>, tables?: string[]) => {
          scopedTables = tables;
          await fn();
        },
        quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
        quoteTableName: (n: string) => `"${n}"`,
        quoteColumnName: (n: string) => `"${n}"`,
      };

      await insertFixturesSet.call(host, { users: [{ name: "Alice" }], posts: [{ title: "Hi" }] }, [
        "old_table",
        "users",
      ]);

      // Union of fixture keys and delete targets, de-duplicated.
      expect(scopedTables && [...scopedTables].sort()).toEqual(["old_table", "posts", "users"]);
    });
  });

  describe("truncateTables", () => {
    it("scopes disableReferentialIntegrity to the tables being truncated", async () => {
      const { truncateTables } = await import("./database-statements.js");
      const executed: string[] = [];
      let scopedTables: string[] | undefined;
      const host: DatabaseStatementsHost & Pick<Quoting, "quoteTableName"> = {
        pool,
        typeCastedBinds,
        execute: async (sql: string) => {
          executed.push(sql);
        },
        disableReferentialIntegrity: async (fn: () => Promise<void>, tables?: string[]) => {
          scopedTables = tables;
          await fn();
        },
        quoteTableName: (n: string) => `"${n}"`,
      };

      // schema_migrations / ar_internal_metadata are filtered out before scoping.
      await truncateTables.call(host, "users", "posts", "schema_migrations");

      expect(scopedTables).toEqual(["users", "posts"]);
      expect(executed).toEqual(['TRUNCATE TABLE "users"', 'TRUNCATE TABLE "posts"']);
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
        pool,
        typeCastedBinds,
        async execute(sql: string, _binds?: unknown[], name?: string | null) {
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
      // A non-Integer Float falls to `Integer(limit)` (database_statements.rb:512),
      // which truncates toward zero rather than flooring.
      expect(sanitizeLimit(3.9)).toBe(3);
      expect(sanitizeLimit(-3.9)).toBe(-3);
    });

    it("sanitize limit with string integer", () => {
      expect(sanitizeLimit("10")).toBe(10);
      // `Integer(str)` parses with base detection, not as plain decimal: a bare
      // leading `0` is octal, `0x`/`0b`/`0o`/`0d` set the radix, and `_`
      // separates digits. Every pair below was taken from `ruby -e`.
      expect(sanitizeLimit("012")).toBe(10);
      expect(sanitizeLimit("0x1f")).toBe(31);
      expect(sanitizeLimit("0b101")).toBe(5);
      expect(sanitizeLimit("0o17")).toBe(15);
      expect(sanitizeLimit("0d19")).toBe(19);
      expect(sanitizeLimit("1_000")).toBe(1000);
      expect(sanitizeLimit("0_1")).toBe(1);
      expect(sanitizeLimit(" 12 ")).toBe(12);
      expect(sanitizeLimit("-0x10")).toBe(-16);
    });

    it("sanitize limit with invalid value", () => {
      // `Integer("abc")` (database_statements.rb:512) raises ArgumentError, not
      // TypeError — TypeError is Ruby's arm for a value with no integer
      // conversion at all, and it names the value's class (nil/true/false render
      // as themselves). `Integer(Float::NAN)` / `Integer(Float::INFINITY)` raise
      // FloatDomainError.
      for (const bad of ["abc", "1__0", "1e3", "12.5", "08", "0b2", "0xg", "_1", "1_", "--5"]) {
        expect(() => sanitizeLimit(bad)).toThrow(ArgumentError);
      }
      expect(() => sanitizeLimit(null)).toThrow(TypeError);
      expect(() => sanitizeLimit(null)).toThrow("can't convert nil into Integer");
      expect(() => sanitizeLimit([1])).toThrow("can't convert Array into Integer");
      expect(() => sanitizeLimit(true)).toThrow("can't convert true into Integer");
      expect(() => sanitizeLimit(NaN)).toThrow(
        expect.objectContaining({ name: "FloatDomainError", message: "NaN" }),
      );
      expect(() => sanitizeLimit(Infinity)).toThrow(
        expect.objectContaining({ name: "FloatDomainError", message: "Infinity" }),
      );
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
    const host: DatabaseStatementsHost = { pool, typeCastedBinds, log };
    expect(preprocessQuery.call(host, "SELECT 1")).toBe("SELECT 1");
  });

  it("calls checkIfWriteQuery on the host", () => {
    let checked: string | undefined;
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      checkIfWriteQuery(sql) {
        checked = sql;
      },
    };
    preprocessQuery.call(host, "DELETE FROM users");
    expect(checked).toBe("DELETE FROM users");
  });

  describe("queryTransformers loop", () => {
    function withTransformers(transformers: QueryTransformer[], fn: () => void): void {
      const saved = ActiveRecord.queryTransformers.slice();
      ActiveRecord.queryTransformers.length = 0;
      ActiveRecord.queryTransformers.push(...transformers);
      try {
        fn();
      } finally {
        ActiveRecord.queryTransformers.length = 0;
        ActiveRecord.queryTransformers.push(...saved);
      }
    }

    it("applies registered transformers in order, threading the connection", () => {
      const host: DatabaseStatementsHost = { pool, typeCastedBinds, log };
      const seen: unknown[] = [];
      withTransformers(
        [
          {
            call(sql, connection) {
              seen.push(connection);
              return `${sql} /*a*/`;
            },
          },
          { call: (sql) => `${sql} /*b*/` },
        ],
        () => {
          expect(preprocessQuery.call(host, "SELECT 1")).toBe("SELECT 1 /*a*/ /*b*/");
        },
      );
      expect(seen).toEqual([host]);
    });

    it("does not double-apply when a transformer re-enters preprocessQuery", () => {
      const host: DatabaseStatementsHost = { pool, typeCastedBinds, log };
      let nested = "";
      withTransformers(
        [
          {
            call(sql) {
              // A transformer that issues its own query on the same connection
              // must reuse the already-transformed SQL, not re-comment it.
              nested = preprocessQuery.call(host, "SELECT inner");
              return `${sql} /*outer*/`;
            },
          },
        ],
        () => {
          expect(preprocessQuery.call(host, "SELECT 1")).toBe("SELECT 1 /*outer*/");
        },
      );
      expect(nested).toBe("SELECT inner");
    });
  });
});

describe("select", () => {
  it("delegates to internalExecQuery and returns a Result", async () => {
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      async internalExecute(_sql, _name, _binds) {
        return [{ id: 1 }];
      },
    };
    const result = await select.call(host, "SELECT 1");
    expect(result).toBeInstanceOf(Result);
  });
});

describe("execInsert", () => {
  function makeInsertHost(supportsReturning: boolean) {
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      supportsInsertReturning: () => supportsReturning,
      quoteColumnName: (c) => `"${c}"`,
    };
    return host;
  }

  it("appends RETURNING via sqlForInsert when adapter supports it", () => {
    const [sql] = sqlForInsert.call(
      makeInsertHost(true),
      "INSERT INTO t (x) VALUES (1)",
      "id",
      [],
      null,
    );
    expect(sql).toBe(`INSERT INTO t (x) VALUES (1) RETURNING "id"`);
  });

  it("passes sql unchanged when adapter does not support RETURNING", () => {
    const [sql] = sqlForInsert.call(
      makeInsertHost(false),
      "INSERT INTO t (x) VALUES (1)",
      "id",
      [],
      null,
    );
    expect(sql).toBe("INSERT INTO t (x) VALUES (1)");
  });

  it("uses explicit returning list when provided", () => {
    const [sql] = sqlForInsert.call(
      makeInsertHost(true),
      "INSERT INTO t (x) VALUES (1)",
      null,
      [],
      ["id", "created_at"],
    );
    expect(sql).toContain('RETURNING "id", "created_at"');
  });
});

describe("internal_exec_query is a virtual call", () => {
  // Ruby's exec_query / exec_insert / select call `internal_exec_query(...)` on
  // self, so an adapter subclass's override (SQLite3Adapter's bind-aware,
  // statement-pooling one) wins — abstract/database_statements.rb. The
  // module-level ports must dispatch through the instance, not call the
  // module-level function directly, or the override is silently dropped.
  function makeOverrideHost() {
    const seen: string[] = [];
    const host: DatabaseStatementsHost = {
      pool,
      typeCastedBinds,
      supportsInsertReturning: () => false,
      quoteColumnName: (c) => `"${c}"`,
      async internalExecQuery(sql: string) {
        seen.push(sql);
        return new Result(["overridden"], [[1]]);
      },
      async internalExecute() {
        throw new Error("module-level internalExecQuery ran instead of the override");
      },
    };
    return { host, seen };
  }

  it("execQuery reaches the adapter override", async () => {
    const { host, seen } = makeOverrideHost();
    const result = await DatabaseStatements.execQuery.call(host as never, "SELECT 1");
    expect(result.columns).toEqual(["overridden"]);
    expect(seen).toEqual(["SELECT 1"]);
  });

  it("select reaches the adapter override", async () => {
    const { host, seen } = makeOverrideHost();
    const result = await select.call(host, "SELECT 2");
    expect(result.columns).toEqual(["overridden"]);
    expect(seen).toEqual(["SELECT 2"]);
  });
});

describe("sqlForInsert", () => {
  it("returns sql and binds unchanged when adapter does not support RETURNING", () => {
    const host: DatabaseStatementsHost = {
      pool,
      typeCastedBinds,
      log,
      supportsInsertReturning: () => false,
    };
    const [sql, binds] = sqlForInsert.call(host, "INSERT INTO t (x) VALUES (1)", "id", [], null);
    expect(sql).toBe("INSERT INTO t (x) VALUES (1)");
    expect(binds).toEqual([]);
  });

  it("appends RETURNING clause when pk is supplied and adapter supports it", () => {
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      supportsInsertReturning: () => true,
      quoteColumnName: (c) => `"${c}"`,
    };
    const [sql] = sqlForInsert.call(host, "INSERT INTO t (x) VALUES (1)", "id", [], null);
    expect(sql).toBe(`INSERT INTO t (x) VALUES (1) RETURNING "id"`);
  });

  it("uses explicit returning list when provided", () => {
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
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

  it("does NOT append pk-derived RETURNING when pk is false (Rails opt-out)", () => {
    // Mirrors Rails sql_for_insert: pk=false signals the caller does not
    // want any pk-derived RETURNING column. extractTableRefFromInsertSql /
    // primaryKey lookup must be skipped too.
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      supportsInsertReturning: () => true,
      quoteColumnName: (c) => `"${c}"`,
      primaryKey: () => {
        throw new Error("primaryKey() must not be called when pk=false");
      },
    };
    const [sql] = sqlForInsert.call(host, "INSERT INTO t (x) VALUES (1)", false, [], null);
    expect(sql).toBe("INSERT INTO t (x) VALUES (1)");
  });

  it("still honours explicit returning list when pk=false", () => {
    const host: DatabaseStatementsHost = {
      log,
      pool,
      typeCastedBinds,
      supportsInsertReturning: () => true,
      quoteColumnName: (c) => `"${c}"`,
    };
    const [sql] = sqlForInsert.call(
      host,
      "INSERT INTO t (x) VALUES (1)",
      false,
      [],
      ["created_at"],
    );
    expect(sql).toBe(`INSERT INTO t (x) VALUES (1) RETURNING "created_at"`);
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
    const host: DatabaseStatementsHost = { pool, typeCastedBinds, log };
    const result = new Result(["id"], [[42]]);
    expect(returningColumnValues.call(host, result)).toEqual([42]);
  });

  it("returns [undefined] for empty result", () => {
    const host: DatabaseStatementsHost = { pool, typeCastedBinds, log };
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
      pool,
      typeCastedBinds,
      log,
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
        pool,
        typeCastedBinds,
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
