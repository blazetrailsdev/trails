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

  describe("window", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.Extract(users.get("created_at"), "YEAR");
      const b = new Nodes.Extract(users.get("created_at"), "YEAR");
      expect(a.field).toBe(b.field);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("name").as("n");
      const b = users.get("name").as("m");
      expect((a.right as Nodes.SqlLiteral).value).not.toBe((b.right as Nodes.SqlLiteral).value);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const b = new Nodes.Grouping(new Nodes.Quoted("foo"));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      expect(a).not.toBe(b);
    });

    it("is equal to other current row nodes", () => {
      const a = new Nodes.CurrentRow();
      const b = new Nodes.CurrentRow();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.Distinct();
      expect(a).not.toBeInstanceOf(Nodes.True);
    });
  });
});
