import { describe, it, expect } from "vitest";
import {
  Table,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("the to_sql visitor", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("should handle nil", () => {
    const visitor = new Visitors.ToSql();
    const node = users.get("name").eq(null);
    expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
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

  it("can handle ESCAPE", () => {
    const node = users.get("name").matches("foo%", true, "\\");
    const visitor = new Visitors.ToSql();
    const result = visitor.compile(node);
    expect(result).toContain("LIKE");
  });

  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  it("should not quote sql literals", () => {
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(new Nodes.SqlLiteral("NOW()"))).toBe("NOW()");
  });

  it("should handle false", () => {
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(new Nodes.False())).toBe("FALSE");
  });

  it("should handle Addition", () => {
    expect(users.project(users.get("age").add(1).as("next")).toSql()).toBe(
      'SELECT ("users"."age" + 1) AS next FROM "users"',
    );
  });

  it("should handle Subtraction", () => {
    expect(users.project(users.get("age").subtract(1).as("prev")).toSql()).toBe(
      'SELECT ("users"."age" - 1) AS prev FROM "users"',
    );
  });

  it("should handle Multiplication", () => {
    expect(users.project(users.get("age").multiply(2).as("double")).toSql()).toBe(
      'SELECT "users"."age" * 2 AS double FROM "users"',
    );
  });

  it("should handle Division", () => {
    expect(users.project(users.get("age").divide(2).as("half")).toSql()).toBe(
      'SELECT "users"."age" / 2 AS half FROM "users"',
    );
  });

  it("should handle Contains", () => {
    const visitor = new Visitors.ToSql();
    const node = users.get("tags").contains("foo");
    expect(visitor.compile(node)).toContain("@>");
  });

  it("should handle Overlaps", () => {
    const visitor = new Visitors.ToSql();
    const node = users.get("tags").overlaps("bar");
    expect(visitor.compile(node)).toContain("&&");
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

  it("can define a dispatch method", () => {
    const visitor: Nodes.NodeVisitor<string> = {
      visit(node: Nodes.Node): string {
        if (node instanceof Nodes.SqlLiteral) return node.value;
        return "unknown";
      },
    };
    const node = new Nodes.SqlLiteral("NOW()");
    expect(node.accept(visitor)).toBe("NOW()");
  });

  it("should visit built-in functions", () => {
    const node = users.get("name").lower();
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("LOWER");
  });

  it("should construct a valid generic SQL statement", () => {
    const mgr = users
      .project(users.get("id"), users.get("name"))
      .where(users.get("id").gt(1))
      .order(users.get("id").desc())
      .take(5);
    const sql = new Visitors.ToSql().compile(mgr.ast);
    expect(sql).toContain("SELECT");
    expect(sql).toContain("FROM");
    expect(sql).toContain("WHERE");
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("LIMIT 5");
  });

  it("should handle column names on both sides", () => {
    const node = users.get("id").eq(posts.get("user_id"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('"users"."id" = "posts"."user_id"');
  });

  // Convention-compare parity stubs (Ruby tests that should live in visitors/to-sql.test.ts).
  it("allows chaining multiple conditions", () => {
    const node = users.get("id").eq(1).and(users.get("name").eq("Alice"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("AND");
  });

  it("can be built by adding SQL fragments one at a time", () => {
    const collector = new Collectors.SQLString();
    collector.append("SELECT ");
    collector.append("1");
    expect(collector.value).toBe("SELECT 1");
  });

  it("can be chained as a predicate", () => {
    const node = users.get("id").eq(1).or(users.get("id").eq(2));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("OR");
    expect(sql).toContain("(");
  });

  it("can handle ranges bounded by infinity", () => {
    const a = users.get("id").between(-Infinity, 10);
    const b = users.get("id").between(10, Infinity);
    expect(new Visitors.ToSql().compile(a)).toContain("<=");
    expect(new Visitors.ToSql().compile(b)).toContain(">=");
  });

  it("can handle three dot ranges", () => {
    const begin = 1;
    const end = 10;
    const node = new Nodes.Grouping(
      new Nodes.And([users.get("id").gteq(begin), users.get("id").lt(end)]),
    );
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain(">=");
    expect(sql).toContain("<");
  });

  it("can handle two dot ranges", () => {
    const node = users.get("id").between([1, 10]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("1 AND 10");
  });

  it("does not quote BindParams used as part of a ValuesList", () => {
    const mgr = new InsertManager(users);
    mgr.insert([[users.get("name"), new Nodes.BindParam()]]);
    expect(mgr.toSql()).toContain("VALUES (?)");
  });

  it("encloses SELECT statements with parentheses", () => {
    const sub = users.project(users.get("id"));
    const node = users.get("id").in(sub);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("IN (");
    expect(sql).toContain("SELECT");
  });

  it("handles CTEs with a MATERIALIZED modifier", () => {
    const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "materialized");
    const stmt = new SelectManager().with(cte).project("1");
    const sql = new Visitors.ToSql().compile(stmt.ast);
    expect(sql).toContain("MATERIALIZED");
  });

  it("handles CTEs with a NOT MATERIALIZED modifier", () => {
    const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "not_materialized");
    const stmt = new SelectManager().with(cte).project("1");
    const sql = new Visitors.ToSql().compile(stmt.ast);
    expect(sql).toContain("NOT MATERIALIZED");
  });

  it("handles CTEs with no MATERIALIZED modifier", () => {
    const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
    const stmt = new SelectManager().with(cte).project("1");
    const sql = new Visitors.ToSql().compile(stmt.ast);
    expect(sql).not.toContain("MATERIALIZED");
  });

  it("handles Cte nodes", () => {
    const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
    const sql = new Visitors.ToSql().compile(cte);
    expect(sql).toContain('"t" AS (');
  });

  it("handles table aliases", () => {
    const aliased = new Nodes.TableAlias(users, "u");
    const sql = new Visitors.ToSql().compile(aliased);
    expect(sql).toBe('"users" "u"');
  });

  it("ignores excess named parameters", () => {
    const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1, extra: 2 });
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("1");
  });

  it("is not preparable when an array", () => {
    const node = users.get("id").in([1, 2, 3]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("1, 2, 3");
  });

  it("is preparable when a subselect", () => {
    const node = users.get("id").in(users.project(users.get("id")));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("SELECT");
  });

  it("joins subexpressions", () => {
    const mgr = users.project(star).join(posts, users.get("id").eq(posts.get("user_id")));
    const sql = new Visitors.ToSql().compile(mgr.ast);
    expect(sql).toContain("JOIN");
    expect(sql).toContain("ON");
  });

  it("quotes nested arrays", () => {
    const node = users.get("id").in([[1, 2] as unknown[]]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("'1,2'");
  });

  it("unsupported input should raise UnsupportedVisitError", () => {
    class Unknown extends Nodes.Node {
      accept<T>(visitor: Nodes.NodeVisitor<T>): T {
        return visitor.visit(this);
      }
    }
    expect(() => new Visitors.ToSql().compile(new Unknown())).toThrow(
      Visitors.UnsupportedVisitError,
    );
  });

  describe("distinct on", () => {
    it("raises not implemented error", () => {
      const core = new Nodes.SelectCore();
      core.setQuantifier = new Nodes.DistinctOn(new Nodes.SqlLiteral("aaron"));
      expect(() => new Visitors.ToSql().compile(core)).toThrow(Visitors.NotImplementedError);
    });
  });

  describe("Nodes::Regexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.Regexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql().compile(node)).toThrow(Visitors.NotImplementedError);
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.NotRegexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql().compile(node)).toThrow(Visitors.NotImplementedError);
    });
  });

  it("refuses mixed binds", () => {
    expect(
      () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
    ).toThrow();
  });

  it("requires all named bind params to be supplied", () => {
    expect(() => new Nodes.BoundSqlLiteral("id = :id", [], {})).toThrow();
  });

  it("requires positional binds to match the placeholders", () => {
    const node = new Nodes.BoundSqlLiteral("id = ? AND name = ?", [1]);
    expect(() => new Visitors.ToSql().compile(node)).toThrow();
  });

  it("should apply Not to the whole expression", () => {
    const node = new Nodes.Not(
      new Nodes.And([users.get("id").eq(1), users.get("name").eq("Alice")]),
    );
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toMatch(/^NOT \(.*\)$/);
  });

  it("should chain predications on named functions", () => {
    const fn = users.get("name").lower();
    const node = new Nodes.Equality(fn, new Nodes.Quoted("alice"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("LOWER");
    expect(sql).toContain("= 'alice'");
  });

  it("should compile node names", () => {
    const sql = new Visitors.ToSql().compile(users.get("name"));
    expect(sql).toContain('"users"."name"');
  });

  it("should compile nodes with bind params", () => {
    const node = users.get("id").eq(new Nodes.BindParam());
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("?");
  });

  it("should contain a single space before ORDER BY", () => {
    const mgr = users.project(star).order(users.get("id").asc());
    const sql = new Visitors.ToSql().compile(mgr.ast);
    expect(sql).toContain(" ORDER BY ");
    expect(sql).not.toContain("  ORDER BY");
  });

  it("should escape strings", () => {
    const node = users.get("name").eq("O'Reilly");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("O''Reilly");
  });

  it("should handle BitwiseAnd", () => {
    const node = new Nodes.BitwiseAnd(users.get("flags"), new Nodes.Quoted(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("&");
  });

  it("should handle BitwiseNot", () => {
    const node = new Nodes.UnaryOperation("~", users.get("flags"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("~");
  });

  it("should handle BitwiseOr", () => {
    const node = new Nodes.BitwiseOr(users.get("flags"), new Nodes.Quoted(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("|");
  });

  it("should handle BitwiseShiftLeft", () => {
    const node = new Nodes.BitwiseShiftLeft(users.get("flags"), new Nodes.Quoted(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("<<");
  });

  it("should handle BitwiseShiftRight", () => {
    const node = new Nodes.BitwiseShiftRight(users.get("flags"), new Nodes.Quoted(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain(">>");
  });

  it("should handle BitwiseXor", () => {
    const node = new Nodes.BitwiseXor(users.get("flags"), new Nodes.Quoted(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("^");
  });

  it("should handle Concatenation", () => {
    const node = new Nodes.Concat(users.get("name"), new Nodes.Quoted("x"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("||");
  });

  it("should handle arbitrary operators", () => {
    const node = new Nodes.InfixOperation("->>", users.get("metadata"), new Nodes.Quoted("key"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("->>");
  });

  it("should handle nil with named functions", () => {
    const fn = new Nodes.NamedFunction("COALESCE", [users.get("name"), new Nodes.Quoted(null)]);
    const sql = new Visitors.ToSql().compile(fn);
    expect(sql).toContain("NULL");
  });

  it("should handle nulls first", () => {
    const node = users.get("id").asc().nullsFirst();
    expect(new Visitors.ToSql().compile(node)).toContain("NULLS FIRST");
  });

  it("should handle nulls first reversed", () => {
    const node = users.get("id").asc().nullsLast().reverse();
    expect(new Visitors.ToSql().compile(node)).toContain("NULLS FIRST");
  });

  it("should handle nulls last", () => {
    const node = users.get("id").asc().nullsLast();
    expect(new Visitors.ToSql().compile(node)).toContain("NULLS LAST");
  });

  it("should handle nulls last reversed", () => {
    const node = users.get("id").asc().nullsFirst().reverse();
    expect(new Visitors.ToSql().compile(node)).toContain("NULLS LAST");
  });

  it("should handle true", () => {
    expect(new Visitors.ToSql().compile(new Nodes.True())).toBe("TRUE");
  });

  it("should mark collector as non-retryable if SQL literal is marked as retryable", () => {
    const lit = new Nodes.SqlLiteral("1", { retryable: true });
    const collector = new Visitors.ToSql().compileWithCollector(lit);
    expect(collector.retryable).toBe(true);
  });

  it("should mark collector as non-retryable if SQL literal is not retryable", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql().compileWithCollector(lit);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting SQL literal", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql().compileWithCollector(lit);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting bound SQL literal", () => {
    const lit = new Nodes.BoundSqlLiteral("id = ?", [1]);
    const collector = new Visitors.ToSql().compileWithCollector(lit);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting delete statement node", () => {
    const stmt = new DeleteManager().from(users).ast;
    const collector = new Visitors.ToSql().compileWithCollector(stmt);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting insert statement node", () => {
    const stmt = new InsertManager(users).insert([[users.get("name"), "dean"]]).ast;
    const collector = new Visitors.ToSql().compileWithCollector(stmt);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting named function", () => {
    const fn = users.get("name").lower();
    const collector = new Visitors.ToSql().compileWithCollector(fn);
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting update statement node", () => {
    const stmt = new UpdateManager().table(users).set([[users.get("name"), "sam"]]).ast;
    const collector = new Visitors.ToSql().compileWithCollector(stmt);
    expect(collector.retryable).toBe(false);
  });

  it("should not change retryable if SQL literal is marked as retryable", () => {
    const lit = new Nodes.SqlLiteral("1", { retryable: true });
    const collector = new Visitors.ToSql().compileWithCollector(lit);
    expect(collector.retryable).toBe(true);
  });

  it("should not quote BindParams used as part of a ValuesList", () => {
    const values = new Nodes.ValuesList([[new Nodes.BindParam()]]);
    const sql = new Visitors.ToSql().compile(values);
    expect(sql).toContain("(?)");
  });

  it("should quote LIMIT without column type coercion", () => {
    const mgr = users.project(star).take(10);
    const sql = new Visitors.ToSql().compile(mgr.ast);
    expect(sql).toContain("LIMIT 10");
  });

  it("should return 1=0 when empty right which is always false", () => {
    const node = users.get("id").in([]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("1=0");
  });

  it("should return 1=1 when empty right which is always true", () => {
    const node = users.get("id").notIn([]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("1=1");
  });

  it("should use the underlying table for checking columns", () => {
    const aliased = new Table("users", { as: "u" });
    const sql = new Visitors.ToSql().compile(aliased.get("id"));
    expect(sql).toBe('"u"."id"');
  });

  it("should visit_Arel_Nodes_And", () => {
    const node = new Nodes.And([users.get("id").eq(1), users.get("name").eq("Alice")]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("AND");
  });

  it("should visit_Arel_Nodes_Assignment", () => {
    const node = new Nodes.Assignment(users.get("name"), new Nodes.Quoted("x"));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('"users"."name" = \'x\'');
  });

  it("should visit_Arel_Nodes_Or", () => {
    const node = new Nodes.Or(users.get("id").eq(1), users.get("id").eq(2));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("OR");
  });

  it("should visit_Arel_SelectManager, which is a subquery", () => {
    const sub = users.project(users.get("id"));
    const node = users.get("id").in(sub);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("IN (");
    expect(sql).toContain("SELECT");
  });

  it("should visit_As", () => {
    const node = users.get("id").as("i");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('"users"."id" AS i');
  });

  it("should visit_BigDecimal", () => {
    const big = { toString: () => "12.34" };
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(big));
    expect(sql).toBe("'12.34'");
  });

  it("should visit_Class", () => {
    class X {}
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(X));
    expect(sql).toContain("'");
  });

  it("should visit_Date", () => {
    const d = new Date(2020, 0, 2, 12, 0, 0);
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2020-01-02'");
  });

  it("should visit_DateTime", () => {
    const dt = { toISOString: () => "2020-01-02T03:04:05.000Z" };
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(dt));
    expect(sql).toBe("'2020-01-02T03:04:05.000Z'");
  });

  it("should visit_Float", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(1.5));
    expect(sql).toBe("1.5");
  });

  it("should visit_Hash", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted({ a: 1 }));
    expect(sql).toBe("'[object Object]'");
  });

  it("should visit_Integer", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(12));
    expect(sql).toBe("12");
  });

  it("should visit_NilClass", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(null));
    expect(sql).toBe("NULL");
  });

  it("should visit_Not", () => {
    const node = new Nodes.Not(users.get("id").eq(1));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("NOT");
  });

  it("should visit_Set", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(new Set([1, 2])));
    expect(sql).toBe("'[object Set]'");
  });

  it("should visit_TrueClass", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(true));
    expect(sql).toBe("TRUE");
  });

  it("should visit named functions", () => {
    const sql = new Visitors.ToSql().compile(users.get("name").upper());
    expect(sql).toContain("UPPER");
  });

  it("should visit string subclass", () => {
    class MyString extends String {}
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(new MyString("x")));
    expect(sql).toBe("'x'");
  });

  it("should visit built-in functions operating on distinct values", () => {
    const node = users.get("id").count(true);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("COUNT(DISTINCT");
  });

  it("squashes parenthesis on multiple union alls", () => {
    const a = users.project(star);
    const b = users.project(star);
    const c = users.project(star);
    const node = new Nodes.UnionAll(a.ast, new Nodes.UnionAll(b.ast, c.ast));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("UNION ALL");
  });

  it("squashes parenthesis on multiple unions", () => {
    const a = users.project(star);
    const b = users.project(star);
    const c = users.project(star);
    const node = new Nodes.Union(a.ast, new Nodes.Union(b.ast, c.ast));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("UNION");
  });

  it("supports other bound literals as binds", () => {
    const node = new Nodes.BoundSqlLiteral("id = ?", [new Nodes.SqlLiteral("1")]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("id = 1");
  });

  it("supports simple case expressions", () => {
    const node = new Nodes.Case(users.get("status")).when("active", "A").else("Z");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN");
    expect(sql).toContain("THEN");
  });

  it("supports extended case expressions", () => {
    const node = new Nodes.Case()
      .when(users.get("id").eq(1), "A")
      .when(users.get("id").eq(2), "B")
      .else("Z");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("END");
  });

  it("will only consider named binds starting with a letter", () => {
    const node = new Nodes.BoundSqlLiteral("x = :_bad", [], { _bad: 1 });
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain(":_bad");
    expect(sql).not.toContain("1");
  });

  it("works with BindParams", () => {
    const v = new Visitors.ToSql();
    expect(v.compile(new Nodes.BindParam())).toBe("?");
    expect(v.compile(new Nodes.BindParam(1))).toBe("1");
  });

  it("works with lists", () => {
    const node = new Nodes.ValuesList([[new Nodes.Quoted(1)], [new Nodes.Quoted(2)]]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("VALUES (1), (2)");
  });

  it("works with positional binds", () => {
    const node = new Nodes.BoundSqlLiteral("id = ?", [1]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("id = 1");
  });

  it("works with named binds", () => {
    const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1 });
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("id = 1");
  });

  it("works with array values", () => {
    const node = users.get("tags").eq([1, 2]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("'1,2'");
  });

  it("wraps nested groupings in brackets only once", () => {
    const node = new Nodes.Grouping(new Nodes.Grouping(users.get("id").eq(1)));
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe('("users"."id" = 1)');
  });

  it("works without default branch", () => {
    const node = new Nodes.Case().when(users.get("id").eq(1), "A");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).not.toContain("ELSE");
  });

  it("supports #when with two arguments and no #then", () => {
    const node = new Nodes.Case(users.get("status")).when("active", "A");
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain("THEN");
  });
});
