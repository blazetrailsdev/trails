import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  describe("not", () => {
    it("makes a NOT node", () => {
      const eq = users.get("id").eq(1);
      const not = new Nodes.Not(eq);
      expect(not).toBeInstanceOf(Nodes.Not);
      expect(not.expr).toBe(eq);
    });
  });
});
