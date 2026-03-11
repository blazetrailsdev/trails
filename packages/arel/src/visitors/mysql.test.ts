import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("mysql", () => {
                    it("should handle nil", () => {
              expect(
                users.project(star).where(users.get("name").eq(null)).toSql()
              ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NULL');
            });

                    it("should handle nulls last reversed", () => {
              const node = users.get("name").desc().nullsLast().reverse();
              expect(node).toBeInstanceOf(Nodes.NullsFirst);
              const mgr = users.project(star).order(node);
              expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS FIRST');
            });

                    it("should handle nulls first reversed", () => {
              const node = users.get("name").asc().nullsFirst().reverse();
              expect(node).toBeInstanceOf(Nodes.NullsLast);
              const mgr = users.project(star).order(node);
              expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" DESC NULLS LAST');
            });

                    it("should handle nulls last", () => {
              const mgr = users.project(star).order(users.get("name").asc().nullsLast());
              expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS LAST');
            });

                    it("should handle nulls first", () => {
              const mgr = users.project(star).order(users.get("name").asc().nullsFirst());
              expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS FIRST');
            });

                    it("can handle subqueries", () => {
              const subquery = users.project(users.get("id"));
              const node = users.get("id").in(subquery);
              const visitor = new Visitors.ToSql();
              expect(visitor.compile(node)).toContain("SELECT");
            });

                        it("should know how to visit", () => {
                  const visitor = new Visitors.ToSql();
                  const node = users.get("id").in([1, 2, 3]);
                  expect(visitor.compile(node)).toContain("IN");
                });

                    it("can handle subqueries", () => {
              const subquery = users.project(users.get("id"));
              const node = users.get("id").in(subquery);
              const visitor = new Visitors.ToSql();
              expect(visitor.compile(node)).toContain("SELECT");
            });

                        it("should know how to visit", () => {
                  const visitor = new Visitors.ToSql();
                  const node = users.get("id").in([1, 2, 3]);
                  expect(visitor.compile(node)).toContain("IN");
                });

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        it("should escape LIMIT", () => {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  const mgr = users.project(star).take(10);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  expect(mgr.toSql()).toContain("LIMIT 10");
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                });

            it.todo("defaults limit to 18446744073709551615", () => {});

            it.todo("uses DUAL for empty from", () => {});

            it.todo("defaults to FOR UPDATE when locking", () => {});

            it.todo("allows a custom string to be used as a lock", () => {});

            it.todo("concats columns", () => {});

            it.todo("concats a string", () => {});

            it.todo("should construct a valid generic SQL statement", () => {});

            it.todo("should handle column names on both sides", () => {});

            it.todo("ignores MATERIALIZED modifiers", () => {});

            it.todo("ignores NOT MATERIALIZED modifiers", () => {});
  });
});
