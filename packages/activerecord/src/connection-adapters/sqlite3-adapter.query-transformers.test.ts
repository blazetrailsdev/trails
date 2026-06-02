import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { queryTransformers, type QueryTransformer } from "../query-transformers.js";

// Integration proof for QL PR 3: a registered query transformer is applied in
// preprocessQuery and the post-transform (commented) SQL flows all the way into
// both the executed statement and the `sql.active_record` instrumentation
// payload — the Rails-faithful ordering where preprocess_query runs before
// raw_execute's log block.
describe("SQLite3Adapter queryTransformers wiring", () => {
  let adapter: SQLite3Adapter;
  let savedTransformers: QueryTransformer[];

  beforeEach(() => {
    adapter = new SQLite3Adapter(":memory:");
    savedTransformers = queryTransformers.slice();
    queryTransformers.length = 0;
  });

  afterEach(async () => {
    queryTransformers.length = 0;
    queryTransformers.push(...savedTransformers);
    await adapter.close().catch(() => undefined);
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
