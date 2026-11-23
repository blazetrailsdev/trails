import { describe, it, expect, vi, afterEach } from "vitest";
import { Table, UpdateManager, DeleteManager, SelectManager } from "../lib/index.js";

describe("crud (trails)", () => {
  const users = new Table("users");

  describe("compileUpdate / compileDelete key assignment", () => {
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

  describe("compileUpdate / compileDelete comment", () => {
    it("compileUpdate carries the select comment into the UPDATE", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1)).comment("x");
      const um = mgr.compileUpdate([[users.get("name"), "a"]], null);
      expect(um.ast.comment).toBe(mgr.comment());
      expect(um.toSql()).toMatch(/ \/\* x \*\/$/);
    });

    it("compileDelete carries the select comment into the DELETE", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1)).comment("x");
      const dm = mgr.compileDelete(null);
      expect(dm.ast.comment).toBe(mgr.comment());
      expect(dm.toSql()).toMatch(/ \/\* x \*\/$/);
    });
  });
});
