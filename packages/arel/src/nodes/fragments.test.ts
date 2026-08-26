import { describe, it, expect } from "vitest";
import { sql, Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("FragmentsTest", () => {
  describe("equality", () => {
    it("is equal with equal values", () => {
      const array = [
        new Nodes.Fragments(["foo", "bar"] as unknown as Node[]),
        new Nodes.Fragments(["foo", "bar"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different values", () => {
      const array = [
        new Nodes.Fragments(["foo"] as unknown as Node[]),
        new Nodes.Fragments(["bar"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(2);
    });

    it("can be joined with other nodes", () => {
      const fragments = new Nodes.Fragments(["foo", "bar"] as unknown as Node[]);
      const literal = sql("SELECT");
      const joinedFragments = fragments.plus(literal);

      expect(fragments.values).toEqual(["foo", "bar"]);
      expect(joinedFragments.values).toEqual(["foo", "bar", literal]);
    });

    it("fails if joined with something that is not an Arel node", () => {
      const fragments = new Nodes.Fragments();
      expect(() => fragments.plus("Not a node")).toThrow(TypeError);
    });
  });
});
