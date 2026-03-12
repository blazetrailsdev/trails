import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("extract", () => {
                it("should extract field", () => {
          const createdAt = users.get("created_at");
          const node = new Nodes.Extract(createdAt, "YEAR");
          const visitor = new Visitors.ToSql();
          const sql = visitor.compile(node);
          expect(sql).toBe('EXTRACT(YEAR FROM "users"."created_at")');
        });

                it("should alias the extract", () => {
          const createdAt = users.get("created_at");
          const node = new Nodes.Extract(createdAt, "MONTH").as("birth_month");
          const visitor = new Visitors.ToSql();
          const sql = visitor.compile(node);
          expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at") AS birth_month');
        });

                it("should not mutate the extract", () => {
          const original = new Nodes.Extract(users.get("created_at"), "YEAR");
          const aliased = original.as("y");
          // Original should remain unchanged (aliased is a new As node)
          expect(original).toBeInstanceOf(Nodes.Extract);
          expect(aliased).toBeInstanceOf(Nodes.As);
        });

                it("is equal with equal ivars", () => {
          const a = new Nodes.TableAlias(users, "u");
          const b = new Nodes.TableAlias(users, "u");
          expect(a.name).toBe(b.name);
          expect(a.relation).toBe(b.relation);
        });

                it("is not equal with different ivars", () => {
          const a = new Nodes.Not(users.get("id").eq(1));
          const b = new Nodes.Not(users.get("id").eq(2));
          expect(a).not.toBe(b);
        });
  });
});
