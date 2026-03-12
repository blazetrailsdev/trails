import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

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
