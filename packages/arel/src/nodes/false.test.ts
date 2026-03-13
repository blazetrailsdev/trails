import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Arel", () => {
  describe("false", () => {
    it("is equal to other false nodes", () => {
      const a = new Nodes.False();
      const b = new Nodes.False();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.True();
      expect(a).not.toBeInstanceOf(Nodes.False);
    });
  });
});
