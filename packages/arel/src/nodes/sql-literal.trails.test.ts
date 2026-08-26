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

  // `SqlLiteral < String` (sql_literal.rb:5), so `==` / `eql?` is `String#==`:
  // the SQL text alone decides, `retryable` (sql_literal.rb:11) plays no part,
  // and a bare String carrying the same text is equal. `Node#eql` — which
  // compares constructors and serialized fields — matches neither arm.
  it("eql? compares by sql text", () => {
    const node = new Nodes.SqlLiteral("id * 2");
    expect(node.eql("id * 2")).toBe(true);
    expect(node.eql("id * 3")).toBe(false);
    expect(node.eql(new Nodes.SqlLiteral("id * 2", { retryable: true }))).toBe(true);
    expect(node.eql(new Nodes.SqlLiteral("id * 3"))).toBe(false);
  });
});
