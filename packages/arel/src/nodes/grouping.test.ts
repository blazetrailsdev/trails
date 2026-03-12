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

  describe("grouping", () => {
    it("is not equal with different ivars", () => {
      const w1 = new Nodes.Window();
      const w2 = new Nodes.Window();
      w2.order(users.get("id").asc());
      expect(w1.orders.length).not.toBe(w2.orders.length);
    });

    it("is equal with equal ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      expect(c1.name).toBe(c2.name);
    });

    it("should create Equality nodes", () => {
      const grouped = new Nodes.Grouping(users.get("id").eq(1));
      const sql = new Visitors.ToSql().compile(grouped);
      expect(sql).toBe('("users"."id" = 1)');
    });
  });
});
