import { describe, it, expect } from "vitest";
import { uniq } from "../test-helpers/uniq.js";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";

describe("And", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [
        new Nodes.And(["foo", "bar"] as unknown as Node[]),
        new Nodes.And(["foo", "bar"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [
        new Nodes.And(["foo", "bar"] as unknown as Node[]),
        new Nodes.And(["foo", "baz"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe("functions as node expression", () => {
    it("allows aliasing", () => {
      const aliased = new Nodes.And(["foo", "bar"] as unknown as Node[]).as("baz") as Nodes.As;

      expect(aliased).toBeInstanceOf(Nodes.As);
      expect(aliased.right).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });
});
