import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Arel", () => {
  describe("true", () => {
    it("is equal to other true nodes", () => {
      const a = new Nodes.True();
      const b = new Nodes.True();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.CurrentRow();
      expect(a).not.toBeInstanceOf(Nodes.Preceding);
    });
  });
});
