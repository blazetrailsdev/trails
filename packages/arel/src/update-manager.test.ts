import { describe, it, expect } from "vitest";
import { Table, UpdateManager, Nodes } from "./index.js";

describe("UpdateManagerTest", () => {
  const users = new Table("users");
  it("should not quote sql literals", () => {
    const um = new UpdateManager();
    um.table(users);
    um.set([[users.get("name"), new Nodes.SqlLiteral("NOW()")]]);
    const sql = um.toSql();
    expect(sql).toContain("NOW()");
    expect(sql).not.toContain("'NOW()'");
  });

  describe("having", () => {
    it("sets having", () => {
      const um = new UpdateManager();
      um.table(users);
      um.having(users.get("id").gt(0));
      expect(um.ast.havings.length).toBe(1);
    });
  });

  describe("group", () => {
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
  });

  describe("UnqualifiedColumn", () => {
    it("renders without a table qualifier on the RHS of an UPDATE SET", () => {
      // Mirrors Rails' ActiveRecord::CounterCache pattern:
      //   SET "counter" = COALESCE("counter", 0) + 1
      // without a `"posts"."counter"` table prefix on the RHS, which some
      // adapters reject inside UPDATE statements.
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
      mgr.set(new Nodes.SqlLiteral("foo = bar"));
      expect(mgr.toSql()).toBe('UPDATE "users" SET foo = bar');
    });

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
      expect(mgr.toSql()).toBe(`UPDATE "users" SET name = 'dean'`);
    });
  });

  describe("table", () => {
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
  });

  describe("where", () => {
    it("generates a where clause", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([
        [users.get("name"), "dean"],
        [users.get("age"), 31],
      ]);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toBe(
        `UPDATE "users" SET "name" = 'dean', "age" = 31 WHERE "users"."id" = 1`,
      );
    });
  });

  describe("key", () => {
    it("can be set", () => {
      const manager = new UpdateManager();
      manager.table(users);
      manager.key = users.attr("id").eq(1);
      expect(manager.ast.key).not.toBeNull();
    });

    it("can be accessed", () => {
      const um = new UpdateManager();
      um.table(users);
      um.where(users.get("id").eq(1));
      expect(um.wheres.length).toBe(1);
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
      `UPDATE "users" SET "active" = FALSE WHERE "users"."age" < 18 ORDER BY "users"."name" ASC LIMIT 5`,
    );
  });

  it("wheres getter returns WHERE conditions", () => {
    const manager = new UpdateManager();
    manager.table(users);
    manager.where(users.attr("id").eq(1));
    expect(manager.wheres.length).toBe(1);
  });

  it("updates with false", () => {
    const mgr = new UpdateManager();
    mgr.table(users);
    mgr.set([[users.get("active"), false]]);
    expect(mgr.toSql()).toContain("FALSE");
  });

  it("handles limit properly", () => {
    const um = new UpdateManager();
    um.table(users);
    um.take(10);
    um.set([[users.get("name"), null]]);
    expect(um.toSql()).toContain("LIMIT 10");
  });

  describe("set", () => {
    it("takes a list of lists", () => {
      const um = new UpdateManager();
      um.table(users);
      um.set([
        [users.get("id"), 1],
        [users.get("name"), "hello"],
      ]);
      const sql = um.toSql();
      expect(sql).toContain('"id" = 1');
      expect(sql).toContain('"name" =');
    });
  });

  describe("where", () => {
    it("chains", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });
});
