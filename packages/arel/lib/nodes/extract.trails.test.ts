import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::ExtractTest", () => {
  const users = new Table("users");
  it("uppercases a lowercase field to match Rails", () => {
    const createdAt = users.get("created_at");
    const node = new Nodes.Extract(createdAt, "month");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
    expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at")');
  });

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
