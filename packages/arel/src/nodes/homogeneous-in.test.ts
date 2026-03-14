import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel::Nodes::HomogeneousInTest", () => {
  const users = new Table("users");
  it("in", () => {
    const node = users.get("id").in([1, 2, 3]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('"users"."id" IN (1, 2, 3)');
  });

  it("custom attribute node", () => {
    const attr = new Nodes.Attribute(users, "id");
    const node = attr.in([1, 2]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain('"users"."id" IN');
  });
});
