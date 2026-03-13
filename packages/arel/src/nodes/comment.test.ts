import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("Arel", () => {
  describe("comment", () => {
    it("is not equal with different contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("CURRENT_TIMESTAMP");
      expect(a.value).not.toBe(b.value);
    });

    it("is equal with equal contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("NOW()");
      expect(a.value).toBe(b.value);
    });
  });
});
