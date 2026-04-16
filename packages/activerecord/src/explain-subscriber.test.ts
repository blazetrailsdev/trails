import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ExplainSubscriber } from "./explain-subscriber.js";
import { ExplainRegistry } from "./explain-registry.js";

const SUBSCRIBER = new ExplainSubscriber();

describe("ExplainSubscriberTest", () => {
  beforeEach(() => {
    ExplainRegistry.reset();
    ExplainRegistry.collect = true;
  });

  afterEach(() => {
    ExplainRegistry.reset();
  });

  it("collects nothing if the payload has an exception", () => {
    SUBSCRIBER.finish(null, null, { exception: new Error("boom") });
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("collects nothing for ignored payloads", () => {
    for (const ip of ExplainSubscriber.IGNORED_PAYLOADS) {
      SUBSCRIBER.finish(null, null, { name: ip });
    }
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("collects nothing if collect is false", () => {
    ExplainRegistry.collect = false;
    SUBSCRIBER.finish(null, null, { name: "SQL", sql: "select 1 from users", binds: [1, 2] });
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("collects pairs of queries and binds", () => {
    const sql = "select 1 from users";
    const binds = [1, 2];
    SUBSCRIBER.finish(null, null, { name: "SQL", sql, binds });
    expect(ExplainRegistry.queries.length).toBe(1);
    expect(ExplainRegistry.queries[0][0]).toBe(sql);
    expect(ExplainRegistry.queries[0][1]).toEqual(binds);
  });

  it("collects nothing if the statement is not explainable", () => {
    SUBSCRIBER.finish(null, null, { name: "SQL", sql: "SHOW max_identifier_length" });
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("collects nothing if the statement is only partially matched", () => {
    SUBSCRIBER.finish(null, null, { name: "SQL", sql: "select_db yo_mama" });
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("collects cte queries", () => {
    SUBSCRIBER.finish(null, null, {
      name: "SQL",
      sql: "with s as (values(3)) select 1 from s",
    });
    expect(ExplainRegistry.queries.length).toBe(1);
  });

  it("collects queries starting with comment", () => {
    SUBSCRIBER.finish(null, null, {
      name: "SQL",
      sql: "/* comment */ select 1 from users",
    });
    expect(ExplainRegistry.queries.length).toBe(1);
  });
});
