import { describe, it, expect } from "vitest";
import { Table, UpdateManager, Nodes } from "./index.js";

describe("UpdateManagerTest (trails)", () => {
  const users = new Table("users");

  describe("UnqualifiedColumn", () => {
    it("renders without a table qualifier on the RHS of an UPDATE SET", () => {
      const posts = new Table("posts");
      const counter = posts.get("counter");
      const unqual = new Nodes.UnqualifiedColumn(counter);
      const coalesced = new Nodes.NamedFunction("COALESCE", [unqual, new Nodes.Quoted(0)]);
      const expr = new Nodes.Addition(coalesced, new Nodes.Quoted(1));

      const um = new UpdateManager();
      um.table(posts);
      um.set([[counter, expr]]);
      const sql = um.toSql();

      expect(sql).toContain(`SET "counter" = COALESCE("counter", 0) + 1`);
      expect(sql).not.toContain(`"posts"."counter", 0`);
    });

    it("supports Subtraction for negative counter deltas", () => {
      const posts = new Table("posts");
      const counter = posts.get("counter");
      const unqual = new Nodes.UnqualifiedColumn(counter);
      const coalesced = new Nodes.NamedFunction("COALESCE", [unqual, new Nodes.Quoted(0)]);
      const expr = new Nodes.Subtraction(coalesced, new Nodes.Quoted(3));

      const um = new UpdateManager();
      um.table(posts);
      um.set([[counter, expr]]);
      const sql = um.toSql();

      expect(sql).toContain(`SET "counter" = COALESCE("counter", 0) - 3`);
    });
  });

  describe("set", () => {
    it("takes a plain string literal", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set("foo = bar");
      expect(mgr.toSql()).toBe('UPDATE "users" SET foo = bar');
    });

    it("takes a BoundSqlLiteral", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set(new Nodes.BoundSqlLiteral("name = ?", ["dean"], {}));
      expect(mgr.toSql()).toBe(`UPDATE "users" SET name = ?`);
    });

    it("wraps each column in an UnqualifiedColumn", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), "dean"]]);
      const assignment = mgr.ast.values[0] as Nodes.Assignment;
      expect(assignment).toBeInstanceOf(Nodes.Assignment);
      expect(assignment.left).toBeInstanceOf(Nodes.UnqualifiedColumn);
    });

    it("stores the raw value on the Assignment (no Quoted wrap)", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("age"), 42]]);
      const assignment = mgr.ast.values[0] as Nodes.Assignment;
      expect(assignment.right).toBe(42);
    });
  });

  it("UPDATE with ORDER BY and LIMIT", () => {
    const mgr = new UpdateManager();
    mgr.table(users);
    mgr.set([[users.get("active"), false]]);
    mgr.where(users.get("age").lt(18));
    mgr.order(users.get("name").asc());
    mgr.take(5);
    expect(mgr.toSql()).toBe(
      `UPDATE "users" SET "active" = 'f' WHERE "users"."age" < 18 ORDER BY "users"."name" ASC LIMIT 5`,
    );
  });

  it("wheres getter returns WHERE conditions", () => {
    const manager = new UpdateManager();
    manager.table(users);
    manager.where(users.get("id").eq(1));
    expect(manager.wheres.length).toBe(1);
  });

  it("updates with false", () => {
    const mgr = new UpdateManager();
    mgr.table(users);
    mgr.set([[users.get("active"), false]]);
    expect(mgr.toSql()).toContain("'f'");
  });

  describe("key=", () => {
    it("wraps a scalar value in Quoted", () => {
      const um = new UpdateManager();
      um.table(users);
      um.key = 5;
      expect(um.ast.key).toBeInstanceOf(Nodes.Quoted);
      expect((um.ast.key as Nodes.Quoted).value).toBe(5);
    });

    it("maps an array, wrapping each element in Quoted", () => {
      const um = new UpdateManager();
      um.table(users);
      um.key = [1, 2];
      const arr = um.ast.key as unknown as Nodes.Quoted[];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.every((q) => q instanceof Nodes.Quoted)).toBe(true);
      expect(arr.map((q) => q.value)).toEqual([1, 2]);
    });

    it("passes existing Nodes through unwrapped", () => {
      const um = new UpdateManager();
      um.table(users);
      const lit = new Nodes.SqlLiteral("id");
      um.key = lit;
      expect(um.ast.key).toBe(lit);
    });
  });
});
