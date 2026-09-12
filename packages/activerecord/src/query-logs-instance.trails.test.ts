import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionContext } from "@blazetrails/activesupport";
import { queryLogs } from "./query-logs-instance.js";

describe("QueryLogs ExecutionContext wiring", () => {
  beforeEach(() => {
    ExecutionContext.clear();
    queryLogs.tags = [];
    ExecutionContext.clear();
    queryLogs.cacheQueryLogTags = false;
  });

  it("clears the QueryLogs cache when the execution context changes", () => {
    const spy = vi.spyOn(queryLogs, "clearCache");
    ExecutionContext.setKey("controller", "users");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("recomputes the cached comment after the execution context changes", () => {
    queryLogs.cacheQueryLogTags = true;
    queryLogs.tags = ["application"];
    ExecutionContext.setKey("application", "active_record");

    expect(queryLogs.comment()).toBe("/*application:active_record*/");

    const suppressed = vi.spyOn(queryLogs, "clearCache").mockImplementation(() => {});
    ExecutionContext.setKey("application", "after_record");
    suppressed.mockRestore();

    expect(queryLogs.comment()).toBe("/*application:active_record*/");

    ExecutionContext.setKey("controller", "users");

    expect(queryLogs.comment()).toBe("/*application:after_record*/");
  });
});
