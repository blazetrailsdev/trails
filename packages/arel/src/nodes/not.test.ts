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

    it("is equal with equal ivars", () => {
      const s1 = new Nodes.SelectStatement();
      const s2 = new Nodes.SelectStatement();
      expect(s1.cores.length).toBe(s2.cores.length);
      expect(s1.limit).toBe(s2.limit);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.DeleteStatement();
      const s2 = new Nodes.DeleteStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });

    describe("equality", () => {
      it.skip("is equal with equal ivars");

      it.skip("is not equal with different ivars");
    });

    describe("#not", () => {
      it.skip("makes a NOT node");
    });
  });
});
