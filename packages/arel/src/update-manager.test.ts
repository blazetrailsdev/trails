import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("update-manager", () => {
                it("should not quote sql literals", () => {
          const node = new Nodes.SqlLiteral("NOW()");
          expect(visitor.compile(node)).toBe("NOW()");
        });

                it("handles limit properly", () => {
          const mgr = new DeleteManager();
          mgr.from(users);
          mgr.where(users.get("active").eq(false));
          mgr.order(users.get("created_at").asc());
          mgr.take(10);
          expect(mgr.toSql()).toBe(
            'DELETE FROM "users" WHERE "users"."active" = FALSE ORDER BY "users"."created_at" ASC LIMIT 10'
          );
        });

                it("sets having", () => {
          const um = new UpdateManager();
          um.table(users);
          um.having(users.get("id").gt(0));
          expect(um.ast.havings.length).toBe(1);
        });

                it("adds columns to the AST when group value is a String", () => {
          const um = new UpdateManager();
          um.table(users);
          um.group("name");
          expect(um.ast.groups.length).toBe(1);
        });

                it("adds columns to the AST when group value is a Symbol", () => {
          const um = new UpdateManager();
          um.table(users);
          um.group(users.get("name"));
          expect(um.ast.groups.length).toBe(1);
        });

                it("updates with null", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("name"), null]]);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toContain("= NULL");
        });

                it("takes a string", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("name"), "test"]]);
          expect(mgr.toSql()).toContain("test");
        });

                it("generates an update statement", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("name"), "dean"]]);
          expect(mgr.toSql()).toContain("UPDATE");
        });

                it("generates an update statement with joins", () => {
          const um = new UpdateManager();
          um.table(users);
          um.set([[users.get("name"), "bob"]]);
          const sql = um.toSql();
          expect(sql).toContain("UPDATE");
          expect(sql).toContain("SET");
        });

                it("generates a where clause", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("name"), "dean"]]);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toContain("WHERE");
        });

                it("can be set", () => {
          const manager = new UpdateManager();
          manager.table(users);
          manager.key(users.attr("id").eq(1));
          expect(manager.ast.key).not.toBeNull();
        });

                it("can be accessed", () => {
          const um = new UpdateManager();
          um.table(users);
          um.where(users.get("id").eq(1));
          expect(um.wheres.length).toBe(1);
        });

                it("generates a where clause", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([
            [users.get("name"), "dean"],
            [users.get("age"), 31],
          ]);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toBe(
            `UPDATE "users" SET "users"."name" = 'dean', "users"."age" = 31 WHERE "users"."id" = 1`
          );
        });

                it("updates with null", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("name"), null]]);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toContain("= NULL");
        });

                it("UPDATE with ORDER BY and LIMIT", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("active"), false]]);
          mgr.where(users.get("age").lt(18));
          mgr.order(users.get("name").asc());
          mgr.take(5);
          expect(mgr.toSql()).toBe(
            `UPDATE "users" SET "users"."active" = FALSE WHERE "users"."age" < 18 ORDER BY "users"."name" ASC LIMIT 5`
          );
        });

                it("wheres getter returns WHERE conditions", () => {
          const manager = new UpdateManager();
          manager.table(users);
          manager.where(users.attr("id").eq(1));
          expect(manager.wheres.length).toBe(1);
        });

                it("should handle false", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("active"), false]]);
          expect(mgr.toSql()).toContain("FALSE");
        });

                    it("chains", () => {
              const mgr = new UpdateManager();
              mgr.table(users);
              expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
            });

                    it("chains", () => {
              const mgr = new UpdateManager();
              mgr.table(users);
              expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
            });

                    it("chains", () => {
              const mgr = new UpdateManager();
              mgr.table(users);
              expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
            });

                    it("takes a list of lists", () => {
              const im = new InsertManager();
              im.into(users);
              const vl = im.createValuesList([
                [new Nodes.Quoted("alice")],
                [new Nodes.Quoted("bob")],
              ]);
              im.values(vl);
              im.ast.columns = [users.get("name")];
              const sql = im.toSql();
              expect(sql).toContain("VALUES");
            });
  });
});
