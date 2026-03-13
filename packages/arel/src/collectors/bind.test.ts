import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("Arel", () => {
  describe("bind", () => {
    it("compile gathers all bind params", () => {
      const bind = new Collectors.Bind();
      bind.append("SELECT * FROM users WHERE id = ");
      bind.addBind(42);
      bind.append(" AND name = ");
      bind.addBind("dean");
      const [sql, binds] = bind.value;
      expect(sql).toBe("SELECT * FROM users WHERE id = ? AND name = ?");
      expect(binds).toEqual([42, "dean"]);
    });
  });
});
