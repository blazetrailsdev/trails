import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { setGlobalExecutorConcurrency } from "./active-record.js";

describe("AsynchronousQueriesTest", () => {
  it.skip("async select all", () => {});
});

describe("AsynchronousExecutorTypeTest", () => {
  it.skip("null configuration uses a single null executor by default", () => {});
  it.skip("one global thread pool is used when set with default concurrency", () => {});
  it.skip("concurrency can be set on global thread pool", () => {});
  it("concurrency cannot be set with null executor or multi thread pool", () => {
    const oldValue = Base.asyncQueryExecutor;
    try {
      Base.asyncQueryExecutor = null;

      expect(() => {
        setGlobalExecutorConcurrency(8);
      }).toThrow(ArgumentError);

      Base.asyncQueryExecutor = "multi_thread_pool";

      expect(() => {
        setGlobalExecutorConcurrency(8);
      }).toThrow(ArgumentError);
    } finally {
      Base.asyncQueryExecutor = oldValue;
    }
  });
  it.skip("multi thread pool executor configuration", () => {});
  it.skip("multi thread pool is used only by configurations that enable it", () => {});
});

it.skip("async select failure", () => {});
it.skip("async query from transaction", () => {});
it.skip("async query cache", () => {});
it.skip("async query foreground fallback", () => {});
