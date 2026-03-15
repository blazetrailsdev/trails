import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("or", () => {
    it("makes an OR node", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      const or = new Nodes.Or(a, b);
      expect(or).toBeInstanceOf(Nodes.Or);
      expect(or.left).toBe(a);
      expect(or.right).toBe(b);
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const a = new Nodes.Or(new Nodes.Quoted("foo"), new Nodes.Quoted("bar"));
        const b = new Nodes.Or(new Nodes.Quoted("foo"), new Nodes.Quoted("bar"));
        expect(a.hash()).toBe(b.hash());
      });

      it("is not equal with different ivars", () => {
        const a = new Nodes.Or(new Nodes.Quoted("foo"), new Nodes.Quoted("bar"));
        const b = new Nodes.Or(new Nodes.Quoted("foo"), new Nodes.Quoted("baz"));
        expect(a.hash()).not.toBe(b.hash());
      });
    });

    describe("#or", () => {
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
  });
});
