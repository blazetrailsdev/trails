/**
 * Trails-only coverage for SqlLiteral, alongside the Rails mirror in
 * sql-literal.test.ts.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("SqlLiteralTest (trails)", () => {
  // Rails' SqlLiteral IS a String subclass, so `to_s` is the SQL text. TS has no
  // String subclass, so the port needs an explicit `toString` for every caller
  // that leans on it — `resolve_attribute_name` (attribute_registration.rb:102)
  // and `in_order_of`'s `column.to_s` (query_methods.rb:724) both do.
  it("to_s returns the sql text", () => {
    const node = new Nodes.SqlLiteral("id * 2");
    expect(node.toString()).toBe("id * 2");
    expect(String(node)).toBe("id * 2");
    expect(`${node}`).toBe("id * 2");
  });
});
