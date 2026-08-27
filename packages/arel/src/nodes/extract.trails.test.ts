import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::ExtractTest", () => {
  const users = new Table("users");
  it("uppercases a lowercase field to match Rails", () => {
    // Rails' visit_Arel_Nodes_Extract does `o.field.to_s.upcase`, so the
    // field identifier in the emitted SQL is always uppercased regardless
    // of how it was constructed.
    const createdAt = users.get("created_at");
    const node = new Nodes.Extract(createdAt, "month");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
    expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at")');
  });

  // Mirrors Rails: `Expressions#extract` calls `Nodes::Extract.new [self], field`,
  // wrapping the receiver in an array (expressions.rb). The visitor renders
  // the array via `inject_join`, so a single-element array still produces
  // the same SQL as a bare expression.
  it("expressions.extract wraps the receiver in an array", () => {
    const createdAt = users.get("created_at");
    const node = createdAt.extract("year");
    expect(Array.isArray(node.expr)).toBe(true);
    expect((node.expr as Nodes.Node[])[0]).toBe(createdAt);
    expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
      'EXTRACT(YEAR FROM "users"."created_at")',
    );
  });
});
