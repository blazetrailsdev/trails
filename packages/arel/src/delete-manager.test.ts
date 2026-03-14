import { describe, it, expect } from "vitest";
import { Table, DeleteManager } from "./index.js";

describe("DeleteManagerTest", () => {
  const users = new Table("users");
  describe("from", () => {
    it("uses from", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      expect(mgr.toSql()).toContain('DELETE FROM "users"');
    });
  });

  describe("where", () => {
    it("uses where values", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toBe('DELETE FROM "users" WHERE "users"."id" = 1');
    });

    it("chains", () => {
      const mgr = new DeleteManager();
      expect(mgr.from(users)).toBe(mgr);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });

  it("handles limit properly", () => {
    const mgr = new DeleteManager();
    mgr.from(users);
    mgr.where(users.get("active").eq(false));
    mgr.order(users.get("created_at").asc());
    mgr.take(10);
    expect(mgr.toSql()).toBe(
      'DELETE FROM "users" WHERE "users"."active" = FALSE ORDER BY "users"."created_at" ASC LIMIT 10',
    );
  });

  it("wheres getter returns WHERE conditions", () => {
    const manager = new DeleteManager();
    manager.from(users);
    manager.where(users.attr("id").eq(1));
    expect(manager.wheres.length).toBe(1);
  });
});
