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
    it("maximum should be compatible with", () => {
      const max = users.get("age").maximum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(max)).toBe('MAX("users"."age")');
    });

    it("minimum should be compatible with", () => {
      const min = users.get("age").minimum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(min)).toBe('MIN("users"."age")');
    });

    it("attribute node should be compatible with", () => {
      const attr = users.get("age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(attr)).toBe('"users"."age"');
    });

    it("average should be compatible with ", () => {
      const avg = users.get("age").average();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(avg)).toBe('AVG("users"."age")');
    });

    it("count should be compatible with ", () => {
      const count = users.get("age").count();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe('COUNT("users"."age")');
    });
  });
});
