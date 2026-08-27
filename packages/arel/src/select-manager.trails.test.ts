import { describe, it, expect } from "vitest";
import { Table, SelectManager, Nodes, EmptyJoinError, Visitors, star, sql } from "./index.js";
import { fakeRecordConnection, testConnection } from "./test-helpers/connection.js";

describe("SelectManagerTest (trails)", () => {
  const users = new Table("users");

  it("promotes a SqlLiteral relation to a StringJoin", () => {
    const mgr = new SelectManager(users);
    mgr.join(new Nodes.SqlLiteral("comments ON comments.user_id = users.id"));
    expect(mgr.joinSources()[0]).toBeInstanceOf(Nodes.StringJoin);
    expect(mgr.toSql()).toContain("comments ON comments.user_id = users.id");
  });

  it("raises EmptyJoinError on an empty SqlLiteral", () => {
    const mgr = new SelectManager(users);
    expect(() => mgr.join(new Nodes.SqlLiteral(""))).toThrow(EmptyJoinError);
  });

  it("does not raise on a whitespace-only relation", () => {
    const mgr = new SelectManager(users);
    expect(() => mgr.join(" ")).not.toThrow();
  });

  it("promotes a bare string relation to a StringJoin", () => {
    const mgr = new SelectManager(users);
    mgr.join("comments ON comments.user_id = users.id");
    expect(mgr.joinSources()[0]).toBeInstanceOf(Nodes.StringJoin);
    expect((mgr.joinSources()[0] as Nodes.StringJoin).left).toBe(
      "comments ON comments.user_id = users.id",
    );
  });

  describe("lock arms", () => {
    const star = new Nodes.SqlLiteral("*");

    it("maps true to FOR UPDATE", () => {
      const mgr = new SelectManager(users).project(star);
      expect(mgr.lock(true).toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
    });

    it("wraps a bare string in a SqlLiteral", () => {
      const mgr = new SelectManager(users).project(star);
      expect(mgr.lock("FOR SHARE").toSql()).toBe('SELECT * FROM "users" FOR SHARE');
    });

    it("passes a SqlLiteral through unwrapped", () => {
      const mgr = new SelectManager(users).project(star);
      const literal = new Nodes.SqlLiteral("FOR UPDATE NOWAIT");
      mgr.lock(literal);
      expect((mgr.locked as Nodes.Lock).expr).toBe(literal);
      expect(mgr.toSql()).toBe('SELECT * FROM "users" FOR UPDATE NOWAIT');
    });

    it("defaults to FOR UPDATE with no argument", () => {
      const mgr = new SelectManager(users).project(star);
      expect(mgr.lock().toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
    });
  });

  describe("join builder chain", () => {
    const posts = new Table("posts");
    const star = new Nodes.SqlLiteral("*");

    it("builds INNER JOIN sql through join().on()", () => {
      expect(
        users
          .project(users.get("name"), posts.get("title"))
          .join(posts)
          .on(users.get("id").eq(posts.get("user_id")))
          .toSql(),
      ).toBe(
        'SELECT "users"."name", "posts"."title" FROM "users" INNER JOIN "posts" ON "users"."id" = "posts"."user_id"',
      );
    });

    it("builds LEFT OUTER JOIN sql through outerJoin().on()", () => {
      expect(
        users
          .project(star)
          .outerJoin(posts)
          .on(users.get("id").eq(posts.get("user_id")))
          .toSql(),
      ).toBe('SELECT * FROM "users" LEFT OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"');
    });
  });
});

describe("SelectManagerTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  describe("backwards compatibility", () => {
    describe("from", () => {
      it("routes a Join to source.right rather than overwriting source.left", () => {
        const mgr = new SelectManager();
        mgr.from(users);
        const join = new Nodes.InnerJoin(
          posts,
          new Nodes.On(users.get("id").eq(posts.get("user_id"))),
        );
        mgr.from(join);
        const core = mgr.ast.cores[0];
        expect(core.source.left).toBe(users);
        expect(core.source.right).toContain(join);
      });
    });
  });

  describe("skip", () => {
    it("stores the raw amount on the Offset (no Quoted wrap)", () => {
      const mgr = new SelectManager(users).skip(5);
      const offset = mgr.ast.offset as Nodes.Offset;
      expect(offset).toBeInstanceOf(Nodes.Offset);
      expect(offset.expr).toBe(5);
    });

    it("clears the offset when given null", () => {
      const mgr = new SelectManager(users).skip(5);
      expect(mgr.ast.offset).not.toBeNull();
      mgr.skip(null);
      expect(mgr.ast.offset).toBeNull();
    });

    it("the offset getter returns the inner expression", () => {
      const mgr = new SelectManager(users).skip(7);
      expect(mgr.offset).toBe(7);
      mgr.skip(null);
      expect(mgr.offset).toBeNull();
    });
  });

  describe("take", () => {
    it("stores the raw amount on the Limit (no Quoted wrap)", () => {
      const mgr = new SelectManager(users).take(5);
      const limit = mgr.ast.limit as Nodes.Limit;
      expect(limit).toBeInstanceOf(Nodes.Limit);
      expect(limit.expr).toBe(5);
    });

    it("clears the limit when given null", () => {
      const mgr = new SelectManager(users).take(5);
      expect(mgr.ast.limit).not.toBeNull();
      mgr.take(null);
      expect(mgr.ast.limit).toBeNull();
    });

    it("the limit getter returns the inner expression", () => {
      const mgr = new SelectManager(users).take(5);
      expect(mgr.limit).toBe(5);
      mgr.take(null);
      expect(mgr.limit).toBeNull();
    });
  });

  describe("limit= / offset= setters", () => {
    it("limit= delegates to take", () => {
      const mgr = new SelectManager(users);
      mgr.limit = 7;
      const limit = mgr.ast.limit as Nodes.Limit;
      expect(limit).toBeInstanceOf(Nodes.Limit);
      expect(limit.expr).toBe(7);
      mgr.limit = null;
      expect(mgr.ast.limit).toBeNull();
    });

    it("offset= delegates to skip", () => {
      const mgr = new SelectManager(users);
      mgr.offset = 9;
      const offset = mgr.ast.offset as Nodes.Offset;
      expect(offset).toBeInstanceOf(Nodes.Offset);
      expect(offset.expr).toBe(9);
      mgr.offset = null;
      expect(mgr.ast.offset).toBeNull();
    });
  });

  describe("minus", () => {
    it("minus aliases except", () => {
      const q1 = users.project(star());
      const q2 = users.project(star());
      expect(new Visitors.ToSql(fakeRecordConnection).compile(q1.minus(q2))).toContain("EXCEPT");
    });
  });

  describe("taken", () => {
    it("taken aliases limit", () => {
      const mgr = users.project(star()).take(5);
      expect(mgr.taken).toBe(mgr.limit);
      expect(mgr.taken).toBe(5);
    });
  });

  describe("order", () => {
    it("accepts string and wraps in SqlLiteral", () => {
      const mgr = users.project(star()).order("name ASC");
      expect(mgr.toSql()).toContain("ORDER BY name ASC");
    });
  });

  it("froms filters null — fromless manager returns empty array", () => {
    const mgr = new SelectManager();
    expect(mgr.froms).toHaveLength(0);
  });

  describe("delete", () => {
    it("limited composite-key delete renders a row-value subselect", () => {
      const mgr = new SelectManager();
      mgr.from(users).take(1);
      const stmt = mgr.compileDelete([users.get("id"), users.get("name")]);
      expect(stmt.toSql()).toBe(
        'DELETE FROM "users" WHERE ("users"."id", "users"."name") IN ' +
          '(SELECT "users"."id", "users"."name" FROM "users" LIMIT 1)',
      );
    });
  });

  describe("update", () => {
    it("takes a bound sql literal", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      const stmt = mgr.compileUpdate(
        new Nodes.BoundSqlLiteral("foo = ?", [1], {}),
        users.get("id"),
      );
      expect(stmt.toSql()).toBe('UPDATE "users" SET foo = ?');
    });
  });

  describe("where", () => {
    it("accepts a TreeManager and unwraps to ast", () => {
      const sub = users.project(users.get("id")).where(users.get("active").eq(true));
      const mgr = users.project(star()).where(sub);
      expect(mgr.toSql()).toContain("WHERE");
    });
  });

  describe("comment", () => {
    it("stores the Comment node on the SelectCore (Rails fidelity)", () => {
      const mgr = users.project(star()).comment("trace");
      const core = mgr.ast.cores[mgr.ast.cores.length - 1];
      expect(core.comment).toBeDefined();
      expect(core.comment).not.toBeNull();
      expect("comment" in mgr.ast).toBe(false);
    });

    it("emits the comment exactly once", () => {
      const sql = users.project(star()).comment("once").toSql();
      const matches = sql.match(/\/\* once \*\//g) ?? [];
      expect(matches.length).toBe(1);
    });
  });

  it("chains where + order + limit + offset", () => {
    expect(
      users
        .project(users.get("name"))
        .where(users.get("age").gt(21))
        .order(users.get("name").asc())
        .take(10)
        .skip(5)
        .toSql(),
    ).toBe(
      'SELECT "users"."name" FROM "users" WHERE "users"."age" > 21 ORDER BY "users"."name" ASC LIMIT 10 OFFSET 5',
    );
  });

  it("group by and having", () => {
    expect(
      users
        .project(users.get("age"), sql("COUNT(*)"))
        .group(users.get("age"))
        .having(sql("COUNT(*) > 1"))
        .toSql(),
    ).toBe(
      'SELECT "users"."age", COUNT(*) FROM "users" GROUP BY "users"."age" HAVING COUNT(*) > 1',
    );
  });

  it("distinct", () => {
    expect(users.project(users.get("name")).distinct().toSql()).toBe(
      'SELECT DISTINCT "users"."name" FROM "users"',
    );
  });

  it("distinct(false) clears the set quantifier", () => {
    const mgr = users.project(users.get("name")).distinct();
    expect(mgr.toSql()).toContain("DISTINCT");
    mgr.distinct(false);
    expect(mgr.toSql()).not.toContain("DISTINCT");
  });

  describe("lateral", () => {
    it("returns a Lateral wrapping the SELECT", () => {
      const mgr = new SelectManager(users).project(users.get("id"));
      const lat = mgr.lateral();
      expect(lat).toBeInstanceOf(Nodes.Lateral);
      const sql = new Visitors.PostgreSQL(fakeRecordConnection).compile(lat);
      expect(sql).toBe('LATERAL (SELECT "users"."id" FROM "users")');
    });

    it("with a name wraps the alias inside the Lateral", () => {
      const mgr = new SelectManager(users).project(users.get("id"));
      const lat = mgr.lateral("u");
      expect(lat).toBeInstanceOf(Nodes.Lateral);
      expect(lat.expr).toBeInstanceOf(Nodes.TableAlias);
      const sql = new Visitors.PostgreSQL(fakeRecordConnection).compile(lat);
      expect(sql).toBe('LATERAL (SELECT "users"."id" FROM "users") u');
    });
  });

  it("comment ctor stores the values array", () => {
    const c = new Nodes.Comment(["hello", "world"]);
    expect(c.values).toEqual(["hello", "world"]);
  });

  it("chaining returns the manager", () => {
    const mgr = users.project(star());
    expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    expect(mgr.order(users.get("id").asc())).toBe(mgr);
    expect(mgr.take(10)).toBe(mgr);
    expect(mgr.skip(5)).toBe(mgr);
    expect(mgr.group(users.get("id"))).toBe(mgr);
  });

  it("rightOuterJoin generates RIGHT OUTER JOIN", () => {
    const mgr = new SelectManager(users);
    mgr.project(star());
    mgr.join(posts, Nodes.RightOuterJoin).on(users.get("id").eq(posts.get("user_id")));
    expect(mgr.toSql()).toContain("RIGHT OUTER JOIN");
    expect(mgr.toSql()).toContain('"posts"');
  });

  it("fullOuterJoin generates FULL OUTER JOIN", () => {
    const mgr = new SelectManager(users);
    mgr.project(star());
    mgr.join(posts, Nodes.FullOuterJoin).on(users.get("id").eq(posts.get("user_id")));
    expect(mgr.toSql()).toContain("FULL OUTER JOIN");
  });

  it("window creates a named window", () => {
    const mgr = new SelectManager(users);
    mgr.project(star());
    const win = mgr.window("w");
    win.order(users.get("created_at").asc());
    expect(mgr.toSql()).toContain("WINDOW");
  });

  it("returns empty array when no joins", () => {
    const manager = users.project("*");
    expect(manager.joinSources()).toEqual([]);
  });

  it("returns join nodes after join()", () => {
    const manager = users
      .project("*")
      .join(posts)
      .on(users.get("id").eq(posts.get("user_id")));
    expect(manager.joinSources().length).toBe(1);
    expect(manager.joinSources()[0]).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("returns multiple join nodes", () => {
    const comments = new Table("comments");
    const manager = users
      .project("*")
      .join(posts)
      .on(users.get("id").eq(posts.get("user_id")))
      .outerJoin(comments)
      .on(posts.get("id").eq(comments.get("post_id")));
    expect(manager.joinSources().length).toBe(2);
    expect(manager.joinSources()[0]).toBeInstanceOf(Nodes.InnerJoin);
    expect(manager.joinSources()[1]).toBeInstanceOf(Nodes.OuterJoin);
  });

  it("returns the FROM source", () => {
    const manager = users.project("*");
    const froms = manager.froms;
    expect(froms.length).toBe(1);
    expect(froms[0]).toBe(users);
  });

  it("should take an order", () => {
    const mgr = users.order(users.get("name").asc()).project(star());
    expect(mgr.toSql()).toContain("ORDER BY");
  });

  describe("optimizerHints", () => {
    it("places hints after SELECT", () => {
      const mgr = new SelectManager(users)
        .project(star())
        .optimizerHints("MAX_EXECUTION_TIME(1000)");
      expect(mgr.toSql()).toBe('SELECT /*+ MAX_EXECUTION_TIME(1000) */ * FROM "users"');
    });

    it("supports multiple hints", () => {
      const mgr = new SelectManager(users)
        .project(star())
        .optimizerHints("NO_INDEX_MERGE(users)", "BKA(users)");
      expect(mgr.toSql()).toBe('SELECT /*+ NO_INDEX_MERGE(users) BKA(users) */ * FROM "users"');
    });

    it("sanitizes comment delimiters from hints", () => {
      const mgr = new SelectManager(users)
        .project(star())
        .optimizerHints("HINT */ DROP TABLE users --");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toBe('SELECT /*+ HINT DROP TABLE users -- */ * FROM "users"');
    });

    it("sanitizes newlines from hints", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints("HINT\nwith\nnewlines");
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).not.toContain("\n");
      expect(sql).toContain("/*+ HINT with newlines */");
    });

    it("emits the hint comment even when hints sanitize to empty", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints("/* */", "/**/");
      expect(new Visitors.ToSql(testConnection).compile(mgr.ast)).toBe(
        'SELECT /*+   */ * FROM "users"',
      );
    });

    it("stores hints as an OptimizerHints node on the SelectCore", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints("X", "Y");
      expect(mgr.ast.cores[0].optimizerHints).toBeInstanceOf(Nodes.OptimizerHints);
      expect((mgr.ast.cores[0].optimizerHints as Nodes.OptimizerHints).expr).toEqual(["X", "Y"]);
    });

    it("is a no-op when called with no hints", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints();
      expect(mgr.ast.cores[0].optimizerHints).toBeNull();
    });
  });
});
