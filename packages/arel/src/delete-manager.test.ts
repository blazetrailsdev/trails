import { describe, it, expect, beforeEach } from "vitest";
import { Table, sql, star, SelectManager, InsertManager, UpdateManager, DeleteManager, Nodes, Visitors, Collectors } from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("delete-manager", () => {
                it("handles limit properly", () => {
          const mgr = new UpdateManager();
          mgr.table(users);
          mgr.set([[users.get("active"), false]]);
          mgr.where(users.get("age").lt(18));
          mgr.order(users.get("name").asc());
          mgr.take(5);
          expect(mgr.toSql()).toContain("LIMIT 5");
        });

                it("uses from", () => {
          const mgr = new DeleteManager();
          mgr.from(users);
          expect(mgr.toSql()).toContain('DELETE FROM "users"');
        });

                it("uses where values", () => {
          const mgr = new DeleteManager();
          mgr.from(users);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toBe('DELETE FROM "users" WHERE "users"."id" = 1');
        });

                it("uses where values", () => {
          const mgr = new DeleteManager();
          mgr.from(users);
          mgr.where(users.get("id").eq(1));
          expect(mgr.toSql()).toBe(
            'DELETE FROM "users" WHERE "users"."id" = 1'
          );
        });

                it("chaining returns the manager", () => {
          const mgr = new DeleteManager();
          expect(mgr.from(users)).toBe(mgr);
          expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
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

                it("wheres getter returns WHERE conditions", () => {
          const manager = new DeleteManager();
          manager.from(users);
          manager.where(users.attr("id").eq(1));
          expect(manager.wheres.length).toBe(1);
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
  });
});
