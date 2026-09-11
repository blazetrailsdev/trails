import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import type { QueryTransformer } from "./query-transformers.js";
import { QueryLogs } from "./query-logs.js";

describe("queryTransformers", () => {
  let saved: QueryTransformer[];
  beforeEach(() => {
    saved = [...Base.queryTransformers];
  });
  afterEach(() => {
    Base.queryTransformers.splice(0, Base.queryTransformers.length, ...saved);
  });

  it("defaults to an empty list", () => {
    expect(Base.queryTransformers).toEqual([]);
  });

  it("is mutable in place — push registers a transformer", () => {
    const t: QueryTransformer = { call: (sql) => `${sql} /*x*/` };
    Base.queryTransformers.push(t);
    expect(Base.queryTransformers).toContain(t);
  });

  it("a registered transformer rewrites SQL via call(sql, connection)", () => {
    Base.queryTransformers.push({ call: (sql) => `${sql} -- tagged` });
    let sql = "SELECT 1";
    for (const t of Base.queryTransformers) sql = t.call(sql, null);
    expect(sql).toBe("SELECT 1 -- tagged");
  });

  it("QueryLogs satisfies the QueryTransformer contract", () => {
    const logs = new QueryLogs();
    logs.tags = [{ app: "MyApp" }];
    const transformer: QueryTransformer = logs;
    Base.queryTransformers.push(transformer);
    expect(transformer.call("SELECT 1", null)).toContain("MyApp");
  });
});
