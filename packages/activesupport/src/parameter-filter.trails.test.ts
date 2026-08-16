import { describe, it, expect } from "vitest";
import { ParameterFilter } from "./parameter-filter.js";

/**
 * Behaviour Rails asserts inside its own `test "process parameter filter"`
 * table (parameter_filter_test.rb:8-44) — deep dot-notation keys and block
 * filters — kept here so the enrolled test names stay Rails' own.
 */
describe("ParameterFilter (trails)", () => {
  it("filters a deep key only under its parent", () => {
    const f = new ParameterFilter(["credit_card.code"]);
    const result = f.filter({
      credit_card: { code: "xxxx", number: "1" },
      file: { code: "xxxx" },
    });
    expect((result.credit_card as Record<string, unknown>).code).toBe("[FILTERED]");
    expect((result.credit_card as Record<string, unknown>).number).toBe("1");
    expect((result.file as Record<string, unknown>).code).toBe("xxxx");
  });

  it("passes each key and value to a block filter", () => {
    const seen: string[] = [];
    const f = new ParameterFilter([
      (key: string, value: unknown) => {
        seen.push(key);
        return key === "secret" ? String(value).split("").reverse().join("") : undefined;
      },
    ]);
    const result = f.filter({ secret: "abc", other: "abc" });
    expect(result.secret).toBe("cba");
    expect(result.other).toBe("abc");
    expect(seen).toEqual(["secret", "other"]);
  });
});
