import { describe, it, expect, vi, afterEach } from "vitest";
import { Table, InsertManager, UpdateManager, DeleteManager, SelectManager } from "./index.js";

describe("crud", () => {
  const users = new Table("users");

  describe("insert", () => {
    it("should call insert on the connection", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      expect(mgr.toSql()).toContain('INSERT INTO "users"');
    });
  });

  describe("update", () => {
    it("should call update on the connection", () => {
      const mgr = new UpdateManager();
      mgr
        .table(users)
        .set([[users.get("name"), "sam"]])
        .where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain('UPDATE "users"');
    });
  });

  describe("delete", () => {
    it("should call delete on the connection", () => {
      const mgr = new DeleteManager();
      mgr.from(users).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain('DELETE FROM "users"');
    });
  });

  describe("compileUpdate / compileDelete key assignment", () => {
    // Mirrors Rails Arel::Crud (activerecord/lib/arel/crud.rb): `um.key = key`
    // and `dm.key = key` are unconditional for Rails parity, so `null` is
    // assigned explicitly rather than being skipped. We spy on the setter
    // because the underlying statement initializes `key` to `null`, so a
    // post-hoc `manager.key === null` check would pass even with the prior
    // `if (key !== null)` guard in place.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("compileUpdate always assigns key, including null", () => {
      const setKey = vi.spyOn(UpdateManager.prototype, "key", "set");
      const mgr = new SelectManager(users);
      mgr.compileUpdate([[users.get("id"), 1]], null);
      expect(setKey).toHaveBeenCalledWith(null);
    });

    it("compileDelete always assigns key, including null", () => {
      const setKey = vi.spyOn(DeleteManager.prototype, "key", "set");
      const mgr = new SelectManager(users);
      mgr.compileDelete(null);
      expect(setKey).toHaveBeenCalledWith(null);
    });
  });
});
