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

  describe("count", () => {
    it("should alias the count", () => {
      const count = users.get("id").count();
      const aliased = count.as("user_count");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(aliased)).toBe('COUNT("users"."id") AS user_count');
    });

    it("should compare the count", () => {
      const count = users.get("id").count();
      expect(count.name).toBe("COUNT");
    });

    it("is equal with equal ivars", () => {
      const rel = users.project(users.get("id")).ast;
      const a = new Nodes.Cte("cte", rel);
      const b = new Nodes.Cte("cte", rel);
      expect(a.name).toBe(b.name);
      expect(a.relation).toBe(b.relation);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "v");
      expect(a.name).not.toBe(b.name);
    });
  });
});
