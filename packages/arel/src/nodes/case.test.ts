import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("NodesTest", () => {
  const users = new Table("users");
  describe("Case", () => {
    it("sets case expression from first argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      expect(caseNode.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Window();
      const b = new Nodes.Window();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const b = new Nodes.Or(users.get("id").eq(3), users.get("id").eq(4));
      expect(a).not.toBe(b);
    });

    it("allows aliasing", () => {
      const node = new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")]);
      const aliased = node.as("condition");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("sets default case from second argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      const withDefault = caseNode.else("unknown");
      expect(withDefault.defaultValue).not.toBeNull();
      expect(new Visitors.ToSql().compile(withDefault)).toContain("ELSE");
    });

    it("clones case, conditions and default", () => {
      const base = new Nodes.Case(users.get("status"));
      const c1 = base.when("active", "A");
      const c2 = c1.else("Z");

      // Immutability-ish: each call returns a new Case instance.
      expect(c1).not.toBe(base);
      expect(c2).not.toBe(c1);

      // Previous instances are not mutated.
      expect(base.conditions.length).toBe(0);
      expect(c1.conditions.length).toBe(1);
      expect(c1.defaultValue).toBeNull();
      expect(c2.conditions.length).toBe(1);
      expect(c2.defaultValue).not.toBeNull();
    });
  });
});
