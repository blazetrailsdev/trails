import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("not", () => {
    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const array = [
          new Nodes.Not("foo" as unknown as Node),
          new Nodes.Not("foo" as unknown as Node),
        ];
        expect(uniq(array).length).toBe(1);
      });

      it("is not equal with different ivars", () => {
        const array = [
          new Nodes.Not("foo" as unknown as Node),
          new Nodes.Not("baz" as unknown as Node),
        ];
        expect(uniq(array).length).toBe(2);
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
