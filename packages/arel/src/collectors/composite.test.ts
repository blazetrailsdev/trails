import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("Arel", () => {
  describe("composite", () => {
    it("composite collector performs multiple collections at once", () => {
      const sql = new Collectors.SQLString();
      const binds = new Collectors.Bind();
      const composite = new Collectors.Composite(sql, binds);

      composite.append("SELECT ");
      composite.addBind(123);

      expect(sql.value).toBe("SELECT ?");
      expect(sql.bindValues).toEqual([123]);
      expect(binds.value).toEqual(["SELECT ?", [123]]);
    });

    it("retryable on composite collector propagates", () => {
      const sql = new Collectors.SQLString();
      const binds = new Collectors.Bind();
      const composite = new Collectors.Composite(sql, binds);

      expect(composite.retryable).toBe(true);
      sql.retryable = false;
      expect(composite.retryable).toBe(false);

      composite.retryable = true;
      expect(sql.retryable).toBe(true);
    });
  });
});
