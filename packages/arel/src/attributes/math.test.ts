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

    it("should handle Addition", () => {
      expect(users.project(users.get("age").add(1).as("next")).toSql()).toBe(
        'SELECT "users"."age" + 1 AS next FROM "users"',
      );
    });

    it("should handle Subtraction", () => {
      expect(users.project(users.get("age").subtract(1).as("prev")).toSql()).toBe(
        'SELECT "users"."age" - 1 AS prev FROM "users"',
      );
    });

    it("should handle Multiplication", () => {
      expect(users.project(users.get("age").multiply(2).as("double")).toSql()).toBe(
        'SELECT "users"."age" * 2 AS double FROM "users"',
      );
    });

    it("should handle Division", () => {
      expect(users.project(users.get("age").divide(2).as("half")).toSql()).toBe(
        'SELECT "users"."age" / 2 AS half FROM "users"',
      );
    });

    it.todo("average should be compatible with ", () => {});

    it.todo("count should be compatible with ", () => {});
  });
});
