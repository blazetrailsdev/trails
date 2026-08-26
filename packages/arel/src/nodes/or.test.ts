import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel", () => {
  describe("or", () => {
    describe("#or", () => {
      it("makes an OR node", () => {
        const attr = new Table("users").get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.or(right);
        expect((node.expr as Nodes.Or).left).toBe(left);
        expect((node.expr as Nodes.Or).right).toBe(right);

        const oror = node.or(right) as Nodes.Grouping;
        expect((oror.expr as Nodes.Or).left).toBe(node);
        expect((oror.expr as Nodes.Or).right).toBe(right);
      });
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
  });
});
