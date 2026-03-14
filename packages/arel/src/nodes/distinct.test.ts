import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Distinct", () => {
  describe("equality", () => {
    it("is equal to other distinct nodes", () => {
      const a = new Nodes.Distinct();
      const b = new Nodes.Distinct();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.False();
      expect(a).not.toBeInstanceOf(Nodes.True);
    });
  });
});
