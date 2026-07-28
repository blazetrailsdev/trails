import { it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { describeIfSqlite } from "../adapters/sqlite3/test-helper.js";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { queryTransformers, type QueryTransformer } from "../query-transformers.js";

fixtures([], { useTransactionalTests: false });

// Integration proof for QL PR 3: a registered query transformer is applied in
// preprocessQuery and the post-transform (commented) SQL flows all the way into
// both the executed statement and the `sql.active_record` instrumentation
// payload — the Rails-faithful ordering where preprocess_query runs before
// raw_execute's log block.
describeIfSqlite("SQLite3Adapter queryTransformers wiring", () => {
  let adapter: AbstractSQLite3Adapter;
  let savedTransformers: QueryTransformer[];
  // Teardown-only handle. `adapter` stays non-optional for the test bodies, but
  // the teardown has to tolerate a beforeEach that failed before the lease, so
  // it reads a genuinely optional binding rather than casting `adapter`.
  let leased: AbstractSQLite3Adapter | undefined;

  // The ambient connection is a shared worker DB, so the scratch tables are
  // cleared on the way in as well as out: a hard-killed run must not wedge the
  // next one.
  const dropScratchTables = async (): Promise<void> => {
    await leased?.exec(
      "DROP TABLE IF EXISTS widgets; DROP TABLE IF EXISTS t; DROP TABLE IF EXISTS a; DROP TABLE IF EXISTS b",
    );
  };

  beforeEach(async () => {
    adapter = leased = Base.connection as AbstractSQLite3Adapter;
    savedTransformers = queryTransformers.slice();
    queryTransformers.length = 0;
    await dropScratchTables();
  });

  afterEach(async () => {
    // Drop before restoring: on the shared ambient connection a globally
    // registered transformer would otherwise rewrite the teardown DDL.
    queryTransformers.length = 0;
    await dropScratchTables();
    queryTransformers.push(...savedTransformers);
  });

  function captureSql<T>(fn: () => Promise<T>): Promise<{ result: T; sqls: string[] }> {
    const sqls: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event) => {
      sqls.push((event.payload as Record<string, unknown>)["sql"] as string);
    });
    return fn()
      .then((result) => ({ result, sqls }))
      .finally(() => Notifications.unsubscribe(sub));
  }

  it("appends the comment to read queries and instruments the commented SQL", async () => {
    queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { result, sqls } = await captureSql(() => adapter.execute("SELECT 1 AS one"));
    // The query still executes correctly with the comment appended.
    expect(result).toEqual([{ one: 1 }]);
    // The instrumentation payload carries the post-transform SQL.
    expect(sqls.some((s) => s === "SELECT 1 AS one /*app:test*/")).toBe(true);
  });

  it("applies the comment on write queries too", async () => {
    await adapter.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      adapter.executeMutation("INSERT INTO widgets (name) VALUES ('x')"),
    );
    expect(sqls.some((s) => s === "INSERT INTO widgets (name) VALUES ('x') /*app:test*/")).toBe(
      true,
    );
  });

  it("leaves SQL untouched when no transformers are registered", async () => {
    const { sqls } = await captureSql(() => adapter.execute("SELECT 2 AS two"));
    expect(sqls).toContain("SELECT 2 AS two");
    expect(sqls.every((s) => !s.includes("/*"))).toBe(true);
  });

  it("leaves executeBatch statements uncommented (matches Rails execute_batch)", async () => {
    queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      adapter.executeBatch([
        "CREATE TABLE a (id INTEGER PRIMARY KEY)",
        "CREATE TABLE b (id INTEGER PRIMARY KEY)",
      ]),
    );
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls.every((s) => !s.includes("/*app:test*/"))).toBe(true);
  });

  it("does not let a concurrent batch suppress a normal query's comment", async () => {
    // The batch-suppression flag is consumed synchronously inside preprocessQuery
    // (before any await), so a query interleaved with an in-flight batch still
    // gets transformed. If the flag spanned the await, this comment would be lost.
    await adapter.executeMutation("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      Promise.all([
        adapter.executeBatch(["INSERT INTO t (id) VALUES (1)", "INSERT INTO t (id) VALUES (2)"]),
        adapter.execute("SELECT id FROM t"),
      ]),
    );
    // The batch statements stay uncommented; the concurrent SELECT keeps its comment.
    expect(sqls.some((s) => s === "SELECT id FROM t /*app:test*/")).toBe(true);
    expect(sqls.some((s) => s.startsWith("INSERT") && s.includes("/*app:test*/"))).toBe(false);
  });

  it("applies each transformer exactly once per query", async () => {
    let calls = 0;
    queryTransformers.push({
      call: (sql) => {
        calls++;
        return `${sql} /*c1*/`;
      },
    });
    const { sqls } = await captureSql(() => adapter.execute("SELECT 3 AS three"));
    expect(calls).toBe(1);
    const matched = sqls.filter((s) => s.includes("/*c1*/"));
    expect(matched).toEqual(["SELECT 3 AS three /*c1*/"]);
  });
});
