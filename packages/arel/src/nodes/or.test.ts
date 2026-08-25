import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("or", () => {
    it("makes an OR node", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      const or = new Nodes.Or([a, b]);
      expect(or).toBeInstanceOf(Nodes.Or);
      expect(or.left).toBe(a);
      expect(or.right).toBe(b);
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const array = [
          new Nodes.Or(["foo", "bar"] as unknown as [Node, Node]),
          new Nodes.Or(["foo", "bar"] as unknown as [Node, Node]),
        ];
        expect(uniq(array).length).toBe(1);
      });

      it("is not equal with different ivars", () => {
        const array = [
          new Nodes.Or(["foo", "bar"] as unknown as [Node, Node]),
          new Nodes.Or(["foo", "baz"] as unknown as [Node, Node]),
        ];
        expect(uniq(array).length).toBe(2);
      });
    });

    describe("#or", () => {
      it("makes an OR node", () => {
        const attr = users.get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.or(right);
        const grouping = node;
        const orNode = grouping.expr as Nodes.Or;
        expect(orNode.left).toBe(left);
        expect(orNode.right).toBe(right);
      });
    });
  });
});
