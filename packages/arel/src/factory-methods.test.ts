import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("factory-methods", () => {
                it("create join", () => {
          const join = users.createJoin(posts, users.attr("id").eq(posts.attr("user_id")));
          expect(join).toBeInstanceOf(Nodes.InnerJoin);
        });

                it("create table alias", () => {
          const aliased = users.alias("u");
          expect(aliased).toBeInstanceOf(Nodes.TableAlias);
          expect(aliased.name).toBe("u");
        });

                it("create and", () => {
          const and = users.createAnd([users.get("id").eq(1), users.get("name").eq("dean")]);
          expect(and).toBeInstanceOf(Nodes.And);
          expect(and.children.length).toBe(2);
        });

                it("create string join", () => {
          const join = users.createStringJoin("INNER JOIN posts ON posts.user_id = users.id");
          expect(join).toBeInstanceOf(Nodes.StringJoin);
        });

                it("grouping", () => {
          const g = users.grouping(users.get("id").eq(1));
          expect(g).toBeInstanceOf(Nodes.Grouping);
        });

                it("create on", () => {
          const on = users.createOn(users.attr("id").eq(posts.attr("user_id")));
          expect(on).toBeInstanceOf(Nodes.On);
        });

                it("lower", () => {
          const fn = users.lower(users.get("name"));
          expect(fn).toBeInstanceOf(Nodes.NamedFunction);
          expect(fn.name).toBe("LOWER");
        });

                it("coalesce", () => {
          const fn = users.coalesce(users.get("name"), new Nodes.Quoted("default"));
          expect(fn).toBeInstanceOf(Nodes.NamedFunction);
          expect(fn.name).toBe("COALESCE");
        });

                it("cast", () => {
          const fn = users.cast(users.get("age"), "VARCHAR");
          expect(fn).toBeInstanceOf(Nodes.NamedFunction);
          expect(fn.name).toBe("CAST");
        });

                it("create join", () => {
          const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
          expect(join).toBeInstanceOf(Nodes.InnerJoin);
        });

                it("create table alias", () => {
          const alias = users.alias("u");
          expect(alias).toBeInstanceOf(Nodes.TableAlias);
          expect(alias.name).toBe("u");
        });

                it("create string join", () => {
          const join = users.createStringJoin("INNER JOIN posts ON posts.user_id = users.id");
          expect(join).toBeInstanceOf(Nodes.StringJoin);
        });

                it("create on", () => {
          const on = users.createOn(users.get("id").eq(posts.get("user_id")));
          expect(on).toBeInstanceOf(Nodes.On);
        });

            it.todo("create true", () => {});

            it.todo("create false", () => {});
  });
});
