import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionContext } from "@blazetrails/activesupport";
import { queryLogs } from "./query-logs-instance.js";

describe("QueryLogs ExecutionContext wiring", () => {
  beforeEach(() => {
    ExecutionContext.clear();
    queryLogs.tags = [];
    queryLogs.clearContext();
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
    queryLogs.updateContext({ application: "active_record" });

    expect(queryLogs.comment()).toBe("/*application:active_record*/");

    (queryLogs as unknown as { _context: Record<string, unknown> })._context.application =
      "after_record";

    expect(queryLogs.comment()).toBe("/*application:active_record*/");

    ExecutionContext.setKey("controller", "users");

    expect(queryLogs.comment()).toBe("/*application:after_record*/");
  });
});
