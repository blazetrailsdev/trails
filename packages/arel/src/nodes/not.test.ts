import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("not", () => {
    it("makes a NOT node", () => {
      const eq = users.get("id").eq(1);
      const not = new Nodes.Not(eq);
      expect(not).toBeInstanceOf(Nodes.Not);
      expect(not.expr).toBe(eq);
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const a = new Nodes.Not(new Nodes.Quoted("foo"));
        const b = new Nodes.Not(new Nodes.Quoted("foo"));
        expect(a.hash()).toBe(b.hash());
      });

      it("is not equal with different ivars", () => {
        const a = new Nodes.Not(new Nodes.Quoted("foo"));
        const b = new Nodes.Not(new Nodes.Quoted("baz"));
        expect(a.hash()).not.toBe(b.hash());
      });
    });

    describe("#not", () => {
      it("makes a NOT node", () => {
        const attr = users.get("id");
        const expr = attr.eq(10);
        const node = expr.not();
        expect(node).toBeInstanceOf(Nodes.Not);
        expect(node.expr).toBe(expr);
      });
    });
  });
});
