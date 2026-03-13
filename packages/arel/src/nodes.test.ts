import { describe, it, expect } from "vitest";
import { Table, Nodes } from "./index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("nodes", () => {
    it("every arel nodes have hash eql eqeq from same class", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("NOW()");
      const c = new Nodes.SqlLiteral("LATER()");

      expect(typeof a.hash()).toBe("number");
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
      expect(a.eql(c)).toBe(false);

      const eq1 = users.get("id").eq(1);
      const eq2 = users.get("id").eq(1);
      const neq = users.get("id").notEq(1);
      expect(eq1.eql(eq2)).toBe(true);
      expect(eq1.eql(neq)).toBe(false);
    });
  });
});
