import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("BoundSqlLiteralTest", () => {
  describe("equality", () => {
    it("is equal with equal components", () => {
      const node1 = new Nodes.BoundSqlLiteral("foo + ?", [2], {});
      const node2 = new Nodes.BoundSqlLiteral("foo + ?", [2], {});

      const array = [node1, node2];

      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different components", () => {
      const node1 = new Nodes.BoundSqlLiteral("foo + ?", [2], {});
      const node2 = new Nodes.BoundSqlLiteral("foo + ?", [3], {});
      const node3 = new Nodes.BoundSqlLiteral("foo + :bar", [], { bar: 2 });

      const array = [node1, node2, node3];

      expect(uniq(array).length).toBe(3);
    });
  });
});
