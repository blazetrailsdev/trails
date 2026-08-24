import { describe, it, expect, vi, afterEach } from "vitest";
import { Table, UpdateManager, DeleteManager, SelectManager } from "./index.js";

describe("crud (trails)", () => {
  const users = new Table("users");

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
