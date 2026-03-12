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

  describe("math", () => {
    it("compiles maximum()", () => {
      const max = users.get("age").maximum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(max)).toBe('MAX("users"."age")');
    });

    it("compiles minimum()", () => {
      const min = users.get("age").minimum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(min)).toBe('MIN("users"."age")');
    });

    it("compiles an attribute", () => {
      const attr = users.get("age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(attr)).toBe('"users"."age"');
    });

    it("compiles average()", () => {
      const avg = users.get("age").average();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(avg)).toBe('AVG("users"."age")');
    });

    it("compiles count()", () => {
      const count = users.get("age").count();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe('COUNT("users"."age")');
    });
  });
});
