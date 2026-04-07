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

  describe("HomogeneousIn visitor", () => {
    it("compiles IN with values", () => {
      const node = new Nodes.HomogeneousIn([1, 2, 3], users.get("id"), "in");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("compiles NOT IN with values", () => {
      const node = new Nodes.HomogeneousIn([4, 5], users.get("id"), "notin");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."id" NOT IN (4, 5)');
    });

    it("compiles empty IN as 1=0", () => {
      const node = new Nodes.HomogeneousIn([], users.get("id"), "in");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=0");
    });

    it("compiles empty NOT IN as 1=1", () => {
      const node = new Nodes.HomogeneousIn([], users.get("id"), "notin");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=1");
    });

    it("compiles string values", () => {
      const node = new Nodes.HomogeneousIn(["a", "b"], users.get("name"), "in");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("\"users\".\"name\" IN ('a', 'b')");
    });
  });
});
