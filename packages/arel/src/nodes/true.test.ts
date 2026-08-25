import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("True", () => {
  describe("equality", () => {
    it("is equal to other true nodes", () => {
      const array = [new Nodes.True(), new Nodes.True()];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with other nodes", () => {
      const array = [new Nodes.True(), new (Nodes.Node as unknown as new () => Node)()];
      expect(uniq(array).length).toBe(2);
    });
  });
});
