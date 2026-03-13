import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Arel", () => {
  describe("bound-sql-literal", () => {
    it("is equal with equal components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1]);
      const b = new Nodes.BoundSqlLiteral("id = ?", [1]);
      expect(a.eql(b)).toBe(true);
      expect(a.hash()).toBe(b.hash());
    });

    it("is not equal with different components", () => {
      const a = new Nodes.BoundSqlLiteral("id = ?", [1]);
      const b = new Nodes.BoundSqlLiteral("id = ?", [2]);
      expect(a.eql(b)).toBe(false);
    });
  });
});
