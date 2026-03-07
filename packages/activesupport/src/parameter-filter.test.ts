import { describe, it, expect } from "vitest";
import { ParameterFilter } from "./parameter-filter.js";

describe("ParameterFilterTest", () => {
  it("process parameter filter", () => {
    const f = new ParameterFilter(["password", "credit_card"]);
    const result = f.filter({ username: "alice", password: "secret", credit_card: "4111111111111111" });
    expect(result.username).toBe("alice");
    expect(result.password).toBe("[FILTERED]");
    expect(result.credit_card).toBe("[FILTERED]");
  });

  it("filter should return mask option when value is filtered", () => {
    const f = new ParameterFilter(["secret"], { mask: "[REDACTED]" });
    const result = f.filter({ secret: "mySecret", name: "bob" });
    expect(result.secret).toBe("[REDACTED]");
    expect(result.name).toBe("bob");
  });

  it("filter_param", () => {
    const f = new ParameterFilter(["password"]);
    expect(f.filterParam("password", "hunter2")).toBe("[FILTERED]");
    expect(f.filterParam("username", "alice")).toBe("alice");
  });

  it("filter_param can work with empty filters", () => {
    const f = new ParameterFilter([]);
    expect(f.filterParam("password", "hunter2")).toBe("hunter2");
    expect(f.filterParam("anything", "value")).toBe("value");
  });

  it("parameter filter should maintain hash with indifferent access", () => {
    const f = new ParameterFilter(["token"]);
    const result = f.filter({ token: "abc123", data: "visible" });
    expect(result["token"]).toBe("[FILTERED]");
    expect(result["data"]).toBe("visible");
  });

  it("filter_param should return mask option when value is filtered", () => {
    const f = new ParameterFilter(["key"], { mask: "[HIDDEN]" });
    expect(f.filterParam("key", "value")).toBe("[HIDDEN]");
  });

  it("process parameter filter with hash having integer keys", () => {
    const f = new ParameterFilter(["secret"]);
    const params: Record<string, unknown> = { "0": "public", secret: "hidden" };
    const result = f.filter(params);
    expect(result["0"]).toBe("public");
    expect(result["secret"]).toBe("[FILTERED]");
  });

  it("precompile_filters", () => {
    // ParameterFilter supports regexp filters which are effectively pre-compiled
    const f = new ParameterFilter([/password/i, /token/i]);
    const result = f.filter({ Password: "secret", access_token: "abc", username: "alice" });
    expect(result["Password"]).toBe("[FILTERED]");
    expect(result["access_token"]).toBe("[FILTERED]");
    expect(result["username"]).toBe("alice");
  });
});
