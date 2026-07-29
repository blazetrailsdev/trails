import { it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { fixtures } from "../test-fixtures.js";
import { describeIfSqlite } from "../support/describe-if-sqlite.js";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { ActiveRecord } from "../ar-config.js";
import type { QueryTransformer } from "../query-transformers.js";

fixtures([]);

// Integration proof for QL PR 3: a registered query transformer is applied in
// preprocessQuery and the post-transform (commented) SQL flows all the way into
// both the executed statement and the `sql.active_record` instrumentation
// payload — the Rails-faithful ordering where preprocess_query runs before
// raw_execute's log block.
describeIfSqlite("SQLite3Adapter queryTransformers wiring", () => {
  let adapter: AbstractSQLite3Adapter;
  let savedTransformers: QueryTransformer[];

  beforeEach(() => {
    adapter = Base.connection as AbstractSQLite3Adapter;
    savedTransformers = ActiveRecord.queryTransformers.slice();
    ActiveRecord.queryTransformers.length = 0;
  });

  afterEach(() => {
    ActiveRecord.queryTransformers.length = 0;
    ActiveRecord.queryTransformers.push(...savedTransformers);
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
    ActiveRecord.queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { result, sqls } = await captureSql(() => adapter.execute("SELECT 1 AS one"));
    // The query still executes correctly with the comment appended.
    expect(result).toEqual([{ one: 1 }]);
    // The instrumentation payload carries the post-transform SQL.
    expect(sqls.some((s) => s === "SELECT 1 AS one /*app:test*/")).toBe(true);
  });

  it("applies the comment on write queries too", async () => {
    ActiveRecord.queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      adapter.executeMutation("INSERT INTO customers (name) VALUES ('x')"),
    );
    expect(sqls.some((s) => s === "INSERT INTO customers (name) VALUES ('x') /*app:test*/")).toBe(
      true,
    );
  });

  it("leaves SQL untouched when no transformers are registered", async () => {
    const { sqls } = await captureSql(() => adapter.execute("SELECT 2 AS two"));
    expect(sqls).toContain("SELECT 2 AS two");
    expect(sqls.every((s) => !s.includes("/*"))).toBe(true);
  });

  it("leaves executeBatch statements uncommented (matches Rails execute_batch)", async () => {
    ActiveRecord.queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      adapter.executeBatch([
        "INSERT INTO customers (name) VALUES ('a')",
        "INSERT INTO customers (name) VALUES ('b')",
      ]),
    );
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls.every((s) => !s.includes("/*app:test*/"))).toBe(true);
  });

  it("does not let a concurrent batch suppress a normal query's comment", async () => {
    // The batch-suppression flag is consumed synchronously inside preprocessQuery
    // (before any await), so a query interleaved with an in-flight batch still
    // gets transformed. If the flag spanned the await, this comment would be lost.
    ActiveRecord.queryTransformers.push({ call: (sql) => `${sql} /*app:test*/` });
    const { sqls } = await captureSql(() =>
      Promise.all([
        adapter.executeBatch([
          "INSERT INTO customers (name) VALUES ('c1')",
          "INSERT INTO customers (name) VALUES ('c2')",
        ]),
        adapter.execute("SELECT id FROM customers"),
      ]),
    );
    // The batch statements stay uncommented; the concurrent SELECT keeps its comment.
    expect(sqls.some((s) => s === "SELECT id FROM customers /*app:test*/")).toBe(true);
    expect(sqls.some((s) => s.startsWith("INSERT") && s.includes("/*app:test*/"))).toBe(false);
  });

  it("applies each transformer exactly once per query", async () => {
    let calls = 0;
    ActiveRecord.queryTransformers.push({
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
