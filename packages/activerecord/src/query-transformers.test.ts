import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { queryTransformers } from "./query-transformers.js";
import type { QueryTransformer } from "./query-transformers.js";
import { QueryLogs } from "./query-logs.js";

describe("queryTransformers", () => {
  // Process-global, like ActiveRecord.query_transformers. Snapshot the live
  // contents and restore them (rather than `length = 0`) so that once a later
  // PR registers a default transformer at import time, these tests neither wipe
  // it nor leak an emptied registry into sibling suites.
  let saved: QueryTransformer[];
  beforeEach(() => {
    saved = [...queryTransformers];
  });
  afterEach(() => {
    queryTransformers.splice(0, queryTransformers.length, ...saved);
  });

  it("defaults to an empty list", () => {
    expect(queryTransformers).toEqual([]);
  });

  it("is mutable in place — push registers a transformer", () => {
    const t: QueryTransformer = { call: (sql) => `${sql} /*x*/` };
    queryTransformers.push(t);
    expect(queryTransformers).toContain(t);
  });

  it("a registered transformer rewrites SQL via call(sql, connection)", () => {
    queryTransformers.push({ call: (sql) => `${sql} -- tagged` });
    let sql = "SELECT 1";
    for (const t of queryTransformers) sql = t.call(sql, null);
    expect(sql).toBe("SELECT 1 -- tagged");
  });

  it("QueryLogs satisfies the QueryTransformer contract", () => {
    const logs = new QueryLogs();
    logs.tags = [{ app: "MyApp" }];
    const transformer: QueryTransformer = logs;
    queryTransformers.push(transformer);
    expect(transformer.call("SELECT 1", null)).toContain("MyApp");
  });
});
