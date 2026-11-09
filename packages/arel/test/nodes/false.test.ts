import { describe, it, expect } from "vitest";
import { Nodes } from "../../lib/index.js";
import type { Node } from "../../lib/nodes/node.js";
import { uniq } from "../support/uniq.js";

describe("False", () => {
  describe("equality", () => {
    it("is equal to other false nodes", () => {
      const array = [new Nodes.False(), new Nodes.False()];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with other nodes", () => {
      const array = [new Nodes.False(), new (Nodes.Node as unknown as new () => Node)()];
      expect(uniq(array).length).toBe(2);
    });
  });
});
