import { describe, it, expect, vi, afterEach } from "vitest";
import { Table, UpdateManager, DeleteManager, SelectManager } from "./index.js";

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
});
