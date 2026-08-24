import { describe, it, expect } from "vitest";
import { Table, InsertManager, Nodes } from "./index.js";

// TS-only coverage for `InsertManager#insert`'s and `#select`'s AST bookkeeping.
// Rails asserts these arms only indirectly, through the SQL the manager renders.
describe("InsertManagerTest (trails)", () => {
  const users = new Table("users");
  const posts = new Table("posts");

  it("returns empty array before insert", () => {
    const manager = new InsertManager();
    expect(manager.columns).toEqual([]);
  });

  // Mirrors Rails: `Arel::InsertManager#insert` (insert_manager.rb).
  describe("insert (Rails parity)", () => {
    it("is a no-op for an empty fields array", () => {
      const mgr = new InsertManager();
      mgr.insert([]);
      expect(mgr.ast.values).toBeNull();
      expect(mgr.ast.relation).toBeNull();
      expect(mgr.ast.columns).toEqual([]);
    });

    it("stores a string `fields` value as a SqlLiteral on ast.values", () => {
      const mgr = new InsertManager(users);
      mgr.insert("foo");
      expect(mgr.ast.values).toBeInstanceOf(Nodes.SqlLiteral);
      expect((mgr.ast.values as Nodes.SqlLiteral).value).toBe("foo");
    });

    it("infers ast.relation from the first column when not yet set", () => {
      const mgr = new InsertManager();
      mgr.insert([[users.get("name"), "alice"]]);
      expect(mgr.ast.relation).toBe(users);
    });

    it("preserves an explicit ast.relation rather than inferring", () => {
      const mgr = new InsertManager(posts);
      mgr.insert([[users.get("name"), "alice"]]);
      expect(mgr.ast.relation).toBe(posts);
    });
  });

  // Mirrors Rails: `InsertManager#select` stores the manager itself
  // (insert_manager.rb), not its inner `.ast`. The visitor handles
  // the SelectManager-shaped duck-type via `visit`.
  describe("select (Rails parity)", () => {
    it("stores the SelectManager itself on ast.select", () => {
      const mgr = new InsertManager(users);
      mgr.ast.columns = [users.get("name")];
      const selectMgr = posts.project(posts.get("title"));
      mgr.select(selectMgr);
      expect(mgr.ast.select).toBe(selectMgr);
      expect(mgr.toSql()).toContain("SELECT");
    });
  });
});
