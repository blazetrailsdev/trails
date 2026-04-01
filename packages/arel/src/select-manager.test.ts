import { describe, it, expect } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  Nodes,
  Visitors,
} from "./index.js";

describe("SelectManagerTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();
  it("join sources", () => {
    const mgr = users.project(star);
    expect(mgr.joinSources).toEqual([]);
  });

  describe("backwards compatibility", () => {
    describe("project", () => {
      it("accepts symbols as sql literals", () => {
        const mgr = new SelectManager();
        mgr.project("id");
        mgr.from(users);
        expect(mgr.toSql()).toContain("SELECT id");
      });
    });

    describe("order", () => {
      it("accepts symbols", () => {
        const mgr = new SelectManager();
        mgr.project(star);
        mgr.from(users);
        mgr.order(new Nodes.SqlLiteral("foo"));
        expect(mgr.toSql()).toContain("ORDER BY");
        expect(mgr.toSql()).toContain("foo");
      });
    });

    describe("group", () => {
      it("takes a symbol", () => {
        const mgr = new SelectManager();
        mgr.from(users);
        mgr.group("foo");
        expect(mgr.toSql()).toContain("GROUP BY");
        expect(mgr.toSql()).toContain("foo");
      });
    });

    describe("as", () => {
      it("makes an AS node by grouping the AST", () => {
        const mgr = new SelectManager();
        const as = mgr.as("foo");
        expect(as).toBeInstanceOf(Nodes.TableAlias);
        expect(as.name).toBe("foo");
      });

      it("converts right to SqlLiteral if a string", () => {
        const mgr = new SelectManager();
        const as = mgr.as("foo");
        expect(as).toBeInstanceOf(Nodes.TableAlias);
        const sql = new Visitors.ToSql().compile(as);
        expect(sql).toContain("foo");
      });

      it("can make a subselect", () => {
        const mgr = new SelectManager();
        mgr.project(star);
        mgr.from(new Nodes.SqlLiteral("zomg"));
        const as = mgr.as("foo");
        const outer = new SelectManager();
        outer.project(new Nodes.SqlLiteral("name"));
        outer.from(as);
        const sql = outer.toSql();
        expect(sql).toContain("name");
        expect(sql).toContain("foo");
      });
    });

    describe("from", () => {
      it("ignores strings when table of same name exists", () => {
        const mgr = new SelectManager();
        mgr.from(users);
        mgr.from("users");
        mgr.project(users.get("id"));
        const sql = mgr.toSql();
        expect(sql).toContain('"users"."id"');
        expect(sql).toContain("FROM");
      });

      it("should support any ast", () => {
        const mgr1 = new SelectManager();
        const mgr2 = new SelectManager();
        mgr2.project(star);
        mgr2.from(users);
        const as = mgr2.as("omg");
        mgr1.project(new Nodes.SqlLiteral("lol"));
        mgr1.from(as);
        expect(mgr1.toSql()).toContain("lol");
      });
    });

    describe("having", () => {
      it("converts strings to SQLLiterals", () => {
        const mgr = users.from();
        mgr.having(new Nodes.SqlLiteral("foo"));
        expect(mgr.toSql()).toContain("HAVING");
        expect(mgr.toSql()).toContain("foo");
      });

      it("can have multiple items specified separately", () => {
        const mgr = users.from();
        mgr.having(new Nodes.SqlLiteral("foo"));
        mgr.having(new Nodes.SqlLiteral("bar"));
        expect(mgr.toSql()).toContain("HAVING");
        expect(mgr.toSql()).toContain("foo");
      });

      it("can receive any node", () => {
        const mgr = users.from();
        mgr.having(new Nodes.And([new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")]));
        expect(mgr.toSql()).toContain("HAVING");
        expect(mgr.toSql()).toContain("foo");
      });
    });

    describe("on", () => {
      it("converts to sqlliterals", () => {
        const right = users.alias();
        const mgr = users.from();
        mgr.join(right).on(new Nodes.SqlLiteral("omg"));
        expect(mgr.toSql()).toContain("omg");
      });

      it("converts to sqlliterals with multiple items", () => {
        const right = users.alias();
        const mgr = users.from();
        mgr.join(right).on(new Nodes.SqlLiteral("omg"), new Nodes.SqlLiteral("123"));
        expect(mgr.toSql()).toContain("omg");
        expect(mgr.toSql()).toContain("123");
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
      mgr.project(star);
      mgr.where(users.get("id").eq(1));
      const sql = mgr.toSql();
      expect(sql).toContain("WHERE");
      expect(sql).toContain("*");
    });
  });

  describe("initialize", () => {
    it("uses alias in sql", () => {
      const aliased = users.alias("u");
      const mgr = new SelectManager();
      mgr.from(aliased);
      mgr.project(new Nodes.SqlLiteral("*"));
      expect(mgr.toSql()).toContain('"u"');
    });
  });

  describe("skip", () => {
    it("should add an offset", () => {
      const mgr = users.project(star).skip(5);
      expect(mgr.toSql()).toContain("OFFSET 5");
    });
  });

  describe("offset", () => {
    it("should add an offset", () => {
      const mgr = users.skip(5).project(star);
      expect(mgr.toSql()).toContain("OFFSET 5");
    });

    it("should remove an offset", () => {
      const mgr = new SelectManager(users);
      mgr.skip(10);
      expect(mgr.offset).not.toBeNull();
      mgr.ast.offset = null;
      expect(mgr.offset).toBeNull();
    });

    it("should return the offset", () => {
      const mgr = users.project(star).skip(5);
      expect(mgr.offset).not.toBeNull();
    });
  });

  describe("exists", () => {
    it("should create an exists clause", () => {
      const mgr = users.project(star).where(users.get("age").gt(21));
      const exists = mgr.exists();
      expect(exists).toBeInstanceOf(Nodes.Exists);
    });

    it("can be aliased", () => {
      const mgr = users.project(users.get("id"));
      const aliased = mgr.as("sub");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("sub");
    });
  });

  describe("union", () => {
    it("should union two managers", () => {
      const q1 = users.project(users.get("name")).where(users.get("age").gt(21));
      const q2 = users.project(users.get("name")).where(users.get("age").lt(18));
      const union = q1.union(q2);
      const visitor = new Visitors.ToSql();
      const compiled = visitor.compile(union);
      expect(compiled).toContain("UNION");
    });

    it("should union all", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(q1.unionAll(q2))).toContain("UNION ALL");
    });
  });

  describe("intersect", () => {
    it("should intersect two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(q1.intersect(q2))).toContain("INTERSECT");
    });
  });

  describe("except", () => {
    it("should except two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(q1.except(q2))).toContain("EXCEPT");
    });
  });

  describe("with", () => {
    it("should support basic WITH", () => {
      const cte = users.project(users.get("name")).where(users.get("age").gt(21));
      const alias = new Nodes.TableAlias(cte.ast, "adults");
      const cteAs = new Nodes.As(alias, cte.ast);
      const main = new SelectManager();
      main.with(cteAs);
      main.from("adults");
      main.project(sql("*"));
      expect(main.toSql()).toContain("WITH");
    });

    it("should support WITH RECURSIVE", () => {
      const cte = users.project(star);
      const alias = new Nodes.TableAlias(cte.ast, "tree");
      const cteAs = new Nodes.As(alias, cte.ast);
      const main = new SelectManager();
      main.withRecursive(cteAs);
      main.from("tree");
      main.project(sql("*"));
      expect(main.toSql()).toContain("WITH RECURSIVE");
    });
  });

  describe("ast", () => {
    it("should return the ast", () => {
      const mgr = users.project(star);
      expect(mgr.ast).toBeInstanceOf(Nodes.SelectStatement);
    });
  });

  describe("taken", () => {
    it("should return limit", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.limit).not.toBeNull();
    });
  });

  describe("lock", () => {
    it("adds a lock node", () => {
      const mgr = users.project(star).lock();
      expect(mgr.toSql()).toContain("FOR UPDATE");
    });
  });

  describe("orders", () => {
    it("returns order clauses", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.orders.length).toBe(1);
    });
  });

  describe("order", () => {
    it("generates order clauses", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.toSql()).toContain("ORDER BY");
    });
  });

  describe("order", () => {
    it("chains", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });

  describe("order", () => {
    it("has order attributes", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.orders[0]).toBeInstanceOf(Nodes.Ascending);
    });
  });

  describe("on", () => {
    it("takes two params", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"), users.get("name"));
      const sql = mgr.toSql();
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
    });

    it("takes three params", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"), users.get("name"), users.get("email"));
      const sql = mgr.toSql();
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
      expect(sql).toContain('"email"');
    });
  });

  it("should hand back froms", () => {
    const mgr = users.project(star);
    expect(mgr.froms.length).toBe(1);
  });

  it("should create and nodes", () => {
    const mgr = new SelectManager(users);
    const and = mgr.createAnd([users.get("id").eq(1), users.get("name").eq("dean")]);
    expect(and).toBeInstanceOf(Nodes.And);
  });

  it("should create insert managers", () => {
    const mgr = new SelectManager(users);
    const insert = mgr.createInsert();
    expect(insert).toBeInstanceOf(InsertManager);
  });

  it("should create join nodes", () => {
    const mgr = new SelectManager(users);
    const join = mgr.createJoin(posts, users.get("id").eq(posts.get("user_id")));
    expect(join).toBeInstanceOf(Nodes.InnerJoin);
  });

  describe("outer join", () => {
    it("responds to join", () => {
      const mgr = users.project(star);
      expect(mgr).toHaveProperty("join");
    });
  });

  describe("join", () => {
    it("takes a class", () => {
      // In Rails, SelectManager can take a class. We take a Table.
      const mgr = new SelectManager(users);
      expect(mgr).toBeInstanceOf(SelectManager);
    });
  });

  describe("join", () => {
    it("noops on nil", () => {
      // Table.join with a null-like argument - the manager still works
      const mgr = users.from();
      expect(mgr).toBeInstanceOf(SelectManager);
    });
  });

  describe("join", () => {
    it("raises EmptyJoinError on empty", () => {
      expect(() => users.join("")).toThrow("EmptyJoinError");
    });
  });

  describe("outer join", () => {
    it("noops on nil", () => {
      // Creating a SelectManager with no table
      const mgr = new SelectManager(null);
      expect(mgr).toBeInstanceOf(SelectManager);
    });
  });

  describe("joins", () => {
    it("returns inner join sql", () => {
      const mgr = users
        .project(users.get("name"), posts.get("title"))
        .join(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.toSql()).toContain("INNER JOIN");
    });

    it("returns outer join sql", () => {
      const mgr = users.project(star).outerJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.toSql()).toContain("LEFT OUTER JOIN");
    });

    it("can have a non-table alias as relation name", () => {
      const subq = new SelectManager(users);
      subq.project(star);
      const alias = subq.as("subquery");
      expect(alias).toBeInstanceOf(Nodes.TableAlias);
    });

    it("joins itself", () => {
      const mgr = users
        .project(star)
        .join(posts)
        .on(users.get("id").eq(posts.get("user_id")));
      const result = mgr.toSql();
      expect(result).toContain("INNER JOIN");
      expect(result).toContain('"posts"');
    });

    it("returns string join sql", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      mgr.ast.cores[0].source.right.push(
        new Nodes.StringJoin(
          new Nodes.SqlLiteral('JOIN "posts" ON "posts"."user_id" = "users"."id"'),
        ),
      );
      expect(mgr.toSql()).toContain('JOIN "posts"');
    });
  });

  describe("group", () => {
    it("chains", () => {
      const mgr = users.project(star);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });

  describe("project", () => {
    it("takes multiple args", () => {
      const mgr = users.project(users.get("id"), users.get("name"));
      expect(mgr.toSql()).toContain('"users"."id"');
      expect(mgr.toSql()).toContain('"users"."name"');
    });
  });

  describe("window definition", () => {
    it("can be empty", () => {
      const mgr = new SelectManager();
      expect(mgr.toSql()).toBeDefined();
    });

    it("takes a partition and an order", () => {
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      w.order(users.get("salary").desc());
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const compiled = visitor.compile(new Nodes.Over(fn, w));
      expect(compiled).toContain("ROW_NUMBER()");
      expect(compiled).toContain("OVER");
      expect(compiled).toContain("PARTITION BY");
      expect(compiled).toContain("ORDER BY");
    });

    it("takes a rows frame, unbounded preceding", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Rows(new Nodes.Preceding()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("ROWS UNBOUNDED PRECEDING");
    });

    it("takes a rows frame, bounded preceding", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Rows(new Nodes.Preceding(new Nodes.Quoted(3))));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("3 PRECEDING");
    });

    it("takes a rows frame, unbounded following", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Following())).toBe("UNBOUNDED FOLLOWING");
    });

    it("takes a rows frame, bounded following", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Following(new Nodes.Quoted(5)))).toBe("5 FOLLOWING");
    });

    it("takes a rows frame, current row", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.CurrentRow())).toBe("CURRENT ROW");
    });

    it("takes a rows frame, between two delimiters", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Rows(new Nodes.Between(new Nodes.CurrentRow(), new Nodes.Following())));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(new Nodes.Over(fn, w));
      expect(result).toContain("ROWS");
      expect(result).toContain("CURRENT ROW");
    });

    it("takes a range frame, unbounded preceding", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Range(new Nodes.Preceding()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("RANGE UNBOUNDED PRECEDING");
    });

    it("takes a range frame, bounded preceding", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Range(new Nodes.Preceding(new Nodes.Quoted(3))));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("3 PRECEDING");
    });

    it("takes a range frame, bounded following", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"));
      const win = mgr.window("w");
      win.frame(new Nodes.Range(new Nodes.Following(new Nodes.Quoted(3))));
      const sql = mgr.toSql();
      expect(sql).toContain("RANGE");
      expect(sql).toContain("FOLLOWING");
    });

    it("takes a range frame, current row", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Range(new Nodes.CurrentRow()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("RANGE CURRENT ROW");
    });

    it("takes a range frame, between two delimiters", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"));
      const win = mgr.window("w");
      win.frame(new Nodes.Rows(new Nodes.Preceding()));
      const sql = mgr.toSql();
      expect(sql).toContain("ROWS");
      expect(sql).toContain("UNBOUNDED PRECEDING");
    });
  });

  describe("delete", () => {
    it("copies from", () => {
      const mgr = new SelectManager(users);
      mgr.from(posts);
      const sql = mgr.toSql();
      expect(sql).toContain('"posts"');
    });
  });

  describe("where_sql", () => {
    it("gives me back the where sql", () => {
      const mgr = users
        .project(star)
        .where(users.get("name").eq("Alice"))
        .where(users.get("age").gt(18));
      expect(mgr.constraints.length).toBe(2);
    });

    it("joins wheres with AND", () => {
      const mgr = users
        .project(star)
        .where(users.get("name").eq("Alice"))
        .where(users.get("age").gt(18));
      expect(mgr.toSql()).toContain("AND");
    });

    it("handles database-specific statements", () => {
      const mgr = new SelectManager(users);
      mgr.lock();
      const sql = mgr.toSql();
      expect(sql).toContain("FOR UPDATE");
    });
  });

  describe("update", () => {
    it("creates an update statement", () => {
      const mgr = users.project(star);
      mgr.where(users.get("id").eq(1));
      // compileUpdate exists on SelectManager
      expect(mgr).toHaveProperty("compileUpdate");
    });

    it("takes a string", () => {
      const mgr = users.project(new Nodes.SqlLiteral("count(*)"));
      expect(mgr.toSql()).toContain("count(*)");
    });

    it("copies limits", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("copies order", () => {
      const mgr = users.project(star).order(users.get("id").asc());
      expect(mgr.toSql()).toContain("ORDER BY");
    });

    it("copies where clauses", () => {
      const mgr = users.project(star).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("copies where clauses when nesting is triggered", () => {
      const mgr = users
        .project(star)
        .where(users.get("id").eq(1))
        .where(users.get("name").eq("test"));
      const result = mgr.toSql();
      expect(result).toContain('"users"."id" = 1');
      expect(result).toContain("AND");
    });
  });

  describe("project", () => {
    it("takes sql literals", () => {
      const mgr = users.project(new Nodes.SqlLiteral("*"));
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });

    it("takes strings", () => {
      const mgr = users.project(new Nodes.SqlLiteral("id"), new Nodes.SqlLiteral("name"));
      const result = mgr.toSql();
      expect(result).toContain("id");
      expect(result).toContain("name");
    });
  });

  describe("projections", () => {
    it("reads projections", () => {
      const mgr = users.project(users.get("name"), users.get("age"));
      expect(mgr.projections.length).toBe(2);
    });
  });

  describe("projections=", () => {
    it("overwrites projections", () => {
      const mgr = users.project(users.get("name"));
      mgr.projections = [users.get("age")];
      expect(mgr.projections.length).toBe(1);
      expect(mgr.toSql()).toContain('"age"');
    });
  });

  describe("take", () => {
    it("chains", () => {
      const um = new UpdateManager();
      const result = um.table(users);
      expect(result).toBe(um);
    });
  });

  describe("take", () => {
    it("removes LIMIT when nil is passed", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });
  });

  describe("where", () => {
    it("knows where", () => {
      const mgr = users.project(star).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });
  });

  describe("comment", () => {
    it("chains", () => {
      const mgr = new SelectManager(users);
      const result = mgr.project(star);
      expect(result).toBe(mgr);
    });
  });

  describe("from", () => {
    it("makes sql", () => {
      const mgr = users.project(star);
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });
  });

  describe("source", () => {
    it("returns the join source of the select core", () => {
      const mgr = users.project(star);
      expect(mgr.source).toBeDefined();
    });
  });

  describe("distinct_on", () => {
    it("sets the quantifier", () => {
      const mgr = users.project(star);
      mgr.distinct();
      expect(mgr.toSql()).toContain("DISTINCT");
    });
  });

  describe("comment", () => {
    it("appends a comment to the generated query", () => {
      const mgr = users.project(star).comment("load users");
      expect(mgr.toSql()).toContain("/* load users */");
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
          .join(posts, users.get("id").eq(posts.get("user_id")))
          .toSql(),
      ).toBe(
        'SELECT "users"."name", "posts"."title" FROM "users" INNER JOIN "posts" ON "users"."id" = "posts"."user_id"',
      );
    });

    it("returns outer join sql", () => {
      expect(
        users
          .project(star)
          .outerJoin(posts, users.get("id").eq(posts.get("user_id")))
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

  describe("lock", () => {
    it("adds a lock node", () => {
      expect(users.project(star).lock().toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
    });
  });

  it("chaining returns the manager", () => {
    const mgr = users.project(star);
    expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    expect(mgr.order(users.get("id").asc())).toBe(mgr);
    expect(mgr.take(10)).toBe(mgr);
    expect(mgr.skip(5)).toBe(mgr);
    expect(mgr.group(users.get("id"))).toBe(mgr);
  });

  it("rightOuterJoin generates RIGHT OUTER JOIN", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.rightOuterJoin(posts, users.get("id").eq(posts.get("user_id")));
    expect(mgr.toSql()).toContain("RIGHT OUTER JOIN");
    expect(mgr.toSql()).toContain('"posts"');
  });

  it("fullOuterJoin generates FULL OUTER JOIN", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.fullOuterJoin(posts, users.get("id").eq(posts.get("user_id")));
    expect(mgr.toSql()).toContain("FULL OUTER JOIN");
  });

  it("crossJoin generates CROSS JOIN", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.crossJoin(posts);
    expect(mgr.toSql()).toContain("CROSS JOIN");
    expect(mgr.toSql()).toContain('"posts"');
  });

  it("window creates a named window", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    const win = mgr.window("w");
    win.order(users.get("created_at").asc());
    // The window should be in core.windows
    expect(mgr.toSql()).toContain("WINDOW");
  });

  it("rightOuterJoin with string table name", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.rightOuterJoin("posts");
    expect(mgr.toSql()).toContain("RIGHT OUTER JOIN");
  });

  it("fullOuterJoin with string table name", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.fullOuterJoin("posts");
    expect(mgr.toSql()).toContain("FULL OUTER JOIN");
  });

  it("crossJoin with string table name", () => {
    const mgr = new SelectManager(users);
    mgr.project(star);
    mgr.crossJoin("posts");
    expect(mgr.toSql()).toContain("CROSS JOIN");
  });

  describe("projections", () => {
    it("reads projections", () => {
      const users = new Table("users");
      const manager = users.project(users.attr("name"), users.attr("age"));
      expect(manager.projections.length).toBe(2);
    });
  });

  describe("projections=", () => {
    it("overwrites projections", () => {
      const users = new Table("users");
      const manager = users.project(users.attr("name"));
      expect(manager.projections.length).toBe(1);
      manager.projections = [users.attr("age")];
      expect(manager.projections.length).toBe(1);
      const sql = manager.toSql();
      expect(sql).toContain('"age"');
      expect(sql).not.toContain('"name"');
    });
  });

  describe("where_sql", () => {
    it("gives me back the where sql", () => {
      const users = new Table("users");
      const manager = users
        .project("*")
        .where(users.attr("name").eq("Alice"))
        .where(users.attr("age").gt(18));
      expect(manager.constraints.length).toBe(2);
    });
  });

  it("should hand back froms", () => {
    const users = new Table("users");
    const manager = users.project("*");
    expect(manager.source).toBeDefined();
  });

  describe("orders", () => {
    it("returns order clauses", () => {
      const users = new Table("users");
      const manager = users.project("*").order(users.attr("name").asc());
      expect(manager.orders.length).toBe(1);
    });
  });

  describe("exists", () => {
    it("can be aliased", () => {
      const users = new Table("users");
      const subquery = users.project(users.attr("id"));
      const aliased = subquery.as("sub");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("sub");
    });
  });

  it("returns empty array when no joins", () => {
    const manager = users.project("*");
    expect(manager.joinSources).toEqual([]);
  });

  it("returns join nodes after join()", () => {
    const manager = users.project("*").join(posts, users.attr("id").eq(posts.attr("user_id")));
    expect(manager.joinSources.length).toBe(1);
    expect(manager.joinSources[0]).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("returns multiple join nodes", () => {
    const comments = new Table("comments");
    const manager = users
      .project("*")
      .join(posts, users.attr("id").eq(posts.attr("user_id")))
      .outerJoin(comments, posts.attr("id").eq(comments.attr("post_id")));
    expect(manager.joinSources.length).toBe(2);
    expect(manager.joinSources[0]).toBeInstanceOf(Nodes.InnerJoin);
    expect(manager.joinSources[1]).toBeInstanceOf(Nodes.OuterJoin);
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
    const mgr = users.order(users.get("name").asc()).project(star);
    expect(mgr.toSql()).toContain("ORDER BY");
  });

  describe("skip", () => {
    it("should chain", () => {
      const mgr = new SelectManager(users);
      expect(mgr.project(star)).toBe(mgr);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
      expect(mgr.order(users.get("id").asc())).toBe(mgr);
    });
  });

  describe("order", () => {
    it("takes *args", () => {
      const mgr = users.project(star).order(users.get("id").asc(), users.get("name").desc());
      expect(mgr.orders.length).toBe(2);
      expect(mgr.toSql()).toContain("ORDER BY");
    });
  });

  it("should create join nodes with a full outer join klass", () => {
    const mgr = new SelectManager(users);
    const join = mgr.createJoin(
      posts,
      users.get("id").eq(posts.get("user_id")),
      Nodes.FullOuterJoin,
    );
    expect(join).toBeInstanceOf(Nodes.FullOuterJoin);
  });

  it("should create join nodes with an outer join klass", () => {
    const mgr = new SelectManager(users);
    const join = mgr.createJoin(posts, users.get("id").eq(posts.get("user_id")), Nodes.OuterJoin);
    expect(join).toBeInstanceOf(Nodes.OuterJoin);
  });

  it("should create join nodes with a right outer join klass", () => {
    const mgr = new SelectManager(users);
    const join = mgr.createJoin(
      posts,
      users.get("id").eq(posts.get("user_id")),
      Nodes.RightOuterJoin,
    );
    expect(join).toBeInstanceOf(Nodes.RightOuterJoin);
  });

  describe("join", () => {
    it("takes the full outer join class", () => {
      const mgr = users
        .project(star)
        .fullOuterJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.joinSources[0]).toBeInstanceOf(Nodes.FullOuterJoin);
      expect(mgr.toSql()).toContain("FULL OUTER JOIN");
    });

    it("takes the right outer join class", () => {
      const mgr = users
        .project(star)
        .rightOuterJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.joinSources[0]).toBeInstanceOf(Nodes.RightOuterJoin);
      expect(mgr.toSql()).toContain("RIGHT OUTER JOIN");
    });
  });

  describe("group", () => {
    it("takes an attribute", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id").over(mgr.window("w")));
      const sql = mgr.toSql();
      expect(sql).toContain("OVER");
    });

    it("makes strings literals", () => {
      const mgr = new SelectManager();
      mgr.from("users").project("*");
      expect(mgr.froms[0]).toBeInstanceOf(Nodes.SqlLiteral);
      expect(mgr.toSql()).toContain("FROM users");
    });
  });

  describe("window definition", () => {
    it("takes an order", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id").over(mgr.window("w").order(users.get("id").asc())));
      expect(mgr.toSql()).toContain("ORDER BY");
    });

    it("takes an order with multiple columns", () => {
      const mgr = new SelectManager(users);
      mgr.project(
        users
          .get("id")
          .over(mgr.window("w").order(users.get("id").asc(), users.get("name").desc())),
      );
      const sql = mgr.toSql();
      expect(sql).toContain("ORDER BY");
      expect(sql).toContain(",");
    });

    it("takes a partition", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id").over(mgr.window("w").partition(users.get("name"))));
      expect(mgr.toSql()).toContain("PARTITION BY");
    });

    it("takes a partition with multiple columns", () => {
      const mgr = new SelectManager(users);
      mgr.project(
        users.get("id").over(mgr.window("w").partition(users.get("name"), users.get("age"))),
      );
      const sql = mgr.toSql();
      expect(sql).toContain("PARTITION BY");
      expect(sql).toContain(",");
    });

    it("takes a range frame, unbounded following", () => {
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"));
      const win = mgr.window("w");
      win.frame(new Nodes.Range(new Nodes.Following()));
      const sql = mgr.toSql();
      expect(sql).toContain("RANGE");
      expect(sql).toContain("UNBOUNDED FOLLOWING");
    });
  });

  describe("delete", () => {
    it("copies where", () => {
      const mgr = new SelectManager(users);
      mgr.project(star).where(users.get("id").eq(1)).where(users.get("name").eq("Alice"));
      const whereSql = mgr.whereSql();
      expect(whereSql).toContain("WHERE");
      expect(whereSql).toContain("AND");
      expect(mgr.constraints.length).toBe(2);
    });
  });

  describe("where_sql", () => {
    it("returns nil when there are no wheres", () => {
      const mgr = new SelectManager(users).project(star);
      expect(mgr.whereSql()).toBeNull();
    });
  });

  describe("take", () => {
    it("knows take", () => {
      const mgr = new SelectManager(users).project(star).take(5);
      expect(mgr.limit).toBeInstanceOf(Nodes.Limit);
      expect(mgr.toSql()).toContain("LIMIT 5");
    });
  });

  describe("optimizerHints", () => {
    it("places hints after SELECT", () => {
      const mgr = new SelectManager(users).project(star).optimizerHints("MAX_EXECUTION_TIME(1000)");
      expect(mgr.toSql()).toBe('SELECT /*+ MAX_EXECUTION_TIME(1000) */ * FROM "users"');
    });

    it("supports multiple hints", () => {
      const mgr = new SelectManager(users)
        .project(star)
        .optimizerHints("NO_INDEX_MERGE(users)", "BKA(users)");
      expect(mgr.toSql()).toBe('SELECT /*+ NO_INDEX_MERGE(users) BKA(users) */ * FROM "users"');
    });

    it("sanitizes comment delimiters from hints", () => {
      const mgr = new SelectManager(users)
        .project(star)
        .optimizerHints("HINT */ DROP TABLE users --");
      const sql = mgr.toSql();
      expect(sql).toBe('SELECT /*+ HINT DROP TABLE users */ * FROM "users"');
    });

    it("sanitizes newlines from hints", () => {
      const mgr = new SelectManager(users).project(star).optimizerHints("HINT\nwith\nnewlines");
      const sql = mgr.toSql();
      expect(sql).not.toContain("\n");
      expect(sql).toContain("/*+ HINT with newlines */");
    });

    it("strips empty hints after sanitization", () => {
      const mgr = new SelectManager(users).project(star).optimizerHints("/* */", "--");
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });
  });
});
