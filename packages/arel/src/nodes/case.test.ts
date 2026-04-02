import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";

describe("NodesTest", () => {
  const users = new Table("users");
  describe("Case", () => {
    it("sets case expression from first argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      expect(caseNode.case).toBeInstanceOf(Nodes.Attribute);
    });

    it("allows aliasing", () => {
      const node = new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")]);
      const aliased = node.as("condition");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("sets default case from second argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      const withDefault = caseNode.else("unknown");
      expect(withDefault.default).not.toBeNull();
      expect(new Visitors.ToSql().compile(withDefault)).toContain("ELSE");
    });

    it("clones case, conditions and default", () => {
      const base = new Nodes.Case(users.get("status"));
      const c1 = base.when("active", "A");
      const c2 = c1.else("Z");

      expect(c1).not.toBe(base);
      expect(c2).not.toBe(c1);

      expect(base.conditions.length).toBe(0);
      expect(c1.conditions.length).toBe(1);
      expect(c1.default).toBeNull();
      expect(c2.conditions.length).toBe(1);
      expect(c2.default).not.toBeNull();
    });

    describe("#as", () => {
      it("allows aliasing", () => {
        const node = new Nodes.Case(new Nodes.Quoted("foo"));
        const as = node.as("bar");
        expect(as).toBeInstanceOf(Nodes.As);
        expect(as.left).toBe(node);
        expect(as.right).toBeInstanceOf(Nodes.SqlLiteral);
      });
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const foo = new Nodes.Quoted("foo");
        const one = new Nodes.Quoted(1);
        const zero = new Nodes.Quoted(0);

        const c1 = new Nodes.Case(foo).when(foo, one).else(zero);
        const c2 = new Nodes.Case(foo).when(foo, one).else(zero);
        expect(c1.hash()).toBe(c2.hash());
      });

      it("is not equal with different ivars", () => {
        const foo = new Nodes.Quoted("foo");
        const bar = new Nodes.Quoted("bar");
        const one = new Nodes.Quoted(1);
        const zero = new Nodes.Quoted(0);

        const c1 = new Nodes.Case(foo).when(foo, one).else(zero);
        const c2 = new Nodes.Case(foo).when(bar, one).else(zero);
        expect(c1.hash()).not.toBe(c2.hash());
      });
    });

    describe("#clone", () => {
      it("clones case, conditions and default", () => {
        const node = new Nodes.Case(new Nodes.Quoted("foo"));
        const built = node.when("active", "A").else("Z");
        const dolly = built.clone();

        expect(dolly.conditions).toEqual(built.conditions);
        expect(dolly.conditions).not.toBe(built.conditions);
        expect(dolly.default).toBe(built.default);
        expect(dolly.case).toBe(built.case);
      });
    });

    describe("#initialize", () => {
      it("sets case expression from first argument", () => {
        const node = new Nodes.Case(new Nodes.Quoted("foo"));
        expect(node.case).toBeInstanceOf(Nodes.Quoted);
      });

      it("sets default case from second argument", () => {
        const node = new Nodes.Case(undefined, new Nodes.Quoted("bar"));
        expect(node.default).toBeInstanceOf(Nodes.Quoted);
      });
    });
  });
});
