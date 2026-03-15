import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("equality", () => {
    it("takes an engine", () => {
      const eq = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      expect(eq.left).toBeInstanceOf(Nodes.Attribute);
      expect(eq.right).toBeInstanceOf(Nodes.Quoted);
    });

    it("makes an OR node", () => {
      const eq1 = users.get("id").eq(1);
      const eq2 = users.get("id").eq(2);
      const or = eq1.or(eq2);
      expect(or).toBeInstanceOf(Nodes.Grouping);
    });

    it("makes and AND node", () => {
      const eq = users.get("id").eq(1);
      const result = eq.and(users.get("name").eq("bob"));
      expect(result).toBeInstanceOf(Nodes.And);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Equality("foo", "bar");
      const b = new Nodes.Equality("foo", "bar");
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Equality("foo", "bar");
      const b = new Nodes.Equality("foo", "baz");
      expect(a.hash()).not.toBe(b.hash());
    });

    describe("and", () => {
      it("makes and AND node", () => {
        const attr = users.get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.and(right);
        expect(node).toBeInstanceOf(Nodes.And);
        expect(node.children).toContain(left);
        expect(node.children).toContain(right);
      });
    });

    describe("or", () => {
      it("makes an OR node", () => {
        const attr = users.get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.or(right);
        const grouping = node as Nodes.Grouping;
        const orNode = grouping.expr as Nodes.Or;
        expect(orNode.left).toBe(left);
        expect(orNode.right).toBe(right);
      });
    });

    describe("backwards compat", () => {
      describe("to_sql", () => {
        it("takes an engine", () => {
          const attr = users.get("id");
          const test = attr.eq(10);
          const sql = new Visitors.ToSql().compile(test);
          expect(sql).toContain('"users"."id"');
          expect(sql).toContain("10");
        });
      });
    });
  });
});
