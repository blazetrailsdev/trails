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
