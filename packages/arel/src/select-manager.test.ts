import { describe, it, expect } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  Nodes,
  Visitors,
  EmptyJoinError,
} from "./index.js";
import { testConnection, fakeRecordConnection } from "./test-helpers/connection.js";
import { mustBeLike } from "./test-helpers/must-be-like.js";

describe("SelectManagerTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  it("join sources", () => {
    const manager = new SelectManager();
    manager.joinSources().push(new Nodes.StringJoin(new Nodes.Quoted("foo")));
    expect(manager.toSql()).toBe("SELECT FROM 'foo'");
  });

  describe("backwards compatibility", () => {
    describe("project", () => {
      it("accepts symbols as sql literals", () => {
        const mgr = new SelectManager();
        mgr.project("id");
        mgr.from(users);
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT id FROM "users"`));
      });
    });

    describe("order", () => {
      it("accepts symbols", () => {
        const mgr = new SelectManager();
        mgr.project(star());
        mgr.from(users);
        mgr.order(new Nodes.SqlLiteral("foo"));
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT * FROM "users" ORDER BY foo`));
      });
    });

    describe("group", () => {
      it("takes a symbol", () => {
        const mgr = new SelectManager();
        mgr.from(users);
        mgr.group("foo");
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" GROUP BY foo`));
      });
    });

    describe("as", () => {
      it("makes an AS node by grouping the AST", () => {
        const mgr = new SelectManager();
        const as = mgr.as("foo");
        expect(as.left).toBeInstanceOf(Nodes.Grouping);
        expect((as.left as Nodes.Grouping).expr).toBe(mgr.ast);
        expect(String(as.right)).toBe("foo");
      });

      it("converts right to SqlLiteral if a string", () => {
        const mgr = new SelectManager();
        const as = mgr.as("foo");
        expect(as.right).toBeInstanceOf(Nodes.SqlLiteral);
      });

      it("can make a subselect", () => {
        const mgr = new SelectManager();
        mgr.project(star());
        mgr.from(sql("zomg"));
        const as = mgr.as("foo");
        const outer = new SelectManager();
        outer.project(sql("name"));
        outer.from(as);
        expect(mustBeLike(outer.toSql())).toBe(
          mustBeLike("SELECT name FROM (SELECT * FROM zomg) foo"),
        );
      });
    });

    describe("from", () => {
      it("ignores strings when table of same name exists", () => {
        const mgr = new SelectManager();
        mgr.from(users);
        mgr.from("users");
        mgr.project(users.get("id"));
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike('SELECT "users"."id" FROM users'));
      });

      it("should support any ast", () => {
        const mgr1 = new SelectManager();
        const mgr2 = new SelectManager();
        mgr2.project(star());
        mgr2.from(users);
        const as = mgr2.as("omg");
        mgr1.project(sql("lol"));
        mgr1.from(as);
        expect(mustBeLike(mgr1.toSql())).toBe(
          mustBeLike(`SELECT lol FROM (SELECT * FROM "users") omg`),
        );
      });

      // Mirrors Rails: `from(table)` (select_manager.rb) routes a Join
      // node to `source.right` so callers can build cross-product FROMs
      // like `FROM users INNER JOIN posts ON ...` via `from(joinNode)`.
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

    describe("having", () => {
      it("converts strings to SQLLiterals", () => {
        const mgr = users.from();
        mgr.having(sql("foo"));
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" HAVING foo`));
      });

      it("can have multiple items specified separately", () => {
        const mgr = users.from();
        mgr.having(sql("foo"));
        mgr.having(sql("bar"));
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" HAVING foo AND bar`));
      });

      it("can receive any node", () => {
        const mgr = users.from();
        mgr.having(new Nodes.And([sql("foo"), sql("bar")]));
        expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" HAVING foo AND bar`));
      });
    });

    describe("on", () => {
      it("converts to sqlliterals", () => {
        const right = users.alias();
        const mgr = users.from();
        mgr.join(right).on("omg");
        expect(mgr.toSql()).toBe('SELECT FROM "users" INNER JOIN "users" "users_2" ON omg');
      });

      it("converts to sqlliterals with multiple items", () => {
        const right = users.alias();
        const mgr = users.from();
        mgr.join(right).on("omg", "123");
        expect(mgr.toSql()).toBe('SELECT FROM "users" INNER JOIN "users" "users_2" ON omg AND 123');
      });
    });
  });

  describe("clone", () => {
    it("creates new cores", () => {
      const mgr = new SelectManager(users);
      expect(mgr.ast.cores.length).toBe(1);
    });

    it("makes updates to the correct copy", () => {
      const mgr = new SelectManager(users);
      mgr.project(star());
      mgr.where(users.get("id").eq(1));
      const sql = mgr.toSql();
      expect(sql).toContain("WHERE");
      expect(sql).toContain("*");
    });
  });

  describe("initialize", () => {
    it("uses alias in sql", () => {
      const table = new Table("users", { as: "foo" });
      const mgr = table.from();
      mgr.skip(10);
      expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" "foo" OFFSET 10`));
    });
  });

  describe("skip", () => {
    it("should add an offset", () => {
      const mgr = users.from();
      mgr.skip(10);
      expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" OFFSET 10`));
    });

    // Mirrors Rails: `skip(amount)` flows the raw value into
    // `Nodes::Offset.new(amount)` (select_manager.rb), no `Quoted` wrap.
    it("stores the raw amount on the Offset (no Quoted wrap)", () => {
      const mgr = new SelectManager(users).skip(5);
      const offset = mgr.ast.offset as Nodes.Offset;
      expect(offset).toBeInstanceOf(Nodes.Offset);
      expect(offset.expr).toBe(5);
    });

    // Mirrors Rails: `skip(nil)` clears the offset.
    it("clears the offset when given null", () => {
      const mgr = new SelectManager(users).skip(5);
      expect(mgr.ast.offset).not.toBeNull();
      mgr.skip(null);
      expect(mgr.ast.offset).toBeNull();
    });

    // Mirrors Rails: `def offset; @ast.offset && @ast.offset.expr; end`.
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

    // Mirrors Rails: `take(nil)` clears the limit.
    it("clears the limit when given null", () => {
      const mgr = new SelectManager(users).take(5);
      expect(mgr.ast.limit).not.toBeNull();
      mgr.take(null);
      expect(mgr.ast.limit).toBeNull();
    });

    // Mirrors Rails: `def limit; @ast.limit && @ast.limit.expr; end`.
    it("the limit getter returns the inner expression", () => {
      const mgr = new SelectManager(users).take(5);
      expect(mgr.limit).toBe(5);
      mgr.take(null);
      expect(mgr.limit).toBeNull();
    });
  });

  // Mirrors Rails: `alias :limit= :take` and `alias :offset= :skip`
  // (select_manager.rb). The setter form is symmetric with the getter.
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

  describe("offset", () => {
    it("should add an offset", () => {
      const mgr = users.from();
      mgr.offset = 10;
      expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" OFFSET 10`));
    });

    it("should remove an offset", () => {
      const mgr = users.from();
      mgr.offset = 10;
      expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users" OFFSET 10`));

      mgr.offset = null;
      expect(mustBeLike(mgr.toSql())).toBe(mustBeLike(`SELECT FROM "users"`));
    });

    it("should return the offset", () => {
      const mgr = users.from();
      mgr.offset = 10;
      expect(mgr.offset).toBe(10);
    });
  });

  describe("exists", () => {
    it("should create an exists clause", () => {
      const manager = new SelectManager(users);
      manager.project(new Nodes.SqlLiteral("*"));
      const m2 = new SelectManager();
      m2.project(manager.exists());
      expect(mustBeLike(m2.toSql())).toBe(mustBeLike(`SELECT EXISTS (${manager.toSql()})`));
    });

    it("can be aliased", () => {
      const manager = new SelectManager(users);
      manager.project(new Nodes.SqlLiteral("*"));
      const m2 = new SelectManager();
      m2.project(manager.exists().as("foo"));
      expect(mustBeLike(m2.toSql())).toBe(mustBeLike(`SELECT EXISTS (${manager.toSql()}) AS foo`));
    });
  });

  describe("union", () => {
    const m1 = new SelectManager(users);
    m1.project(star());
    m1.where(users.get("age").lt(18));

    const m2 = new SelectManager(users);
    m2.project(star());
    m2.where(users.get("age").gt(99));

    it("should union two managers", () => {
      const node = m1.union(m2);
      expect(mustBeLike(visitor.compile(node))).toBe(
        mustBeLike(
          `( SELECT * FROM "users" WHERE "users"."age" < 18 UNION SELECT * FROM "users" WHERE "users"."age" > 99 )`,
        ),
      );
    });

    it("should union all", () => {
      const node = m1.union(":all", m2);
      expect(mustBeLike(visitor.compile(node))).toBe(
        mustBeLike(
          `( SELECT * FROM "users" WHERE "users"."age" < 18 UNION ALL SELECT * FROM "users" WHERE "users"."age" > 99 )`,
        ),
      );
    });
  });

  describe("intersect", () => {
    it("should intersect two managers", () => {
      const m1 = new SelectManager(users);
      m1.project(star());
      m1.where(users.get("age").gt(18));

      const m2 = new SelectManager(users);
      m2.project(star());
      m2.where(users.get("age").lt(99));

      const node = m1.intersect(m2);
      expect(mustBeLike(visitor.compile(node))).toBe(
        mustBeLike(
          `( SELECT * FROM "users" WHERE "users"."age" > 18 INTERSECT SELECT * FROM "users" WHERE "users"."age" < 99 )`,
        ),
      );
    });
  });

  describe("except", () => {
    it("should except two managers", () => {
      const m1 = new SelectManager(users);
      m1.project(star());
      m1.where(users.get("age").between({ begin: 18, end: 60 }));

      const m2 = new SelectManager(users);
      m2.project(star());
      m2.where(users.get("age").between({ begin: 40, end: 99 }));

      const node = m1.except(m2);
      expect(mustBeLike(visitor.compile(node))).toBe(
        mustBeLike(
          `( SELECT * FROM "users" WHERE "users"."age" BETWEEN 18 AND 60 EXCEPT SELECT * FROM "users" WHERE "users"."age" BETWEEN 40 AND 99 )`,
        ),
      );
    });
  });

  describe("minus", () => {
    it("minus aliases except", () => {
      const q1 = users.project(star());
      const q2 = users.project(star());
      expect(new Visitors.ToSql(fakeRecordConnection).compile(q1.minus(q2))).toContain("EXCEPT");
    });
  });

  describe("with", () => {
    it("should support basic WITH", () => {
      const users = new Table("users");
      const usersTop = new Table("users_top");
      const comments = new Table("comments");

      const top = users.project(users.get("id")).where(users.get("karma").gt(100));
      const usersAs = new Nodes.As(usersTop, top);
      const selectManager = comments
        .project(star())
        .with(usersAs)
        .where(comments.get("author_id").in(usersTop.project(usersTop.get("id"))));

      expect(mustBeLike(visitor.compile(selectManager.ast))).toBe(
        mustBeLike(
          `WITH "users_top" AS (SELECT "users"."id" FROM "users" WHERE "users"."karma" > 100) SELECT * FROM "comments" WHERE "comments"."author_id" IN (SELECT "users_top"."id" FROM "users_top")`,
        ),
      );
    });

    it("should support WITH RECURSIVE", () => {
      const comments = new Table("comments");
      const commentsId = comments.get("id");
      const commentsParentId = comments.get("parent_id");

      const replies = new Table("replies");
      const repliesId = replies.get("id");

      const nonRecursiveTerm = new SelectManager();
      nonRecursiveTerm
        .from(comments)
        .project(commentsId, commentsParentId)
        .where(commentsId.eq(42));

      const recursiveTerm = new SelectManager();
      recursiveTerm
        .from(comments)
        .project(commentsId, commentsParentId)
        .join(replies)
        .on(commentsParentId.eq(repliesId));

      const union = nonRecursiveTerm.union(recursiveTerm);

      const asStatement = new Nodes.As(replies, union);

      const manager = new SelectManager();
      manager.withRecursive(asStatement).from(replies).project(star());

      expect(mustBeLike(visitor.compile(manager.ast))).toBe(
        mustBeLike(`
          WITH RECURSIVE "replies" AS (
              SELECT "comments"."id", "comments"."parent_id" FROM "comments" WHERE "comments"."id" = 42
            UNION
              SELECT "comments"."id", "comments"."parent_id" FROM "comments" INNER JOIN "replies" ON "comments"."parent_id" = "replies"."id"
          )
          SELECT * FROM "replies"
        `),
      );
    });
  });

  describe("ast", () => {
    it("should return the ast", () => {
      const mgr = users.from();
      expect(mgr.ast).toBeTruthy();
    });
  });

  describe("taken", () => {
    it("should return limit", () => {
      const manager = new SelectManager();
      manager.take(10);
      expect(manager.taken).toBe(10);
    });

    it("taken aliases limit", () => {
      const mgr = users.project(star()).take(5);
      expect(mgr.taken).toBe(mgr.limit);
      expect(mgr.taken).toBe(5);
    });
  });

  describe("lock", () => {
    it("adds a lock node", () => {
      const mgr = users.from();
      expect(mustBeLike(mgr.lock().toSql())).toBe(mustBeLike(`SELECT FROM "users" FOR UPDATE`));
    });
  });

  describe("orders", () => {
    it("returns order clauses", () => {
      const manager = new SelectManager();
      const order = users.get("id");
      manager.order(users.get("id"));
      expect(manager.orders).toEqual([order]);
    });
  });

  describe("order", () => {
    it("generates order clauses", () => {
      const manager = new SelectManager();
      manager.project(new Nodes.SqlLiteral("*"));
      manager.from(users);
      manager.order(users.get("id"));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT * FROM "users" ORDER BY "users"."id"`),
      );
    });

    it("accepts string and wraps in SqlLiteral", () => {
      const mgr = users.project(star()).order("name ASC");
      expect(mgr.toSql()).toContain("ORDER BY name ASC");
    });

    it("accepts symbol and uses description (Rails :sym.to_s == 'sym')", () => {
      const mgr = users.project(star()).order(Symbol("name"));
      expect(mgr.toSql()).toContain("ORDER BY name");
    });
  });

  describe("order", () => {
    it("chains", () => {
      const table = new Table("users");
      const mgr = new SelectManager();
      expect(mgr.order(table.get("id"))).toBe(mgr);
    });
  });

  describe("order", () => {
    it("has order attributes", () => {
      const manager = new SelectManager();
      manager.project(new Nodes.SqlLiteral("*"));
      manager.from(users);
      manager.order(users.get("id").desc());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT * FROM "users" ORDER BY "users"."id" DESC`),
      );
    });
  });

  describe("on", () => {
    it("takes two params", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const manager = new SelectManager();

      manager.from(left);
      manager.join(right).on(predicate, predicate);
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT FROM "users"
            INNER JOIN "users" "users_2"
              ON "users"."id" = "users_2"."id" AND
              "users"."id" = "users_2"."id"
        `),
      );
    });

    it("takes three params", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const manager = new SelectManager();

      manager.from(left);
      manager.join(right).on(predicate, predicate, left.get("name").eq(right.get("name")));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT FROM "users"
            INNER JOIN "users" "users_2"
              ON "users"."id" = "users_2"."id" AND
              "users"."id" = "users_2"."id" AND
              "users"."name" = "users_2"."name"
        `),
      );
    });
  });

  it("should hand back froms", () => {
    const relation = new SelectManager();
    expect(relation.froms).toEqual([]);
  });

  it("froms filters null — fromless manager returns empty array", () => {
    const mgr = new SelectManager();
    expect(mgr.froms).toHaveLength(0);
  });

  it("should create and nodes", () => {
    const mgr = new SelectManager();
    const children = ["foo", "bar", "baz"];
    const clause = mgr.createAnd(children);
    expect(clause).toBeInstanceOf(Nodes.And);
    expect(clause.children).toEqual(children);
  });

  it("should create insert managers", () => {
    const mgr = new SelectManager(users);
    const insert = mgr.createInsert();
    expect(insert).toBeInstanceOf(InsertManager);
  });

  it("should create join nodes", () => {
    const mgr = new SelectManager();
    const join = mgr.createJoin("foo", "bar");
    expect(join).toBeInstanceOf(Nodes.InnerJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with a full outer join klass", () => {
    const mgr = new SelectManager();
    const join = mgr.createJoin("foo", "bar", Nodes.FullOuterJoin);
    expect(join).toBeInstanceOf(Nodes.FullOuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with an outer join klass", () => {
    const mgr = new SelectManager();
    const join = mgr.createJoin("foo", "bar", Nodes.OuterJoin);
    expect(join).toBeInstanceOf(Nodes.OuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with a right outer join klass", () => {
    const mgr = new SelectManager();
    const join = mgr.createJoin("foo", "bar", Nodes.RightOuterJoin);
    expect(join).toBeInstanceOf(Nodes.RightOuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  describe("join", () => {
    it("responds to join", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const mgr = new SelectManager();

      mgr.from(left);
      mgr.join(right).on(predicate);
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" INNER JOIN "users" "users_2" ON "users"."id" = "users_2"."id"',
      );
    });

    it("takes a class", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const mgr = new SelectManager();

      mgr.from(left);
      mgr.join(right, Nodes.OuterJoin).on(predicate);
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" LEFT OUTER JOIN "users" "users_2" ON "users"."id" = "users_2"."id"',
      );
    });

    it("noops on nil", () => {
      const mgr = new SelectManager();
      expect(mgr.join(null)).toBe(mgr);
    });

    it("raises EmptyJoinError on empty", () => {
      const left = new Table("users");
      const mgr = new SelectManager();

      mgr.from(left);
      expect(() => mgr.join("")).toThrow(EmptyJoinError);
    });
  });

  describe("outer join", () => {
    it("responds to join", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const mgr = new SelectManager();

      mgr.from(left);
      mgr.outerJoin(right).on(predicate);
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" LEFT OUTER JOIN "users" "users_2" ON "users"."id" = "users_2"."id"',
      );
    });

    it("noops on nil", () => {
      const mgr = new SelectManager();
      expect(mgr.outerJoin(null)).toBe(mgr);
    });
  });

  describe("joins", () => {
    it("returns inner join sql", () => {
      const table = new Table("users");
      const aliaz = table.alias();
      const manager = new SelectManager();
      manager.from(new Nodes.InnerJoin(aliaz, table.get("id").eq(aliaz.get("id"))));
      expect(manager.toSql()).toMatch('INNER JOIN "users" "users_2" "users"."id" = "users_2"."id"');
    });

    it("returns outer join sql", () => {
      const table = new Table("users");
      const aliaz = table.alias();
      const manager = new SelectManager();
      manager.from(new Nodes.OuterJoin(aliaz, table.get("id").eq(aliaz.get("id"))));
      expect(manager.toSql()).toMatch(
        'LEFT OUTER JOIN "users" "users_2" "users"."id" = "users_2"."id"',
      );
    });

    it("can have a non-table alias as relation name", () => {
      const comments = new Table("comments");

      const counts = comments
        .from()
        .group(comments.get("user_id"))
        .project(comments.get("user_id").as("user_id"), comments.get("user_id").count().as("count"))
        .as("counts");

      const joins = users.join(counts).on(counts.get("user_id").eq(10));
      expect(mustBeLike(joins.toSql())).toBe(
        mustBeLike(
          `SELECT FROM "users" INNER JOIN (SELECT "comments"."user_id" AS user_id, COUNT("comments"."user_id") AS count FROM "comments" GROUP BY "comments"."user_id") counts ON counts."user_id" = 10`,
        ),
      );
    });

    it("joins itself", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));

      const mgr = left.join(right);
      mgr.project(new Nodes.SqlLiteral("*"));
      expect(mgr.on(predicate)).toBe(mgr);

      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT * FROM "users"
            INNER JOIN "users" "users_2"
              ON "users"."id" = "users_2"."id"
        `),
      );
    });

    it("returns string join sql", () => {
      const manager = new SelectManager();
      manager.from(new Nodes.StringJoin(new Nodes.Quoted("hello")));
      expect(manager.toSql()).toMatch("'hello'");
    });
  });

  describe("group", () => {
    it("takes multiple args", () => {
      const table = new Table("users");
      const mgr = new SelectManager();
      mgr.from(table);
      mgr.group(table.get("id"), table.get("name"));
      expect(mgr.toSql()).toBe('SELECT FROM "users" GROUP BY "users"."id", "users"."name"');
    });

    it("chains", () => {
      const table = new Table("users");
      const mgr = new SelectManager();
      expect(mgr.group(table.get("id"))).toBe(mgr);
    });
  });

  describe("project", () => {
    it("takes multiple args", () => {
      const manager = new SelectManager();
      manager.project(new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike(`SELECT foo, bar`));
    });
  });

  describe("window definition", () => {
    it("can be empty", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window");
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS ()`),
      );
    });

    it("takes a partition and an order", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").partition(users.get("foo")).order(users.get("foo").asc());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(
          `SELECT FROM "users" WINDOW "a_window" AS (PARTITION BY "users"."foo" ORDER BY "users"."foo" ASC)`,
        ),
      );
    });

    it("takes a rows frame, unbounded preceding", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").rows(new Nodes.Preceding());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (ROWS UNBOUNDED PRECEDING)`),
      );
    });

    it("takes a rows frame, bounded preceding", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").rows(new Nodes.Preceding(5));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (ROWS 5 PRECEDING)`),
      );
    });

    it("takes a rows frame, unbounded following", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").rows(new Nodes.Following());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (ROWS UNBOUNDED FOLLOWING)`),
      );
    });

    it("takes a rows frame, bounded following", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").rows(new Nodes.Following(5));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (ROWS 5 FOLLOWING)`),
      );
    });

    it("takes a rows frame, current row", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").rows(new Nodes.CurrentRow());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (ROWS CURRENT ROW)`),
      );
    });

    it("takes a rows frame, between two delimiters", () => {
      const manager = new SelectManager();
      manager.from(users);
      const window = manager.window("a_window");
      window.frame(
        new Nodes.Between(
          window.rows(),
          new Nodes.And([new Nodes.Preceding(), new Nodes.CurrentRow()]),
        ),
      );
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(
          `SELECT FROM "users" WINDOW "a_window" AS (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
        ),
      );
    });

    it("takes a range frame, unbounded preceding", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").range(new Nodes.Preceding());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (RANGE UNBOUNDED PRECEDING)`),
      );
    });

    it("takes a range frame, bounded preceding", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").range(new Nodes.Preceding(5));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (RANGE 5 PRECEDING)`),
      );
    });

    it("takes a range frame, bounded following", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").range(new Nodes.Following(5));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (RANGE 5 FOLLOWING)`),
      );
    });

    it("takes a range frame, current row", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.window("a_window").range(new Nodes.CurrentRow());
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT FROM "users" WINDOW "a_window" AS (RANGE CURRENT ROW)`),
      );
    });

    it("takes a range frame, between two delimiters", () => {
      const manager = new SelectManager();
      manager.from(users);
      const window = manager.window("a_window");
      window.frame(
        new Nodes.Between(
          window.range(),
          new Nodes.And([new Nodes.Preceding(), new Nodes.CurrentRow()]),
        ),
      );
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(
          `SELECT FROM "users" WINDOW "a_window" AS (RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
        ),
      );
    });
  });

  describe("delete", () => {
    it("copies from", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      const stmt = mgr.compileDelete();
      expect(stmt.toSql()).toBe('DELETE FROM "users"');
    });

    it("copies where", () => {
      const mgr = new SelectManager();
      mgr.from(users).where(users.get("id").eq(10));
      const stmt = mgr.compileDelete();
      expect(stmt.toSql()).toBe('DELETE FROM "users" WHERE "users"."id" = 10');
    });

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
    it("creates an update statement", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      const stmt = mgr.compileUpdate([[users.get("id"), 1]], users.get("id"));
      expect(stmt.toSql()).toBe('UPDATE "users" SET "id" = 1');
    });

    it("takes a string", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      const stmt = mgr.compileUpdate("foo = bar", users.get("id"));
      expect(stmt.toSql()).toBe('UPDATE "users" SET foo = bar');
    });

    it("takes a bound sql literal", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      const stmt = mgr.compileUpdate(
        new Nodes.BoundSqlLiteral("foo = ?", [1], {}),
        users.get("id"),
      );
      // `to_sql` compiles through a plain SQLString collector, where the
      // BoundSqlLiteral's `add_bind` emits a `?` placeholder (Rails parity) —
      // not the inlined value.
      expect(stmt.toSql()).toBe('UPDATE "users" SET foo = ?');
    });

    it("copies limits", () => {
      const mgr = new SelectManager();
      mgr.from(users).take(1);
      const stmt = mgr.compileUpdate(new Nodes.SqlLiteral("foo = bar"), users.get("id"));
      expect(stmt.toSql()).toBe(
        'UPDATE "users" SET foo = bar WHERE ("users"."id") IN (SELECT "users"."id" FROM "users" LIMIT 1)',
      );
    });

    it("copies order", () => {
      const mgr = new SelectManager();
      mgr.from(users).order(new Nodes.SqlLiteral("foo"));
      const stmt = mgr.compileUpdate(new Nodes.SqlLiteral("foo = bar"), users.get("id"));
      expect(stmt.toSql()).toBe(
        'UPDATE "users" SET foo = bar WHERE ("users"."id") IN (SELECT "users"."id" FROM "users" ORDER BY foo)',
      );
    });

    it("copies where clauses", () => {
      const mgr = new SelectManager();
      mgr.where(users.get("id").eq(10)).from(users);
      const stmt = mgr.compileUpdate([[users.get("id"), 1]], users.get("id"));
      expect(stmt.toSql()).toBe('UPDATE "users" SET "id" = 1 WHERE "users"."id" = 10');
    });

    it("copies where clauses when nesting is triggered", () => {
      const mgr = new SelectManager();
      mgr.where(users.get("foo").eq(10)).take(42).from(users);
      const stmt = mgr.compileUpdate([[users.get("id"), 1]], users.get("id"));
      expect(stmt.toSql()).toBe(
        'UPDATE "users" SET "id" = 1 WHERE ("users"."id") IN (SELECT "users"."id" FROM "users" WHERE "users"."foo" = 10 LIMIT 42)',
      );
    });
  });

  describe("project", () => {
    it("takes sql literals", () => {
      const manager = new SelectManager();
      manager.project(new Nodes.SqlLiteral("*"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike(`SELECT *`));
    });

    it("takes strings", () => {
      const manager = new SelectManager();
      manager.project("*");
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike(`SELECT *`));
    });
  });

  describe("projections", () => {
    it("reads projections", () => {
      const manager = new SelectManager();
      manager.project(sql("foo"), sql("bar"));
      expect(manager.projections).toEqual([sql("foo"), sql("bar")]);
    });
  });

  describe("projections=", () => {
    it("overwrites projections", () => {
      const manager = new SelectManager();
      manager.project(sql("foo"));
      manager.projections = [sql("bar")];
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike(`SELECT bar`));
    });
  });

  describe("take", () => {
    it("chains", () => {
      const mgr = new SelectManager();
      expect(mgr.take(1)).toBe(mgr);
    });
  });

  describe("take", () => {
    it("removes LIMIT when nil is passed", () => {
      const manager = new SelectManager();
      manager.limit = 10;
      expect(manager.toSql()).toMatch("LIMIT");

      manager.limit = null;
      expect(manager.toSql()).not.toMatch("LIMIT");
    });
  });

  describe("where", () => {
    it("knows where", () => {
      const manager = new SelectManager();
      manager.from(users).project(users.get("id"));
      manager.where(users.get("id").eq(1));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id"
          FROM "users"
          WHERE "users"."id" = 1
        `),
      );
    });

    it("accepts a TreeManager and unwraps to ast", () => {
      const sub = users.project(users.get("id")).where(users.get("active").eq(true));
      const mgr = users.project(star()).where(sub);
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("chains", () => {
      const table = new Table("users");
      const mgr = new SelectManager();
      mgr.from(table);
      expect(mgr.project(table.get("id")).where(table.get("id").eq(1))).toBe(mgr);
    });
  });

  describe("comment", () => {
    it("chains", () => {
      const mgr = new SelectManager();
      expect(mgr.comment("selecting")).toBe(mgr);
    });
  });

  describe("from", () => {
    it("makes sql", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.project(users.get("id"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike('SELECT "users"."id" FROM "users"'));
    });

    it("chains", () => {
      const table = new Table("users");
      const mgr = new SelectManager();
      expect(mgr.from(table).project(table.get("id"))).toBe(mgr);
      expect(mgr.toSql()).toBe('SELECT "users"."id" FROM "users"');
    });
  });

  describe("source", () => {
    it("returns the join source of the select core", () => {
      const manager = new SelectManager();
      expect(manager.source).toBe(manager.ast.cores[manager.ast.cores.length - 1].source);
    });
  });

  describe("distinct", () => {
    it("sets the quantifier", () => {
      const mgr = new SelectManager();

      mgr.distinct();
      expect(mgr.ast.cores[mgr.ast.cores.length - 1].setQuantifier?.constructor).toBe(
        Nodes.Distinct,
      );

      mgr.distinct(false);
      expect(mgr.ast.cores[mgr.ast.cores.length - 1].setQuantifier).toBeNull();
    });

    it("chains", () => {
      const mgr = new SelectManager();
      expect(mgr.distinct()).toBe(mgr);
      expect(mgr.distinct(false)).toBe(mgr);
    });
  });

  describe("distinct_on", () => {
    it("sets the quantifier", () => {
      const mgr = new SelectManager();
      const table = new Table("users");

      mgr.distinctOn(table.get("id"));
      expect(mgr.ast.cores[mgr.ast.cores.length - 1].setQuantifier).toEqual(
        new Nodes.DistinctOn(table.get("id")),
      );

      mgr.distinctOn(false);
      expect(mgr.ast.cores[mgr.ast.cores.length - 1].setQuantifier).toBeNull();
    });

    it("chains", () => {
      const mgr = new SelectManager();
      const table = new Table("users");

      expect(mgr.distinctOn(table.get("id"))).toBe(mgr);
      expect(mgr.distinctOn(false)).toBe(mgr);
    });
  });

  describe("comment", () => {
    it("appends a comment to the generated query", () => {
      const manager = new SelectManager();
      manager.from(users).project(users.get("id"));

      manager.comment("selecting");
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT "users"."id" FROM "users" /* selecting */`),
      );

      manager.comment("selecting", "with", "comment");
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT "users"."id" FROM "users" /* selecting */ /* with */ /* comment */`),
      );
    });

    it("stores the Comment node on the SelectCore (Rails fidelity)", () => {
      const mgr = users.project(star()).comment("trace");
      // Rails: `@ctx.comment = Nodes::Comment.new(values)` — sets on
      // the core, not the statement. SelectStatement no longer carries
      // a `comment` field at all.
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

  describe("joins", () => {
    it("returns inner join sql", () => {
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

    it("returns outer join sql", () => {
      expect(
        users
          .project(star())
          .outerJoin(posts)
          .on(users.get("id").eq(posts.get("user_id")))
          .toSql(),
      ).toBe('SELECT * FROM "users" LEFT OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"');
    });
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

  // Mirrors Rails: `distinct(value=true)` clears the set quantifier only
  // when value is `false` or `nil` (select_manager.rb's `if value`); any
  // other value enables DISTINCT.
  it("distinct(false) clears the set quantifier", () => {
    const mgr = users.project(users.get("name")).distinct();
    expect(mgr.toSql()).toContain("DISTINCT");
    mgr.distinct(false);
    expect(mgr.toSql()).not.toContain("DISTINCT");
  });

  describe("lateral", () => {
    // Mirrors Rails: `lateral` returns `Lateral.new(ast)` when no name is
    // given (select_manager.rb). `visit_Arel_Nodes_Lateral` is declared on
    // the PostgreSQL visitor only (postgresql.rb:64), so compile there.
    it("returns a Lateral wrapping the SELECT", () => {
      const mgr = new SelectManager(users).project(users.get("id"));
      const lat = mgr.lateral();
      expect(lat).toBeInstanceOf(Nodes.Lateral);
      const sql = new Visitors.PostgreSQL(fakeRecordConnection).compile(lat);
      expect(sql).toBe('LATERAL (SELECT "users"."id" FROM "users")');
    });

    // Mirrors Rails: `lateral(name)` builds `Lateral.new(as(name))` —
    // TableAlias inside Lateral, not vice versa. The TableAlias renders
    // its own grouping parens, so the visitor emits `LATERAL (...) name`.
    it("with a name wraps the alias inside the Lateral", () => {
      const mgr = new SelectManager(users).project(users.get("id"));
      const lat = mgr.lateral("u");
      expect(lat).toBeInstanceOf(Nodes.Lateral);
      expect(lat.expr).toBeInstanceOf(Nodes.TableAlias);
      const sql = new Visitors.PostgreSQL(fakeRecordConnection).compile(lat);
      expect(sql).toBe('LATERAL (SELECT "users"."id" FROM "users") u');
    });
  });

  // Mirrors Rails: `comment(*values)` constructs `Comment.new(values)` —
  // values are passed as a single array arg (select_manager.rb).
  it("comment ctor stores the values array", () => {
    const c = new Nodes.Comment(["hello", "world"]);
    expect(c.values).toEqual(["hello", "world"]);
  });

  describe("lock", () => {
    it("adds a lock node", () => {
      expect(users.project(star()).lock().toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
    });
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

  describe("window definition", () => {
    it("takes a range frame, current row", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"));
      const win = mgr.window("w");
      win.frame(new Nodes.Range(new Nodes.CurrentRow()));
      const sql = mgr.toSql();
      expect(sql).toContain("RANGE");
      expect(sql).toContain("CURRENT ROW");
    });
  });

  it("should take an order", () => {
    const mgr = users.order(users.get("name").asc()).project(star());
    expect(mgr.toSql()).toContain("ORDER BY");
  });

  describe("skip", () => {
    it("should chain", () => {
      const mgr = users.from();
      expect(mustBeLike(mgr.skip(10).toSql())).toBe(mustBeLike(`SELECT FROM "users" OFFSET 10`));
    });
  });

  describe("order", () => {
    it("takes *args", () => {
      const manager = new SelectManager();
      manager.project(new Nodes.SqlLiteral("*"));
      manager.from(users);
      manager.order(users.get("id"), users.get("name"));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`SELECT * FROM "users" ORDER BY "users"."id", "users"."name"`),
      );
    });
  });

  describe("join", () => {
    it("takes the full outer join class", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const manager = new SelectManager();

      manager.from(left);
      manager.join(right, Nodes.FullOuterJoin).on(predicate);
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT FROM "users"
            FULL OUTER JOIN "users" "users_2"
              ON "users"."id" = "users_2"."id"
        `),
      );
    });

    it("takes the right outer join class", () => {
      const left = new Table("users");
      const right = left.alias();
      const predicate = left.get("id").eq(right.get("id"));
      const manager = new SelectManager();

      manager.from(left);
      manager.join(right, Nodes.RightOuterJoin).on(predicate);
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT FROM "users"
            RIGHT OUTER JOIN "users" "users_2"
              ON "users"."id" = "users_2"."id"
        `),
      );
    });
  });

  describe("group", () => {
    it("takes an attribute", () => {
      const mgr = new SelectManager(users);
      mgr.group(users.get("id"));
      expect(mgr.toSql()).toBe('SELECT FROM "users" GROUP BY "users"."id"');
    });

    it("makes strings literals", () => {
      const manager = new SelectManager();
      manager.from(users);
      manager.group("foo");
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike(`SELECT FROM "users" GROUP BY foo`));
    });
  });

  describe("window definition", () => {
    it("takes an order", () => {
      const mgr = new SelectManager(users);
      mgr.window("a_window").order(users.get("foo").asc());
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" WINDOW "a_window" AS (ORDER BY "users"."foo" ASC)',
      );
    });

    it("takes an order with multiple columns", () => {
      const mgr = new SelectManager(users);
      mgr.window("a_window").order(users.get("foo").asc(), users.get("bar").desc());
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" WINDOW "a_window" AS (ORDER BY "users"."foo" ASC, "users"."bar" DESC)',
      );
    });

    it("takes a partition", () => {
      const mgr = new SelectManager(users);
      mgr.window("a_window").partition(users.get("bar"));
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" WINDOW "a_window" AS (PARTITION BY "users"."bar")',
      );
    });

    it("takes a partition with multiple columns", () => {
      const mgr = new SelectManager(users);
      mgr.window("a_window").partition(users.get("bar"), users.get("baz"));
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" WINDOW "a_window" AS (PARTITION BY "users"."bar", "users"."baz")',
      );
    });

    it("takes a range frame, unbounded following", () => {
      const mgr = new SelectManager(users);
      mgr.window("a_window").range(new Nodes.Following());
      expect(mgr.toSql()).toBe(
        'SELECT FROM "users" WINDOW "a_window" AS (RANGE UNBOUNDED FOLLOWING)',
      );
    });
  });

  describe("delete", () => {
    it("copies where", () => {
      const mgr = new SelectManager(users);
      mgr.project(star()).where(users.get("id").eq(1)).where(users.get("name").eq("Alice"));
      const whereSql = mgr.whereSql()?.value;
      expect(whereSql).toContain("WHERE");
      expect(whereSql).toContain("AND");
      expect(mgr.constraints.length).toBe(2);
    });
  });

  describe("where_sql", () => {
    it("gives me back the where sql", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(10));
      expect(mgr.whereSql()?.value).toBe('WHERE "users"."id" = 10');
    });

    it("joins wheres with AND", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(10));
      mgr.where(users.get("id").eq(11));
      expect(mgr.whereSql()?.value).toBe('WHERE "users"."id" = 10 AND "users"."id" = 11');
    });

    it("handles database-specific statements", () => {
      const pgEngine = {
        connection: { visitor: new Visitors.PostgreSQL(fakeRecordConnection) },
      };
      const mgr = new SelectManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(10));
      mgr.where(users.get("name").matches("foo%"));
      expect(mgr.whereSql(pgEngine)?.value).toBe(
        `WHERE "users"."id" = 10 AND "users"."name" ILIKE 'foo%'`,
      );
    });

    it("returns nil when there are no wheres", () => {
      const mgr = new SelectManager(users).project(star());
      expect(mgr.whereSql()).toBeNull();
    });
  });

  describe("take", () => {
    it("knows take", () => {
      const manager = new SelectManager();
      manager.from(users).project(users.get("id"));
      manager.where(users.get("id").eq(1));
      manager.take(1);

      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id"
          FROM "users"
          WHERE "users"."id" = 1
          LIMIT 1
        `),
      );
    });
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

    // Comment sanitization is an adapter behaviour: the visitor routes each hint
    // through `connection.sanitizeAsSqlComment`, and the suite's FakeRecord engine
    // returns it unchanged (fake_record.rb:63-65). These tests exercise the
    // sanitizing path, so they name a real quoting connection at the call site.
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
      // Rails always wraps the sanitized-and-joined hints in `/*+ ... */`
      // (to_sql.rb:170-172); it never drops the comment when the hints reduce to
      // empty, so `optimizer_hints("/* */", "/**/")` still emits the marker.
      const mgr = new SelectManager(users).project(star()).optimizerHints("/* */", "/**/");
      expect(new Visitors.ToSql(testConnection).compile(mgr.ast)).toBe(
        'SELECT /*+   */ * FROM "users"',
      );
    });

    // Mirrors Rails: `optimizer_hints(*hints)` builds
    // `Nodes::OptimizerHints.new(hints)` (select_manager.rb), so the AST
    // carries an OptimizerHints node — not a bare string array.
    it("stores hints as an OptimizerHints node on the SelectCore", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints("X", "Y");
      expect(mgr.ast.cores[0].optimizerHints).toBeInstanceOf(Nodes.OptimizerHints);
      expect((mgr.ast.cores[0].optimizerHints as Nodes.OptimizerHints).expr).toEqual(["X", "Y"]);
    });

    // Mirrors Rails: `optimizer_hints` is a no-op when called with no
    // arguments (the Rails impl skips the assignment when hints empty).
    it("is a no-op when called with no hints", () => {
      const mgr = new SelectManager(users).project(star()).optimizerHints();
      expect(mgr.ast.cores[0].optimizerHints).toBeNull();
    });
  });
});
