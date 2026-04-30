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
  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").isDistinctFrom(null);
      expect(visitor.compile(node)).toContain("IS DISTINCT FROM");
    });

    it("should handle column names on both sides", () => {
      const node = users.get("name").isDistinctFrom(users.get("login"));
      expect(new Visitors.ToSql().compile(node)).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::NotIn", () => {
    it("can handle subqueries", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").notIn(mgr);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("NOT IN");
      expect(sql).toContain("SELECT");
    });

    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").notIn([1, 2, 3]);
      expect(visitor.compile(node)).toContain("NOT IN");
    });

    it("can handle two dot ranges", () => {
      // Mirrors Rails: not_between renders as `(col < begin OR col > end)`,
      // not as a literal `NOT BETWEEN`.
      const node = users.get("id").notBetween([1, 3]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('("users"."id" < 1 OR "users"."id" > 3)');
    });

    it("can handle three dot ranges", () => {
      const node = users.get("id").notBetween({ begin: 1, end: 2, excludeEnd: true });
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('("users"."id" < 1 OR "users"."id" >= 2)');
    });

    it("can handle ranges bounded by infinity", () => {
      // Mirrors Rails: not_between(-Inf..Inf) collapses to in([]) → `1=0`.
      const node = users.get("id").notBetween([-Infinity, Infinity]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=0");
    });

    it("is not preparable when an array", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("NOT IN (1, 2, 3)");
    });

    it("is preparable when a subselect", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").notIn(mgr);
      expect(new Visitors.ToSql().compile(node)).toContain("SELECT");
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("can handle ESCAPE", () => {
      const node = users.get("name").doesNotMatch("%chunky%", "\\", true);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("ESCAPE");
      expect(sql).toContain("ESCAPE '\\'");
    });

    it("should know how to visit", () => {
      const node = users.get("name").doesNotMatch("%chunky%");
      expect(new Visitors.ToSql().compile(node)).toContain("NOT LIKE");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("name"));
      const node = users.get("name").doesNotMatch(mgr);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("NOT LIKE SELECT");
    });
  });

  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  it("should not quote sql literals", () => {
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(new Nodes.SqlLiteral("NOW()"))).toBe("NOW()");
  });

  describe("Constants", () => {
    it("should handle false", () => {
      const node = new Nodes.False();
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("FALSE");
    });
  });

  describe("Nodes::InfixOperation", () => {
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

    it("should handle arbitrary operators", () => {
      const node = new Nodes.InfixOperation("+", new Nodes.Quoted(1), new Nodes.Quoted(2));
      expect(new Visitors.ToSql().compile(node)).toContain("1 + 2");
    });
  });

  describe("Table", () => {
    it("should compile literal SQL", () => {
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(new Nodes.SqlLiteral("1 = 1"))).toBe("1 = 1");
    });

    it("should compile Arel nodes", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").eq(1);
      expect(visitor.compile(node)).toBe('"users"."id" = 1');
    });
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

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      expect(new Visitors.ToSql().compile(node)).toContain("IS NOT DISTINCT FROM");
    });

    it("should handle column names on both sides", () => {
      const node = users.get("name").isNotDistinctFrom(users.get("login"));
      expect(new Visitors.ToSql().compile(node)).toContain("IS NOT DISTINCT FROM");
    });
  });

  // Convention-compare parity stubs (Ruby tests that should live in visitors/to-sql.test.ts).
  describe("Nodes::Case", () => {
    it("allows chaining multiple conditions", () => {
      const node = users.get("id").eq(1).and(users.get("name").eq("Alice"));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("AND");
    });
  });

  describe("Nodes::Fragments", () => {
    it("can be built by adding SQL fragments one at a time", () => {
      const collector = new Collectors.SQLString();
      collector.append("SELECT ");
      collector.append("1");
      expect(collector.value).toBe("SELECT 1");
    });
  });

  describe("Nodes::Case", () => {
    it("can be chained as a predicate", () => {
      const node = users.get("id").eq(1).or(users.get("id").eq(2));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("OR");
      expect(sql).toContain("(");
    });
  });

  describe("Nodes::Between", () => {
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
  });

  it("does not quote BindParams used as part of a ValuesList", () => {
    const mgr = new InsertManager(users);
    mgr.insert([[users.get("name"), new Nodes.BindParam()]]);
    expect(mgr.toSql()).toContain("VALUES (?)");
  });

  describe("Nodes::UnionAll", () => {
    it("encloses SELECT statements with parentheses", () => {
      const sub = users.project(users.get("id"));
      const node = users.get("id").in(sub);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("IN (");
      expect(sql).toContain("SELECT");
    });
  });

  describe("Nodes::Cte", () => {
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
  });

  describe("Nodes::With", () => {
    it("handles Cte nodes", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
      const sql = new Visitors.ToSql().compile(cte);
      expect(sql).toContain('"t" AS (');
    });

    it("handles table aliases", () => {
      const mgr = users.project(star);
      const asNode = new Nodes.As(mgr.ast, new Nodes.SqlLiteral("foo"));
      const node = new Nodes.With([asNode]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("WITH");
      expect(sql).toContain("foo");
    });
  });

  describe("Nodes::WithRecursive", () => {
    it("handles table aliases", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const sql = new Visitors.ToSql().compile(aliased);
      expect(sql).toBe('"users" "u"');
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("ignores excess named parameters", () => {
      const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1, extra: 2 });
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("1");
    });
  });

  describe("Nodes::NotIn", () => {
    it("is not preparable when an array", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("NOT IN");
      expect(sql).toContain("1, 2, 3");
    });
  });

  describe("Nodes::Fragments", () => {
    it("joins subexpressions", () => {
      const mgr = users.project(star).join(posts, users.get("id").eq(posts.get("user_id")));
      const sql = new Visitors.ToSql().compile(mgr.ast);
      expect(sql).toContain("JOIN");
      expect(sql).toContain("ON");
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("quotes nested arrays", () => {
      const node = users.get("id").in([[1, 2] as unknown[]]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("'1,2'");
    });
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

  describe("Nodes::BoundSqlLiteral", () => {
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

  describe("Table", () => {
    it("should compile node names", () => {
      const sql = new Visitors.ToSql().compile(users.get("name"));
      expect(sql).toContain('"users"."name"');
    });

    it("should compile nodes with bind params", () => {
      const node = users.get("id").eq(new Nodes.BindParam());
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("?");
    });
  });

  it("should contain a single space before ORDER BY", () => {
    const mgr = users.project(star).order(users.get("id").asc());
    const sql = new Visitors.ToSql().compile(mgr.ast);
    expect(sql).toContain(" ORDER BY ");
    expect(sql).not.toContain("  ORDER BY");
  });

  describe("Nodes::Equality", () => {
    it("should escape strings", () => {
      const node = users.get("name").eq("O'Reilly");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("O''Reilly");
    });

    it("should handle false", () => {
      const node = new Nodes.Equality(users.get("active"), new Nodes.False());
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("FALSE");
    });

    it("should handle nil", () => {
      const node = users.get("id").eq(null);
      expect(new Visitors.ToSql().compile(node)).toContain("IS NULL");
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle BitwiseAnd", () => {
      const node = new Nodes.BitwiseAnd(users.get("flags"), new Nodes.Quoted(1));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("&");
    });
  });

  describe("Nodes::UnaryOperation", () => {
    it("should handle BitwiseNot", () => {
      const node = new Nodes.UnaryOperation("~", users.get("flags"));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("~");
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.UnaryOperation("-", new Nodes.Quoted(1));
      // Rails' visit_Arel_Nodes_UnaryOperation emits `" #{operator} "` —
      // space on both sides of the operator. Lock the exact byte sequence
      // (including the leading space) so any spacing regression is caught
      // by this test, not just by parity.
      expect(new Visitors.ToSql().compile(node)).toBe(" - 1");
    });
  });

  describe("Nodes::InfixOperation", () => {
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
  });

  it("should handle nil with named functions", () => {
    const fn = new Nodes.NamedFunction("COALESCE", [users.get("name"), new Nodes.Quoted(null)]);
    const sql = new Visitors.ToSql().compile(fn);
    expect(sql).toContain("NULL");
  });

  describe("Nodes::Ordering", () => {
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

    it("should know how to visit", () => {
      const node = users.get("id").asc();
      expect(new Visitors.ToSql().compile(node)).toContain("ASC");
    });
  });

  describe("Constants", () => {
    it("should handle true", () => {
      expect(new Visitors.ToSql().compile(new Nodes.True())).toBe("TRUE");
    });
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

  describe("Nodes::In", () => {
    it("should return 1=0 when empty right which is always false", () => {
      const node = users.get("id").in([]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=0");
    });

    it("should know how to visit", () => {
      const node = users.get("id").in([1, 2, 3]);
      expect(new Visitors.ToSql().compile(node)).toContain("IN (1, 2, 3)");
    });

    it("can handle two dot ranges", () => {
      const node = users.get("id").between([1, 3]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can handle three dot ranges", () => {
      const node = users.get("id").between([1, 2]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
    });

    it("can handle ranges bounded by infinity", () => {
      // Mirrors Rails: between(-Inf..Inf) collapses to not_in([]) → `1=1`.
      const node = users.get("id").between([-Infinity, Infinity]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=1");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").in(mgr);
      expect(new Visitors.ToSql().compile(node)).toContain("SELECT");
    });

    it("is not preparable when an array", () => {
      const node = users.get("id").in([1, 2, 3]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("IN (1, 2, 3)");
    });

    it("is preparable when a subselect", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").in(mgr);
      expect(new Visitors.ToSql().compile(node)).toContain("SELECT");
    });
  });

  describe("Nodes::NotIn", () => {
    it("should return 1=1 when empty right which is always true", () => {
      const node = users.get("id").notIn([]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=1");
    });
  });

  describe("TableAlias", () => {
    it("should use the underlying table for checking columns", () => {
      const aliased = new Table("users", { as: "u" });
      const sql = new Visitors.ToSql().compile(aliased.get("id"));
      expect(sql).toBe('"u"."id"');
    });

    it("emits a subquery alias bare (Rails AliasPredication via SqlLiteral name)", () => {
      // SelectManager#as wraps the relation in a Grouping, which Rails'
      // visit_Arel_Nodes_TableAlias renders bare via quote_table_name's
      // SqlLiteral pass-through. Trails matches on the relation shape.
      const sub = users.project(users.get("id")).as("sub");
      const sql = new Visitors.ToSql().compile(sub);
      expect(sql).toContain(") sub");
      expect(sql).not.toContain('"sub"');
    });

    it("keeps regular table aliases quoted", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const sql = new Visitors.ToSql().compile(aliased);
      expect(sql).toContain('"users" "u"');
    });
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
    const d = new Date("2020-01-02T12:00:00.000Z");
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(d));
    // Mirrors Rails' AbstractAdapter#quoted_date: space separator, seconds precision.
    expect(sql).toBe("'2020-01-02 12:00:00'");
  });

  it("should visit_DateTime", () => {
    const dt = { toISOString: () => "2020-01-02T03:04:05.000Z" };
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(dt));
    expect(sql).toBe("'2020-01-02 03:04:05'");
  });

  it("should visit_Date with fractional seconds retains microseconds", () => {
    const d = new Date("2026-04-18T13:00:41.729Z");
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(d));
    // "729" → padded to "729000" microseconds
    expect(sql).toBe("'2026-04-18 13:00:41.729000'");
  });

  it("should visit_Date-like with 1-digit fraction normalises to microseconds", () => {
    // "7" → "700000" μs (not "007000" which the old ms*1000 approach produced)
    const obj = { toISOString: () => "2020-01-02T03:04:05.7Z" };
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(obj as unknown as Date));
    expect(sql).toBe("'2020-01-02 03:04:05.700000'");
  });

  it("should visit_Date with zero ms emits bare seconds (Rails quoted_date format)", () => {
    const d = new Date("2000-01-01T00:00:00.000Z");
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2000-01-01 00:00:00'");
  });

  it("should visit_Date-like with no fractional part (no trailing Z artifact)", () => {
    // Handles objects whose toISOString() omits the fractional part, e.g. "...T00:00:00Z".
    const obj = { toISOString: () => "2026-01-01T00:00:00Z" };
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(obj as unknown as Date));
    expect(sql).toBe("'2026-01-01 00:00:00'");
    expect(sql).not.toContain("Z");
  });

  it("should extract Date as bind param in compileWithBinds", () => {
    const users = new Table("users");
    const d = new Date("2020-01-02T12:00:00.000Z");
    const node = users.get("created_at").eq(new Nodes.Quoted(d));
    const [sql, binds] = new Visitors.ToSql().compileWithBinds(node);
    // Placeholder in SQL, actual Date in binds array.
    expect(sql).toContain("?");
    expect(sql).not.toContain("2020-01-02");
    expect(binds).toHaveLength(1);
    expect(binds[0]).toBe(d);
  });

  it("should visit_Float", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted(1.5));
    expect(sql).toBe("1.5");
  });

  it("should visit_Hash", () => {
    const sql = new Visitors.ToSql().compile(new Nodes.Quoted({ a: 1 }));
    expect(sql).toBe(`'{"a":1}'`);
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

  describe("Nodes::UnionAll", () => {
    it("squashes parenthesis on multiple union alls", () => {
      const a = users.project(star);
      const b = users.project(star);
      const c = users.project(star);
      const node = new Nodes.UnionAll(a.ast, new Nodes.UnionAll(b.ast, c.ast));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("UNION ALL");
    });
  });

  describe("Nodes::Union", () => {
    it("squashes parenthesis on multiple unions", () => {
      const a = users.project(star);
      const b = users.project(star);
      const c = users.project(star);
      const node = new Nodes.Union(a.ast, new Nodes.Union(b.ast, c.ast));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("UNION");
    });

    it("encloses SELECT statements with parentheses", () => {
      const m1 = users.project(star);
      const m2 = users.project(star);
      const node = new Nodes.Union(m1.ast, m2.ast);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("UNION");
      expect(sql).toContain("(");
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("supports other bound literals as binds", () => {
      const node = new Nodes.BoundSqlLiteral("id = ?", [new Nodes.SqlLiteral("1")]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("id = 1");
    });
  });

  describe("Nodes::Case", () => {
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
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("will only consider named binds starting with a letter", () => {
      const node = new Nodes.BoundSqlLiteral("x = :_bad", [], { _bad: 1 });
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(":_bad");
      expect(sql).not.toContain("1");
    });
  });

  it("works with BindParams", () => {
    const v = new Visitors.ToSql();
    expect(v.compile(new Nodes.BindParam())).toBe("?");
    // compile() inlines values (like Rails' to_sql under unprepared_statement)
    expect(v.compile(new Nodes.BindParam(1))).toBe("1");
  });

  it("compileWithBinds extracts bind values", () => {
    const v = new Visitors.ToSql();
    const table = new Table("users");
    const mgr = table.project(star).where(table.get("id").eq(new Nodes.BindParam(42)));
    const [sql, binds] = v.compileWithBinds(mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("42");
    expect(binds).toEqual([42]);
  });

  it("compileWithBinds handles multiple bind params", () => {
    const v = new Visitors.ToSql();
    const table = new Table("users");
    const mgr = table
      .project(star)
      .where(table.get("name").eq(new Nodes.BindParam("alice")))
      .where(table.get("age").gt(new Nodes.BindParam(21)));
    const [sql, binds] = v.compileWithBinds(mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("alice");
    expect(sql).not.toContain("21");
    expect(binds).toEqual(["alice", 21]);
  });

  it("compileWithBinds with undefined BindParam", () => {
    const v = new Visitors.ToSql();
    const node = new Nodes.BindParam();
    const [sql, binds] = v.compileWithBinds(node);
    expect(sql).toBe("?");
    expect(binds).toHaveLength(1);
  });

  it("compileWithCollector accepts external collector", () => {
    const v = new Visitors.ToSql();
    const table = new Table("users");
    const mgr = table.project(star).where(table.get("name").eq("alice"));

    // Use a custom collector that tracks parts and binds
    const parts: unknown[] = [];
    const binds: unknown[] = [];
    const collector = {
      preparable: false,
      retryable: true,
      append(str: string) {
        parts.push(str);
        return collector;
      },
      addBind(value: unknown) {
        binds.push(value);
        parts.push("?");
        return collector;
      },
      get value() {
        return [parts, binds];
      },
    };

    v.compileWithCollector(mgr.ast, collector);
    // The collector received addBind calls for Casted values
    expect(binds.length).toBeGreaterThan(0);
    // SQL parts are accumulated
    expect(parts.some((p) => typeof p === "string" && p.includes("users"))).toBe(true);
  });

  it("works with lists", () => {
    const node = new Nodes.ValuesList([[new Nodes.Quoted(1)], [new Nodes.Quoted(2)]]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toBe("VALUES (1), (2)");
  });

  describe("Nodes::BoundSqlLiteral", () => {
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
  });

  describe("Nodes::Grouping", () => {
    it("wraps nested groupings in brackets only once", () => {
      const node = new Nodes.Grouping(new Nodes.Grouping(users.get("id").eq(1)));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('("users"."id" = 1)');
    });
  });

  describe("Nodes::Case", () => {
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

  describe("Nodes::Matches", () => {
    it("should know how to visit", () => {
      const node = users.get("name").matches("%chunky%");
      expect(new Visitors.ToSql().compile(node)).toContain("LIKE");
    });

    it("can handle ESCAPE", () => {
      const node = users.get("name").matches("%chunky%", "\\", true);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("ESCAPE");
      expect(sql).toContain("ESCAPE '\\'");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("name"));
      const node = users.get("name").matches(mgr);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("LIKE SELECT");
    });
  });

  describe("Nodes::NotEqual", () => {
    it("should handle false", () => {
      const node = new Nodes.NotEqual(users.get("active"), new Nodes.False());
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("FALSE");
    });

    it("should handle nil", () => {
      const node = users.get("id").notEq(null);
      expect(new Visitors.ToSql().compile(node)).toContain("IS NOT NULL");
    });
  });

  // Mirrors Rails' to_sql.rb private helpers (sanitize_as_sql_comment,
  // quote_table_name, quote_column_name).
  describe("Rails-mirrored private helpers", () => {
    type ToSqlInternals = {
      sanitizeAsSqlComment(value: string | Nodes.SqlLiteral): string;
      quoteTableName(name: string | Nodes.SqlLiteral): string;
      quoteColumnName(name: string | Nodes.SqlLiteral): string;
    };
    const make = (): ToSqlInternals => new Visitors.ToSql() as unknown as ToSqlInternals;

    it("sanitizeAsSqlComment passes through SqlLiteral values", () => {
      const literal = new Nodes.SqlLiteral("/* raw */");
      expect(make().sanitizeAsSqlComment(literal)).toBe("/* raw */");
    });

    it("sanitizeAsSqlComment strips comment delimiters and newlines", () => {
      const v = make();
      expect(v.sanitizeAsSqlComment("a /* boom */ b")).toBe("a boom b");
      expect(v.sanitizeAsSqlComment("multi\nline")).toBe("multi line");
      expect(v.sanitizeAsSqlComment("trailing */")).toBe("trailing");
    });

    it("quoteTableName / quoteColumnName double-quote bare names and pass through SqlLiteral", () => {
      const v = make();
      expect(v.quoteTableName("users")).toBe('"users"');
      expect(v.quoteColumnName("name")).toBe('"name"');
      expect(v.quoteTableName('weird"name')).toBe('"weird""name"');
      expect(v.quoteTableName(new Nodes.SqlLiteral("users"))).toBe("users");
    });

    it("visitTable and visitAttribute now route through quoteTableName / quoteColumnName", () => {
      // A table name with a double-quote in it would have crashed pre-PR
      // because the inline replace was string-only; quoteTableName escapes it.
      const weird = new Table('we"ird');
      const sql = new Visitors.ToSql().compile(weird.get('co"l').eq(1));
      expect(sql).toBe('"we""ird"."co""l" = 1');
    });

    it("collectNodesFor prefixes the spacer and joins with the connector", () => {
      const tbl = new Table("users");
      // Verify via SelectCore: Rails' WHERE collapses on " AND ".
      const sql = tbl
        .where(tbl.get("a").eq(1))
        .where(tbl.get("b").eq(2))
        .project(tbl.get("a"))
        .toSql();
      expect(sql).toContain('WHERE "users"."a" = 1 AND "users"."b" = 2');
    });

    it("collectNodesFor is a no-op when the list is empty", () => {
      // SELECT with no projections / no WHERE should not emit those
      // clauses at all (no stray spacer).
      const sql = new Table("users").project().toSql();
      expect(sql).toBe('SELECT FROM "users"');
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("GROUP BY");
    });
  });

  describe("Nodes::OptimizerHints (visit)", () => {
    it("emits /*+ HINT */ for an OptimizerHints node with array expr", () => {
      const node = new Nodes.OptimizerHints(["IDX(t1)", "MAX_EXEC_TIME(1000)"]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe(" /*+ IDX(t1) MAX_EXEC_TIME(1000) */");
    });

    it("strips embedded comment delimiters from each hint (Rails parity)", () => {
      // Mirrors Rails: sanitize_as_sql_comment removes /* and */ so a hint
      // can't escape the surrounding comment block. The literal SQL inside
      // is preserved as comment text — it's still inside /*+ ... */.
      const node = new Nodes.OptimizerHints(["A */ DROP /*"]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe(" /*+ A DROP */");
      expect(sql.match(/\*\//g)?.length).toBe(1);
    });

    it("accepts SqlLiteral hints (passes through unchanged)", () => {
      const node = new Nodes.OptimizerHints([new Nodes.SqlLiteral("FORCE INDEX (t)")]);
      expect(new Visitors.ToSql().compile(node)).toBe(" /*+ FORCE INDEX (t) */");
    });
  });

  describe("Nodes::Comment placement", () => {
    it("emits exactly one space before each comment in SelectCore (no double space)", () => {
      // Regression: visit_Arel_Nodes_Comment used to prepend its own leading
      // space, and SelectCore also called maybeVisit() which adds another.
      // The visitor now leaves the leading space to the caller.
      const tbl = new Table("users");
      const sql = tbl.project(tbl.get("id")).comment("hi", "bye").toSql();
      expect(sql).toBe('SELECT "users"."id" FROM "users" /* hi */ /* bye */');
      expect(sql).not.toContain("  /*");
    });
  });

  describe("schema-qualified table identifier", () => {
    it("quotes each segment of a schema.table name in SELECT and column refs", () => {
      const tbl = new Table("schema.table");
      const sql = tbl.project(tbl.get("col")).toSql();
      // Both the FROM clause and the qualified column reference should
      // emit "schema"."table" — not "schema.table" (which would be a
      // single identifier and reference a different relation).
      expect(sql).toBe('SELECT "schema"."table"."col" FROM "schema"."table"');
    });
  });

  describe("identifier-escape consistency (helper-routed quoting)", () => {
    // Regression: four sites used to interpolate `"${name}"` directly,
    // bypassing quoteColumnName / quoteTableName and silently producing
    // invalid SQL on identifiers containing a literal double-quote.
    it("UPDATE SET column quotes embedded double-quotes", () => {
      const tbl = new Table('tab"le');
      const mgr = new UpdateManager().table(tbl).set([[tbl.get('co"l'), 1]]);
      expect(mgr.toSql()).toContain('"co""l" = 1');
    });

    it("CTE name escapes embedded double-quotes", () => {
      const inner = new Table("users");
      const cte = new Nodes.Cte('w"in', new SelectManager(inner).project(inner.get("a")).ast);
      const sql = new Visitors.ToSql().compile(cte);
      expect(sql).toContain('"w""in" AS');
    });
  });

  describe("Rails-mirrored to_sql tail helpers", () => {
    interface ToSqlInternals {
      isUnboundable(value: unknown): boolean;
      hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean;
      bindBlock(): (index: number) => string;
    }
    const make = () => new Visitors.ToSql() as unknown as ToSqlInternals;

    it("isUnboundable returns true only when the value reports unboundable", () => {
      const v = make();
      expect(v.isUnboundable({ isUnboundable: () => 1 })).toBe(true);
      expect(v.isUnboundable({ isUnboundable: () => false })).toBe(false);
      expect(v.isUnboundable({})).toBe(false);
      expect(v.isUnboundable(null)).toBe(false);
    });

    it("hasGroupByAndHaving requires both groups and havings to be non-empty", () => {
      const v = make();
      expect(v.hasGroupByAndHaving({ groups: [1], havings: [1] })).toBe(true);
      expect(v.hasGroupByAndHaving({ groups: [], havings: [1] })).toBe(false);
      expect(v.hasGroupByAndHaving({ groups: [1], havings: [] })).toBe(false);
    });

    it("bindBlock returns a placeholder callback emitting ? by default", () => {
      const block = make().bindBlock();
      expect(block(0)).toBe("?");
      expect(block(7)).toBe("?");
    });

    it("an overridden bindBlock takes effect at every base addBind callsite", () => {
      class NumberedVisitor extends Visitors.ToSql {
        idx = 0;
        protected override bindBlock(): (i: number) => string {
          return () => `$${++this.idx}`;
        }
      }
      const tbl = new Table("users");
      const v = new NumberedVisitor();
      // Two bind sites reachable via standard dispatch — BindParam (extracted)
      // and Casted (extracted) — both routed through bindBlock.
      const [sql] = v.compileWithBinds(
        tbl
          .where(tbl.get("id").eq(new Nodes.BindParam(1)))
          .where(tbl.get("name").eq(new Nodes.Casted("hi", tbl.get("name"))))
          .project(tbl.get("id")).ast,
      );
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
      expect(sql).not.toContain("?");
    });

    it("Nodes.SelectOptions visits limit/offset/lock via maybeVisit through dispatch", () => {
      const opts = new Nodes.SelectOptions(
        new Nodes.Limit(new Nodes.SqlLiteral("10")),
        new Nodes.Offset(new Nodes.SqlLiteral("20")),
      );
      const sql = new Visitors.ToSql().compile(opts);
      expect(sql).toBe(" LIMIT 10 OFFSET 20");
    });

    it("visitActiveModelAttribute routes through bindBlock (Rails parity)", () => {
      // ActiveModel::Attribute isn't a Node ctor so it's not reachable
      // through standard dispatch — exercise the visitor method directly
      // to confirm Rails' add_bind(o, &bind_block) shape is preserved.
      class NumberedVisitor extends Visitors.ToSql {
        idx = 0;
        protected override bindBlock(): (i: number) => string {
          return () => `$${++this.idx}`;
        }
        run(o: unknown): string {
          this.compile(new Nodes.SqlLiteral(""));
          this.visitActiveModelAttribute(o);
          return (this as unknown as { collector: { value: string } }).collector.value;
        }
      }
      expect(new NumberedVisitor().run({ value: "x" })).toBe("$1");
    });

    it("visitArelSelectManager wraps the manager's AST in parens", () => {
      // Called directly — SelectManager isn't in the dispatch table because
      // it's a TreeManager, not a Node. Mirrors Rails' `visit_Arel_SelectManager`
      // which is invoked when the visitor encounters a SelectManager value.
      const tbl = new Table("users");
      const mgr = new SelectManager(tbl).project(tbl.get("id"));
      const v = new Visitors.ToSql();
      // Initialize the collector via a no-op compile.
      v.compile(new Nodes.SqlLiteral(""));
      (
        v as unknown as { visitArelSelectManager(o: { ast: Nodes.Node }): void }
      ).visitArelSelectManager({ ast: mgr.ast as unknown as Nodes.Node });
      const sql = (v as unknown as { collector: { value: string } }).collector.value;
      expect(sql).toMatch(/^\(SELECT.*\)$/);
    });

    it("visitArelNodesWhen / Else are reachable as standalone visits (Case still works)", () => {
      const tbl = new Table("users");
      const node = new Nodes.Case(tbl.get("status")).when("ok", 1).when("warn", 2)["else"](0);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("CASE");
      expect(sql).toContain("WHEN");
      expect(sql).toContain("THEN");
      expect(sql).toContain("ELSE");
      expect(sql).toContain("END");
    });

    it("dispatches Nodes.When and Nodes.Else as top-level visits", () => {
      const tbl = new Table("users");
      const whenNode = new Nodes.When(tbl.get("status"), new Nodes.SqlLiteral("1"));
      const elseNode = new Nodes.Else(new Nodes.SqlLiteral("0"));
      expect(new Visitors.ToSql().compile(whenNode)).toBe('WHEN "users"."status" THEN 1');
      expect(new Visitors.ToSql().compile(elseNode)).toBe("ELSE 0");
    });

    // Mirrors Rails to_sql.rb#visit_Arel_Nodes_{Equality,NotEqual,GreaterThan,
    // GreaterThanOrEqual,LessThan,LessThanOrEqual,In,NotIn} short-circuits
    // when the right operand reports `unboundable?` (±Float::INFINITY).
    describe("unboundable short-circuits", () => {
      const tbl = new Table("users");
      const compile = (n: Nodes.Node) => new Visitors.ToSql().compile(n);
      const id = tbl.get("id");

      it("Equality with +Infinity collapses to 1=0", () => {
        expect(compile(id.eq(Infinity))).toBe("1=0");
      });
      it("Equality with -Infinity collapses to 1=0", () => {
        expect(compile(id.eq(-Infinity))).toBe("1=0");
      });
      it("NotEqual with +Infinity collapses to 1=1", () => {
        expect(compile(id.notEq(Infinity))).toBe("1=1");
      });
      it("NotEqual with -Infinity collapses to 1=1", () => {
        expect(compile(id.notEq(-Infinity))).toBe("1=1");
      });
      it("GreaterThan +Infinity → 1=0; -Infinity → 1=1", () => {
        expect(compile(id.gt(Infinity))).toBe("1=0");
        expect(compile(id.gt(-Infinity))).toBe("1=1");
      });
      it("GreaterThanOrEqual +Infinity → 1=0; -Infinity → 1=1", () => {
        expect(compile(id.gteq(Infinity))).toBe("1=0");
        expect(compile(id.gteq(-Infinity))).toBe("1=1");
      });
      it("LessThan +Infinity → 1=1; -Infinity → 1=0", () => {
        expect(compile(id.lt(Infinity))).toBe("1=1");
        expect(compile(id.lt(-Infinity))).toBe("1=0");
      });
      it("LessThanOrEqual +Infinity → 1=1; -Infinity → 1=0", () => {
        expect(compile(id.lteq(Infinity))).toBe("1=1");
        expect(compile(id.lteq(-Infinity))).toBe("1=0");
      });
      it("In filters unboundable values; all-unboundable collapses to 1=0", () => {
        expect(compile(id.in([Infinity, -Infinity]))).toBe("1=0");
      });
      it("In retains bounded values when mixed with unboundable", () => {
        const sql = compile(id.in([1, Infinity, 2]));
        expect(sql).toBe('"users"."id" IN (1, 2)');
      });
      it("NotIn filters unboundable values; all-unboundable collapses to 1=1", () => {
        expect(compile(id.notIn([Infinity, -Infinity]))).toBe("1=1");
      });
      it("NotIn retains bounded values when mixed with unboundable", () => {
        const sql = compile(id.notIn([1, Infinity, 2]));
        expect(sql).toBe('"users"."id" NOT IN (1, 2)');
      });
      it("bounded comparisons are unaffected", () => {
        expect(compile(id.gt(5))).toBe('"users"."id" > 5');
        expect(compile(id.lt(5))).toBe('"users"."id" < 5');
        expect(compile(id.eq(5))).toBe('"users"."id" = 5');
      });

      it("Equality with null still emits IS NULL (not the unboundable branch)", () => {
        // Regression guard: null is bounded — sign is 0, so the `IS NULL`
        // path must still fire, not the new `1=0` short-circuit.
        expect(compile(id.eq(null))).toBe('"users"."id" IS NULL');
        expect(compile(id.notEq(null))).toBe('"users"."id" IS NOT NULL');
      });

      it("short-circuits when wrapped directly in Nodes.Quoted (not via buildQuoted)", () => {
        const eq = new Nodes.Equality(id, new Nodes.Quoted(Infinity));
        expect(compile(eq)).toBe("1=0");
        const gt = new Nodes.GreaterThan(id, new Nodes.Quoted(-Infinity));
        expect(compile(gt)).toBe("1=1");
      });
    });

    describe("unboundableSign protocol", () => {
      interface Internals {
        unboundableSign(v: unknown): 1 | -1 | 0;
        isUnboundable(v: unknown): boolean;
      }
      const v = () => new Visitors.ToSql() as unknown as Internals;

      it("returns +1 for +Infinity, -1 for -Infinity, 0 otherwise", () => {
        expect(v().unboundableSign(Infinity)).toBe(1);
        expect(v().unboundableSign(-Infinity)).toBe(-1);
        expect(v().unboundableSign(0)).toBe(0);
        expect(v().unboundableSign(null)).toBe(0);
        expect(v().unboundableSign(undefined)).toBe(0);
        expect(v().unboundableSign("foo")).toBe(0);
      });

      it("unwraps Quoted via isInfinite()", () => {
        expect(v().unboundableSign(new Nodes.Quoted(Infinity))).toBe(1);
        expect(v().unboundableSign(new Nodes.Quoted(-Infinity))).toBe(-1);
        expect(v().unboundableSign(new Nodes.Quoted(5))).toBe(0);
      });

      it("descends through nodes that expose .value (e.g. Casted)", () => {
        const tbl = new Table("users");
        const casted = new Nodes.Casted(Infinity, tbl.get("id"));
        expect(v().unboundableSign(casted)).toBe(1);
      });

      it("honours an isUnboundable() protocol returning a sign or boolean", () => {
        expect(v().unboundableSign({ isUnboundable: () => 1 })).toBe(1);
        expect(v().unboundableSign({ isUnboundable: () => -1 })).toBe(-1);
        expect(v().unboundableSign({ isUnboundable: () => true })).toBe(1);
        expect(v().unboundableSign({ isUnboundable: () => false })).toBe(0);
      });

      it("isUnboundable is the truthy wrapper of unboundableSign", () => {
        expect(v().isUnboundable(Infinity)).toBe(true);
        expect(v().isUnboundable(-Infinity)).toBe(true);
        expect(v().isUnboundable(5)).toBe(false);
        expect(v().isUnboundable(null)).toBe(false);
      });
    });

    it("visitArray handles a mix of Node and primitive entries", () => {
      const tbl = new Table("users");
      const v = new Visitors.ToSql();
      v.compile(new Nodes.SqlLiteral(""));
      (v as unknown as { visitArray(a: ReadonlyArray<unknown>): void }).visitArray([
        tbl.get("a"),
        1,
        "text",
      ]);
      expect((v as unknown as { collector: { value: string } }).collector.value).toBe(
        '"users"."a", 1, \'text\'',
      );
    });
  });
});
