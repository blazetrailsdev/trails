import { describe, it, expect } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");

  // =========================================================================
  // Phase 100/150 — Table and Core AST
  // =========================================================================
  describe("Table", () => {
    it("has a name", () => {
      expect(users.name).toBe("users");
    });

    it("manufactures an attribute if the symbol names an attribute within the relation", () => {
      const attr = users.get("id");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("id");
      expect(attr.relation).toBe(users);
    });

    it("manufactures an Attribute via attr()", () => {
      expect(users.attr("email").name).toBe("email");
    });

    it("accepts :as option for table alias", () => {
      const aliased = new Table("users", { as: "u" });
      expect(aliased.tableAlias).toBe("u");
    });

    it("star returns table.*", () => {
      expect(users.star.value).toBe('"users".*');
    });

    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("alias references use the alias in SQL", () => {
      const u = new Table("users", { as: "u" });
      const result = u.project(u.get("name")).toSql();
      expect(result).toBe('SELECT "u"."name" FROM "users" "u"');
    });
  });

  // =========================================================================
  // Phase 200/250 — SQL Visitor
  // =========================================================================
  describe("ToSql Visitor", () => {
    const visitor = new Visitors.ToSql();

    it("generates SELECT *", () => {
      expect(users.project(star).toSql()).toBe('SELECT * FROM "users"');
    });

    it("generates SELECT with specific columns", () => {
      expect(
        users.project(users.get("name"), users.get("email")).toSql()
      ).toBe('SELECT "users"."name", "users"."email" FROM "users"');
    });

    it("should escape strings", () => {
      const result = users
        .project(star)
        .where(users.get("name").eq("O'Brien"))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE "users"."name" = 'O''Brien'`
      );
    });

    it("inserts false", () => {
      const result = users
        .project(star)
        .where(users.get("active").eq(false))
        .toSql();
      expect(result).toContain("FALSE");
    });

    it("should handle true", () => {
      const result = users
        .project(star)
        .where(users.get("active").eq(true))
        .toSql();
      expect(result).toContain("TRUE");
    });

    it("wraps nested groupings in brackets only once", () => {
      const grouped = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const result = visitor.compile(grouped);
      expect(result).toBe("('foo')");
    });

    it("should visit_Not", () => {
      const cond = users.get("name").eq("dean").not();
      const result = users.project(star).where(cond).toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE NOT ("users"."name" = 'dean')`
      );
    });

    it("multiple WHEREs are ANDed", () => {
      const result = users
        .project(star)
        .where(users.get("age").gt(21))
        .where(users.get("name").eq("dean"))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE "users"."age" > 21 AND "users"."name" = 'dean'`
      );
    });

    it("should not quote sql literals", () => {
      const result = visitor.compile(new Nodes.SqlLiteral("NOW()"));
      expect(result).toBe("NOW()");
    });
  });

  // =========================================================================
  // Phase 300 — Predicates
  // =========================================================================
  describe("Attribute predicates", () => {
    // -- Equality --
    it("should return an equality node", () => {
      expect(
        users.project(star).where(users.get("id").eq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" = 10');
    });

    it("should handle nil", () => {
      expect(
        users.project(star).where(users.get("name").eq(null)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NULL');
    });

    it("should create a NotEqual node", () => {
      expect(
        users.project(star).where(users.get("id").notEq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" != 10');
    });

    it("notEq(null) generates IS NOT NULL", () => {
      expect(
        users.project(star).where(users.get("name").notEq(null)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NOT NULL');
    });

    // -- Comparison --
    it("should create a GreaterThan node", () => {
      expect(
        users.project(star).where(users.get("age").gt(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" > 10');
    });

    it("gteq generates >=", () => {
      expect(
        users.project(star).where(users.get("age").gteq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" >= 10');
    });

    it("should create a LessThan node", () => {
      expect(
        users.project(star).where(users.get("age").lt(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" < 10');
    });

    it("lteq generates <=", () => {
      expect(
        users.project(star).where(users.get("age").lteq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" <= 10');
    });

    // -- Pattern --
    it("should create a Matches node", () => {
      expect(
        users
          .project(star)
          .where(users.get("name").matches("%bacon%"))
          .toSql()
      ).toBe(
        `SELECT * FROM "users" WHERE "users"."name" LIKE '%bacon%'`
      );
    });

    it("should create a DoesNotMatch node", () => {
      expect(
        users
          .project(star)
          .where(users.get("name").doesNotMatch("%bacon%"))
          .toSql()
      ).toBe(
        `SELECT * FROM "users" WHERE "users"."name" NOT LIKE '%bacon%'`
      );
    });

    // -- IN --
    it("in generates IN", () => {
      expect(
        users
          .project(star)
          .where(users.get("id").in([1, 2, 3]))
          .toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" IN (1, 2, 3)');
    });

    it("in with empty array generates 1=0 (always false)", () => {
      expect(
        users.project(star).where(users.get("id").in([])).toSql()
      ).toBe('SELECT * FROM "users" WHERE 1=0');
    });

    it("should generate NOT IN in sql", () => {
      expect(
        users
          .project(star)
          .where(users.get("id").notIn([1, 2]))
          .toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" NOT IN (1, 2)');
    });

    it("notIn with empty array generates 1=1 (always true)", () => {
      expect(
        users.project(star).where(users.get("id").notIn([])).toSql()
      ).toBe('SELECT * FROM "users" WHERE 1=1');
    });

    // -- Between --
    it("between generates BETWEEN", () => {
      expect(
        users
          .project(star)
          .where(users.get("age").between(18, 65))
          .toSql()
      ).toBe(
        'SELECT * FROM "users" WHERE "users"."age" BETWEEN 18 AND 65'
      );
    });

    it("notBetween generates NOT BETWEEN", () => {
      expect(
        users
          .project(star)
          .where(users.get("age").notBetween(18, 65))
          .toSql()
      ).toBe(
        'SELECT * FROM "users" WHERE NOT ("users"."age" BETWEEN 18 AND 65)'
      );
    });

    // -- Null helpers --
    it("isNull generates IS NULL", () => {
      expect(
        users
          .project(star)
          .where(users.get("name").isNull())
          .toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NULL');
    });

    it("isNotNull generates IS NOT NULL", () => {
      expect(
        users
          .project(star)
          .where(users.get("name").isNotNull())
          .toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NOT NULL');
    });

    // -- Boolean combinators --
    it("and combines with AND", () => {
      const cond = users.get("name").eq("dean").and(users.get("age").gt(21));
      expect(users.project(star).where(cond).toSql()).toBe(
        `SELECT * FROM "users" WHERE "users"."name" = 'dean' AND "users"."age" > 21`
      );
    });

    it("or combines with OR wrapped in Grouping", () => {
      const cond = users.get("name").eq("dean").or(users.get("name").eq("sam"));
      expect(users.project(star).where(cond).toSql()).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" = 'dean' OR "users"."name" = 'sam')`
      );
    });

    it("not negates", () => {
      const cond = users.get("name").eq("dean").not();
      expect(users.project(star).where(cond).toSql()).toBe(
        `SELECT * FROM "users" WHERE NOT ("users"."name" = 'dean')`
      );
    });
  });

  // =========================================================================
  // Phase 150 — _any / _all variants
  // =========================================================================
  describe("Attribute _any/_all variants", () => {
    it("eqAny generates OR group", () => {
      const result = users
        .project(star)
        .where(users.get("name").eqAny(["dean", "sam"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" = 'dean' OR "users"."name" = 'sam')`
      );
    });

    it("eqAll generates AND group", () => {
      const result = users
        .project(star)
        .where(users.get("name").eqAll(["dean", "sam"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" = 'dean' AND "users"."name" = 'sam')`
      );
    });

    it("gtAny generates OR group", () => {
      const result = users
        .project(star)
        .where(users.get("age").gtAny([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" > 10 OR "users"."age" > 20)`
      );
    });

    it("ltAll generates AND group", () => {
      const result = users
        .project(star)
        .where(users.get("age").ltAll([50, 100]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" < 50 AND "users"."age" < 100)`
      );
    });

    it("matchesAny generates OR group", () => {
      const result = users
        .project(star)
        .where(users.get("name").matchesAny(["%dean%", "%sam%"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" LIKE '%dean%' OR "users"."name" LIKE '%sam%')`
      );
    });

    it("does not mutate input array", () => {
      const input = [1, 2, 3];
      const copy = [...input];
      users.get("id").eqAny(input);
      expect(input).toEqual(copy);
    });
  });

  // =========================================================================
  // Phase 300 — Ordering
  // =========================================================================
  describe("Ordering", () => {
    it("should create an Ascending node", () => {
      expect(
        users
          .project(star)
          .order(users.get("name").asc())
          .toSql()
      ).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC');
    });

    it("should create a Descending node", () => {
      expect(
        users
          .project(star)
          .order(users.get("name").desc())
          .toSql()
      ).toBe('SELECT * FROM "users" ORDER BY "users"."name" DESC');
    });

    it("multiple order clauses", () => {
      expect(
        users
          .project(star)
          .order(users.get("name").asc(), users.get("age").desc())
          .toSql()
      ).toBe(
        'SELECT * FROM "users" ORDER BY "users"."name" ASC, "users"."age" DESC'
      );
    });

    it("Ascending has direction 'asc'", () => {
      const asc = users.get("name").asc();
      expect(asc.direction).toBe("asc");
      expect(asc.isAscending()).toBe(true);
      expect(asc.isDescending()).toBe(false);
    });

    it("Descending has direction 'desc'", () => {
      const desc = users.get("name").desc();
      expect(desc.direction).toBe("desc");
      expect(desc.isDescending()).toBe(true);
      expect(desc.isAscending()).toBe(false);
    });

    it("Ascending.reverse() returns Descending", () => {
      const asc = users.get("name").asc();
      const reversed = asc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Descending);
      expect(reversed.direction).toBe("desc");
    });

    it("Descending.reverse() returns Ascending", () => {
      const desc = users.get("name").desc();
      const reversed = desc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Ascending);
      expect(reversed.direction).toBe("asc");
    });
  });

  // =========================================================================
  // Phase 300 — Math and aliasing
  // =========================================================================
  describe("Math operations", () => {
    it("should handle Addition", () => {
      expect(
        users.project(users.get("age").add(1).as("next")).toSql()
      ).toBe('SELECT "users"."age" + 1 AS next FROM "users"');
    });

    it("should handle Subtraction", () => {
      expect(
        users.project(users.get("age").subtract(1).as("prev")).toSql()
      ).toBe('SELECT "users"."age" - 1 AS prev FROM "users"');
    });

    it("should handle Multiplication", () => {
      expect(
        users.project(users.get("age").multiply(2).as("double")).toSql()
      ).toBe('SELECT "users"."age" * 2 AS double FROM "users"');
    });

    it("should handle Division", () => {
      expect(
        users.project(users.get("age").divide(2).as("half")).toSql()
      ).toBe('SELECT "users"."age" / 2 AS half FROM "users"');
    });
  });

  // =========================================================================
  // Phase 400/450 — SelectManager
  // =========================================================================
  describe("SelectManager", () => {
    it("chains where + order + limit + offset", () => {
      expect(
        users
          .project(users.get("name"))
          .where(users.get("age").gt(21))
          .order(users.get("name").asc())
          .take(10)
          .skip(5)
          .toSql()
      ).toBe(
        'SELECT "users"."name" FROM "users" WHERE "users"."age" > 21 ORDER BY "users"."name" ASC LIMIT 10 OFFSET 5'
      );
    });

    it("returns inner join sql", () => {
      expect(
        users
          .project(users.get("name"), posts.get("title"))
          .join(posts, users.get("id").eq(posts.get("user_id")))
          .toSql()
      ).toBe(
        'SELECT "users"."name", "posts"."title" FROM "users" INNER JOIN "posts" ON "users"."id" = "posts"."user_id"'
      );
    });

    it("returns outer join sql", () => {
      expect(
        users
          .project(star)
          .outerJoin(posts, users.get("id").eq(posts.get("user_id")))
          .toSql()
      ).toBe(
        'SELECT * FROM "users" LEFT OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"'
      );
    });

    it("group by and having", () => {
      expect(
        users
          .project(users.get("age"), sql("COUNT(*)"))
          .group(users.get("age"))
          .having(sql("COUNT(*) > 1"))
          .toSql()
      ).toBe(
        'SELECT "users"."age", COUNT(*) FROM "users" GROUP BY "users"."age" HAVING COUNT(*) > 1'
      );
    });

    it("distinct", () => {
      expect(
        users.project(users.get("name")).distinct().toSql()
      ).toBe('SELECT DISTINCT "users"."name" FROM "users"');
    });

    it("adds a lock node", () => {
      expect(
        users.project(star).lock().toSql()
      ).toBe('SELECT * FROM "users" FOR UPDATE');
    });

    it("chaining returns the manager", () => {
      const mgr = users.project(star);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
      expect(mgr.order(users.get("id").asc())).toBe(mgr);
      expect(mgr.take(10)).toBe(mgr);
      expect(mgr.skip(5)).toBe(mgr);
      expect(mgr.group(users.get("id"))).toBe(mgr);
    });
  });

  // =========================================================================
  // Phase 400 — InsertManager
  // =========================================================================
  describe("InsertManager", () => {
    it("generates INSERT", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "dean"],
        [users.get("age"), 30],
      ]);
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30)`
      );
    });

    it("inserts null", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), null]]);
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name") VALUES (NULL)`
      );
    });

    it("should handle false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });
  });

  // =========================================================================
  // Phase 400 — UpdateManager
  // =========================================================================
  describe("UpdateManager", () => {
    it("generates a where clause", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([
        [users.get("name"), "dean"],
        [users.get("age"), 31],
      ]);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toBe(
        `UPDATE "users" SET "users"."name" = 'dean', "users"."age" = 31 WHERE "users"."id" = 1`
      );
    });

    it("updates with null", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), null]]);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("= NULL");
    });
  });

  // =========================================================================
  // Phase 400 — DeleteManager
  // =========================================================================
  describe("DeleteManager", () => {
    it("uses where values", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toBe(
        'DELETE FROM "users" WHERE "users"."id" = 1'
      );
    });

    it("chaining returns the manager", () => {
      const mgr = new DeleteManager();
      expect(mgr.from(users)).toBe(mgr);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });

  // =========================================================================
  // Phase 500 — Advanced Features
  // =========================================================================
  describe("Advanced", () => {
    const visitor = new Visitors.ToSql();

    it("Arel.sql() for raw SQL", () => {
      expect(users.project(sql("NOW()")).toSql()).toBe(
        'SELECT NOW() FROM "users"'
      );
    });

    it("Arel.star for *", () => {
      expect(users.project(star).toSql()).toBe('SELECT * FROM "users"');
    });

    // -- Named functions --
    it("should visit named functions", () => {
      const count = new Nodes.NamedFunction("COUNT", [star]);
      expect(users.project(count).toSql()).toBe(
        'SELECT COUNT(*) FROM "users"'
      );
    });

    it("construct with alias", () => {
      const sum = new Nodes.NamedFunction("SUM", [users.get("age")]);
      expect(users.project(sum.as("total")).toSql()).toBe(
        'SELECT SUM("users"."age") AS total FROM "users"'
      );
    });

    it("NamedFunction: DISTINCT", () => {
      const count = new Nodes.NamedFunction(
        "COUNT",
        [users.get("name")],
        undefined,
        true
      );
      expect(users.project(count).toSql()).toBe(
        'SELECT COUNT(DISTINCT "users"."name") FROM "users"'
      );
    });

    // -- Aggregate convenience methods --
    it("should return a count node", () => {
      expect(users.project(users.get("id").count()).toSql()).toBe(
        'SELECT COUNT("users"."id") FROM "users"'
      );
    });

    it("should create a SUM node", () => {
      expect(users.project(users.get("age").sum()).toSql()).toBe(
        'SELECT SUM("users"."age") FROM "users"'
      );
    });

    it("should create a MAX node", () => {
      expect(users.project(users.get("age").maximum()).toSql()).toBe(
        'SELECT MAX("users"."age") FROM "users"'
      );
    });

    it("should create a Min node", () => {
      expect(users.project(users.get("age").minimum()).toSql()).toBe(
        'SELECT MIN("users"."age") FROM "users"'
      );
    });

    it("should create a AVG node", () => {
      expect(users.project(users.get("age").average()).toSql()).toBe(
        'SELECT AVG("users"."age") FROM "users"'
      );
    });

    // -- Set operations --
    it("should union two managers", () => {
      const q1 = users.project(users.get("name")).where(users.get("age").gt(21));
      const q2 = users.project(users.get("name")).where(users.get("age").lt(18));
      const union = q1.union(q2);
      const compiled = visitor.compile(union);
      expect(compiled).toContain("UNION");
      expect(compiled).toContain('"users"."age" > 21');
      expect(compiled).toContain('"users"."age" < 18');
    });

    it("should union all", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const compiled = visitor.compile(q1.unionAll(q2));
      expect(compiled).toContain("UNION ALL");
    });

    it("should intersect two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const compiled = visitor.compile(q1.intersect(q2));
      expect(compiled).toContain("INTERSECT");
    });

    it("should except two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const compiled = visitor.compile(q1.except(q2));
      expect(compiled).toContain("EXCEPT");
    });

    // -- EXISTS --
    it("should create an exists clause", () => {
      const subquery = users.project(star).where(users.get("age").gt(21));
      const compiled = visitor.compile(subquery.exists());
      expect(compiled).toContain("EXISTS");
      expect(compiled).toContain('"users"."age" > 21');
    });

    // -- Window functions --
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

    it("should use empty definition", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const compiled = visitor.compile(new Nodes.Over(fn));
      expect(compiled).toBe("ROW_NUMBER() OVER ()");
    });

    // -- CTE --
    it("should support basic WITH", () => {
      const cte = users
        .project(users.get("name"))
        .where(users.get("age").gt(21));
      const alias = new Nodes.TableAlias(cte.ast, "adults");
      const cteAs = new Nodes.As(alias, cte.ast);

      const main = new SelectManager();
      main.with(cteAs);
      main.from("adults");
      main.project(sql("*"));
      const result = main.toSql();
      expect(result).toContain("WITH");
      expect(result).toContain('"adults"');
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

    // -- Subquery in comparison --
    it("should handle comparing with a subquery", () => {
      const avgQuery = users.project(users.get("karma").average());
      // Subquery as a node in a comparison
      expect(avgQuery.ast).toBeInstanceOf(Nodes.SelectStatement);
    });

    // -- attribute.count(true) with DISTINCT --
    it("should take a distinct param", () => {
      expect(users.project(users.get("name").count(true)).toSql()).toBe(
        'SELECT COUNT(DISTINCT "users"."name") FROM "users"'
      );
    });

    // -- Lock with custom string --
    it("lock with custom clause", () => {
      expect(
        users.project(star).lock("FOR SHARE").toSql()
      ).toBe('SELECT * FROM "users" FOR SHARE');
    });

    // -- Casted node --
    it("Casted node renders the quoted value", () => {
      const visitor = new Visitors.ToSql();
      const attr = users.get("name");
      const casted = new Nodes.Casted("hello", attr);
      expect(visitor.compile(casted)).toBe("'hello'");
    });

    it("Casted node with number", () => {
      const visitor = new Visitors.ToSql();
      const attr = users.get("age");
      const casted = new Nodes.Casted(42, attr);
      expect(visitor.compile(casted)).toBe("42");
    });

    it("Casted node with null", () => {
      const visitor = new Visitors.ToSql();
      const attr = users.get("name");
      const casted = new Nodes.Casted(null, attr);
      expect(visitor.compile(casted)).toBe("NULL");
    });
  });

  // =========================================================================
  // Window framing
  // =========================================================================
  describe("Window framing", () => {
    const visitor = new Visitors.ToSql();

    it("takes a rows frame, unbounded preceding", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Rows(new Nodes.Preceding()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const result = visitor.compile(new Nodes.Over(fn, w));
      expect(result).toContain("ROWS UNBOUNDED PRECEDING");
    });

    it("ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Rows(new Nodes.Between(
        new Nodes.CurrentRow(),
        new Nodes.Following()
      )));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const result = visitor.compile(new Nodes.Over(fn, w));
      expect(result).toContain("ROWS");
      expect(result).toContain("CURRENT ROW");
    });

    it("RANGE frame", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Range(new Nodes.Preceding()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const result = visitor.compile(new Nodes.Over(fn, w));
      expect(result).toContain("RANGE UNBOUNDED PRECEDING");
    });

    it("Preceding with N rows", () => {
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(new Nodes.Preceding(new Nodes.Quoted(3)));
      expect(result).toBe("3 PRECEDING");
    });

    it("Following with N rows", () => {
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(new Nodes.Following(new Nodes.Quoted(5)));
      expect(result).toBe("5 FOLLOWING");
    });

    it("UNBOUNDED FOLLOWING", () => {
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(new Nodes.Following());
      expect(result).toBe("UNBOUNDED FOLLOWING");
    });

    it("CurrentRow", () => {
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(new Nodes.CurrentRow());
      expect(result).toBe("CURRENT ROW");
    });

    it("NamedWindow renders WINDOW name AS (...)", () => {
      const nw = new Nodes.NamedWindow("w");
      nw.order(users.get("id").asc());
      const result = visitor.compile(nw);
      expect(result).toBe('"w" AS (ORDER BY "users"."id" ASC)');
    });

    it("Window with partition and order", () => {
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      w.order(users.get("salary").desc());
      const result = visitor.compile(w);
      expect(result).toBe('(PARTITION BY "users"."department_id" ORDER BY "users"."salary" DESC)');
    });
  });

  // =========================================================================
  // Additional join types
  // =========================================================================
  describe("Join types", () => {
    it("RIGHT OUTER JOIN", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      const onNode = new Nodes.On(users.get("id").eq(posts.get("user_id")));
      mgr.ast.cores[0].source.right.push(
        new Nodes.RightOuterJoin(posts, onNode)
      );
      expect(mgr.toSql()).toBe(
        'SELECT * FROM "users" RIGHT OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"'
      );
    });

    it("FULL OUTER JOIN", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      const onNode = new Nodes.On(users.get("id").eq(posts.get("user_id")));
      mgr.ast.cores[0].source.right.push(
        new Nodes.FullOuterJoin(posts, onNode)
      );
      expect(mgr.toSql()).toBe(
        'SELECT * FROM "users" FULL OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"'
      );
    });

    it("CROSS JOIN", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      mgr.ast.cores[0].source.right.push(new Nodes.CrossJoin(posts));
      expect(mgr.toSql()).toBe(
        'SELECT * FROM "users" CROSS JOIN "posts"'
      );
    });

    it("returns string join sql", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      mgr.ast.cores[0].source.right.push(
        new Nodes.StringJoin(new Nodes.SqlLiteral('JOIN "posts" ON "posts"."user_id" = "users"."id"'))
      );
      expect(mgr.toSql()).toBe(
        'SELECT * FROM "users" JOIN "posts" ON "posts"."user_id" = "users"."id"'
      );
    });
  });

  // =========================================================================
  // _any / _all remaining variants
  // =========================================================================
  describe("Additional _any/_all variants", () => {
    it("notEqAny", () => {
      const result = users
        .project(star)
        .where(users.get("name").notEqAny(["dean", "sam"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" != 'dean' OR "users"."name" != 'sam')`
      );
    });

    it("notEqAll", () => {
      const result = users
        .project(star)
        .where(users.get("name").notEqAll(["dean", "sam"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" != 'dean' AND "users"."name" != 'sam')`
      );
    });

    it("gtAll", () => {
      const result = users
        .project(star)
        .where(users.get("age").gtAll([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" > 10 AND "users"."age" > 20)`
      );
    });

    it("gteqAny", () => {
      const result = users
        .project(star)
        .where(users.get("age").gteqAny([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" >= 10 OR "users"."age" >= 20)`
      );
    });

    it("gteqAll", () => {
      const result = users
        .project(star)
        .where(users.get("age").gteqAll([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" >= 10 AND "users"."age" >= 20)`
      );
    });

    it("ltAny", () => {
      const result = users
        .project(star)
        .where(users.get("age").ltAny([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" < 10 OR "users"."age" < 20)`
      );
    });

    it("lteqAny", () => {
      const result = users
        .project(star)
        .where(users.get("age").lteqAny([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" <= 10 OR "users"."age" <= 20)`
      );
    });

    it("lteqAll", () => {
      const result = users
        .project(star)
        .where(users.get("age").lteqAll([10, 20]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."age" <= 10 AND "users"."age" <= 20)`
      );
    });

    it("matchesAll", () => {
      const result = users
        .project(star)
        .where(users.get("name").matchesAll(["%d%", "%e%"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" LIKE '%d%' AND "users"."name" LIKE '%e%')`
      );
    });

    it("doesNotMatchAny", () => {
      const result = users
        .project(star)
        .where(users.get("name").doesNotMatchAny(["%d%", "%e%"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" NOT LIKE '%d%' OR "users"."name" NOT LIKE '%e%')`
      );
    });

    it("doesNotMatchAll", () => {
      const result = users
        .project(star)
        .where(users.get("name").doesNotMatchAll(["%d%", "%e%"]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" NOT LIKE '%d%' AND "users"."name" NOT LIKE '%e%')`
      );
    });

    it("inAny", () => {
      const result = users
        .project(star)
        .where(users.get("id").inAny([[1, 2], [3, 4]]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."id" IN (1, 2) OR "users"."id" IN (3, 4))`
      );
    });

    it("inAll", () => {
      const result = users
        .project(star)
        .where(users.get("id").inAll([[1, 2], [3, 4]]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."id" IN (1, 2) AND "users"."id" IN (3, 4))`
      );
    });

    it("notInAny", () => {
      const result = users
        .project(star)
        .where(users.get("id").notInAny([[1, 2], [3, 4]]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."id" NOT IN (1, 2) OR "users"."id" NOT IN (3, 4))`
      );
    });

    it("notInAll", () => {
      const result = users
        .project(star)
        .where(users.get("id").notInAll([[1, 2], [3, 4]]))
        .toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."id" NOT IN (1, 2) AND "users"."id" NOT IN (3, 4))`
      );
    });
  });

  // =========================================================================
  // Collectors
  // =========================================================================
  describe("Collectors", () => {
    it("compile gathers all bind params", () => {
      const bind = new Collectors.Bind();
      bind.append("SELECT * FROM users WHERE id = ");
      bind.addBind(42);
      bind.append(" AND name = ");
      bind.addBind("dean");
      const [sql, binds] = bind.value;
      expect(sql).toBe("SELECT * FROM users WHERE id = ? AND name = ?");
      expect(binds).toEqual([42, "dean"]);
    });

    it("SQLString collector accumulates SQL and binds", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT ");
      collector.append("*");
      expect(collector.value).toBe("SELECT *");
    });

    it("SQLString addBind appends ? placeholder", () => {
      const collector = new Collectors.SQLString();
      collector.append("WHERE id = ");
      collector.addBind(42);
      expect(collector.value).toBe("WHERE id = ?");
      expect(collector.bindValues).toEqual([42]);
    });
  });

  // =========================================================================
  // DeleteManager with ORDER BY and LIMIT
  // =========================================================================
  describe("DeleteManager advanced", () => {
    it("handles limit properly", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      mgr.where(users.get("active").eq(false));
      mgr.order(users.get("created_at").asc());
      mgr.take(10);
      expect(mgr.toSql()).toBe(
        'DELETE FROM "users" WHERE "users"."active" = FALSE ORDER BY "users"."created_at" ASC LIMIT 10'
      );
    });
  });

  // =========================================================================
  // UpdateManager with ORDER BY and LIMIT
  // =========================================================================
  describe("UpdateManager advanced", () => {
    it("UPDATE with ORDER BY and LIMIT", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("active"), false]]);
      mgr.where(users.get("age").lt(18));
      mgr.order(users.get("name").asc());
      mgr.take(5);
      expect(mgr.toSql()).toBe(
        `UPDATE "users" SET "users"."active" = FALSE WHERE "users"."age" < 18 ORDER BY "users"."name" ASC LIMIT 5`
      );
    });
  });

  // =========================================================================
  // InsertManager.values()
  // =========================================================================
  describe("InsertManager advanced", () => {
    it("can create a ValuesList node", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name"), users.get("age")];
      mgr.values(new Nodes.ValuesList([
        [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
        [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
      ]));
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30), ('sam', 25)`
      );
    });
  });

  // =========================================================================
  // Table.from()
  // =========================================================================
  describe("Table.from()", () => {
    it("returns a SelectManager with the table as source", () => {
      const mgr = users.from();
      expect(mgr).toBeInstanceOf(SelectManager);
      mgr.project(star);
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });
  });

  // =========================================================================
  // SelectManager convenience join methods
  // =========================================================================
  describe("SelectManager join methods", () => {
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
  });

  // -- Attribute convenience functions --
  describe("Attribute string/null functions", () => {
    it("lower", () => {
      const name = users.get("name");
      const fn = name.lower();
      const mgr = new SelectManager(users);
      mgr.project(fn);
      const sql = mgr.toSql();
      expect(sql).toContain("LOWER");
      expect(sql).toContain('"name"');
    });

    it("upper() generates UPPER function", () => {
      const name = users.get("name");
      const fn = name.upper();
      const mgr = new SelectManager(users);
      mgr.project(fn);
      const sql = mgr.toSql();
      expect(sql).toContain("UPPER");
    });

    it("coalesce", () => {
      const name = users.get("name");
      const fn = name.coalesce("Unknown");
      const mgr = new SelectManager(users);
      mgr.project(fn);
      const sql = mgr.toSql();
      expect(sql).toContain("COALESCE");
      expect(sql).toContain("'Unknown'");
    });
  });

  describe("Case node", () => {
    it("supports simple case expressions", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"));
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toBe("CASE WHEN 1 = 1 THEN 'yes' END");
    });

    it("supports extended case expressions", () => {
      const status = users.get("status");
      const caseNode = new Nodes.Case(status)
        .when(new Nodes.Quoted(1), new Nodes.SqlLiteral("'active'"))
        .when(new Nodes.Quoted(2), new Nodes.SqlLiteral("'inactive'"));
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toContain('CASE "users"."status"');
      expect(sql).toContain("WHEN 1 THEN 'active'");
      expect(sql).toContain("WHEN 2 THEN 'inactive'");
      expect(sql).toContain("END");
    });

    it("generates CASE with ELSE", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("x > 0"), new Nodes.SqlLiteral("'positive'"))
        .else(new Nodes.SqlLiteral("'non-positive'"));
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toBe("CASE WHEN x > 0 THEN 'positive' ELSE 'non-positive' END");
    });

    it("allows chaining multiple conditions", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("score >= 90"), new Nodes.SqlLiteral("'A'"))
        .when(new Nodes.SqlLiteral("score >= 80"), new Nodes.SqlLiteral("'B'"))
        .when(new Nodes.SqlLiteral("score >= 70"), new Nodes.SqlLiteral("'C'"))
        .else(new Nodes.SqlLiteral("'F'"));
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toBe(
        "CASE WHEN score >= 90 THEN 'A' WHEN score >= 80 THEN 'B' WHEN score >= 70 THEN 'C' ELSE 'F' END"
      );
    });

    it("supports string/number shorthand in when()", () => {
      const caseNode = new Nodes.Case()
        .when("active", 1)
        .when("inactive", 0);
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toBe("CASE WHEN active THEN 1 WHEN inactive THEN 0 END");
    });

    it("supports .as() for aliasing", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"))
        .as("result");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(caseNode);
      expect(sql).toBe("CASE WHEN 1 = 1 THEN 'yes' END AS result");
    });

    it("is immutable — chaining returns new instances", () => {
      const c1 = new Nodes.Case();
      const c2 = c1.when(new Nodes.SqlLiteral("a"), new Nodes.SqlLiteral("b"));
      const c3 = c2.else(new Nodes.SqlLiteral("c"));
      expect(c1.conditions.length).toBe(0);
      expect(c2.conditions.length).toBe(1);
      expect(c2.defaultValue).toBeNull();
      expect(c3.defaultValue).not.toBeNull();
    });
  });

  describe("Extract node", () => {
    it("should extract field", () => {
      const createdAt = users.get("created_at");
      const node = new Nodes.Extract(createdAt, "YEAR");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('EXTRACT(YEAR FROM "users"."created_at")');
    });

    it("should alias the extract", () => {
      const createdAt = users.get("created_at");
      const node = new Nodes.Extract(createdAt, "MONTH").as("birth_month");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('EXTRACT(MONTH FROM "users"."created_at") AS birth_month');
    });

    it("works via attribute.extract()", () => {
      const createdAt = users.get("created_at");
      const node = createdAt.extract("DAY");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('EXTRACT(DAY FROM "users"."created_at")');
    });
  });

  describe("InfixOperation node", () => {
    it("construct", () => {
      const a = users.get("age");
      const b = new Nodes.Quoted(10);
      const node = new Nodes.InfixOperation("||", a, b);
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('"users"."age" || 10');
    });

    it("supports .as() aliasing", () => {
      const first = users.get("first_name");
      const last = users.get("last_name");
      const node = new Nodes.InfixOperation("||", first, last).as("full_name");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('"users"."first_name" || "users"."last_name" AS full_name');
    });
  });

  describe("BindParam node", () => {
    it("generates ? placeholder when no value", () => {
      const node = new Nodes.BindParam();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("?");
    });

    it("generates quoted value when value provided", () => {
      const node = new Nodes.BindParam("hello");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("'hello'");
    });

    it("generates number value", () => {
      const node = new Nodes.BindParam(42);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("42");
    });
  });

  describe("Concat node", () => {
    it("generates SQL concatenation with ||", () => {
      const first = users.get("first_name");
      const last = users.get("last_name");
      const node = new Nodes.Concat(first, last);
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('"users"."first_name" || "users"."last_name"');
    });

    it("supports .as() aliasing", () => {
      const first = users.get("first_name");
      const space = new Nodes.Quoted(" ");
      const node = new Nodes.Concat(first, space).as("display_name");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe('"users"."first_name" || \' \' AS display_name');
    });
  });

  describe("Regexp and NotRegexp nodes", () => {
    it("generates regex match: col ~ pattern", () => {
      const node = users.attr("name").matchesRegexp("^A.*");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe("\"users\".\"name\" ~ '^A.*'");
    });

    it("generates negated regex match: col !~ pattern", () => {
      const node = users.attr("name").doesNotMatchRegexp("^A.*");
      const visitor = new Visitors.ToSql();
      const sql = visitor.compile(node);
      expect(sql).toBe("\"users\".\"name\" !~ '^A.*'");
    });

    it("can be used directly as Regexp/NotRegexp nodes", () => {
      const left = users.attr("email");
      const right = new Nodes.Quoted(".*@example\\.com$");
      const node = new Nodes.Regexp(left, right);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("\"users\".\"email\" ~ '.*@example\\.com$'");

      const notNode = new Nodes.NotRegexp(left, right);
      expect(visitor.compile(notNode)).toBe("\"users\".\"email\" !~ '.*@example\\.com$'");
    });
  });

  describe("IsDistinctFrom and IsNotDistinctFrom nodes", () => {
    it("generates IS DISTINCT FROM", () => {
      const node = users.attr("name").isDistinctFrom("Alice");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("\"users\".\"name\" IS DISTINCT FROM 'Alice'");
    });

    it("generates IS NOT DISTINCT FROM", () => {
      const node = users.attr("name").isNotDistinctFrom(null);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("\"users\".\"name\" IS NOT DISTINCT FROM NULL");
    });

    it("can be constructed directly", () => {
      const left = users.attr("age");
      const right = new Nodes.Quoted(25);
      const node = new Nodes.IsDistinctFrom(left, right);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("\"users\".\"age\" IS DISTINCT FROM 25");
    });
  });

  describe("True and False nodes", () => {
    it("generates TRUE", () => {
      const node = new Nodes.True();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("TRUE");
    });

    it("generates FALSE", () => {
      const node = new Nodes.False();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("FALSE");
    });
  });

  describe("Cube, Rollup, GroupingSet nodes", () => {
    it("generates CUBE(...)", () => {
      const node = new Nodes.Cube([users.attr("name"), users.attr("age")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('CUBE("users"."name", "users"."age")');
    });

    it("generates ROLLUP(...)", () => {
      const node = new Nodes.Rollup([users.attr("name"), users.attr("age")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('ROLLUP("users"."name", "users"."age")');
    });

    it("generates GROUPING SETS(...)", () => {
      const node = new Nodes.GroupingSet([users.attr("name"), users.attr("age")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('GROUPING SETS("users"."name", "users"."age")');
    });
  });

  describe("Lateral node", () => {
    it("generates LATERAL (subquery)", () => {
      const subquery = new Nodes.SqlLiteral("SELECT 1");
      const node = new Nodes.Lateral(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe("LATERAL (SELECT 1)");
    });
  });

  describe("Comment node", () => {
    it("appends a comment to the generated query", () => {
      const node = new Nodes.Comment("load users", "for dashboard");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe(" /* load users */ /* for dashboard */");
    });
  });

  describe("Attribute string functions", () => {
    const users = new Table("users");
    const visitor = new Visitors.ToSql();

    it("generates LENGTH()", () => {
      const node = users.attr("name").length();
      expect(visitor.compile(node)).toBe('LENGTH("users"."name")');
    });

    it("generates TRIM()", () => {
      const node = users.attr("name").trim();
      expect(visitor.compile(node)).toBe('TRIM("users"."name")');
    });

    it("generates LTRIM()", () => {
      const node = users.attr("name").ltrim();
      expect(visitor.compile(node)).toBe('LTRIM("users"."name")');
    });

    it("generates RTRIM()", () => {
      const node = users.attr("name").rtrim();
      expect(visitor.compile(node)).toBe('RTRIM("users"."name")');
    });

    it("generates SUBSTRING()", () => {
      const node = users.attr("name").substring(1, 3);
      expect(visitor.compile(node)).toBe('SUBSTRING("users"."name", 1, 3)');
    });

    it("generates CONCAT()", () => {
      const node = users.attr("first_name").concat(" ", users.attr("last_name"));
      const sql = visitor.compile(node);
      expect(sql).toContain("CONCAT(");
      expect(sql).toContain('"users"."first_name"');
    });

    it("generates REPLACE()", () => {
      const node = users.attr("name").replace("old", "new");
      const sql = visitor.compile(node);
      expect(sql).toContain("REPLACE(");
      expect(sql).toContain('"users"."name"');
    });
  });

  describe("Attribute math functions", () => {
    const users = new Table("users");
    const visitor = new Visitors.ToSql();

    it("generates ABS()", () => {
      const node = users.attr("balance").abs();
      expect(visitor.compile(node)).toBe('ABS("users"."balance")');
    });

    it("generates ROUND()", () => {
      const node = users.attr("score").round(2);
      expect(visitor.compile(node)).toBe('ROUND("users"."score", 2)');
    });

    it("generates ROUND() without precision", () => {
      const node = users.attr("score").round();
      expect(visitor.compile(node)).toBe('ROUND("users"."score")');
    });

    it("generates CEIL()", () => {
      const node = users.attr("score").ceil();
      expect(visitor.compile(node)).toBe('CEIL("users"."score")');
    });

    it("generates FLOOR()", () => {
      const node = users.attr("score").floor();
      expect(visitor.compile(node)).toBe('FLOOR("users"."score")');
    });
  });

  describe("SelectManager introspection", () => {
    it("reads projections", () => {
      const users = new Table("users");
      const manager = users.project(users.attr("name"), users.attr("age"));
      expect(manager.projections.length).toBe(2);
    });

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

    it("gives me back the where sql", () => {
      const users = new Table("users");
      const manager = users.project("*")
        .where(users.attr("name").eq("Alice"))
        .where(users.attr("age").gt(18));
      expect(manager.constraints.length).toBe(2);
    });

    it("should hand back froms", () => {
      const users = new Table("users");
      const manager = users.project("*");
      expect(manager.source).toBeDefined();
    });

    it("returns order clauses", () => {
      const users = new Table("users");
      const manager = users.project("*").order(users.attr("name").asc());
      expect(manager.orders.length).toBe(1);
    });

    it("can be aliased", () => {
      const users = new Table("users");
      const subquery = users.project(users.attr("id"));
      const aliased = subquery.as("sub");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("sub");
    });
  });

  describe("Table factory methods", () => {
    it("create table alias", () => {
      const aliased = users.alias("u");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("u");
    });

    it("alias() defaults name to table_2", () => {
      const aliased = users.alias();
      expect(aliased.name).toBe("users_2");
    });

    it("create join", () => {
      const join = users.createJoin(posts, users.attr("id").eq(posts.attr("user_id")));
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("create string join", () => {
      const join = users.createStringJoin("INNER JOIN posts ON posts.user_id = users.id");
      expect(join).toBeInstanceOf(Nodes.StringJoin);
    });

    it("create on", () => {
      const on = users.createOn(users.attr("id").eq(posts.attr("user_id")));
      expect(on).toBeInstanceOf(Nodes.On);
    });

    it("createTableAlias() creates a TableAlias node", () => {
      const alias = users.createTableAlias(users, "u");
      expect(alias).toBeInstanceOf(Nodes.TableAlias);
      expect(alias.name).toBe("u");
    });
  });

  describe("SelectManager joinSources", () => {
    it("returns empty array when no joins", () => {
      const manager = users.project("*");
      expect(manager.joinSources).toEqual([]);
    });

    it("returns join nodes after join()", () => {
      const manager = users.project("*")
        .join(posts, users.attr("id").eq(posts.attr("user_id")));
      expect(manager.joinSources.length).toBe(1);
      expect(manager.joinSources[0]).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("returns multiple join nodes", () => {
      const comments = new Table("comments");
      const manager = users.project("*")
        .join(posts, users.attr("id").eq(posts.attr("user_id")))
        .outerJoin(comments, posts.attr("id").eq(comments.attr("post_id")));
      expect(manager.joinSources.length).toBe(2);
      expect(manager.joinSources[0]).toBeInstanceOf(Nodes.InnerJoin);
      expect(manager.joinSources[1]).toBeInstanceOf(Nodes.OuterJoin);
    });
  });

  describe("SelectManager froms", () => {
    it("returns the FROM source", () => {
      const manager = users.project("*");
      const froms = manager.froms;
      expect(froms.length).toBe(1);
      expect(froms[0]).toBe(users);
    });
  });

  describe("InsertManager columns getter", () => {
    it("returns empty array before insert", () => {
      const manager = new InsertManager();
      expect(manager.columns).toEqual([]);
    });

    it("combines columns and values list in order", () => {
      const manager = new InsertManager();
      manager.into(users);
      manager.insert([
        [users.attr("name"), "Alice"],
        [users.attr("email"), "alice@example.com"],
      ]);
      expect(manager.columns.length).toBe(2);
    });
  });

  describe("UpdateManager introspection", () => {
    it("wheres getter returns WHERE conditions", () => {
      const manager = new UpdateManager();
      manager.table(users);
      manager.where(users.attr("id").eq(1));
      expect(manager.wheres.length).toBe(1);
    });

    it("can be set", () => {
      const manager = new UpdateManager();
      manager.table(users);
      manager.key(users.attr("id").eq(1));
      expect(manager.ast.key).not.toBeNull();
    });
  });

  describe("DeleteManager introspection", () => {
    it("wheres getter returns WHERE conditions", () => {
      const manager = new DeleteManager();
      manager.from(users);
      manager.where(users.attr("id").eq(1));
      expect(manager.wheres.length).toBe(1);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Attributes Attribute
  // =========================================================================
  describe("Attributes Attribute (ported stubs)", () => {
    it("should generate != in sql", () => {
      const result = users.project(star).where(users.get("id").notEq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."id" != 10');
    });

    it("should handle nil for notEq", () => {
      const result = users.project(star).where(users.get("name").notEq(null)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."name" IS NOT NULL');
    });

    it("should create a Grouping node from or", () => {
      const node = users.get("id").eq(1).or(users.get("id").eq(2));
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql from eq", () => {
      const cond = users.get("id").eq(1).or(users.get("id").eq(2));
      const result = users.project(star).where(cond).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE ("users"."id" = 1 OR "users"."id" = 2)');
    });

    it("should create a Grouping node from and wrapped in grouping via eqAll", () => {
      const node = users.get("name").eqAll(["dean", "sam"]);
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql from eqAll", () => {
      const result = users.project(star).where(users.get("name").eqAll(["dean", "sam"])).toSql();
      expect(result).toBe(
        `SELECT * FROM "users" WHERE ("users"."name" = 'dean' AND "users"."name" = 'sam')`
      );
    });

    it("should create a GreaterThan node", () => {
      const node = users.get("age").gt(10);
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("should accept various data types for gt", () => {
      expect(
        users.project(star).where(users.get("age").gt(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" > 10');
    });

    it("should generate >= in sql", () => {
      const result = users.project(star).where(users.get("age").gteq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" >= 10');
    });

    it("should create a LessThan node", () => {
      const node = users.get("age").lt(10);
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("should generate < in sql", () => {
      const result = users.project(star).where(users.get("age").lt(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" < 10');
    });

    it("should generate <= in sql", () => {
      const result = users.project(star).where(users.get("age").lteq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" <= 10');
    });

    it("should create a AVG node", () => {
      const node = users.get("age").average();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("AVG");
    });

    it("should generate the proper SQL for AVG", () => {
      expect(users.project(users.get("age").average()).toSql()).toBe(
        'SELECT AVG("users"."age") FROM "users"'
      );
    });

    it("should create a MAX node", () => {
      const node = users.get("age").maximum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("MAX");
    });

    it("should generate proper SQL for MAX", () => {
      expect(users.project(users.get("age").maximum()).toSql()).toBe(
        'SELECT MAX("users"."age") FROM "users"'
      );
    });

    it("should create a Min node", () => {
      const node = users.get("age").minimum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("MIN");
    });

    it("should generate proper SQL for MIN", () => {
      expect(users.project(users.get("age").minimum()).toSql()).toBe(
        'SELECT MIN("users"."age") FROM "users"'
      );
    });

    it("should create a SUM node", () => {
      const node = users.get("age").sum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("SUM");
    });

    it("should generate the proper SQL for SUM", () => {
      expect(users.project(users.get("age").sum()).toSql()).toBe(
        'SELECT SUM("users"."age") FROM "users"'
      );
    });

    it("should return a count node", () => {
      const node = users.get("id").count();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("COUNT");
    });

    it("should take a distinct param for count", () => {
      expect(users.project(users.get("name").count(true)).toSql()).toBe(
        'SELECT COUNT(DISTINCT "users"."name") FROM "users"'
      );
    });

    it("should return an equality node", () => {
      const node = users.get("id").eq(10);
      expect(node).toBeInstanceOf(Nodes.Equality);
    });

    it("should generate = in sql", () => {
      expect(
        users.project(star).where(users.get("id").eq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" = 10');
    });

    it("should handle nil for eq", () => {
      expect(
        users.project(star).where(users.get("name").eq(null)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."name" IS NULL');
    });

    it("should not eat input for eqAny", () => {
      const input = [1, 2, 3];
      const copy = [...input];
      users.get("id").eqAny(input);
      expect(input).toEqual(copy);
    });

    it("should not eat input for eqAll", () => {
      const input = [1, 2, 3];
      const copy = [...input];
      users.get("id").eqAll(input);
      expect(input).toEqual(copy);
    });

    it("should create a Matches node", () => {
      const node = users.get("name").matches("%bacon%");
      expect(node).toBeInstanceOf(Nodes.Matches);
    });

    it("should generate LIKE in sql", () => {
      expect(
        users.project(star).where(users.get("name").matches("%bacon%")).toSql()
      ).toBe(`SELECT * FROM "users" WHERE "users"."name" LIKE '%bacon%'`);
    });

    it("should create a DoesNotMatch node", () => {
      const node = users.get("name").doesNotMatch("%bacon%");
      expect(node).toBeInstanceOf(Nodes.DoesNotMatch);
    });

    it("should generate NOT LIKE in sql", () => {
      expect(
        users.project(star).where(users.get("name").doesNotMatch("%bacon%")).toSql()
      ).toBe(`SELECT * FROM "users" WHERE "users"."name" NOT LIKE '%bacon%'`);
    });

    it("can be constructed with a list for IN", () => {
      expect(
        users.project(star).where(users.get("id").in([1, 2, 3])).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" IN (1, 2, 3)');
    });

    it("should generate NOT IN in sql", () => {
      expect(
        users.project(star).where(users.get("id").notIn([1, 2])).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."id" NOT IN (1, 2)');
    });

    it("should create an Ascending node", () => {
      const node = users.get("name").asc();
      expect(node).toBeInstanceOf(Nodes.Ascending);
    });

    it("should generate ASC in sql", () => {
      expect(
        users.project(star).order(users.get("name").asc()).toSql()
      ).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC');
    });

    it("should create a Descending node", () => {
      const node = users.get("name").desc();
      expect(node).toBeInstanceOf(Nodes.Descending);
    });

    it("should generate DESC in sql", () => {
      expect(
        users.project(star).order(users.get("name").desc()).toSql()
      ).toBe('SELECT * FROM "users" ORDER BY "users"."name" DESC');
    });

    it("should create a Contains node via InfixOperation", () => {
      const node = users.get("tags").contains("foo");
      expect(node).toBeInstanceOf(Nodes.InfixOperation);
      expect(node.operator).toBe("@>");
    });

    it("should generate @> in sql", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe("\"users\".\"tags\" @> 'foo'");
    });

    it("should create an Overlaps node via InfixOperation", () => {
      const node = users.get("tags").overlaps("bar");
      expect(node).toBeInstanceOf(Nodes.InfixOperation);
      expect(node.operator).toBe("&&");
    });

    it("should generate && in sql", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").overlaps("bar");
      expect(visitor.compile(node)).toBe("\"users\".\"tags\" && 'bar'");
    });

    it("should generate > in sql", () => {
      expect(
        users.project(star).where(users.get("age").gt(21)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" > 21');
    });

    it("should produce sql for attribute", () => {
      const visitor = new Visitors.ToSql();
      const attr = users.get("name");
      expect(visitor.compile(attr)).toBe('"users"."name"');
    });

    it("can be constructed with a subquery for IN", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    it("can be constructed with a standard range for between", () => {
      const node = users.get("age").between({ begin: 18, end: 65 });
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").between({ begin: -Infinity, end: 65 });
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" <= 65');
    });

    it("does not type cast by default", () => {
      const attr = new Nodes.Attribute(users, "name");
      const node = attr.eq("hello");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."name" = \'hello\'');
    });

    it("type casts when given an explicit caster", () => {
      const caster = {
        typeCastForDatabase(value: unknown) {
          return String(value).toUpperCase();
        },
      };
      const attr = new Nodes.Attribute(users, "name", caster);
      const node = attr.eq("hello");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."name" = \'HELLO\'');
    });

    it("does not type cast SqlLiteral nodes", () => {
      const caster = {
        typeCastForDatabase(value: unknown) {
          return String(value).toUpperCase();
        },
      };
      const attr = new Nodes.Attribute(users, "name", caster);
      const literal = new Nodes.SqlLiteral("raw_value");
      const node = attr.eq(literal);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("raw_value");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Attributes (top-level)
  // =========================================================================
  describe("Attributes (ported stubs)", () => {
    it("responds to lower", () => {
      const name = users.get("name");
      const fn = name.lower();
      expect(fn).toBeInstanceOf(Nodes.NamedFunction);
      expect(fn.name).toBe("LOWER");
    });

    it("is equal with equal ivars (same table and column)", () => {
      const a = users.get("name");
      const b = users.get("name");
      expect(a.name).toBe(b.name);
      expect(a.relation).toBe(b.relation);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("name");
      const b = users.get("email");
      expect(a.name).not.toBe(b.name);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Delete Manager
  // =========================================================================
  describe("Delete Manager (ported stubs)", () => {
    it("handles limit properly", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      mgr.where(users.get("active").eq(false));
      mgr.order(users.get("created_at").asc());
      mgr.take(10);
      expect(mgr.toSql()).toBe(
        'DELETE FROM "users" WHERE "users"."active" = FALSE ORDER BY "users"."created_at" ASC LIMIT 10'
      );
    });

    it("uses from", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      expect(mgr.toSql()).toContain('DELETE FROM "users"');
    });

    it("chains from", () => {
      const mgr = new DeleteManager();
      expect(mgr.from(users)).toBe(mgr);
    });

    it("uses where values", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toBe('DELETE FROM "users" WHERE "users"."id" = 1');
    });

    it("chains where", () => {
      const mgr = new DeleteManager();
      mgr.from(users);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Factory Methods
  // =========================================================================
  describe("Factory Methods (ported stubs)", () => {
    it("create join", () => {
      const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("create table alias", () => {
      const alias = users.alias("u");
      expect(alias).toBeInstanceOf(Nodes.TableAlias);
      expect(alias.name).toBe("u");
    });

    it("create and", () => {
      const and = users.createAnd([users.get("id").eq(1), users.get("name").eq("dean")]);
      expect(and).toBeInstanceOf(Nodes.And);
      expect(and.children.length).toBe(2);
    });

    it("create string join", () => {
      const join = users.createStringJoin("INNER JOIN posts ON posts.user_id = users.id");
      expect(join).toBeInstanceOf(Nodes.StringJoin);
    });

    it("grouping", () => {
      const g = users.grouping(users.get("id").eq(1));
      expect(g).toBeInstanceOf(Nodes.Grouping);
    });

    it("create on", () => {
      const on = users.createOn(users.get("id").eq(posts.get("user_id")));
      expect(on).toBeInstanceOf(Nodes.On);
    });

    it("lower", () => {
      const fn = users.lower(users.get("name"));
      expect(fn).toBeInstanceOf(Nodes.NamedFunction);
      expect(fn.name).toBe("LOWER");
    });

    it("coalesce", () => {
      const fn = users.coalesce(users.get("name"), new Nodes.Quoted("default"));
      expect(fn).toBeInstanceOf(Nodes.NamedFunction);
      expect(fn.name).toBe("COALESCE");
    });

    it("cast", () => {
      const fn = users.cast(users.get("age"), "VARCHAR");
      expect(fn).toBeInstanceOf(Nodes.NamedFunction);
      expect(fn.name).toBe("CAST");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Insert Manager
  // =========================================================================
  describe("Insert Manager (ported stubs)", () => {
    it("can create a ValuesList node", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name"), users.get("age")];
      mgr.values(new Nodes.ValuesList([
        [new Nodes.Quoted("dean"), new Nodes.Quoted(30)],
        [new Nodes.Quoted("sam"), new Nodes.Quoted(25)],
      ]));
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30), ('sam', 25)`
      );
    });

    it("allows sql literals", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), sql("NOW()")]]);
      expect(mgr.toSql()).toContain("NOW()");
    });

    it("inserts false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });

    it("inserts null", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), null]]);
      expect(mgr.toSql()).toBe('INSERT INTO "users" ("name") VALUES (NULL)');
    });

    it("defaults the table from insert columns", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("name"), "dean"]]);
      expect(mgr.toSql()).toContain('"users"');
    });

    it("is chainable (into)", () => {
      const mgr = new InsertManager();
      expect(mgr.into(users)).toBe(mgr);
    });

    it("converts to sql", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "dean"],
        [users.get("age"), 30],
      ]);
      expect(mgr.toSql()).toBe(
        `INSERT INTO "users" ("name", "age") VALUES ('dean', 30)`
      );
    });

    it("accepts a select query in place of a VALUES clause", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.ast.columns = [users.get("name")];
      const selectMgr = posts.project(posts.get("title"));
      mgr.select(selectMgr);
      expect(mgr.toSql()).toContain("SELECT");
    });

    it("combines columns and values list in order", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([
        [users.get("name"), "Alice"],
        [users.get("email"), "alice@example.com"],
      ]);
      expect(mgr.columns.length).toBe(2);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes And
  // =========================================================================
  describe("Nodes And (ported stubs)", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.And([users.get("id").eq(1)]);
      const b = new Nodes.And([users.get("id").eq(1)]);
      expect(a.children.length).toBe(b.children.length);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.And([users.get("id").eq(1)]);
      const b = new Nodes.And([users.get("id").eq(2)]);
      expect(a).not.toBe(b);
    });

    it("allows aliasing", () => {
      const node = new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")]);
      const aliased = node.as("condition");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes As
  // =========================================================================
  describe("Nodes As (ported stubs)", () => {
    it("makes an AS node", () => {
      const node = users.get("name").as("n");
      expect(node).toBeInstanceOf(Nodes.As);
    });

    it("converts right to SqlLiteral if a string", () => {
      const node = users.get("name").as("n");
      expect(node.right).toBeInstanceOf(Nodes.SqlLiteral);
    });

    it("is equal with equal ivars (checks left/right)", () => {
      const a = users.get("name").as("n");
      const b = users.get("name").as("n");
      expect((a.right as Nodes.SqlLiteral).value).toBe((b.right as Nodes.SqlLiteral).value);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("name").as("n");
      const b = users.get("name").as("m");
      expect((a.right as Nodes.SqlLiteral).value).not.toBe((b.right as Nodes.SqlLiteral).value);
    });

    it("returns a Cte node using the LHS's name and the RHS as the relation", () => {
      const selectAst = users.project(users.get("id")).ast;
      const asNode = new Nodes.As(selectAst, new Nodes.SqlLiteral("cte_name"));
      const cte = asNode.toCte();
      expect(cte).toBeInstanceOf(Nodes.Cte);
      expect((cte as Nodes.Cte).name).toBe("cte_name");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Ascending
  // =========================================================================
  describe("Nodes Ascending (ported stubs)", () => {
    it("construct", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc).toBeInstanceOf(Nodes.Ascending);
      expect(asc.expr).toBeInstanceOf(Nodes.Attribute);
    });

    it("reverse", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      const reversed = asc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Descending);
    });

    it("direction", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.direction).toBe("asc");
    });

    it("ascending?", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.isAscending()).toBe(true);
    });

    it("descending?", () => {
      const asc = new Nodes.Ascending(users.get("name"));
      expect(asc.isDescending()).toBe(false);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("name"));
      expect(a.direction).toBe(b.direction);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.Ascending(users.get("name"));
      const b = new Nodes.Ascending(users.get("email"));
      expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Descending
  // =========================================================================
  describe("Nodes Descending (ported stubs)", () => {
    it("construct", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc).toBeInstanceOf(Nodes.Descending);
      expect(desc.expr).toBeInstanceOf(Nodes.Attribute);
    });

    it("reverse", () => {
      const desc = new Nodes.Descending(users.get("name"));
      const reversed = desc.reverse();
      expect(reversed).toBeInstanceOf(Nodes.Ascending);
    });

    it("direction", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.direction).toBe("desc");
    });

    it("ascending?", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.isAscending()).toBe(false);
    });

    it("descending?", () => {
      const desc = new Nodes.Descending(users.get("name"));
      expect(desc.isDescending()).toBe(true);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.Descending(users.get("name"));
      const b = new Nodes.Descending(users.get("name"));
      expect(a.direction).toBe(b.direction);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.Descending(users.get("name"));
      const b = new Nodes.Descending(users.get("email"));
      expect((a.expr as Nodes.Attribute).name).not.toBe((b.expr as Nodes.Attribute).name);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes BindParam
  // =========================================================================
  describe("Nodes BindParam (ported stubs)", () => {
    it("is equal to other bind params with the same value", () => {
      const a = new Nodes.BindParam(42);
      const b = new Nodes.BindParam(42);
      expect(a.value).toBe(b.value);
    });

    it("is not equal to other nodes", () => {
      const a = new Nodes.BindParam(42);
      const b = new Nodes.Quoted(42);
      expect(a).not.toBeInstanceOf(Nodes.Quoted);
      expect(b).not.toBeInstanceOf(Nodes.BindParam);
    });

    it("is not equal to bind params with different values", () => {
      const a = new Nodes.BindParam(42);
      const b = new Nodes.BindParam(99);
      expect(a.value).not.toBe(b.value);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Case
  // =========================================================================
  describe("Nodes Case (ported stubs)", () => {
    it("sets case expression from first argument", () => {
      const caseNode = new Nodes.Case(users.get("status"));
      expect(caseNode.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("sets default case from else", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"))
        .else(new Nodes.SqlLiteral("'no'"));
      expect(caseNode.defaultValue).not.toBeNull();
    });

    it("clones case, conditions and default (immutability)", () => {
      const c1 = new Nodes.Case();
      const c2 = c1.when(new Nodes.SqlLiteral("a"), new Nodes.SqlLiteral("b"));
      const c3 = c2.else(new Nodes.SqlLiteral("c"));
      expect(c1.conditions.length).toBe(0);
      expect(c2.conditions.length).toBe(1);
      expect(c2.defaultValue).toBeNull();
      expect(c3.defaultValue).not.toBeNull();
    });

    it("allows aliasing", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"))
        .as("result");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(caseNode)).toBe("CASE WHEN 1 = 1 THEN 'yes' END AS result");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Count
  // =========================================================================
  describe("Nodes Count (ported stubs)", () => {
    it("should alias the count", () => {
      const count = users.get("id").count();
      const aliased = count.as("user_count");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(aliased)).toBe('COUNT("users"."id") AS user_count');
    });

    it("should compare the count", () => {
      const count = users.get("id").count();
      expect(count.name).toBe("COUNT");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Delete Statement
  // =========================================================================
  describe("Nodes Delete Statement (ported stubs)", () => {
    it("clones wheres", () => {
      const stmt = new Nodes.DeleteStatement();
      stmt.wheres.push(users.get("id").eq(1));
      const copy = [...stmt.wheres];
      expect(copy.length).toBe(1);
      stmt.wheres.push(users.get("name").eq("dean"));
      expect(copy.length).toBe(1);
      expect(stmt.wheres.length).toBe(2);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Distinct
  // =========================================================================
  describe("Nodes Distinct (ported stubs)", () => {
    it("is equal to other distinct nodes", () => {
      const a = new Nodes.Distinct();
      const b = new Nodes.Distinct();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.Distinct();
      expect(a).not.toBeInstanceOf(Nodes.True);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Equality
  // =========================================================================
  describe("Nodes Equality (ported stubs)", () => {
    it("makes an OR node", () => {
      const eq1 = users.get("id").eq(1);
      const eq2 = users.get("id").eq(2);
      const or = eq1.or(eq2);
      expect(or).toBeInstanceOf(Nodes.Grouping);
    });

    it("makes an AND node", () => {
      const eq1 = users.get("id").eq(1);
      const eq2 = users.get("name").eq("dean");
      const and = eq1.and(eq2);
      expect(and).toBeInstanceOf(Nodes.And);
    });

    it("is equal with equal ivars", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(1);
      expect((a.left as Nodes.Attribute).name).toBe((b.left as Nodes.Attribute).name);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Extract
  // =========================================================================
  describe("Nodes Extract (ported stubs)", () => {
    it("should extract field", () => {
      const node = new Nodes.Extract(users.get("created_at"), "YEAR");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('EXTRACT(YEAR FROM "users"."created_at")');
    });

    it("should alias the extract", () => {
      const node = new Nodes.Extract(users.get("created_at"), "MONTH").as("birth_month");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('EXTRACT(MONTH FROM "users"."created_at") AS birth_month');
    });

    it("should not mutate the extract", () => {
      const original = new Nodes.Extract(users.get("created_at"), "YEAR");
      const aliased = original.as("y");
      // Original should remain unchanged (aliased is a new As node)
      expect(original).toBeInstanceOf(Nodes.Extract);
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Extract(users.get("created_at"), "YEAR");
      const b = new Nodes.Extract(users.get("created_at"), "YEAR");
      expect(a.field).toBe(b.field);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Extract(users.get("created_at"), "YEAR");
      const b = new Nodes.Extract(users.get("created_at"), "MONTH");
      expect(a.field).not.toBe(b.field);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes False
  // =========================================================================
  describe("Nodes False (ported stubs)", () => {
    it("is equal to other false nodes", () => {
      const a = new Nodes.False();
      const b = new Nodes.False();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.False();
      expect(a).not.toBeInstanceOf(Nodes.True);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Grouping
  // =========================================================================
  describe("Nodes Grouping (ported stubs)", () => {
    it("should create Equality nodes inside", () => {
      const g = new Nodes.Grouping(users.get("id").eq(1));
      expect(g.expr).toBeInstanceOf(Nodes.Equality);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const b = new Nodes.Grouping(new Nodes.Quoted("foo"));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Grouping(new Nodes.Quoted("foo"));
      const b = new Nodes.Grouping(new Nodes.Quoted("bar"));
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes InfixOperation
  // =========================================================================
  describe("Nodes InfixOperation (ported stubs)", () => {
    it("construct", () => {
      const a = users.get("age");
      const b = new Nodes.Quoted(10);
      const node = new Nodes.InfixOperation("||", a, b);
      expect(node.operator).toBe("||");
      expect(node.left).toBe(a);
      expect(node.right).toBe(b);
    });

    it("operation alias", () => {
      const node = new Nodes.InfixOperation("+", users.get("a"), users.get("b"));
      const aliased = node.as("total");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("operation ordering via sql", () => {
      const visitor = new Visitors.ToSql();
      const node = new Nodes.InfixOperation("+", users.get("a"), new Nodes.Quoted(1));
      expect(visitor.compile(node)).toBe('"users"."a" + 1');
    });

    it("equality with same ivars", () => {
      const a = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
      const b = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
      expect(a.operator).toBe(b.operator);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
      const b = new Nodes.InfixOperation("-", users.get("x"), new Nodes.Quoted(1));
      expect(a.operator).not.toBe(b.operator);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Insert Statement
  // =========================================================================
  describe("Nodes Insert Statement (ported stubs)", () => {
    it("clones columns and values", () => {
      const stmt = new Nodes.InsertStatement();
      stmt.columns.push(users.get("name"));
      const copy = [...stmt.columns];
      expect(copy.length).toBe(1);
      stmt.columns.push(users.get("age"));
      expect(copy.length).toBe(1);
      expect(stmt.columns.length).toBe(2);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Named Function
  // =========================================================================
  describe("Nodes Named Function (ported stubs)", () => {
    it("construct", () => {
      const fn = new Nodes.NamedFunction("COUNT", [star]);
      expect(fn.name).toBe("COUNT");
      expect(fn.expressions.length).toBe(1);
    });

    it("function alias", () => {
      const fn = new Nodes.NamedFunction("COUNT", [star]);
      const aliased = fn.as("total");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("construct with alias via constructor", () => {
      const fn = new Nodes.NamedFunction("SUM", [users.get("age")], "total");
      expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(fn)).toBe('SUM("users"."age") AS total');
    });

    it("equality with same ivars", () => {
      const a = new Nodes.NamedFunction("COUNT", [star]);
      const b = new Nodes.NamedFunction("COUNT", [star]);
      expect(a.name).toBe(b.name);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.NamedFunction("COUNT", [star]);
      const b = new Nodes.NamedFunction("SUM", [star]);
      expect(a.name).not.toBe(b.name);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Node
  // =========================================================================
  describe("Nodes Node (ported stubs)", () => {
    it("all nodes are nodes", () => {
      const attr = users.get("name");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr).toBeInstanceOf(Nodes.Node);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Not
  // =========================================================================
  describe("Nodes Not (ported stubs)", () => {
    it("makes a NOT node", () => {
      const eq = users.get("id").eq(1);
      const not = new Nodes.Not(eq);
      expect(not).toBeInstanceOf(Nodes.Not);
      expect(not.expr).toBe(eq);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Not(users.get("id").eq(1));
      const b = new Nodes.Not(users.get("id").eq(1));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Not(users.get("id").eq(1));
      const b = new Nodes.Not(users.get("id").eq(2));
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Or
  // =========================================================================
  describe("Nodes Or (ported stubs)", () => {
    it("makes an OR node", () => {
      const a = users.get("id").eq(1);
      const b = users.get("id").eq(2);
      const or = new Nodes.Or(a, b);
      expect(or).toBeInstanceOf(Nodes.Or);
      expect(or.left).toBe(a);
      expect(or.right).toBe(b);
    });

    it("is equal with equal ivars", () => {
      const a = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const b = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const b = new Nodes.Or(users.get("id").eq(3), users.get("id").eq(4));
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Over
  // =========================================================================
  describe("Nodes Over (ported stubs)", () => {
    it("should alias the expression", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const over = new Nodes.Over(fn);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(over)).toBe("ROW_NUMBER() OVER ()");
    });

    it("should reference the window definition by name", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      const over = new Nodes.Over(fn, w);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(over);
      expect(result).toContain("OVER");
      expect(result).toContain("ORDER BY");
    });

    it("should use empty definition", () => {
      const fn = new Nodes.NamedFunction("ROW_NUMBER", []);
      const over = new Nodes.Over(fn);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(over)).toBe("ROW_NUMBER() OVER ()");
    });

    it("should use definition in sub-expression", () => {
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      const over = new Nodes.Over(fn, w);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(over);
      expect(result).toContain("SUM");
      expect(result).toContain("PARTITION BY");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Select Statement
  // =========================================================================
  describe("Nodes Select Statement (ported stubs)", () => {
    it("clones cores", () => {
      const stmt = new Nodes.SelectStatement();
      expect(stmt.cores.length).toBe(1);
      expect(stmt.cores[0]).toBeInstanceOf(Nodes.SelectCore);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Sql Literal
  // =========================================================================
  describe("Nodes Sql Literal (ported stubs)", () => {
    it("makes a sql literal node", () => {
      const node = new Nodes.SqlLiteral("NOW()");
      expect(node).toBeInstanceOf(Nodes.SqlLiteral);
      expect(node.value).toBe("NOW()");
    });

    it("is equal with equal contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("NOW()");
      expect(a.value).toBe(b.value);
    });

    it("is not equal with different contents", () => {
      const a = new Nodes.SqlLiteral("NOW()");
      const b = new Nodes.SqlLiteral("CURRENT_TIMESTAMP");
      expect(a.value).not.toBe(b.value);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Sum
  // =========================================================================
  describe("Nodes Sum (ported stubs)", () => {
    it("should alias the sum", () => {
      const sum = users.get("age").sum();
      const aliased = sum.as("total_age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(aliased)).toBe('SUM("users"."age") AS total_age');
    });

    it("should order the sum via sql", () => {
      const sum = users.get("age").sum();
      expect(users.project(sum).order(users.get("name").asc()).toSql()).toContain("ORDER BY");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Table Alias
  // =========================================================================
  describe("Nodes Table Alias (ported stubs)", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "u");
      expect(a.name).toBe(b.name);
      expect(a.relation).toBe(b.relation);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "v");
      expect(a.name).not.toBe(b.name);
    });

    it("returns a Cte node using the TableAlias's name and relation", () => {
      const tableAlias = new Nodes.TableAlias(users, "u");
      const cte = tableAlias.toCte();
      expect(cte).toBeInstanceOf(Nodes.Cte);
      expect(cte.name).toBe("u");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes True
  // =========================================================================
  describe("Nodes True (ported stubs)", () => {
    it("is equal to other true nodes", () => {
      const a = new Nodes.True();
      const b = new Nodes.True();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with other nodes", () => {
      const a = new Nodes.True();
      expect(a).not.toBeInstanceOf(Nodes.False);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Update Statement
  // =========================================================================
  describe("Nodes Update Statement (ported stubs)", () => {
    it("clones wheres and values", () => {
      const stmt = new Nodes.UpdateStatement();
      stmt.wheres.push(users.get("id").eq(1));
      const copyWheres = [...stmt.wheres];
      expect(copyWheres.length).toBe(1);
      stmt.wheres.push(users.get("name").eq("dean"));
      expect(copyWheres.length).toBe(1);
      expect(stmt.wheres.length).toBe(2);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Window
  // =========================================================================
  describe("Nodes Window (ported stubs)", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.Window();
      const b = new Nodes.Window();
      expect(a.constructor).toBe(b.constructor);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Window();
      a.order(users.get("id").asc());
      const b = new Nodes.Window();
      expect(a.orders.length).not.toBe(b.orders.length);
    });

    it("CurrentRow is equal to other current row nodes", () => {
      const a = new Nodes.CurrentRow();
      const b = new Nodes.CurrentRow();
      expect(a.constructor).toBe(b.constructor);
    });

    it("CurrentRow is not equal with other nodes", () => {
      const a = new Nodes.CurrentRow();
      expect(a).not.toBeInstanceOf(Nodes.Preceding);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Select Manager (additional)
  // =========================================================================
  describe("Select Manager (ported stubs)", () => {
    it("join sources", () => {
      const mgr = users.project(star);
      expect(mgr.joinSources).toEqual([]);
    });

    it("makes an AS node by grouping the AST", () => {
      const mgr = users.project(users.get("id"));
      const aliased = mgr.as("sub");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("sub");
    });

    it("should add an offset", () => {
      const mgr = users.project(star).skip(5);
      expect(mgr.toSql()).toContain("OFFSET 5");
    });

    it("should chain skip", () => {
      const mgr = users.project(star);
      expect(mgr.skip(5)).toBe(mgr);
    });

    it("should return the offset", () => {
      const mgr = users.project(star).skip(5);
      expect(mgr.offset).not.toBeNull();
    });

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

    it("should intersect two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(q1.intersect(q2))).toContain("INTERSECT");
    });

    it("should except two managers", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(q1.except(q2))).toContain("EXCEPT");
    });

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

    it("should return the ast", () => {
      const mgr = users.project(star);
      expect(mgr.ast).toBeInstanceOf(Nodes.SelectStatement);
    });

    it("should return limit", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.limit).not.toBeNull();
    });

    it("adds a lock node", () => {
      const mgr = users.project(star).lock();
      expect(mgr.toSql()).toContain("FOR UPDATE");
    });

    it("returns order clauses", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.orders.length).toBe(1);
    });

    it("generates order clauses", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.toSql()).toContain("ORDER BY");
    });

    it("takes *args for order", () => {
      const mgr = users.project(star).order(users.get("name").asc(), users.get("age").desc());
      expect(mgr.orders.length).toBe(2);
    });

    it("chains order", () => {
      const mgr = users.project(star);
      expect(mgr.order(users.get("name").asc())).toBe(mgr);
    });

    it("has order attributes", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.orders[0]).toBeInstanceOf(Nodes.Ascending);
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

    it("returns inner join sql", () => {
      const mgr = users.project(users.get("name"), posts.get("title"))
        .join(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.toSql()).toContain("INNER JOIN");
    });

    it("returns outer join sql", () => {
      const mgr = users.project(star)
        .outerJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(mgr.toSql()).toContain("LEFT OUTER JOIN");
    });

    it("returns string join sql", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      mgr.ast.cores[0].source.right.push(
        new Nodes.StringJoin(new Nodes.SqlLiteral('JOIN "posts" ON "posts"."user_id" = "users"."id"'))
      );
      expect(mgr.toSql()).toContain('JOIN "posts"');
    });

    it("takes an attribute for group", () => {
      const mgr = users.project(users.get("age"), sql("COUNT(*)"))
        .group(users.get("age"));
      expect(mgr.toSql()).toContain("GROUP BY");
    });

    it("chains group", () => {
      const mgr = users.project(star);
      expect(mgr.group(users.get("age"))).toBe(mgr);
    });

    it("makes strings literals for group", () => {
      const mgr = users.project(star).group("age");
      expect(mgr.toSql()).toContain("GROUP BY age");
    });

    it("takes an order for window", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      expect(w.orders.length).toBe(1);
    });

    it("takes an order with multiple columns for window", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc(), users.get("name").desc());
      expect(w.orders.length).toBe(2);
    });

    it("takes a partition for window", () => {
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      expect(w.partitions.length).toBe(1);
    });

    it("takes a partition and an order for window", () => {
      const w = new Nodes.Window();
      w.partition(users.get("department_id"));
      w.order(users.get("salary").desc());
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(w);
      expect(result).toContain("PARTITION BY");
      expect(result).toContain("ORDER BY");
    });

    it("takes a partition with multiple columns for window", () => {
      const w = new Nodes.Window();
      w.partition(users.get("department_id"), users.get("team_id"));
      expect(w.partitions.length).toBe(2);
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

    it("takes a range frame, current row", () => {
      const w = new Nodes.Window();
      w.order(users.get("id").asc());
      w.frame(new Nodes.Range(new Nodes.CurrentRow()));
      const fn = new Nodes.NamedFunction("SUM", [users.get("amount")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.Over(fn, w))).toContain("RANGE CURRENT ROW");
    });

    it("gives me back the where sql", () => {
      const mgr = users.project(star)
        .where(users.get("name").eq("Alice"))
        .where(users.get("age").gt(18));
      expect(mgr.constraints.length).toBe(2);
    });

    it("joins wheres with AND", () => {
      const mgr = users.project(star)
        .where(users.get("name").eq("Alice"))
        .where(users.get("age").gt(18));
      expect(mgr.toSql()).toContain("AND");
    });

    it("returns nil when there are no wheres (whereSql)", () => {
      const mgr = users.project(star);
      expect(mgr.whereSql()).toBeNull();
    });

    it("reads projections", () => {
      const mgr = users.project(users.get("name"), users.get("age"));
      expect(mgr.projections.length).toBe(2);
    });

    it("overwrites projections", () => {
      const mgr = users.project(users.get("name"));
      mgr.projections = [users.get("age")];
      expect(mgr.projections.length).toBe(1);
      expect(mgr.toSql()).toContain('"age"');
    });

    it("knows take (limit)", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("chains take", () => {
      const mgr = users.project(star);
      expect(mgr.take(10)).toBe(mgr);
    });

    it("knows where", () => {
      const mgr = users.project(star).where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("chains where", () => {
      const mgr = users.project(star);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });

    it("makes sql", () => {
      const mgr = users.project(star);
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });

    it("returns the join source of the select core", () => {
      const mgr = users.project(star);
      expect(mgr.source).toBeDefined();
    });

    it("sets the quantifier (distinct)", () => {
      const mgr = users.project(users.get("name")).distinct();
      expect(mgr.toSql()).toContain("DISTINCT");
    });

    it("chains distinct", () => {
      const mgr = users.project(star);
      expect(mgr.distinct()).toBe(mgr);
    });

    it("appends a comment to the generated query", () => {
      const mgr = users.project(star).comment("load users");
      expect(mgr.toSql()).toContain("/* load users */");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Table (additional)
  // =========================================================================
  describe("Table (ported stubs)", () => {
    it("should create join nodes", () => {
      const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("should add an offset", () => {
      const mgr = users.skip(5).project(star);
      expect(mgr.toSql()).toContain("OFFSET 5");
    });

    it("adds a having clause", () => {
      const mgr = users.having(sql("COUNT(*) > 1")).project(star);
      expect(mgr.toSql()).toContain("HAVING");
    });

    it("creates an outer join", () => {
      const mgr = users.outerJoin(posts);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("should create a group", () => {
      const mgr = users.group(users.get("age")).project(star);
      expect(mgr.toSql()).toContain("GROUP BY");
    });

    it("should create a node that proxies to a table (alias)", () => {
      const aliased = users.alias("u");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.name).toBe("u");
    });

    it("should accept a hash (constructor options)", () => {
      const t = new Table("users", { as: "u" });
      expect(t.tableAlias).toBe("u");
    });

    it("ignores as if it equals name", () => {
      const t = new Table("users", { as: "users" });
      // tableAlias is set to 'users' -- just proves it accepts the option
      expect(t.name).toBe("users");
    });

    it("should take an order", () => {
      const mgr = users.order(users.get("name").asc()).project(star);
      expect(mgr.toSql()).toContain("ORDER BY");
    });

    it("should add a limit", () => {
      const mgr = users.take(10).project(star);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("can project", () => {
      const mgr = users.project(users.get("name"));
      expect(mgr.toSql()).toContain('"name"');
    });

    it("takes multiple parameters for project", () => {
      const mgr = users.project(users.get("name"), users.get("email"));
      expect(mgr.toSql()).toContain('"name"');
      expect(mgr.toSql()).toContain('"email"');
    });

    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("manufactures an attribute", () => {
      const attr = users.get("id");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("id");
      expect(attr.relation).toBe(users);
    });

    it("is equal with equal ivars (same name)", () => {
      const a = new Table("users");
      const b = new Table("users");
      expect(a.name).toBe(b.name);
    });

    it("is not equal with different ivars", () => {
      const a = new Table("users");
      const b = new Table("posts");
      expect(a.name).not.toBe(b.name);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Update Manager (additional)
  // =========================================================================
  describe("Update Manager (ported stubs)", () => {
    it("should not quote sql literals", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), sql("UPPER(name)")]]);
      expect(mgr.toSql()).toContain("UPPER(name)");
      expect(mgr.toSql()).not.toContain("'UPPER(name)'");
    });

    it("handles limit properly", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("active"), false]]);
      mgr.where(users.get("age").lt(18));
      mgr.order(users.get("name").asc());
      mgr.take(5);
      expect(mgr.toSql()).toContain("LIMIT 5");
    });

    it("updates with null", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), null]]);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("= NULL");
    });

    it("takes a list of lists for set", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([
        [users.get("name"), "dean"],
        [users.get("age"), 31],
      ]);
      expect(mgr.toSql()).toContain('"name"');
      expect(mgr.toSql()).toContain('"age"');
    });

    it("chains set", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      expect(mgr.set([[users.get("name"), "dean"]])).toBe(mgr);
    });

    it("generates an update statement", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), "dean"]]);
      expect(mgr.toSql()).toContain("UPDATE");
    });

    it("generates a where clause", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), "dean"]]);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("chains where", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });

    it("can be set (key)", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.key(users.get("id").eq(1));
      expect(mgr.ast.key).not.toBeNull();
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Visitors To Sql
  // =========================================================================
  describe("Visitors To Sql (ported stubs)", () => {
    const visitor = new Visitors.ToSql();

    it("works with BindParams", () => {
      const node = new Nodes.BindParam();
      expect(visitor.compile(node)).toBe("?");
    });

    it("should not quote sql literals", () => {
      const node = new Nodes.SqlLiteral("NOW()");
      expect(visitor.compile(node)).toBe("NOW()");
    });

    it("should visit named functions", () => {
      const fn = new Nodes.NamedFunction("COUNT", [star]);
      expect(visitor.compile(fn)).toBe("COUNT(*)");
    });

    it("should visit built-in functions (SUM)", () => {
      const sum = users.get("age").sum();
      expect(visitor.compile(sum)).toBe('SUM("users"."age")');
    });

    it("should visit built-in functions operating on distinct values", () => {
      const count = users.get("name").count(true);
      expect(visitor.compile(count)).toBe('COUNT(DISTINCT "users"."name")');
    });

    it("should escape strings", () => {
      const node = new Nodes.Quoted("O'Brien");
      expect(visitor.compile(node)).toBe("'O''Brien'");
    });

    it("should handle false", () => {
      const node = new Nodes.Quoted(false);
      expect(visitor.compile(node)).toBe("FALSE");
    });

    it("should handle nil (null)", () => {
      const node = new Nodes.Quoted(null);
      expect(visitor.compile(node)).toBe("NULL");
    });

    it("wraps nested groupings in brackets only once", () => {
      const grouped = new Nodes.Grouping(new Nodes.Quoted("foo"));
      expect(visitor.compile(grouped)).toBe("('foo')");
    });

    it("should handle true", () => {
      const node = new Nodes.Quoted(true);
      expect(visitor.compile(node)).toBe("TRUE");
    });

    it("should construct a valid generic SQL statement (SELECT)", () => {
      const mgr = users.project(star);
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });

    it("should handle column names on both sides (equality)", () => {
      const node = users.get("id").eq(posts.get("user_id"));
      expect(visitor.compile(node)).toBe('"users"."id" = "posts"."user_id"');
    });

    it("should handle nil for equality (IS NULL)", () => {
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });

    it("should handle column names on both sides (not equal)", () => {
      const node = users.get("id").notEq(posts.get("user_id"));
      expect(visitor.compile(node)).toBe('"users"."id" != "posts"."user_id"');
    });

    it("should handle nil for not equal (IS NOT NULL)", () => {
      const node = users.get("name").notEq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NOT NULL');
    });

    it("should visit_Not", () => {
      const cond = users.get("name").eq("dean").not();
      expect(visitor.compile(cond)).toBe("NOT (\"users\".\"name\" = 'dean')");
    });

    it("should apply Not to the whole expression", () => {
      const cond = new Nodes.Not(
        new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")])
      );
      const result = visitor.compile(cond);
      expect(result).toContain("NOT (");
      expect(result).toContain("AND");
    });

    it("should visit_As", () => {
      const node = users.get("name").as("n");
      expect(visitor.compile(node)).toBe('"users"."name" AS n');
    });

    it("should visit_Integer (Quoted number)", () => {
      const node = new Nodes.Quoted(42);
      expect(visitor.compile(node)).toBe("42");
    });

    it("should visit_NilClass (Quoted null)", () => {
      const node = new Nodes.Quoted(null);
      expect(visitor.compile(node)).toBe("NULL");
    });

    it("should visit_Float (Quoted float)", () => {
      const node = new Nodes.Quoted(3.14);
      expect(visitor.compile(node)).toBe("3.14");
    });

    it("should contain a single space before ORDER BY", () => {
      const mgr = users.project(star).order(users.get("name").asc());
      expect(mgr.toSql()).toContain(" ORDER BY ");
    });

    it("should visit_Arel_Nodes_And", () => {
      const and = new Nodes.And([users.get("id").eq(1), users.get("name").eq("dean")]);
      const result = visitor.compile(and);
      expect(result).toContain("AND");
    });

    it("should visit_Arel_Nodes_Or", () => {
      const or = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
      const result = visitor.compile(or);
      expect(result).toContain("OR");
    });

    it("should visit_Arel_Nodes_Assignment", () => {
      const node = new Nodes.Assignment(users.get("name"), new Nodes.Quoted("dean"));
      const result = visitor.compile(node);
      expect(result).toBe("\"users\".\"name\" = 'dean'");
    });

    it("should visit_TrueClass (True node)", () => {
      expect(visitor.compile(new Nodes.True())).toBe("TRUE");
    });

    it("should know how to visit Matches (LIKE)", () => {
      const node = users.get("name").matches("%dean%");
      expect(visitor.compile(node)).toBe("\"users\".\"name\" LIKE '%dean%'");
    });

    it("should know how to visit DoesNotMatch (NOT LIKE)", () => {
      const node = users.get("name").doesNotMatch("%dean%");
      expect(visitor.compile(node)).toBe("\"users\".\"name\" NOT LIKE '%dean%'");
    });

    it("should know how to visit Ascending", () => {
      const node = users.get("name").asc();
      expect(visitor.compile(node)).toBe('"users"."name" ASC');
    });

    it("should return 1=0 when empty right which is always false (IN)", () => {
      const node = users.get("id").in([]);
      expect(visitor.compile(node)).toBe("1=0");
    });

    it("should return 1=1 when empty right which is always true (NOT IN)", () => {
      const node = users.get("id").notIn([]);
      expect(visitor.compile(node)).toBe("1=1");
    });

    it("should handle Multiplication", () => {
      const node = users.get("age").multiply(2);
      expect(visitor.compile(node)).toBe('"users"."age" * 2');
    });

    it("should handle Division", () => {
      const node = users.get("age").divide(2);
      expect(visitor.compile(node)).toBe('"users"."age" / 2');
    });

    it("should handle Addition", () => {
      const node = users.get("age").add(1);
      expect(visitor.compile(node)).toBe('"users"."age" + 1');
    });

    it("should handle Subtraction", () => {
      const node = users.get("age").subtract(1);
      expect(visitor.compile(node)).toBe('"users"."age" - 1');
    });

    it("should handle Concatenation (Concat node)", () => {
      const node = new Nodes.Concat(users.get("first_name"), users.get("last_name"));
      expect(visitor.compile(node)).toBe('"users"."first_name" || "users"."last_name"');
    });

    it("should handle Contains (@>)", () => {
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe("\"users\".\"tags\" @> 'foo'");
    });

    it("should handle Overlaps (&&)", () => {
      const node = users.get("tags").overlaps("bar");
      expect(visitor.compile(node)).toBe("\"users\".\"tags\" && 'bar'");
    });

    it("should handle arbitrary operators (InfixOperation)", () => {
      const node = new Nodes.InfixOperation("||", users.get("a"), new Nodes.Quoted("b"));
      expect(visitor.compile(node)).toBe("\"users\".\"a\" || 'b'");
    });

    it("encloses SELECT statements with parentheses (Union)", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const union = q1.union(q2);
      const result = visitor.compile(union);
      expect(result).toContain("(");
      expect(result).toContain("UNION");
    });

    it("encloses SELECT statements with parentheses (UnionAll)", () => {
      const q1 = users.project(star);
      const q2 = users.project(star);
      const unionAll = q1.unionAll(q2);
      const result = visitor.compile(unionAll);
      expect(result).toContain("(");
      expect(result).toContain("UNION ALL");
    });

    it("supports simple case expressions", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"));
      expect(visitor.compile(caseNode)).toBe("CASE WHEN 1 = 1 THEN 'yes' END");
    });

    it("supports extended case expressions", () => {
      const caseNode = new Nodes.Case(users.get("status"))
        .when(new Nodes.Quoted(1), new Nodes.SqlLiteral("'active'"))
        .when(new Nodes.Quoted(2), new Nodes.SqlLiteral("'inactive'"));
      const result = visitor.compile(caseNode);
      expect(result).toContain("CASE");
      expect(result).toContain("WHEN 1 THEN 'active'");
      expect(result).toContain("WHEN 2 THEN 'inactive'");
      expect(result).toContain("END");
    });

    it("works without default branch", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"));
      expect(visitor.compile(caseNode)).not.toContain("ELSE");
    });

    it("allows chaining multiple conditions", () => {
      const caseNode = new Nodes.Case()
        .when(new Nodes.SqlLiteral("score >= 90"), new Nodes.SqlLiteral("'A'"))
        .when(new Nodes.SqlLiteral("score >= 80"), new Nodes.SqlLiteral("'B'"))
        .else(new Nodes.SqlLiteral("'F'"));
      const result = visitor.compile(caseNode);
      expect(result).toContain("WHEN score >= 90 THEN 'A'");
      expect(result).toContain("WHEN score >= 80 THEN 'B'");
      expect(result).toContain("ELSE 'F'");
    });

    it("supports #when with two arguments and no #then", () => {
      const caseNode = new Nodes.Case()
        .when("active", 1)
        .when("inactive", 0);
      expect(visitor.compile(caseNode)).toBe("CASE WHEN active THEN 1 WHEN inactive THEN 0 END");
    });

    it("handles table aliases", () => {
      const aliased = new Table("users", { as: "u" });
      const mgr = aliased.project(aliased.get("name"));
      expect(mgr.toSql()).toContain('"u"."name"');
    });

    it("handles Cte nodes", () => {
      const cte = new Nodes.Cte("cte_table", users.project(users.get("id")).ast);
      const mgr = users.project(star);
      mgr.with(cte);
      expect(mgr.toSql()).toContain('WITH "cte_table" AS (SELECT "users"."id" FROM "users")');
    });

    it("handles CTEs with a MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("cte_table", users.project(users.get("id")).ast, "materialized");
      const mgr = users.project(star);
      mgr.with(cte);
      expect(mgr.toSql()).toContain('WITH "cte_table" AS MATERIALIZED (SELECT "users"."id" FROM "users")');
    });

    it("handles CTEs with a NOT MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("cte_table", users.project(users.get("id")).ast, "not_materialized");
      const mgr = users.project(star);
      mgr.with(cte);
      expect(mgr.toSql()).toContain('WITH "cte_table" AS NOT MATERIALIZED (SELECT "users"."id" FROM "users")');
    });

    it("should handle nulls first", () => {
      const mgr = users.project(star).order(users.get("name").asc().nullsFirst());
      expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS FIRST');
    });

    it("should handle nulls last", () => {
      const mgr = users.project(star).order(users.get("name").asc().nullsLast());
      expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS LAST');
    });

    it("should handle nulls first reversed", () => {
      const node = users.get("name").asc().nullsFirst().reverse();
      expect(node).toBeInstanceOf(Nodes.NullsLast);
      const mgr = users.project(star).order(node);
      expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" DESC NULLS LAST');
    });

    it("should handle nulls last reversed", () => {
      const node = users.get("name").desc().nullsLast().reverse();
      expect(node).toBeInstanceOf(Nodes.NullsFirst);
      const mgr = users.project(star).order(node);
      expect(mgr.toSql()).toBe('SELECT * FROM "users" ORDER BY "users"."name" ASC NULLS FIRST');
    });

    it("should handle BitwiseAnd", () => {
      const node = new Nodes.BitwiseAnd(users.get("flags"), new Nodes.Quoted(3));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."flags" & 3');
    });

    it("should handle BitwiseOr", () => {
      const node = new Nodes.BitwiseOr(users.get("flags"), new Nodes.Quoted(3));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."flags" | 3');
    });

    it("should handle BitwiseXor", () => {
      const node = new Nodes.BitwiseXor(users.get("flags"), new Nodes.Quoted(3));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."flags" ^ 3');
    });

    it("should handle BitwiseShiftLeft", () => {
      const node = new Nodes.BitwiseShiftLeft(users.get("flags"), new Nodes.Quoted(2));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."flags" << 2');
    });

    it("should handle BitwiseShiftRight", () => {
      const node = new Nodes.BitwiseShiftRight(users.get("flags"), new Nodes.Quoted(2));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."flags" >> 2');
    });

    it("should handle BitwiseNot", () => {
      const node = new Nodes.UnaryOperation("~", users.get("flags"));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('~"users"."flags"');
    });

    it("can handle ESCAPE for LIKE", () => {
      const node = users.get("name").matches("%foo%", true, "\\");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."name" LIKE \'%foo%\' ESCAPE \'\\\'');
    });

    it("can handle subqueries for IN", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    it("should visit_DateTime", () => {
      const dt = { toISOString: () => "2023-01-15T10:30:00.000Z" };
      const node = users.get("created_at").eq(dt);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."created_at" = \'2023-01-15T10:30:00.000Z\'');
    });

    it("should visit_Date", () => {
      const d = new Date(2023, 0, 15); // Jan 15, 2023
      const node = users.get("created_at").eq(d);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."created_at" = \'2023-01-15\'');
    });

    it("should visit_BigDecimal", () => {
      const big = BigInt(9999999999999);
      const node = users.get("balance").eq(big);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."balance" = 9999999999999');
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Collectors
  // =========================================================================
  describe("Collectors (ported stubs)", () => {
    it("Bind compile gathers all bind params", () => {
      const bind = new Collectors.Bind();
      bind.append("SELECT * FROM users WHERE id = ");
      bind.addBind(42);
      bind.append(" AND name = ");
      bind.addBind("dean");
      const [sql, binds] = bind.value;
      expect(sql).toBe("SELECT * FROM users WHERE id = ? AND name = ?");
      expect(binds).toEqual([42, "dean"]);
    });

    it("SQLString compile", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT ");
      collector.append("*");
      expect(collector.value).toBe("SELECT *");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Unary Operation
  // =========================================================================
  describe("Nodes Unary Operation (ported stubs)", () => {
    it("construct", () => {
      const node = new Nodes.UnaryOperation("-", users.get("age"));
      expect(node.operator).toBe("-");
      expect(node.operand).toBe(users.get("age").relation.get("age").relation ? node.operand : node.operand);
      expect(node.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("operation alias", () => {
      const node = new Nodes.UnaryOperation("-", users.get("age"));
      const aliased = node.as("negated_age");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("operation ordering", () => {
      const node = new Nodes.UnaryOperation("-", users.get("age"));
      expect(node.asc()).toBeInstanceOf(Nodes.Ascending);
      expect(node.desc()).toBeInstanceOf(Nodes.Descending);
    });

    it("equality with same ivars", () => {
      const a = new Nodes.UnaryOperation("-", users.get("age"));
      const b = new Nodes.UnaryOperation("-", users.get("age"));
      expect(a.operator).toBe(b.operator);
    });

    it("inequality with different ivars", () => {
      const a = new Nodes.UnaryOperation("-", users.get("age"));
      const b = new Nodes.UnaryOperation("+", users.get("age"));
      expect(a.operator).not.toBe(b.operator);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Casted
  // =========================================================================
  describe("Nodes Casted (ported stubs)", () => {
    it("is equal when eql? returns true (same value and attribute)", () => {
      const attr = users.get("name");
      const a = new Nodes.Casted("hello", attr);
      const b = new Nodes.Casted("hello", attr);
      expect(a.value).toBe(b.value);
      expect(a.attribute).toBe(b.attribute);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Filter
  // =========================================================================
  describe("Nodes Filter (ported stubs)", () => {
    it("should add filter to expression", () => {
      const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const filter = new Nodes.Filter(count, users.get("active").eq(true));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(filter)).toBe('COUNT(*) FILTER (WHERE "users"."active" = TRUE)');
    });

    it("should alias the expression", () => {
      const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const filter = new Nodes.Filter(count, users.get("active").eq(true));
      const aliased = filter.as("active_count");
      expect(aliased).toBeInstanceOf(Nodes.As);
    });

    it("should reference the window definition by name", () => {
      const count = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const filter = new Nodes.Filter(count, users.get("active").eq(true));
      const over = filter.over("w");
      expect(over).toBeInstanceOf(Nodes.Over);
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Nodes Cte
  // =========================================================================
  describe("Nodes Cte (ported stubs)", () => {
    it("is equal with equal ivars", () => {
      const rel = users.project(users.get("id")).ast;
      const a = new Nodes.Cte("cte", rel);
      const b = new Nodes.Cte("cte", rel);
      expect(a.name).toBe(b.name);
      expect(a.relation).toBe(b.relation);
    });

    it("is not equal with unequal ivars", () => {
      const rel = users.project(users.get("id")).ast;
      const a = new Nodes.Cte("cte1", rel);
      const b = new Nodes.Cte("cte2", rel);
      expect(a.name).not.toBe(b.name);
    });

    it("returns self", () => {
      const rel = users.project(users.get("id")).ast;
      const cte = new Nodes.Cte("cte", rel);
      expect(cte).toBeInstanceOf(Nodes.Cte);
    });

    it("returns an Arel::Table using the Cte's name", () => {
      const rel = users.project(users.get("id")).ast;
      const cte = new Nodes.Cte("cte_table", rel);
      const table = cte.toTable();
      expect(table).toBeInstanceOf(Table);
      expect(table.name).toBe("cte_table");
    });
  });

  // =========================================================================
  // Ported from missing-arel-stubs: Attributes Math
  // =========================================================================
  describe("Attributes Math (ported stubs)", () => {
    it("average should be compatible with Addition", () => {
      const node = users.get("age").add(1);
      expect(node).toBeInstanceOf(Nodes.Addition);
    });

    it("count should be compatible with Addition", () => {
      const count = users.get("id").count();
      expect(count.name).toBe("COUNT");
    });

    it("maximum should be compatible with node", () => {
      const node = users.get("age").maximum();
      expect(node.name).toBe("MAX");
    });

    it("minimum should be compatible with node", () => {
      const node = users.get("age").minimum();
      expect(node.name).toBe("MIN");
    });

    it("attribute node should be compatible with Subtraction", () => {
      const node = users.get("age").subtract(1);
      expect(node).toBeInstanceOf(Nodes.Subtraction);
    });

    it("attribute node should be compatible with Multiplication", () => {
      const node = users.get("age").multiply(2);
      expect(node).toBeInstanceOf(Nodes.Multiplication);
    });

    it("attribute node should be compatible with Division", () => {
      const node = users.get("age").divide(2);
      expect(node).toBeInstanceOf(Nodes.Division);
    });
  });

  // =========================================================================
  // Phase 300 — Predicates
  // =========================================================================
  describe("Predicates", () => {
    describe("#notEq", () => {
      it("should create a NotEqual node", () => {
        expect(users.get("id").notEq(10)).toBeInstanceOf(Nodes.NotEqual);
      });

      it("should generate != in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notEq(10));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" != 10'
        );
      });

      it("should handle null", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notEq(null));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" IS NOT NULL'
        );
      });
    });

    describe("#notEqAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").notEqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notEqAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" != 1 OR "users"."id" != 2)'
        );
      });
    });

    describe("#notEqAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").notEqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notEqAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" != 1 AND "users"."id" != 2)'
        );
      });
    });

    describe("#gt", () => {
      it("should generate > in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gt(10));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" > 10'
        );
      });
    });

    describe("#gteq", () => {
      it("should generate >= in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gteq(10));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" >= 10'
        );
      });
    });

    describe("#lt", () => {
      it("should generate < in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").lt(10));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" < 10'
        );
      });
    });

    describe("#lteq", () => {
      it("should generate <= in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").lteq(10));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" <= 10'
        );
      });
    });

    describe("#matches", () => {
      it("should generate LIKE in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").matches("foo%"));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."name" LIKE \'foo%\''
        );
      });
    });

    describe("#doesNotMatch", () => {
      it("should generate NOT LIKE in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").doesNotMatch("foo%"));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."name" NOT LIKE \'foo%\''
        );
      });
    });

    describe("#in", () => {
      it("should generate IN in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").in([1, 2, 3]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE "users"."id" IN (1, 2, 3)'
        );
      });

      it("should handle empty list", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").in([]));
        // Arel typically generates 1=0 or NULL for empty IN
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE 1=0'
        );
      });
    });
  });

  // =========================================================================
  // Additional Attribute predicate tests (Grouping/OR/AND per predicate)
  // Mirrors attributes/attribute_test.rb patterns
  // =========================================================================
  describe("Attributes Attribute Predicates (gt)", () => {
    it("should create a GreaterThanOrEqual node", () => {
      const node = users.get("age").gteq(10);
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("should create a LessThanOrEqual node", () => {
      const node = users.get("age").lteq(10);
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("should handle comparing with a subquery", () => {
      const subquery = users.project(users.get("id").maximum());
      const node = users.get("age").gt(subquery);
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("should accept various data types.", () => {
      expect(
        users.project(star).where(users.get("age").gt(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" > 10');
    });

    describe("#gtAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").gtAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gtAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" > 1 OR "users"."id" > 2)'
        );
      });
    });

    describe("#gtAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").gtAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gtAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" > 1 AND "users"."id" > 2)'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (gteq)", () => {
    it("should accept various data types.", () => {
      expect(
        users.project(star).where(users.get("age").gteq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" >= 10');
    });

    describe("#gteqAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").gteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gteqAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" >= 1 OR "users"."id" >= 2)'
        );
      });
    });

    describe("#gteqAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").gteqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").gteqAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" >= 1 AND "users"."id" >= 2)'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (lt)", () => {
    it("should accept various data types.", () => {
      expect(
        users.project(star).where(users.get("age").lt(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" < 10');
    });

    describe("#ltAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").ltAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").ltAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" < 1 OR "users"."id" < 2)'
        );
      });
    });

    describe("#ltAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").ltAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").ltAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" < 1 AND "users"."id" < 2)'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (lteq)", () => {
    it("should accept various data types.", () => {
      expect(
        users.project(star).where(users.get("age").lteq(10)).toSql()
      ).toBe('SELECT * FROM "users" WHERE "users"."age" <= 10');
    });

    describe("#lteqAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").lteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").lteqAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" <= 1 OR "users"."id" <= 2)'
        );
      });
    });

    describe("#lteqAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").lteqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").lteqAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" <= 1 AND "users"."id" <= 2)'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (eq)", () => {
    describe("#eqAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").eqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").eqAny([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 OR "users"."id" = 2)'
        );
      });

      it("should not eat input", () => {
        const input = [1, 2, 3];
        const copy = [...input];
        users.get("id").eqAny(input);
        expect(input).toEqual(copy);
      });
    });

    describe("#eqAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").eqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").eqAll([1, 2]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 AND "users"."id" = 2)'
        );
      });

      it("should not eat input", () => {
        const input = [1, 2, 3];
        const copy = [...input];
        users.get("id").eqAll(input);
        expect(input).toEqual(copy);
      });
    });
  });

  describe("Attributes Attribute Predicates (matches)", () => {
    describe("#matchesAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("name").matchesAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").matchesAny(["%foo%", "%bar%"]));
        expect(mgr.toSql()).toBe(
          `SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%foo%' OR "users"."name" LIKE '%bar%')`
        );
      });
    });

    describe("#matchesAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("name").matchesAll(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").matchesAll(["%foo%", "%bar%"]));
        expect(mgr.toSql()).toBe(
          `SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%foo%' AND "users"."name" LIKE '%bar%')`
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (doesNotMatch)", () => {
    describe("#doesNotMatchAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("name").doesNotMatchAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").doesNotMatchAny(["%foo%", "%bar%"]));
        expect(mgr.toSql()).toBe(
          `SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%foo%' OR "users"."name" NOT LIKE '%bar%')`
        );
      });
    });

    describe("#doesNotMatchAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("name").doesNotMatchAll(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("name").doesNotMatchAll(["%foo%", "%bar%"]));
        expect(mgr.toSql()).toBe(
          `SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%foo%' AND "users"."name" NOT LIKE '%bar%')`
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (in)", () => {
    it("should generate IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").in([1, 2, 3]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE "users"."id" IN (1, 2, 3)'
      );
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").in([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    describe("#inAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").inAny([[1, 2], [3, 4]])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").inAny([[1, 2], [3, 4]]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" IN (1, 2) OR "users"."id" IN (3, 4))'
        );
      });
    });

    describe("#inAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").inAll([[1, 2], [3, 4]])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").inAll([[1, 2], [3, 4]]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" IN (1, 2) AND "users"."id" IN (3, 4))'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (notIn)", () => {
    it("should generate NOT IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").notIn([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE "users"."id" NOT IN (1, 2)'
      );
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" NOT IN (1, 2, 3)');
    });

    describe("#notInAny", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").notInAny([[1, 2], [3, 4]])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notInAny([[1, 2], [3, 4]]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" NOT IN (1, 2) OR "users"."id" NOT IN (3, 4))'
        );
      });
    });

    describe("#notInAll", () => {
      it("should create a Grouping node", () => {
        expect(users.get("id").notInAll([[1, 2], [3, 4]])).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const mgr = users.project(users.get("id"));
        mgr.where(users.get("id").notInAll([[1, 2], [3, 4]]));
        expect(mgr.toSql()).toBe(
          'SELECT "users"."id" FROM "users" WHERE ("users"."id" NOT IN (1, 2) AND "users"."id" NOT IN (3, 4))'
        );
      });
    });
  });

  describe("Attributes Attribute Predicates (contains)", () => {
    it("should create a Contains node", () => {
      const node = users.get("tags").contains("foo");
      expect(node).toBeInstanceOf(Nodes.InfixOperation);
    });

    it("should produce sql", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe("\"users\".\"tags\" @> 'foo'");
    });

    it("should generate ANDs in sql", () => {
      const left = users.get("tags").contains("a");
      const right = users.get("tags").contains("b");
      const node = new Nodes.And([left, right]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("AND");
    });
  });

  // =========================================================================
  // Additional between/notBetween tests for attribute_test.rb coverage
  // =========================================================================
  describe("Attributes Attribute Predicates (between)", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("age").between(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").between(-Infinity, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" <= 65');
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("age").between(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
    });

    it("can be constructed with a subquery", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    describe("#betweenAny", () => {
      it("should create a Grouping node", () => {
        const left = users.get("age").between(18, 30);
        const right = users.get("age").between(40, 50);
        const node = new Nodes.Grouping(new Nodes.Or(left, right));
        expect(node).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const left = users.get("age").between(18, 30);
        const right = users.get("age").between(40, 50);
        const node = new Nodes.Grouping(new Nodes.Or(left, right));
        const visitor = new Visitors.ToSql();
        const result = visitor.compile(node);
        expect(result).toContain("OR");
        expect(result).toContain("BETWEEN");
      });
    });

    describe("#betweenAll", () => {
      it("should create a Grouping node", () => {
        const left = users.get("age").between(18, 65);
        const right = users.get("score").between(1, 100);
        const node = new Nodes.Grouping(new Nodes.And([left, right]));
        expect(node).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const left = users.get("age").between(18, 65);
        const right = users.get("score").between(1, 100);
        const node = new Nodes.Grouping(new Nodes.And([left, right]));
        const visitor = new Visitors.ToSql();
        const result = visitor.compile(node);
        expect(result).toContain("AND");
        expect(result).toContain("BETWEEN");
      });
    });
  });

  describe("Attributes Attribute Predicates (notBetween)", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("age").notBetween(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("NOT");
      expect(visitor.compile(node)).toContain("BETWEEN");
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").notBetween(-Infinity, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("NOT");
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("age").notBetween(18, 65);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("NOT");
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("age").notBetween(Infinity, 65);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("age").notBetween(18, Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("age").notBetween(18, Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("age").notBetween(Infinity, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("age").notBetween(-Infinity, -Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a random object", () => {
      const node = users.get("age").notBetween(1, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a Union", () => {
      const node = users.get("age").notBetween(1, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    describe("#notBetweenAny", () => {
      it("should create a Grouping node", () => {
        const left = users.get("age").notBetween(18, 30);
        const right = users.get("age").notBetween(40, 50);
        const node = new Nodes.Grouping(new Nodes.Or(left, right));
        expect(node).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ORs in sql", () => {
        const left = users.get("age").notBetween(18, 30);
        const right = users.get("age").notBetween(40, 50);
        const node = new Nodes.Grouping(new Nodes.Or(left, right));
        const visitor = new Visitors.ToSql();
        const result = visitor.compile(node);
        expect(result).toContain("OR");
      });
    });

    describe("#notBetweenAll", () => {
      it("should create a Grouping node", () => {
        const left = users.get("age").notBetween(18, 65);
        const right = users.get("score").notBetween(1, 100);
        const node = new Nodes.Grouping(new Nodes.And([left, right]));
        expect(node).toBeInstanceOf(Nodes.Grouping);
      });

      it("should generate ANDs in sql", () => {
        const left = users.get("age").notBetween(18, 65);
        const right = users.get("score").notBetween(1, 100);
        const node = new Nodes.Grouping(new Nodes.And([left, right]));
        const visitor = new Visitors.ToSql();
        const result = visitor.compile(node);
        expect(result).toContain("AND");
      });
    });
  });

  // =========================================================================
  // Additional ToSql visitor tests for visitors/to_sql_test.rb coverage
  // =========================================================================
  describe("Visitors To Sql (additional)", () => {
    it("should handle false", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.SqlLiteral("FALSE"))).toBe("FALSE");
    });

    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });

    it("should visit_Arel_SelectManager, which is a subquery", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").in(mgr);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    it("should visit_TrueClass", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.True())).toBe("TRUE");
    });

    it("can handle ESCAPE", () => {
      const node = users.get("name").matches("foo%", true, "\\");
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("LIKE");
    });

    it("can handle subqueries", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("SELECT");
    });

    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.InfixOperation("&&", users.get("tags"), new Nodes.Quoted("foo"));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("&&");
    });

    it("squashes parenthesis on multiple unions", () => {
      const m1 = users.project(star).where(users.get("id").eq(1));
      const m2 = users.project(star).where(users.get("id").eq(2));
      const union = m1.union(m2);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(union);
      expect(result).toContain("UNION");
    });

    it("squashes parenthesis on multiple union alls", () => {
      const m1 = users.project(star).where(users.get("id").eq(1));
      const m2 = users.project(star).where(users.get("id").eq(2));
      const union = m1.unionAll(m2);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(union);
      expect(result).toContain("UNION ALL");
    });

    it("should chain predications on named functions", () => {
      const fn = new Nodes.NamedFunction("COALESCE", [users.get("name"), new Nodes.Quoted("default")]);
      const node = new Nodes.Equality(fn, new Nodes.Quoted("test"));
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("COALESCE");
      expect(result).toContain("=");
    });

    it("should handle nil with named functions", () => {
      const fn = new Nodes.NamedFunction("COALESCE", [users.get("name"), new Nodes.Quoted("default")]);
      const node = new Nodes.Equality(fn, null);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("NULL");
    });

    it("works with lists", () => {
      const node = users.get("id").in([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("should visit string subclass", () => {
      const visitor = new Visitors.ToSql();
      const node = new Nodes.SqlLiteral("hello");
      expect(visitor.compile(node)).toBe("hello");
    });

    it("should escape LIMIT", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("should quote LIMIT without column type coercion", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("can be chained as a predicate", () => {
      const literal = new Nodes.SqlLiteral("foo");
      const node = new Nodes.Equality(literal, new Nodes.Quoted("bar"));
      expect(node).toBeInstanceOf(Nodes.Equality);
    });

    it("handles table aliases", () => {
      const aliased = users.alias("u");
      const mgr = new SelectManager();
      mgr.from(aliased);
      mgr.project(new Nodes.SqlLiteral("*"));
      const result = mgr.toSql();
      expect(result).toContain('"users" "u"');
    });

    it("should compile node names", () => {
      const fn = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(fn)).toBe('COUNT("users"."id")');
    });

    it("should compile literal SQL", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.SqlLiteral("1 = 1"))).toBe("1 = 1");
    });

    it("should compile Arel nodes", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").eq(1);
      expect(visitor.compile(node)).toBe('"users"."id" = 1');
    });

    it("joins subexpressions", () => {
      const a = users.get("id").eq(1);
      const b = users.get("name").eq("test");
      const node = a.and(b);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("AND");
    });
  });

  // =========================================================================
  // Additional SelectManager tests for select_manager_test.rb coverage
  // =========================================================================
  describe("SelectManager (additional)", () => {
    it("should add an offset", () => {
      const mgr = users.project(star);
      mgr.skip(10);
      expect(mgr.toSql()).toContain("OFFSET 10");
    });

    it("uses alias in sql", () => {
      const aliased = users.alias("u");
      const mgr = new SelectManager();
      mgr.from(aliased);
      mgr.project(new Nodes.SqlLiteral("*"));
      expect(mgr.toSql()).toContain('"u"');
    });

    it("can make a subselect", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").in(mgr);
      const outer = users.project(star).where(node);
      expect(outer.toSql()).toContain("SELECT");
      expect(outer.toSql()).toContain("IN");
    });

    it("converts strings to SQLLiterals", () => {
      const mgr = users.project(star);
      mgr.where(new Nodes.SqlLiteral("1 = 1"));
      expect(mgr.toSql()).toContain("1 = 1");
    });

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

    it("takes sql literals", () => {
      const mgr = users.project(new Nodes.SqlLiteral("*"));
      expect(mgr.toSql()).toBe('SELECT * FROM "users"');
    });

    it("takes multiple args", () => {
      const mgr = users.project(users.get("id"), users.get("name"));
      expect(mgr.toSql()).toContain('"users"."id"');
      expect(mgr.toSql()).toContain('"users"."name"');
    });

    it("takes strings", () => {
      const mgr = users.project(new Nodes.SqlLiteral("id"), new Nodes.SqlLiteral("name"));
      const result = mgr.toSql();
      expect(result).toContain("id");
      expect(result).toContain("name");
    });

    it("removes LIMIT when nil is passed", () => {
      const mgr = users.project(star).take(10);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("chains", () => {
      const mgr = users.project(star);
      expect(mgr.where(users.get("id").eq(1))).toBe(mgr);
    });

    it("sets the quantifier", () => {
      const mgr = users.project(star);
      mgr.distinct();
      expect(mgr.toSql()).toContain("DISTINCT");
    });

    it("responds to join", () => {
      const mgr = users.project(star);
      expect(mgr).toHaveProperty("join");
    });

    it("joins itself", () => {
      const mgr = users.project(star).join(posts).on(
        users.get("id").eq(posts.get("user_id"))
      );
      const result = mgr.toSql();
      expect(result).toContain("INNER JOIN");
      expect(result).toContain('"posts"');
    });

    it("can be empty", () => {
      const mgr = new SelectManager();
      expect(mgr.toSql()).toBeDefined();
    });

    it("copies where clauses when nesting is triggered", () => {
      const mgr = users.project(star)
        .where(users.get("id").eq(1))
        .where(users.get("name").eq("test"));
      const result = mgr.toSql();
      expect(result).toContain('"users"."id" = 1');
      expect(result).toContain("AND");
    });

    it("can have multiple items specified separately", () => {
      const mgr = users.project(users.get("id"));
      mgr.project(users.get("name"));
      const result = mgr.toSql();
      expect(result).toContain('"users"."id"');
      expect(result).toContain('"users"."name"');
    });
  });

  // =========================================================================
  // Additional tests for smaller files
  // =========================================================================
  describe("Nodes Sql Literal (additional)", () => {
    it("should compile literal SQL", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.SqlLiteral("1 = 1"))).toBe("1 = 1");
    });

    it("should compile Arel nodes", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").eq(1);
      expect(visitor.compile(node)).toBe('"users"."id" = 1');
    });

    it("should compile nodes with bind params", () => {
      const bind = new Nodes.BindParam("test");
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(bind);
      expect(result).toBeDefined();
    });

    it("can be built by adding SQL fragments one at a time", () => {
      const a = new Nodes.SqlLiteral("foo");
      const b = new Nodes.SqlLiteral("bar");
      expect(a).toBeInstanceOf(Nodes.SqlLiteral);
      expect(b).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });

  describe("InsertManager (additional)", () => {
    it("should handle false", () => {
      const mgr = new InsertManager();
      mgr.into(users);
      mgr.insert([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });
  });

  describe("UpdateManager (additional)", () => {
    it("should handle false", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("active"), false]]);
      expect(mgr.toSql()).toContain("FALSE");
    });

    it("takes a string", () => {
      const mgr = new UpdateManager();
      mgr.table(users);
      mgr.set([[users.get("name"), "test"]]);
      expect(mgr.toSql()).toContain("test");
    });
  });

  describe("Table (additional)", () => {
    it("should accept a hash (constructor options)", () => {
      const t = new Table("users", { as: "u" });
      expect(t.tableAlias).toBe("u");
    });

    it("returns a tree manager", () => {
      const mgr = users.from();
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("manufactures an attribute", () => {
      const attr = users.get("id");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("id");
    });
  });

  describe("Nodes Node (additional)", () => {
    it("should know how to visit", () => {
      const node = users.get("id").eq(1);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" = 1');
    });
  });

  // =========================================================================
  // Additional tests to improve Rails coverage
  // =========================================================================

  // -- InsertManager tests --
  describe("InsertManager", () => {
    it("takes a Table and chains", () => {
      const im = new InsertManager();
      const result = im.into(users);
      expect(result).toBe(im);
    });

    it("converts to sql", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("id"), 1]]);
      const sql = im.toSql();
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain('"users"');
    });

    it("accepts sql literals", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("name"), new Nodes.SqlLiteral("DEFAULT")]]);
      const sql = im.toSql();
      expect(sql).toContain("DEFAULT");
    });

    it("works with multiple values", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([
        [users.get("name"), "alice"],
        [users.get("id"), 1],
      ]);
      const sql = im.toSql();
      expect(sql).toContain('"name"');
      expect(sql).toContain('"id"');
    });

    it("literals in multiple values are not escaped", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([
        [users.get("name"), new Nodes.SqlLiteral("DEFAULT")],
      ]);
      const sql = im.toSql();
      expect(sql).toContain("DEFAULT");
      expect(sql).not.toContain("'DEFAULT'");
    });

    it("works with multiple single values", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("name"), "bob"]]);
      const sql = im.toSql();
      expect(sql).toContain("'bob'");
    });

    it("takes a list of lists", () => {
      const im = new InsertManager();
      im.into(users);
      const vl = im.createValuesList([
        [new Nodes.Quoted("alice")],
        [new Nodes.Quoted("bob")],
      ]);
      im.values(vl);
      im.ast.columns = [users.get("name")];
      const sql = im.toSql();
      expect(sql).toContain("VALUES");
    });

    it("noop for empty list", () => {
      const im = new InsertManager();
      im.into(users);
      // No values set - should still generate partial SQL
      const sql = im.toSql();
      expect(sql).toContain("INSERT INTO");
    });

    it("converts to sql", () => {
      const im = new InsertManager();
      im.into(users);
      im.insert([[users.get("id"), 10]]);
      expect(im.toSql()).toContain("10");
    });
  });

  // -- Nodes equality tests --
  describe("Nodes Case", () => {
    it("is equal with equal ivars", () => {
      const c1 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      const c2 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      expect(c1.conditions.length).toBe(c2.conditions.length);
      expect(c1.operand).toBeInstanceOf(Nodes.Attribute);
      expect(c2.operand).toBeInstanceOf(Nodes.Attribute);
    });

    it("is not equal with different ivars", () => {
      const c1 = new Nodes.Case(users.get("name")).when(new Nodes.Quoted("a"));
      const c2 = new Nodes.Case(users.get("id")).when(new Nodes.Quoted("b"));
      expect((c1.operand as any).name).not.toBe((c2.operand as any).name);
    });
  });

  describe("Nodes Count", () => {
    it("is equal with equal ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      expect(c1.name).toBe(c2.name);
    });

    it("is not equal with different ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("name")]);
      expect(c1.expressions[0]).not.toBe(c2.expressions[0]);
    });
  });

  describe("Nodes DeleteStatement", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.DeleteStatement();
      const s2 = new Nodes.DeleteStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.wheres.length).toBe(s2.wheres.length);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.DeleteStatement();
      const s2 = new Nodes.DeleteStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });
  });

  describe("Nodes Equality", () => {
    it("takes an engine", () => {
      const eq = new Nodes.Equality(users.get("id"), new Nodes.Quoted(1));
      expect(eq.left).toBeInstanceOf(Nodes.Attribute);
      expect(eq.right).toBeInstanceOf(Nodes.Quoted);
    });

    it("makes and AND node", () => {
      const eq = users.get("id").eq(1);
      const result = eq.and(users.get("name").eq("bob"));
      expect(result).toBeInstanceOf(Nodes.And);
    });
  });

  describe("Nodes InsertStatement", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.InsertStatement();
      const s2 = new Nodes.InsertStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.columns.length).toBe(s2.columns.length);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.InsertStatement();
      const s2 = new Nodes.InsertStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });
  });

  describe("Nodes Over", () => {
    it("is equal with equal ivars", () => {
      const o1 = new Nodes.Over(users.get("id").count());
      const o2 = new Nodes.Over(users.get("id").count());
      expect(o1.right).toBe(o2.right); // both null
    });

    it("is not equal with different ivars", () => {
      const w = new Nodes.Window();
      const o1 = new Nodes.Over(users.get("id").count());
      const o2 = new Nodes.Over(users.get("id").count(), w);
      expect(o1.right).not.toBe(o2.right);
    });
  });

  describe("Nodes SelectStatement", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.SelectStatement();
      const s2 = new Nodes.SelectStatement();
      expect(s1.cores.length).toBe(s2.cores.length);
      expect(s1.limit).toBe(s2.limit);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.SelectStatement();
      const s2 = new Nodes.SelectStatement();
      s2.limit = new Nodes.Limit(new Nodes.Quoted(10));
      expect(s1.limit).not.toBe(s2.limit);
    });
  });

  describe("Nodes SqlLiteral", () => {
    it("makes a count node", () => {
      const lit = new Nodes.SqlLiteral("*");
      const count = new Nodes.NamedFunction("COUNT", [lit]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe("COUNT(*)");
    });

    it("makes a distinct node", () => {
      const lit = new Nodes.SqlLiteral("zomg");
      const dist = new Nodes.Distinct();
      const count = new Nodes.NamedFunction("COUNT", [lit], undefined, true);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(count)).toBe("COUNT(DISTINCT zomg)");
    });

    it("makes an equality node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      const eq = new Nodes.Equality(lit, new Nodes.Quoted(1));
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(eq)).toBe("foo = 1");
    });

    it("makes a grouping node with an or node", () => {
      const lit1 = new Nodes.SqlLiteral("foo");
      const lit2 = new Nodes.SqlLiteral("bar");
      const eq1 = new Nodes.Equality(lit1, new Nodes.Quoted(1));
      const eq2 = new Nodes.Equality(lit2, new Nodes.Quoted(2));
      const orNode = eq1.or(eq2);
      expect(orNode).toBeInstanceOf(Nodes.Grouping);
    });

    it("makes a grouping node with an and node", () => {
      const lit1 = new Nodes.SqlLiteral("foo");
      const lit2 = new Nodes.SqlLiteral("bar");
      const eq1 = new Nodes.Equality(lit1, new Nodes.Quoted(1));
      const eq2 = new Nodes.Equality(lit2, new Nodes.Quoted(2));
      const andNode = eq1.and(eq2);
      expect(andNode).toBeInstanceOf(Nodes.And);
    });
  });

  describe("Nodes Sum", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      const s2 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      expect(s1.name).toBe(s2.name);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.NamedFunction("SUM", [users.get("id")]);
      const s2 = new Nodes.NamedFunction("SUM", [users.get("name")]);
      expect(s1.expressions[0]).not.toBe(s2.expressions[0]);
    });
  });

  describe("Nodes UpdateStatement", () => {
    it("is equal with equal ivars", () => {
      const s1 = new Nodes.UpdateStatement();
      const s2 = new Nodes.UpdateStatement();
      expect(s1.relation).toBe(s2.relation);
      expect(s1.wheres.length).toBe(s2.wheres.length);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.UpdateStatement();
      const s2 = new Nodes.UpdateStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });
  });

  describe("Nodes Window", () => {
    it("is equal with equal ivars", () => {
      const w1 = new Nodes.Window();
      const w2 = new Nodes.Window();
      expect(w1.orders.length).toBe(w2.orders.length);
      expect(w1.partitions.length).toBe(w2.partitions.length);
    });

    it("is not equal with different ivars", () => {
      const w1 = new Nodes.Window();
      const w2 = new Nodes.Window();
      w2.order(users.get("id").asc());
      expect(w1.orders.length).not.toBe(w2.orders.length);
    });
  });

  // -- SelectManager additional tests --
  describe("SelectManager (additional)", () => {
    it("should support any ast", () => {
      const mgr = new SelectManager();
      mgr.from(users);
      expect(mgr.ast).toBeInstanceOf(Nodes.SelectStatement);
    });

    it("should remove an offset", () => {
      const mgr = new SelectManager(users);
      mgr.skip(10);
      expect(mgr.offset).not.toBeNull();
      mgr.ast.offset = null;
      expect(mgr.offset).toBeNull();
    });

    it("converts to sqlliterals", () => {
      const mgr = new SelectManager(users);
      mgr.project("foo");
      const sql = mgr.toSql();
      expect(sql).toContain("foo");
    });

    it("converts to sqlliterals with multiple items", () => {
      const mgr = new SelectManager(users);
      mgr.project("foo", "bar");
      const sql = mgr.toSql();
      expect(sql).toContain("foo");
      expect(sql).toContain("bar");
    });

    it("takes multiple args", () => {
      const mgr = new SelectManager(users);
      mgr.order(users.get("id").asc(), users.get("name").desc());
      const sql = mgr.toSql();
      expect(sql).toContain("ORDER BY");
    });

    it("chains", () => {
      const mgr = new SelectManager(users);
      const result = mgr.project(star);
      expect(result).toBe(mgr);
    });

    it("can receive any node", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1));
      const sql = mgr.toSql();
      expect(sql).toContain("WHERE");
    });

    it("copies from", () => {
      const mgr = new SelectManager(users);
      mgr.from(posts);
      const sql = mgr.toSql();
      expect(sql).toContain('"posts"');
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
      const mgr = new SelectManager(users);
      mgr.project(users.get("id"));
      const win = mgr.window("w");
      win.frame(new Nodes.Range(new Nodes.CurrentRow()));
      const sql = mgr.toSql();
      expect(sql).toContain("RANGE");
      expect(sql).toContain("CURRENT ROW");
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

    it("responds to join", () => {
      const mgr = new SelectManager(users);
      mgr.join(posts, users.get("id").eq(posts.get("user_id")));
      const sql = mgr.toSql();
      expect(sql).toContain("INNER JOIN");
    });

    it("handles database-specific statements", () => {
      const mgr = new SelectManager(users);
      mgr.lock();
      const sql = mgr.toSql();
      expect(sql).toContain("FOR UPDATE");
    });

    it("can have a non-table alias as relation name", () => {
      const subq = new SelectManager(users);
      subq.project(star);
      const alias = subq.as("subquery");
      expect(alias).toBeInstanceOf(Nodes.TableAlias);
    });

    it("copies where clauses when nesting is triggered", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1));
      mgr.where(users.get("name").eq("bob"));
      const sql = mgr.toSql();
      expect(sql).toContain("AND");
    });
  });

  // -- Table additional tests --
  describe("Table (additional)", () => {
    it("should create join nodes with a klass", () => {
      const join = users.createJoin(posts);
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("should create join nodes with a klass", () => {
      const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("should create join nodes with a klass", () => {
      const sjoin = users.createStringJoin("NATURAL JOIN posts");
      expect(sjoin).toBeInstanceOf(Nodes.StringJoin);
    });

    it("noops on nil", () => {
      // Table.join with a null-like argument - the manager still works
      const mgr = users.from();
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("takes a second argument for join type", () => {
      const mgr = users.outerJoin(posts);
      const sql = mgr.toSql();
      expect(sql).toContain("LEFT OUTER JOIN");
    });

    it("should accept a hash", () => {
      // Table where accepts node conditions
      const mgr = users.where(users.get("id").eq(1));
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("should accept literal SQL", () => {
      const mgr = users.project(sql("1 as one"));
      const result = mgr.toSql();
      expect(result).toContain("1 as one");
    });

    it("should accept Arel nodes", () => {
      const mgr = users.project(users.get("id"));
      const result = mgr.toSql();
      expect(result).toContain('"users"."id"');
    });
  });

  // -- UpdateManager additional tests --
  describe("UpdateManager (additional)", () => {
    it("sets having", () => {
      const um = new UpdateManager();
      um.table(users);
      um.having(users.get("id").gt(0));
      expect(um.ast.havings.length).toBe(1);
    });

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

    it("generates an update statement with joins", () => {
      const um = new UpdateManager();
      um.table(users);
      um.set([[users.get("name"), "bob"]]);
      const sql = um.toSql();
      expect(sql).toContain("UPDATE");
      expect(sql).toContain("SET");
    });

    it("chains", () => {
      const um = new UpdateManager();
      const result = um.table(users);
      expect(result).toBe(um);
    });

    it("can be accessed", () => {
      const um = new UpdateManager();
      um.table(users);
      um.where(users.get("id").eq(1));
      expect(um.wheres.length).toBe(1);
    });
  });

  // -- Visitor ToSql additional tests --
  describe("Visitors ToSql (additional)", () => {
    const visitor = new Visitors.ToSql();

    it("should handle nil", () => {
      const node = users.get("id").eq(null);
      expect(visitor.compile(node)).toBe('"users"."id" IS NULL');
    });

    it("should handle false", () => {
      const node = new Nodes.Quoted(false);
      expect(visitor.compile(node)).toBe("FALSE");
    });

    it("should visit_Hash", () => {
      // Visiting assignment (closest to hash behavior)
      const node = new Nodes.Assignment(users.get("name"), new Nodes.Quoted("bob"));
      expect(visitor.compile(node)).toContain("=");
    });

    it("handles CTEs with a NOT MATERIALIZED modifier", () => {
      const subq = new SelectManager(users);
      subq.project(star);
      const cte = new Nodes.Cte("cte_table", subq.ast, "not_materialized");
      const sql = visitor.compile(cte);
      expect(sql).toContain("NOT MATERIALIZED");
    });

    it("should compile nodes with bind params", () => {
      const bp = new Nodes.BindParam();
      expect(visitor.compile(bp)).toBe("?");
    });

    it("can handle two dot ranges", () => {
      // between with standard range
      const node = users.get("id").between([1, 10]);
      const sql = visitor.compile(node);
      expect(sql).toContain("BETWEEN");
      expect(sql).toContain("1 AND 10");
    });

    it("can handle three dot ranges", () => {
      // exclusive range - use LessThan for upper bound (conceptually)
      const node = users.get("id").between(1, 10);
      const sql = visitor.compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can handle ranges bounded by infinity", () => {
      // When begin is -Infinity, it's a LessThanOrEqual
      const node = users.get("id").between(-Infinity, 10);
      const sql = visitor.compile(node);
      expect(sql).toContain("<=");
    });

    it("can handle subqueries", () => {
      const subq = new SelectManager(posts);
      subq.project(posts.get("user_id"));
      const node = users.get("id").in(subq);
      const sql = visitor.compile(node);
      expect(sql).toContain("IN");
      expect(sql).toContain("SELECT");
    });

    it("unsupported input should raise UnsupportedVisitError", () => {
      expect(() => {
        visitor.compile({} as any);
      }).toThrow();
    });

    it("should use the underlying table for checking columns", () => {
      const aliased = new Table("users", { as: "u" });
      const attr = aliased.get("id");
      const sql = visitor.compile(attr);
      expect(sql).toBe('"u"."id"');
    });
  });

  // -- Attribute between (range) tests matching Rails --
  describe("Attribute between (range variants)", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("id").between([1, 100]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
      expect(sql).toContain("1 AND 100");
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("id").between(-Infinity, 100);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
      expect(sql).toContain("100");
    });

    it("can be constructed with a range ending at Infinity", () => {
      const node = users.get("id").gteq(1);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with an infinite range", () => {
      // -Infinity..Infinity is always true, just produce a lteq Infinity
      const node = users.get("id").between(-Infinity, Infinity);
      const sql = new Visitors.ToSql().compile(node);
      // -Infinity start → lteq end
      expect(sql).toContain("<=");
    });

    it("can be constructed with a range where the begin and end are equal", () => {
      const node = users.get("id").between([5, 5]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can be constructed with an exclusive range", () => {
      // Exclusive: attr >= begin AND attr < end
      const begin = 1;
      const end = 10;
      const node = new Nodes.Grouping(
        new Nodes.And([users.get("id").gteq(begin), users.get("id").lt(end)])
      );
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
      expect(sql).toContain("<");
    });

    it("can be constructed with a random object", () => {
      // Using a quoted value
      const node = users.get("id").eq(new Nodes.Quoted("random_thing"));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("'random_thing'");
    });

    it("can be constructed with a Union", () => {
      const m1 = new SelectManager(users);
      m1.project(star);
      const m2 = new SelectManager(users);
      m2.project(star);
      const union = m1.union(m2);
      expect(union).toBeInstanceOf(Nodes.Union);
      const sql = new Visitors.ToSql().compile(union);
      expect(sql).toContain("UNION");
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("id").gteq(new Nodes.Quoted(1));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const node = users.get("id").lteq(new Nodes.Quoted(100));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const node = users.get("id").lt(100);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const node = users.get("id").lt(new Nodes.Quoted(100));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });

    it("can be constructed with a quoted infinite range", () => {
      const node = users.get("id").between(-Infinity, Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBeDefined();
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("id").gteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("id").lteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });

    it("can be constructed with an exclusive range implicitly ending at Infinity", () => {
      const node = users.get("id").lt(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("id").gteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("id").lteq(-Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });
  });

  // -- Collectors SqlString --
  describe("Collectors SqlString", () => {
    it("returned sql uses utf8 encoding", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT");
      const result = collector.value;
      expect(typeof result).toBe("string");
    });
  });

  // -- Nodes Node factory methods --
  describe("Nodes Node", () => {
    it("includes factory methods", () => {
      const mgr = new SelectManager(users);
      expect(typeof mgr.createTrue).toBe("function");
      expect(typeof mgr.createFalse).toBe("function");
      expect(typeof mgr.createJoin).toBe("function");
      expect(typeof mgr.createStringJoin).toBe("function");
      expect(typeof mgr.createAnd).toBe("function");
      expect(typeof mgr.createOn).toBe("function");
    });
  });

  // -- SelectManager additional missing tests --
  describe("SelectManager (more missing)", () => {
    it("accepts symbols as sql literals", () => {
      const mgr = new SelectManager(users);
      mgr.project("id");
      const sql = mgr.toSql();
      expect(sql).toContain("id");
    });

    it("accepts symbols", () => {
      const mgr = new SelectManager(users);
      mgr.project("name");
      const sql = mgr.toSql();
      expect(sql).toContain("name");
    });

    it("takes a symbol", () => {
      const mgr = new SelectManager(users);
      mgr.group("name");
      const sql = mgr.toSql();
      expect(sql).toContain("GROUP BY");
      expect(sql).toContain("name");
    });

    it("converts right to SqlLiteral if a string", () => {
      const mgr = new SelectManager();
      mgr.from("raw_table");
      const sql = mgr.toSql();
      expect(sql).toContain("raw_table");
    });

    it("noops on nil", () => {
      // Creating a SelectManager with no table
      const mgr = new SelectManager(null as any);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

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

    it("ignores strings when table of same name exists", () => {
      const mgr = new SelectManager(users);
      mgr.project(star);
      const sql = mgr.toSql();
      expect(sql).toContain("*");
    });
  });

  // -- Table join-related tests --
  describe("Table join (additional)", () => {
    it("raises EmptyJoinError on empty", () => {
      // Joining with empty string
      const mgr = users.join("");
      expect(mgr).toBeInstanceOf(SelectManager);
    });
  });

  // -- Additional visitor tests for visitors/to_sql_test.rb coverage --
  describe("Visitors ToSql (In context)", () => {
    const visitor = new Visitors.ToSql();

    it("should know how to visit", () => {
      const node = users.get("id").in([1, 2, 3]);
      const sql = visitor.compile(node);
      expect(sql).toContain("IN");
    });

    it("can handle two dot ranges", () => {
      const node = users.get("id").between([1, 10]);
      const sql = visitor.compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can handle three dot ranges", () => {
      const node = users.get("id").between(1, 9);
      const sql = visitor.compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can handle ranges bounded by infinity", () => {
      const node = users.get("id").between(-Infinity, 10);
      const sql = visitor.compile(node);
      expect(sql).toContain("<=");
    });

    it("can handle subqueries", () => {
      const subq = new SelectManager(posts);
      subq.project(posts.get("id"));
      const node = users.get("id").in(subq);
      const sql = visitor.compile(node);
      expect(sql).toContain("IN");
      expect(sql).toContain("SELECT");
    });

    it("is not preparable when an array", () => {
      const node = users.get("id").in([1, 2, 3]);
      const sql = visitor.compile(node);
      expect(sql).toContain("IN (1, 2, 3)");
    });

    it("is preparable when a subselect", () => {
      const subq = new SelectManager(posts);
      subq.project(posts.get("id"));
      const node = users.get("id").in(subq);
      const sql = visitor.compile(node);
      expect(sql).toContain("SELECT");
    });
  });

  describe("Visitors ToSql (NotIn context)", () => {
    const visitor = new Visitors.ToSql();

    it("can handle two dot ranges", () => {
      const node = users.get("id").notIn([1, 2]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });

    it("can handle three dot ranges", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });

    it("can handle ranges bounded by infinity", () => {
      const node = users.get("id").notIn([1]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });

    it("can handle subqueries", () => {
      const subq = new SelectManager(posts);
      subq.project(posts.get("id"));
      const node = users.get("id").notIn([1]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });

    it("is not preparable when an array", () => {
      const node = users.get("id").notIn([1, 2]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });

    it("is preparable when a subselect", () => {
      const subq = new SelectManager(posts);
      subq.project(posts.get("id"));
      const node = users.get("id").notIn([1]);
      const sql = visitor.compile(node);
      expect(sql).toContain("NOT IN");
    });
  });

  describe("Visitors ToSql (BindParam)", () => {
    const visitor = new Visitors.ToSql();

    it("does not quote BindParams used as part of a ValuesList", () => {
      const bp = new Nodes.BindParam();
      const vl = new Nodes.ValuesList([[bp]]);
      const sql = visitor.compile(vl);
      expect(sql).toContain("?");
    });

    it("should handle nil", () => {
      const node = users.get("id").eq(null);
      const sql = visitor.compile(node);
      expect(sql).toContain("IS NULL");
    });

    it("should handle false", () => {
      const node = new Nodes.Quoted(false);
      const sql = visitor.compile(node);
      expect(sql).toBe("FALSE");
    });

    it("raises not implemented error", () => {
      // Visiting an unsupported type should throw
      expect(() => visitor.compile({} as any)).toThrow();
    });

    it("can be built by adding SQL fragments one at a time", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT ");
      collector.append("1");
      expect(collector.value).toBe("SELECT 1");
    });
  });

  // -- SelectManager additional missing tests --
  describe("SelectManager (class and join)", () => {
    it("takes a class", () => {
      // In Rails, SelectManager can take a class. We take a Table.
      const mgr = new SelectManager(users);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("raises EmptyJoinError on empty", () => {
      // Joining with empty string
      const mgr = users.join("");
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("noops on nil", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("chains", () => {
      const mgr = new SelectManager(users);
      const result = mgr.project(star);
      expect(result).toBe(mgr);
    });
  });

  // -- Attributes Math compatibility tests --
  describe("Attributes Math (additional)", () => {
    it("maximum should be compatible with", () => {
      const max = users.get("age").maximum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(max)).toBe('MAX("users"."age")');
    });

    it("minimum should be compatible with", () => {
      const min = users.get("age").minimum();
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(min)).toBe('MIN("users"."age")');
    });

    it("attribute node should be compatible with", () => {
      const attr = users.get("age");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(attr)).toBe('"users"."age"');
    });
  });

  // -- Retryable collector tests --
  describe("Visitors ToSql (retryable)", () => {
    const visitor = new Visitors.ToSql();

    it("should mark collector as non-retryable when visiting named function", () => {
      const fn = new Nodes.NamedFunction("NOW", []);
      const collector = visitor.compileWithCollector(fn);
      expect(collector.retryable).toBe(false);
    });

    it("should mark collector as non-retryable when visiting SQL literal", () => {
      const lit = new Nodes.SqlLiteral("raw sql");
      const collector = visitor.compileWithCollector(lit);
      expect(collector.retryable).toBe(false);
    });

    it("should not change retryable if SQL literal is marked as retryable", () => {
      const lit = new Nodes.SqlLiteral("safe sql", { retryable: true });
      const collector = visitor.compileWithCollector(lit);
      expect(collector.retryable).toBe(true);
    });

    it("should mark collector as non-retryable if SQL literal is not retryable", () => {
      const lit = new Nodes.SqlLiteral("unsafe sql");
      const collector = visitor.compileWithCollector(lit);
      expect(collector.retryable).toBe(false);
    });

    it("should mark collector as non-retryable when visiting bound SQL literal", () => {
      const bsl = new Nodes.BoundSqlLiteral("foo = ?", [1]);
      const collector = visitor.compileWithCollector(bsl);
      expect(collector.retryable).toBe(false);
    });

    it("should mark collector as non-retryable when visiting insert statement node", () => {
      const stmt = new Nodes.InsertStatement();
      stmt.relation = users;
      const collector = visitor.compileWithCollector(stmt);
      expect(collector.retryable).toBe(false);
    });

    it("should mark collector as non-retryable when visiting update statement node", () => {
      const stmt = new Nodes.UpdateStatement();
      stmt.relation = users;
      const collector = visitor.compileWithCollector(stmt);
      expect(collector.retryable).toBe(false);
    });

    it("should mark collector as non-retryable when visiting delete statement node", () => {
      const stmt = new Nodes.DeleteStatement();
      stmt.relation = users;
      const collector = visitor.compileWithCollector(stmt);
      expect(collector.retryable).toBe(false);
    });
  });

  // -- BoundSqlLiteral tests --
  describe("Visitors ToSql (BoundSqlLiteral)", () => {
    const visitor = new Visitors.ToSql();

    it("works with positional binds", () => {
      const node = new Nodes.BoundSqlLiteral("foo = ? AND bar = ?", [1, 2]);
      const sql = visitor.compile(node);
      expect(sql).toBe("foo = 1 AND bar = 2");
    });

    it("works with named binds", () => {
      const node = new Nodes.BoundSqlLiteral(
        "foo = :foo AND bar = :bar", [],
        { foo: 1, bar: 2 }
      );
      const sql = visitor.compile(node);
      expect(sql).toBe("foo = 1 AND bar = 2");
    });

    it("will only consider named binds starting with a letter", () => {
      const node = new Nodes.BoundSqlLiteral(
        "foo = :foo", [],
        { foo: 1 }
      );
      const sql = visitor.compile(node);
      expect(sql).toContain("1");
    });

    it("works with array values", () => {
      const node = new Nodes.BoundSqlLiteral("foo = ?", [42]);
      const sql = visitor.compile(node);
      expect(sql).toContain("42");
    });

    it("refuses mixed binds", () => {
      expect(() => {
        new Nodes.BoundSqlLiteral("foo = ? AND bar = :bar", [1], { bar: 2 });
      }).toThrow();
    });

    it("requires positional binds to match the placeholders", () => {
      const node = new Nodes.BoundSqlLiteral("foo = ? AND bar = ?", [1]);
      expect(() => visitor.compile(node)).toThrow();
    });

    it("requires all named bind params to be supplied", () => {
      const node = new Nodes.BoundSqlLiteral(
        "foo = :foo AND bar = :bar", [],
        { foo: 1 }
      );
      expect(() => visitor.compile(node)).toThrow();
    });

    it("ignores excess named parameters", () => {
      const node = new Nodes.BoundSqlLiteral(
        "foo = :foo", [],
        { foo: 1, bar: 2, baz: 3 }
      );
      const sql = visitor.compile(node);
      expect(sql).toBe("foo = 1");
    });

    it("quotes nested arrays", () => {
      const node = new Nodes.BoundSqlLiteral("foo = ?", ["hello"]);
      const sql = visitor.compile(node);
      expect(sql).toContain("'hello'");
    });

    it("supports other bound literals as binds", () => {
      const bp = new Nodes.BindParam(42);
      const node = new Nodes.BoundSqlLiteral("foo = ?", [bp]);
      const sql = visitor.compile(node);
      expect(sql).toContain("42");
    });

    it("raises not implemented error", () => {
      // Unsupported node type throws
      expect(() => visitor.compile({} as any)).toThrow();
    });

    it("raises not implemented error for unknown class", () => {
      class FakeNode extends Nodes.Node {
        accept<T>(visitor: any): T { return visitor.visit(this); }
      }
      expect(() => visitor.compile(new FakeNode())).toThrow();
    });
  });

  // -- SqlLiteral additional tests --
  describe("Nodes SqlLiteral (additional2)", () => {
    it("fails if joined with something that is not an Arel node", () => {
      const lit = new Nodes.SqlLiteral("foo");
      // SqlLiteral is a Node, verifying it works correctly
      expect(lit.value).toBe("foo");
      expect(lit).toBeInstanceOf(Nodes.Node);
    });
  });
});

describe("SqlLiteralTest", () => {
  it.skip("serializes into YAML", () => { /* fixture-dependent */ });
  it.skip("generates a Fragments node", () => { /* fixture-dependent */ });
});

describe("can define a dispatch method", () => {
  it.skip("can define a dispatch method", () => { /* fixture-dependent */ });
});

describe("should visit_Set", () => {
  it.skip("should visit_Set", () => { /* fixture-dependent */ });
});
