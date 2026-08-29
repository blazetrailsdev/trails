import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActiveRecord } from "./ar-config.js";
import type { QueryTransformer } from "./query-transformers.js";
import { QueryLogs } from "./query-logs.js";

describe("queryTransformers", () => {
  let saved: QueryTransformer[];
  beforeEach(() => {
    saved = [...ActiveRecord.queryTransformers];
  });
  afterEach(() => {
    ActiveRecord.queryTransformers.splice(0, ActiveRecord.queryTransformers.length, ...saved);
  });

  it("defaults to an empty list", () => {
    expect(ActiveRecord.queryTransformers).toEqual([]);
  });

  it("is mutable in place — push registers a transformer", () => {
    const t: QueryTransformer = { call: (sql) => `${sql} /*x*/` };
    ActiveRecord.queryTransformers.push(t);
    expect(ActiveRecord.queryTransformers).toContain(t);
  });

  it("a registered transformer rewrites SQL via call(sql, connection)", () => {
    ActiveRecord.queryTransformers.push({ call: (sql) => `${sql} -- tagged` });
    let sql = "SELECT 1";
    for (const t of ActiveRecord.queryTransformers) sql = t.call(sql, null);
    expect(sql).toBe("SELECT 1 -- tagged");
  });

  it("QueryLogs satisfies the QueryTransformer contract", () => {
    const logs = new QueryLogs();
    logs.tags = [{ app: "MyApp" }];
    const transformer: QueryTransformer = logs;
    ActiveRecord.queryTransformers.push(transformer);
    expect(transformer.call("SELECT 1", null)).toContain("MyApp");
  });
});
