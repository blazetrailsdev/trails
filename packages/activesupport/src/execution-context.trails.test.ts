import { Thread } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { ExecutionContext } from "./execution-context.js";

describe("ExecutionContext isolation", () => {
  it("does not leak keys written inside an isolated execution state", () => {
    ExecutionContext.clear();

    new Thread(() => {
      ExecutionContext.setKey("request_id", "inner");
      expect(ExecutionContext.get("request_id")).toBe("inner");
    }).value();

    expect(ExecutionContext.get("request_id")).toBeUndefined();
  });

  it("gives each isolated execution state its own context", () => {
    ExecutionContext.clear();
    ExecutionContext.setKey("request_id", "outer");

    new Thread(() => {
      expect(ExecutionContext.get("request_id")).toBeUndefined();
      ExecutionContext.setKey("request_id", "inner");
    }).value();

    expect(ExecutionContext.get("request_id")).toBe("outer");
  });
});
