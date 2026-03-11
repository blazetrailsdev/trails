import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("sqlite", () => {
                    it("should handle nil", () => {
              const visitor = new Visitors.ToSql();
              const node = users.get("name").eq(null);
              expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
            });

                    it("should handle nil", () => {
              const visitor = new Visitors.ToSql();
              const node = users.get("name").eq(null);
              expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
            });

            it.todo("defaults limit to -1", () => {});

            it.todo("does not support locking", () => {});

            it.todo("does not support boolean", () => {});

            it.todo("should construct a valid generic SQL statement", () => {});

            it.todo("should handle column names on both sides", () => {});
  });
});
