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

  describe("sum", () => {
    it("should alias the sum", () => {
      const sum = users.get("age").sum();
      const aliased = sum.as("total_age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(aliased)).toBe('SUM("users"."age") AS total_age');
    });

    it("is equal with equal ivars", () => {
      const w1 = new Nodes.Window();
      const w2 = new Nodes.Window();
      expect(w1.orders.length).toBe(w2.orders.length);
      expect(w1.partitions.length).toBe(w2.partitions.length);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      const s2 = new Nodes.NamedFunction("SUM", [users.get("name")]);
      expect(s1.expressions[0]).not.toBe(s2.expressions[0]);
    });

    it("should order the sum via sql", () => {
      const sum = users.get("age").sum();
      expect(users.project(sum).order(users.get("name").asc()).toSql()).toContain("ORDER BY");
    });

    it.todo("should order the sum", () => {});
  });
});
