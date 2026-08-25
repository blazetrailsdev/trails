import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
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
  sql,
} from "../index.js";
import { Attribute as AMAttribute, ValueType, StringType } from "@blazetrails/activemodel";
import { testConnection, fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { buildQuoted } from "../nodes/casted.js";

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

describe("the to_sql visitor", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  // Rails' `before` block and `compile` helper (`to_sql_test.rb:10-18`): the
  // FakeRecord connection is what makes `true` render as `'t'` here.
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const table = new Table("users");
  const attr = table.get("id");
  const compile = (node: unknown): string =>
    visitor.accept(node as Nodes.Node, new Collectors.SQLString()).value;
  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("first_name").isDistinctFrom(users.get("last_name"));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe(
        `CASE WHEN "users"."first_name" = "users"."last_name" OR ("users"."first_name" IS NULL AND "users"."last_name" IS NULL) THEN 0 ELSE 1 END = 1`,
      );
    });

    it("should handle nil", () => {
      const node = users.get("name").isDistinctFrom(null);
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe(`"users"."name" IS NOT NULL`);
    });
  });

  describe("Nodes::NotIn", () => {
    it("can handle subqueries", () => {
      const t = new Table("users");
      const subquery = t.project("id").where(t.get("name").eq("Aaron"));
      const node = attr.notIn(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" NOT IN (SELECT id FROM "users" WHERE "users"."name" = 'Aaron')`),
      );
    });

    it("should know how to visit", () => {
      const node = attr.notIn([1, 2, 3]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" NOT IN (1, 2, 3)`));
    });

    it("can handle two dot ranges", () => {
      const node = attr.notBetween([1, 3]);
      expect(compile(node)).toBe(`("users"."id" < 1 OR "users"."id" > 3)`);
    });

    it("can handle three dot ranges", () => {
      const node = attr.notBetween({ begin: 1, end: 3, excludeEnd: true });
      expect(compile(node)).toBe(`("users"."id" < 1 OR "users"."id" >= 3)`);
    });

    it("can handle ranges bounded by infinity", () => {
      expect(mustBeLike(compile(attr.notBetween([1, Infinity])))).toBe(
        mustBeLike(`"users"."id" < 1`),
      );
      expect(mustBeLike(compile(attr.notBetween([-Infinity, 3])))).toBe(
        mustBeLike(`"users"."id" > 3`),
      );
      expect(
        mustBeLike(compile(attr.notBetween({ begin: -Infinity, end: 3, excludeEnd: true }))),
      ).toBe(mustBeLike(`"users"."id" >= 3`));
      expect(mustBeLike(compile(attr.notBetween([-Infinity, Infinity])))).toBe(mustBeLike("1=0"));
    });

    it("is not preparable when an array", () => {
      const node = attr.notIn([1, 2, 3]);
      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(false);
    });

    it("is preparable when a subselect", () => {
      const t = new Table("users");
      const subquery = t.project(t.get("id")).where(t.get("name").eq("Aaron"));
      const node = attr.notIn(subquery);

      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(true);
    });
  });

  // A value exposing `isUnboundable()` (out of range for its column) is dropped
  // from an IN / NOT IN list, mirroring Rails' `visit_Arel_Nodes_In`
  // `values.delete_if { |v| unboundable?(v) }`.
  describe("unboundable values in IN / NOT IN lists", () => {
    // Rails' PredicateBuilder wraps out-of-range bounds in a QueryAttribute,
    // which `Nodes.build_quoted` passes through unwrapped (casted.rb:50-51 —
    // the `when ..., ActiveModel::Attribute` arm returning `other`) so it
    // answers `unboundable?` to the visitor directly (to_sql.rb:905-907).
    // Trails' equivalent is a BindParam, whose `isUnboundable` delegates to its
    // value (bind_param.rb:39-40). Only that shape short-circuits.
    const unboundable = new Nodes.BindParam({ isUnboundable: () => 1 as const });

    it("drops an unboundable value from an IN list", () => {
      const sql = new Visitors.ToSql(testConnection).compile(users.get("id").in([1, unboundable]));
      expect(sql).toBe('"users"."id" IN (1)');
    });

    it("collapses an all-unboundable IN list to 1=0", () => {
      const sql = new Visitors.ToSql(testConnection).compile(
        users.get("id").in([unboundable, unboundable]),
      );
      expect(sql).toBe("1=0");
    });

    it("drops an unboundable value from a NOT IN list", () => {
      const sql = new Visitors.ToSql(testConnection).compile(
        users.get("id").notIn([1, unboundable]),
      );
      expect(sql).toBe('"users"."id" NOT IN (1)');
    });

    it("collapses an all-unboundable NOT IN list to 1=1", () => {
      const sql = new Visitors.ToSql(testConnection).compile(
        users.get("id").notIn([unboundable, unboundable]),
      );
      expect(sql).toBe("1=1");
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("can handle ESCAPE", () => {
      const node = table.get("name").doesNotMatch("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."name" NOT LIKE 'foo!%' ESCAPE '!'`),
      );
    });

    it("should know how to visit", () => {
      const node = table.get("name").doesNotMatch("foo%");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" NOT LIKE 'foo%'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").doesNotMatch("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" NOT LIKE 'foo%')`),
      );
    });
  });

  it("should escape LIMIT", () => {
    const sc = new Nodes.SelectStatement();
    sc.limit = new Nodes.Limit(buildQuoted("omg"));
    expect(compile(sc)).toMatch(/LIMIT 'omg'/);
  });

  it("should not quote sql literals", () => {
    // Rails is `@table[Arel.star]`; trails' `Table#get` is typed to the string
    // name, so the star node is seated on the Attribute directly.
    const node = table.get(star as unknown as string);
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users".*`));
  });

  describe("Constants", () => {
    it("should handle false", () => {
      const test = new Table("users").createFalse();
      expect(mustBeLike(compile(test))).toBe(mustBeLike("FALSE"));
    });
  });

  describe("Nodes::InfixOperation", () => {
    const products = new Table("products");

    it("should handle Multiplication", () => {
      const node = products.get("price").multiply(new Table("currency_rates").get("rate"));
      expect(compile(node)).toBe(`"products"."price" * "currency_rates"."rate"`);
    });

    it("should handle Division", () => {
      const node = products.get("price").divide(5);
      expect(compile(node)).toBe(`"products"."price" / 5`);
    });

    it("should handle Addition", () => {
      const node = products.get("price").add(6);
      expect(compile(node)).toBe(`("products"."price" + 6)`);
    });

    it("should handle Subtraction", () => {
      const node = products.get("price").subtract(7);
      expect(compile(node)).toBe(`("products"."price" - 7)`);
    });

    it("should handle Concatenation", () => {
      const node = table.get("name").concat(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" || "users"."name"`);
    });

    it("should handle Contains", () => {
      const node = table.get("name").contains(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" @> "users"."name"`);
    });

    it("should handle Overlaps", () => {
      const node = table.get("name").overlaps(table.get("name"));
      expect(compile(node)).toBe(`"users"."name" && "users"."name"`);
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.InfixOperation("&&", products.get("name"), products.get("name"));
      expect(compile(node)).toBe(`"products"."name" && "products"."name"`);
    });
  });

  describe("Table", () => {
    it("should compile literal SQL", () => {
      const test = new Table(sql("generate_series(4, 2)") as unknown as string);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, 2)"));
    });

    it("should compile Arel nodes", () => {
      const test = new Nodes.NamedFunction("generate_series", [4, 2] as unknown as Nodes.Node[]);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, 2)"));
    });
  });

  it("can define a dispatch method", () => {
    let visited = false;
    class HelloVisitor extends Visitors.Visitor {
      hello(_node: Table, _c: unknown): string {
        visited = true;
        return "";
      }
      static {
        this.dispatchCache().set(Table, "hello");
      }
    }
    const viz = new HelloVisitor();
    viz.accept(users, new Collectors.SQLString());
    expect(visited).toBeTruthy();
  });

  it("should visit built-in functions", () => {
    expect(compile(new Nodes.Count([star]))).toBe("COUNT(*)");
    expect(compile(new Nodes.Sum([star]))).toBe("SUM(*)");
    expect(compile(new Nodes.Max([star]))).toBe("MAX(*)");
    expect(compile(new Nodes.Min([star]))).toBe("MIN(*)");
    expect(compile(new Nodes.Avg([star]))).toBe("AVG(*)");
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted("Aaron Patterson"));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe(
        `CASE WHEN "users"."name" = 'Aaron Patterson' OR ("users"."name" IS NULL AND 'Aaron Patterson' IS NULL) THEN 0 ELSE 1 END = 0`,
      );
    });

    it("should handle column names on both sides", () => {
      const node = users.get("first_name").isNotDistinctFrom(users.get("last_name"));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe(
        `CASE WHEN "users"."first_name" = "users"."last_name" OR ("users"."first_name" IS NULL AND "users"."last_name" IS NULL) THEN 0 ELSE 1 END = 0`,
      );
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe(`"users"."name" IS NULL`);
    });
  });

  describe("Nodes::Case", () => {
    it("allows chaining multiple conditions", () => {
      const node = new Nodes.Case(table.get("name"))
        .when("foo")
        .then(1)
        .when("bar")
        .then(2)
        .else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 WHEN 'bar' THEN 2 ELSE 0 END`),
      );
    });
  });

  describe("Nodes::Fragments", () => {
    it("can be built by adding SQL fragments one at a time", () => {
      let fragments = sql("SELECT foo, bar").plus(sql("FROM customers"));
      fragments = fragments.join(sql("GROUP BY foo"));
      expect(mustBeLike(compile(fragments))).toBe(
        mustBeLike("SELECT foo, bar FROM customers GROUP BY foo"),
      );
    });
  });

  describe("Nodes::Case", () => {
    it("can be chained as a predicate", () => {
      const node = table.get("name").when("foo").then("bar").else("baz");
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 'bar' ELSE 'baz' END`),
      );
    });
  });

  describe("Nodes::Between", () => {
    it("can handle ranges bounded by infinity", () => {
      const a = users.get("id").between(-Infinity, 10);
      const b = users.get("id").between(10, Infinity);
      expect(new Visitors.ToSql(testConnection).compile(a)).toContain("<=");
      expect(new Visitors.ToSql(testConnection).compile(b)).toContain(">=");
    });

    it("can handle three dot ranges", () => {
      const begin = 1;
      const end = 10;
      const node = new Nodes.Grouping(
        new Nodes.And([users.get("id").gteq(begin), users.get("id").lt(end)]),
      );
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toContain(">=");
      expect(sql).toContain("<");
    });

    it("can handle two dot ranges", () => {
      const node = users.get("id").between([1, 10]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toContain("BETWEEN");
      expect(sql).toContain("1 AND 10");
    });
  });

  it("does not quote BindParams used as part of a ValuesList", () => {
    const bp = new Nodes.BindParam(1);
    const values = new Nodes.ValuesList([[bp]]);
    expect(mustBeLike(compile(values))).toBe(mustBeLike("VALUES (?)"));
  });

  it("renders non-finite numbers bare in a ValuesList, matching the abstract adapter", () => {
    // Rails' abstract `quote` emits `when Numeric then value.to_s`
    // (abstract/quoting.rb:82), so the connection-less default visitor renders
    // non-finite numbers bare. Only PostgreSQL's adapter string-quotes them.
    const mgr = new InsertManager(users);
    mgr.insert([[users.get("name"), Number.POSITIVE_INFINITY]]);
    expect(mgr.toSql()).toContain("VALUES (Infinity)");
    const mgr2 = new InsertManager(users);
    mgr2.insert([[users.get("name"), Number.NEGATIVE_INFINITY]]);
    expect(mgr2.toSql()).toContain("VALUES (-Infinity)");
    const mgr3 = new InsertManager(users);
    mgr3.insert([[users.get("name"), Number.NaN]]);
    expect(mgr3.toSql()).toContain("VALUES (NaN)");
  });

  describe("Nodes::UnionAll", () => {
    it("encloses SELECT statements with parentheses", () => {
      const left = table.where(table.get("name").eq(0)).take(1).ast;
      const right = table.where(table.get("name").eq(1)).take(1).ast;
      const node = new Nodes.UnionAll(left, right);
      expect(compile(node)).toMatch(/LIMIT 1\) UNION ALL \(/);
    });
  });

  describe("Nodes::Cte", () => {
    it("handles CTEs with a MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star).ast, true);
      expect(mustBeLike(compile(cte))).toBe(
        mustBeLike(`"foo" AS MATERIALIZED (SELECT * FROM "bar")`),
      );
    });

    it("handles CTEs with a NOT MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star).ast, false);
      expect(mustBeLike(compile(cte))).toBe(
        mustBeLike(`"foo" AS NOT MATERIALIZED (SELECT * FROM "bar")`),
      );
    });

    it("handles CTEs with no MATERIALIZED modifier", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star).ast);
      expect(mustBeLike(compile(cte))).toBe(mustBeLike(`"foo" AS (SELECT * FROM "bar")`));
    });

    it("handles CTEs with null materialized (tristate nil — no modifier)", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, null);
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.ToSql(testConnection).compile(stmt.ast);
      expect(sql).not.toContain("MATERIALIZED");
    });

    it("wraps a bare SelectStatement body in exactly one set of parens", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast);
      const sql = new Visitors.ToSql(testConnection).compile(cte);
      expect(sql).toBe('"t" AS (SELECT "users"."id" FROM "users")');
    });

    it("does not double-wrap a Grouping body (SqlLiteral path)", () => {
      const cte = new Nodes.Cte("t", new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 1")));
      const sql = new Visitors.ToSql(testConnection).compile(cte);
      expect(sql).toBe('"t" AS (SELECT 1)');
    });

    it("does not double-wrap a UnionAll body (array CTE path)", () => {
      const union = new Nodes.UnionAll(
        new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 1")),
        new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 2")),
      );
      const cte = new Nodes.Cte("t", union);
      const sql = new Visitors.ToSql(testConnection).compile(cte);
      expect(sql).toBe('"t" AS ( (SELECT 1) UNION ALL (SELECT 2) )');
    });
  });

  describe("Nodes::With", () => {
    it("handles table aliases", () => {
      const manager = new Table("foo").project(star).from(new Nodes.SqlLiteral("expr2"));
      const expr1 = new Table("bar").project(star).as("expr1");
      const expr2 = new Table("baz").project(star).as("expr2");
      manager.with(expr1, expr2);
      const sql = new Visitors.ToSql(testConnection).compile(manager.ast);
      expect(sql).toBe(
        'WITH expr1 AS (SELECT * FROM "bar"), expr2 AS (SELECT * FROM "baz") SELECT * FROM expr2',
      );
    });

    it("handles Cte nodes", () => {
      const cte = new Nodes.Cte("expr1", new Table("bar").project(star).ast);
      const manager = new Table("foo")
        .project(star)
        .with(cte)
        .from(cte.toTable())
        .where(cte.toTable().get("score").gt(5));
      const sql = new Visitors.ToSql(testConnection).compile(manager.ast);
      expect(sql).toBe(
        'WITH "expr1" AS (SELECT * FROM "bar") SELECT * FROM "expr1" WHERE "expr1"."score" > 5',
      );
    });
  });

  describe("Nodes::WithRecursive", () => {
    it("handles table aliases", () => {
      const manager = new Table("foo").project(star).from(new Nodes.SqlLiteral("expr1"));
      const expr1 = new Table("bar").project(star).as("expr1");
      manager.withRecursive(expr1);
      const sql = new Visitors.ToSql(testConnection).compile(manager.ast);
      expect(sql).toBe('WITH RECURSIVE expr1 AS (SELECT * FROM "bar") SELECT * FROM expr1');
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("ignores excess named parameters", () => {
      const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1, extra: 2 });
      const sql = new Visitors.ToSql(testConnection).compile(node);
      // `:id` renders as a `?` placeholder (add_bind), `:extra` is unreferenced
      // and silently ignored — Rails to_sql_test.rb.
      expect(sql).toBe("id = ?");
    });
  });

  describe("Nodes::NotIn", () => {
    it("is not preparable when an array", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const collector = new Collectors.SQLString();
      new Visitors.ToSql(testConnection).accept(node, collector);
      expect(collector.preparable).toBe(false);
    });
  });

  describe("Nodes::Fragments", () => {
    it("joins subexpressions", () => {
      const fragments = sql("SELECT foo, bar").plus(sql(" FROM customers"));
      expect(mustBeLike(compile(fragments))).toBe(mustBeLike("SELECT foo, bar FROM customers"));
    });

    it("interleaves a space between values", () => {
      const node = new Nodes.Fragments([new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")]);
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("foo bar");
    });
  });

  describe("Nodes::HomogeneousIn", () => {
    it("is not preparable", () => {
      // HomogeneousIn#casted_values reaches Table#type_for_attribute, which
      // delegates bare to the caster — so Rails builds this table with a caster
      // too (`fake_pg_caster`, homogeneous_in_test.rb:44-50).
      const castedUsers = new Table("users", {
        typeCaster: { typeForAttribute: () => new StringType() },
      });
      const node = new Nodes.HomogeneousIn([1, 2, 3], castedUsers.get("id"), "in");
      const collector = new Collectors.SQLString();
      new Visitors.ToSql(testConnection).accept(node, collector);
      expect(collector.preparable).toBe(false);
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("quotes nested arrays", () => {
      // Mirrors Rails to_sql_test.rb — two cases exercise the mixed
      // Arel-node/scalar branch. An Arel node in the list is visited; every other
      // element (including a nested array) is a single `add_bind` → one `?`.
      const innerLiteral = new Nodes.BoundSqlLiteral("? * 2", [4], {});
      const node = new Nodes.BoundSqlLiteral("id IN (?)", [[1, [2, 3], innerLiteral]], {});
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("id IN (?, ?, ? * 2)");

      const node2 = new Nodes.BoundSqlLiteral("id IN (?)", [[1, [2, 3]]], {});
      expect(new Visitors.ToSql(testConnection).compile(node2)).toBe("id IN (?, ?)");
    });
  });

  it("unsupported input should raise UnsupportedVisitError", () => {
    // Rails compiles `nil`, whose NilClass handler is aliased to `unsupported`
    // (to_sql.rb:838) — the UnsupportedVisitError terminal. A class with no
    // handler at all is the other terminal and raises TypeError
    // (visitor.rb:38), covered in visitor.test.ts.
    let error: unknown;
    try {
      compile(null);
    } catch (e) {
      error = e;
    }
    expect(() => compile(null)).toThrow(Visitors.UnsupportedVisitError);
    expect((error as Error).message).toMatch(/^Unsupported/);
  });

  describe("value-class visitors aliased to unsupported", () => {
    // Rails aliases visit_Class/Date/DateTime/Float/Hash/NilClass/String/
    // Time/TrueClass/FalseClass and the ActiveSupport string types to
    // `unsupported` (to_sql.rb:832-845): each raises UnsupportedVisitError.
    const aliasNames = [
      "visitActiveSupportMultibyteChars",
      "visitActiveSupportStringInquirer",
      "visitBigDecimal",
      "visitClass",
      "visitDate",
      "visitDateTime",
      "visitFalseClass",
      "visitFloat",
      "visitHash",
      "visitNilClass",
      "visitString",
      "visitSymbol",
      "visitTime",
      "visitTrueClass",
    ] as const;

    for (const name of aliasNames) {
      it(`${name} raises UnsupportedVisitError`, () => {
        const v = new Visitors.ToSql(testConnection);
        const fn = (v as unknown as Record<string, (o: unknown, c: unknown) => never>)[name];
        const node = new Nodes.SqlLiteral("x");
        const collector = new Collectors.SQLString();
        expect(() => fn.call(v, node, collector)).toThrow(Visitors.UnsupportedVisitError);
      });
    }

    describe("raw values reaching visit dispatch on their class", () => {
      // Rails' raw-value dispatch: only `visit_Integer` renders
      // (`collector << o.to_s`, to_sql.rb:824-826); every other scalar aliases
      // to `unsupported` and raises (to_sql.rb:828-845). Equality visits its
      // right (to_sql.rb:643), so a raw value placed there hits that dispatch.
      const compileRight = (right: unknown): string =>
        new Visitors.ToSql(testConnection).compile(
          new Nodes.Equality(new Table("users").get("id"), right as Nodes.NodeOrValue),
        );

      it("renders an Integer bare", () => {
        expect(compileRight(1)).toBe('"users"."id" = 1');
        // Ruby has no fixnum/bignum split at this layer — both are Integer.
        expect(compileRight(9007199254740993n)).toBe('"users"."id" = 9007199254740993');
      });

      for (const [label, value] of [
        ["a String", "x"],
        ["a Float", 1.5],
        ["NaN", NaN],
        ["TrueClass", true],
        ["FalseClass", false],
        ["a Time", Temporal.Instant.from("2024-01-01T00:00:00Z")],
        ["a Hash", { a: 1 }],
      ] as const) {
        it(`raises UnsupportedVisitError for ${label}`, () => {
          expect(() => compileRight(value)).toThrow(Visitors.UnsupportedVisitError);
        });
      }

      it("renders IS NULL for Casted(nil) as well as Quoted(nil)", () => {
        // Rails defines `nil?` as `value.nil?` on both wrappers — Casted
        // (casted.rb:15) and Quoted (casted.rb:41) — so `right.nil?`
        // (to_sql.rb:649) is true for either and both emit IS NULL.
        const attr = new Table("users").get("id");
        expect(compileRight(new Nodes.Quoted(null))).toBe('"users"."id" IS NULL');
        expect(compileRight(new Nodes.Casted(null, attr))).toBe('"users"."id" IS NULL');
      });

      it("renders IS NULL for a bare NilClass rather than dispatching", () => {
        // Rails tests `right.nil?` (to_sql.rb:649) before visiting, and that is
        // true for a bare nil as well as Quoted(nil) (`Quoted#nil?` delegates
        // to `value.nil?`, casted.rb:41) — so nil never reaches raw dispatch
        // here, even though visit_NilClass is aliased to `unsupported`.
        expect(compileRight(null)).toBe('"users"."id" IS NULL');
        const attr = new Table("users").get("id");
        expect(new Visitors.ToSql(testConnection).compile(new Nodes.NotEqual(attr, null))).toBe(
          '"users"."id" IS NOT NULL',
        );
      });

      it("raises UnsupportedVisitError for NilClass on a path that reaches dispatch", () => {
        // visit_NilClass is aliased to `unsupported` (to_sql.rb:840); visitArray
        // reaches it because there is no `nil?` guard on that path.
        const v = new Visitors.ToSql(testConnection);
        const visitArray = (
          v as unknown as { visitArray(a: ReadonlyArray<unknown>, c: unknown): void }
        ).visitArray;
        expect(() => visitArray.call(v, [null], new Collectors.SQLString())).toThrow(
          Visitors.UnsupportedVisitError,
        );
      });

      it("raises UnsupportedVisitError for a non-finite Float", () => {
        // Infinity is not integral, so it lands on the Float branch — there is
        // no separate non-finite rule. `unboundable?` is purely duck-typed
        // (`value.respond_to?(:unboundable?) && value.unboundable?`,
        // to_sql.rb:905-907) and a Float answers it false, so Equality visits
        // its right (to_sql.rb:643) and reaches visit_Float, aliased to
        // `unsupported` (to_sql.rb:839).
        expect(() => compileRight(Infinity)).toThrow(Visitors.UnsupportedVisitError);
      });

      it("dispatches a bare Temporal on its Rails analogue", () => {
        // Temporal is the Time analogue, so an Instant must reach visit_Time
        // (`alias :visit_Time :unsupported`, to_sql.rb:844) and a PlainDate
        // visit_Date (to_sql.rb:836) — not the generic no-handler tail.
        // Temporal exposes no toISOString, so the tag is what routes them.
        const v = new Visitors.ToSql(testConnection);
        const seen: string[] = [];
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitTime = () => {
          seen.push("Time");
          throw new Visitors.UnsupportedVisitError("x");
        };
        spy.visitDate = () => {
          seen.push("Date");
          throw new Visitors.UnsupportedVisitError("x");
        };
        const attr = new Table("users").get("id");
        expect(() =>
          spy.compile(new Nodes.Equality(attr, Temporal.Instant.from("2026-04-30T12:34:56Z"))),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(() =>
          spy.compile(new Nodes.Equality(attr, Temporal.PlainDate.from("2026-04-30"))),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(seen).toEqual(["Time", "Date"]);
      });

      it("does not dispatch a Temporal without a Rails analogue on visit_Time", () => {
        // Duration/PlainYearMonth/PlainMonthDay have no visitable Rails
        // ancestor: to_sql.rb defines no visit_ActiveSupport_Duration and
        // ActiveSupport::Duration is a plain Object subclass, not a Numeric
        // (duration.rb:14), so Rails finds no handler (visitor.rb:39). They
        // must reach that same tail, not be mislabelled as a Ruby Time.
        const v = new Visitors.ToSql(testConnection);
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitTime = () => {
          throw new Error("visit_Time must not be reached");
        };
        spy.visitDate = () => {
          throw new Error("visit_Date must not be reached");
        };
        const attr = new Table("users").get("id");
        for (const value of [
          Temporal.Duration.from({ hours: 1 }),
          Temporal.PlainYearMonth.from("2026-04"),
          Temporal.PlainMonthDay.from("04-30"),
        ]) {
          expect(() =>
            spy.compile(new Nodes.Equality(attr, value as unknown as Nodes.NodeOrValue)),
          ).toThrow(TypeError);
        }
      });

      it("dispatches a bare Temporal.PlainDateTime on visit_DateTime", () => {
        // PlainDateTime is the DateTime analogue (`alias :visit_DateTime
        // :unsupported`, to_sql.rb:837), not the Time one.
        const v = new Visitors.ToSql(testConnection);
        const seen: string[] = [];
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitDateTime = () => {
          seen.push("DateTime");
          throw new Visitors.UnsupportedVisitError("x");
        };
        expect(() =>
          spy.compile(
            new Nodes.Equality(
              new Table("users").get("id"),
              Temporal.PlainDateTime.from("2026-04-30T12:34:56"),
            ),
          ),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(seen).toEqual(["DateTime"]);
      });

      it("raises for a bare Temporal but still renders it wrapped", () => {
        // A bare Temporal raises; wrapped in Quoted it routes through quote()
        // (to_sql.rb:87-90) and still inlines, which is the only shape any AR
        // caller produces.
        const instant = Temporal.Instant.from("2026-04-30T12:34:56.000Z");
        expect(() => compileRight(instant)).toThrow(Visitors.UnsupportedVisitError);
        expect(compileRight(new Nodes.Quoted(instant))).toContain("2026-04-30");
      });

      it("renders once wrapped via quotedNode, as predications do", () => {
        // The AR-facing path: `eq` wraps the raw value in a Casted node, which
        // routes through quote() (to_sql.rb:87-90) rather than raw dispatch.
        expect(
          new Visitors.ToSql(testConnection).compile(new Table("users").get("id").eq("x")),
        ).toBe('"users"."id" = \'x\'');
      });
    });

    it("visit_Set is aliased to visit_Array (joins with ', ')", () => {
      // Rails: `alias :visit_Set :visit_Array` (to_sql.rb:861).
      const v = new Visitors.ToSql(testConnection);
      const collector = new Collectors.SQLString();
      const set = new Set<Nodes.NodeOrValue>([new Nodes.Quoted(1), new Nodes.Quoted(2)]);
      const out = (
        v as unknown as {
          visitSet(
            s: ReadonlySet<Nodes.NodeOrValue>,
            c: Collectors.SQLString,
          ): Collectors.SQLString;
        }
      ).visitSet(set, collector);
      expect(out.value).toBe("1, 2");
    });
  });

  describe("distinct on", () => {
    it("raises not implemented error", () => {
      const core = new Nodes.SelectCore();
      core.setQuantifier = new Nodes.DistinctOn(new Nodes.SqlLiteral("aaron"));
      expect(() => new Visitors.ToSql(testConnection).compile(core)).toThrow(
        "DISTINCT ON not implemented for this db",
      );
    });
  });

  describe("Nodes::Regexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.Regexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql(testConnection).compile(node)).toThrow(
        "~ not implemented for this db",
      );
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("raises not implemented error", () => {
      const node = new Nodes.NotRegexp(users.get("name"), new Nodes.Quoted("foo%"));
      expect(() => new Visitors.ToSql(testConnection).compile(node)).toThrow(
        "!~ not implemented for this db",
      );
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("refuses mixed binds", () => {
      expect(
        () => new Nodes.BoundSqlLiteral("id = ? AND name = :name", [1], { name: "x" }),
      ).toThrow();
    });

    it("requires all named bind params to be supplied", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (:foo, :bar)", [], { foo: 1 })).toThrow();
    });

    it("requires positional binds to match the placeholders", () => {
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2], {})).toThrow();
      expect(() => new Nodes.BoundSqlLiteral("id IN (?, ?, ?)", [1, 2, 3, 4], {})).toThrow();
    });
  });

  it("should apply Not to the whole expression", () => {
    const node = new Nodes.And([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(new Nodes.Not(node)))).toBe(
      mustBeLike(`NOT ("users"."id" = 10 AND "users"."id" = 11)`),
    );
  });

  it("should chain predications on named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star]);
    expect(mustBeLike(compile(fn.eq(2)))).toBe(mustBeLike("omg(*) = 2"));
  });

  describe("Table", () => {
    it("should compile node names", () => {
      const test = new Table("users").alias("zomgusers").get("id").eq("3");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"zomgusers"."id" = '3'`));
    });

    it("should compile nodes with bind params", () => {
      const bp = new Nodes.BindParam(1);
      const test = new Nodes.NamedFunction("generate_series", [4, bp] as unknown as Nodes.Node[]);
      expect(mustBeLike(compile(test))).toBe(mustBeLike("generate_series(4, ?)"));
    });
  });

  it("should contain a single space before ORDER BY", () => {
    const test = table.order(table.get("name"));
    expect(compile(test)).toMatch(/"users" ORDER BY/);
  });

  describe("Nodes::Equality", () => {
    it("should escape strings", () => {
      const test = new Table("users").get("name").eq("Aaron Patterson");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."name" = 'Aaron Patterson'`));
    });

    it("should handle false", () => {
      const t = new Table("users");
      const val = buildQuoted(false, t.get("active"));
      expect(mustBeLike(compile(new Nodes.Equality(val, val)))).toBe(mustBeLike(`'f' = 'f'`));
    });

    it("should handle nil", () => {
      const compiled = compile(new Nodes.Equality(table.get("name"), null));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NULL`));
    });

    it("emits IS NULL for a BindParam wrapping a bare null", () => {
      const node = new Nodes.Equality(users.get("id"), new Nodes.BindParam(null));
      expect(new Visitors.ToSql(testConnection).compile(node)).toContain("IS NULL");
    });

    it("emits IS NOT NULL for a NotEqual BindParam wrapping a bare null", () => {
      const node = new Nodes.NotEqual(users.get("id"), new Nodes.BindParam(null));
      expect(new Visitors.ToSql(testConnection).compile(node)).toContain("IS NOT NULL");
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle BitwiseAnd", () => {
      const node = new Table("products").get("bitmap").bitwiseAnd(16);
      expect(compile(node)).toBe(`("products"."bitmap" & 16)`);
    });
  });

  describe("Nodes::UnaryOperation", () => {
    it("should handle BitwiseNot", () => {
      const node = new Table("products").get("bitmap").bitwiseNot();
      expect(compile(node)).toBe(` ~ "products"."bitmap"`);
    });

    it("should handle arbitrary operators", () => {
      const node = new Nodes.UnaryOperation("!", new Table("products").get("active"));
      expect(compile(node)).toBe(` ! "products"."active"`);
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle BitwiseOr", () => {
      const node = new Table("products").get("bitmap").bitwiseOr(16);
      expect(compile(node)).toBe(`("products"."bitmap" | 16)`);
    });

    it("should handle BitwiseShiftLeft", () => {
      const node = new Table("products").get("bitmap").bitwiseShiftLeft(4);
      expect(compile(node)).toBe(`("products"."bitmap" << 4)`);
    });

    it("should handle BitwiseShiftRight", () => {
      const node = new Table("products").get("bitmap").bitwiseShiftRight(4);
      expect(compile(node)).toBe(`("products"."bitmap" >> 4)`);
    });

    it("should handle BitwiseXor", () => {
      const node = new Table("products").get("bitmap").bitwiseXor(16);
      expect(compile(node)).toBe(`("products"."bitmap" ^ 16)`);
    });
  });

  it("should handle nil with named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star]);
    expect(mustBeLike(compile(fn.eq(null)))).toBe(mustBeLike("omg(*) IS NULL"));
  });

  describe("Nodes::Ordering", () => {
    it("should handle nulls first", () => {
      const node = attr.desc().nullsFirst();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC NULLS FIRST`));
    });

    it("should handle nulls first reversed", () => {
      const node = attr.desc().nullsFirst().reverse();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" ASC NULLS LAST`));
    });

    it("should handle nulls last", () => {
      const node = attr.desc().nullsLast();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC NULLS LAST`));
    });

    it("should handle nulls last reversed", () => {
      const node = attr.desc().nullsLast().reverse();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" ASC NULLS FIRST`));
    });

    it("should know how to visit", () => {
      const node = attr.desc();
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" DESC`));
    });
  });

  describe("Constants", () => {
    it("should handle true", () => {
      const test = new Table("users").createTrue();
      expect(mustBeLike(compile(test))).toBe(mustBeLike("TRUE"));
    });
  });

  it("should mark collector as non-retryable if SQL literal is marked as retryable", () => {
    const lit = new Nodes.SqlLiteral("1", { retryable: true });
    const collector = new Visitors.ToSql(testConnection).accept(lit, new Collectors.SQLString());
    expect(collector.retryable).toBe(true);
  });

  it("should mark collector as non-retryable if SQL literal is not retryable", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql(testConnection).accept(lit, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting SQL literal", () => {
    const lit = new Nodes.SqlLiteral("1");
    const collector = new Visitors.ToSql(testConnection).accept(lit, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting bound SQL literal", () => {
    const lit = new Nodes.BoundSqlLiteral("id = ?", [1]);
    const collector = new Visitors.ToSql(testConnection).accept(lit, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting delete statement node", () => {
    const stmt = new DeleteManager().from(users).ast;
    const collector = new Visitors.ToSql(testConnection).accept(stmt, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting insert statement node", () => {
    const stmt = new InsertManager(users).insert([[users.get("name"), "dean"]]).ast;
    const collector = new Visitors.ToSql(testConnection).accept(stmt, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  describe("Nodes::DeleteStatement", () => {
    it("renders DELETE FROM via the table visitor", () => {
      const stmt = new DeleteManager().from(users).ast;
      const sql = new Visitors.ToSql(testConnection).compile(stmt);
      expect(sql).toBe('DELETE FROM "users"');
    });

    it("treats a JoinSource with no joins as no-join-source (Rails has_join_sources?)", () => {
      // Mirrors Rails: `has_join_sources?` requires non-empty `right`.
      // A bare JoinSource(table) renders via the plain `DELETE FROM` path,
      // identical to passing the table directly.
      const stmt = new Nodes.DeleteStatement(new Nodes.JoinSource(users));
      const sql = new Visitors.ToSql(testConnection).compile(stmt);
      expect(sql).toBe('DELETE FROM "users"');
    });

    it("renders TableAlias on the left when join sources are present", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const join = new Nodes.InnerJoin(
        posts,
        new Nodes.On(new Nodes.Equality(posts.get("user_id"), users.get("id"))),
      );
      const stmt = new Nodes.DeleteStatement(new Nodes.JoinSource(aliased, [join]));
      stmt.wheres.push(new Nodes.Equality(users.get("id"), 1));
      const sql = new Visitors.ToSql(testConnection).compile(stmt);
      expect(sql).toContain('DELETE "users" "u" FROM "users" "u"');
      expect(sql).toContain("INNER JOIN");
      expect(sql).toContain("WHERE");
    });
  });

  describe("Nodes::InsertStatement", () => {
    it("prefers values over select when both are present", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      const sub = users.project(users.get("name"));
      mgr.ast.select = sub.ast;
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain("VALUES");
      expect(sql).toContain("'dean'");
      expect(sql).not.toContain("SELECT");
    });

    it("routes column names through quoteColumnName", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain('("name")');
    });
  });

  it("should mark collector as non-retryable when visiting named function", () => {
    const fn = users.get("name").lower();
    const collector = new Visitors.ToSql(testConnection).accept(fn, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should mark collector as non-retryable when visiting update statement node", () => {
    const stmt = new UpdateManager().table(users).set([[users.get("name"), "sam"]]).ast;
    const collector = new Visitors.ToSql(testConnection).accept(stmt, new Collectors.SQLString());
    expect(collector.retryable).toBe(false);
  });

  it("should not change retryable if SQL literal is marked as retryable", () => {
    const node = new Nodes.SqlLiteral("COUNT(*)", { retryable: true });
    const collector = new Collectors.SQLString();
    collector.retryable = true;
    visitor.accept(node, collector);

    expect(collector.retryable).toBeTruthy();
  });

  it("should not quote BindParams used as part of a ValuesList", () => {
    const values = new Nodes.ValuesList([[new Nodes.BindParam()]]);
    const sql = new Visitors.ToSql(testConnection).compile(values);
    expect(sql).toContain("(?)");
  });

  it("should quote LIMIT without column type coercion", () => {
    const sc = table.where(table.get("name").eq(0)).take(1).ast;
    expect(compile(sc)).toMatch(/WHERE "users"."name" = 0 LIMIT 1/);
  });

  describe("Nodes::In", () => {
    it("should return 1=0 when empty right which is always false", () => {
      const node = users.get("id").in([]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("1=0");
    });

    it("should know how to visit", () => {
      const node = attr.in([1, 2, 3]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" IN (1, 2, 3)`));
    });

    it("can handle two dot ranges", () => {
      const node = attr.between([1, 3]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" BETWEEN 1 AND 3`));
    });

    it("can handle three dot ranges", () => {
      const node = attr.between({ begin: 1, end: 3, excludeEnd: true });
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" >= 1 AND "users"."id" < 3`));
    });

    it("can handle ranges bounded by infinity", () => {
      expect(mustBeLike(compile(attr.between([1, Infinity])))).toBe(
        mustBeLike(`"users"."id" >= 1`),
      );
      expect(mustBeLike(compile(attr.between([-Infinity, 3])))).toBe(
        mustBeLike(`"users"."id" <= 3`),
      );
      expect(
        mustBeLike(compile(attr.between({ begin: -Infinity, end: 3, excludeEnd: true }))),
      ).toBe(mustBeLike(`"users"."id" < 3`));
      expect(mustBeLike(compile(attr.between([-Infinity, Infinity])))).toBe(mustBeLike("1=1"));
    });

    it("can handle subqueries", () => {
      const t = new Table("users");
      const subquery = t.project("id").where(t.get("name").eq("Aaron"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" = 'Aaron')`),
      );
    });

    it("is not preparable when an array", () => {
      const node = attr.in([1, 2, 3]);
      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(false);
    });

    it("is preparable when a subselect", () => {
      const t = new Table("users");
      const subquery = t.project(t.get("id")).where(t.get("name").eq("Aaron"));
      const node = attr.in(subquery);

      const collector = new Collectors.SQLString();
      collector.preparable = true;
      visitor.accept(node, collector);
      expect(collector.preparable).toBe(true);
    });
  });

  describe("Nodes::NotIn", () => {
    it("should return 1=1 when empty right which is always true", () => {
      const node = users.get("id").notIn([]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("1=1");
    });
  });

  describe("TableAlias", () => {
    it("should use the underlying table for checking columns", () => {
      const test = new Table("users").alias("zomgusers").get("id").eq("3");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"zomgusers"."id" = '3'`));
    });

    it("emits a subquery alias bare (Rails AliasPredication via SqlLiteral name)", () => {
      // SelectManager#as wraps the relation in a Grouping, which Rails'
      // visit_Arel_Nodes_TableAlias renders bare via quote_table_name's
      // SqlLiteral pass-through. Trails matches on the relation shape.
      const sub = users.project(users.get("id")).as("sub");
      const sql = new Visitors.ToSql(testConnection).compile(sub);
      expect(sql).toContain(") sub");
      expect(sql).not.toContain('"sub"');
    });

    it("keeps regular table aliases quoted", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const sql = new Visitors.ToSql(testConnection).compile(aliased);
      expect(sql).toContain('"users" "u"');
    });
  });

  it("should visit_Arel_Nodes_And", () => {
    const node = new Nodes.And([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" = 10 AND "users"."id" = 11`));
  });

  it("should visit_Arel_Nodes_Assignment", () => {
    const column = table.get("id");
    const node = new Nodes.Assignment(
      new Nodes.UnqualifiedColumn(column),
      new Nodes.UnqualifiedColumn(column),
    );
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"id" = "id"`));
  });

  // Rails: to_sql.rb:632's `when ..., ActiveModel::Attribute` arm visits the
  // right, reaching visit_ActiveModel_Attribute (rb:756) and its add_bind.
  it("visits an ActiveModel::Attribute assignment right instead of quoting it", () => {
    // `NodeOrValue` doesn't name ActiveModel::Attribute — Rails' `case` accepts
    // it at runtime, which is what this asserts.
    const node = new Nodes.Assignment(
      users.get("name"),
      AMAttribute.fromUser("name", "x", new ValueType()),
    );
    expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"users"."name" = ?');
  });

  it("should visit_Arel_Nodes_Or", () => {
    const node = new Nodes.Or([attr.eq(10), attr.eq(11)]);
    expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."id" = 10 OR "users"."id" = 11`));
  });

  it("should visit_Arel_SelectManager, which is a subquery", () => {
    const mgr = new Table("foo").project("bar");
    expect(mustBeLike(compile(mgr))).toBe(mustBeLike(`(SELECT bar FROM "foo")`));
  });

  it("should visit_As", () => {
    const as = new Nodes.As(sql("foo"), sql("bar"));
    expect(mustBeLike(compile(as))).toBe(mustBeLike("foo AS bar"));
  });

  it("should visit_BigDecimal", () => {
    // Rails exercises the visitor without asserting (to_sql_test.rb:344-346):
    // reaching the end of the body is the assertion.
    compile(buildQuoted({ toString: () => "2.14" }));
  });

  it("should visit_Class", () => {
    // Ruby `Class#to_s` is the class name, so `build_quoted(DateTime)` quotes
    // `'DateTime'`. JS `String(klass)` is the constructor's source text, so the
    // faithful analogue of Ruby's `to_s` here is the constructor's `name`.
    class DateTime {}
    expect(compile(buildQuoted(DateTime.name))).toBe("'DateTime'");
  });

  it("should visit_Date", () => {
    const dt = Temporal.PlainDate.from("2020-01-02");
    const test = table.get("created_at").eq(dt);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."created_at" = '2020-01-02'`));
  });

  it("should visit_DateTime", () => {
    const dt = Temporal.PlainDateTime.from("2020-01-02T03:04:05");
    const test = table.get("created_at").eq(dt);
    expect(mustBeLike(compile(test))).toBe(
      mustBeLike(`"users"."created_at" = '2020-01-02 03:04:05'`),
    );
  });

  it("should visit_Date with fractional seconds retains microseconds", () => {
    const d = Temporal.Instant.from("2026-04-18T13:00:41.729Z");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2026-04-18 13:00:41.729000'");
  });

  it("should visit_Date-like with 1-digit fraction normalises to microseconds", () => {
    const obj = Temporal.PlainDateTime.from("2020-01-02T03:04:05.7");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(obj));
    expect(sql).toBe("'2020-01-02 03:04:05.700000'");
  });

  it("should visit_Date with zero ms emits bare seconds (Rails quoted_date format)", () => {
    const d = Temporal.Instant.from("2000-01-01T00:00:00.000Z");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2000-01-01 00:00:00'");
  });

  it("should visit_Date-like with no fractional part (no trailing Z artifact)", () => {
    const obj = Temporal.PlainDate.from("2026-01-01").toPlainDateTime();
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(obj));
    expect(sql).toBe("'2026-01-01 00:00:00'");
    expect(sql).not.toContain("Z");
  });

  it("should extract Date as bind param in compileWithBinds", () => {
    const users = new Table("users");
    const d = Temporal.Instant.from("2020-01-02T12:00:00.000Z");
    const node = users.get("created_at").eq(new Nodes.Quoted(d));
    const [sql, binds] = compileWithBinds(new Visitors.ToSql(testConnection), node);
    // Quoted(Date) inlines per Rails to_sql.rb — _extractBinds was removed by
    // collector threading; only BindParam/ActiveModel::Attribute go to addBind.
    expect(sql).toContain("2020-01-02");
    expect(sql).not.toContain("?");
    expect(binds).toHaveLength(0);
  });

  it("should visit_Float", () => {
    const test = new Table("products").get("price").eq(2.14);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"products"."price" = 2.14`));
  });

  it("should visit_Hash", () => {
    compile(buildQuoted({ a: 1 }));
  });

  it("should visit_Integer", () => {
    compile(8787878092);
  });

  it("should visit_NilClass", () => {
    expect(mustBeLike(compile(buildQuoted(null)))).toBe(mustBeLike("NULL"));
  });

  it("should visit_Not", () => {
    expect(mustBeLike(compile(new Nodes.Not(sql("foo"))))).toBe(mustBeLike("NOT (foo)"));
  });

  it("should visit_Set", () => {
    compile(buildQuoted(new Set([1, 2])));
  });

  it("should visit_TrueClass", () => {
    const test = table.get("bool").eq(true);
    expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."bool" = 't'`));
  });

  it("should visit named functions", () => {
    const fn = new Nodes.NamedFunction("omg", [star]);
    expect(compile(fn)).toBe("omg(*)");
  });

  it("should visit string subclass", () => {
    class StringSubclass extends String {}
    class StringSubSubclass extends StringSubclass {}
    for (const obj of [new StringSubclass(":'("), new StringSubSubclass(":'(")]) {
      const val = buildQuoted(obj, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" != ':\\'('`));
    }
  });

  it("should visit built-in functions operating on distinct values", () => {
    const count = new Nodes.Count([star]);
    count.distinct = true;
    expect(compile(count)).toBe("COUNT(DISTINCT *)");
    const sum = new Nodes.Sum([star]);
    sum.distinct = true;
    expect(compile(sum)).toBe("SUM(DISTINCT *)");
    const max = new Nodes.Max([star]);
    max.distinct = true;
    expect(compile(max)).toBe("MAX(DISTINCT *)");
    const min = new Nodes.Min([star]);
    min.distinct = true;
    expect(compile(min)).toBe("MIN(DISTINCT *)");
    const avg = new Nodes.Avg([star]);
    avg.distinct = true;
    expect(compile(avg)).toBe("AVG(DISTINCT *)");
  });

  describe("Nodes::UnionAll", () => {
    it("squashes parenthesis on multiple union alls", () => {
      let subnode = new Nodes.UnionAll(sql("left"), sql("right"));
      let node = new Nodes.UnionAll(subnode, sql("topright"));
      expect(compile(node)).toBe("( left UNION ALL right UNION ALL topright )");
      subnode = new Nodes.UnionAll(sql("left"), sql("right"));
      node = new Nodes.UnionAll(sql("topleft"), subnode);
      expect(compile(node)).toBe("( topleft UNION ALL left UNION ALL right )");
    });
  });

  describe("Nodes::Union", () => {
    it("squashes parenthesis on multiple unions", () => {
      let subnode = new Nodes.Union(sql("left"), sql("right"));
      let node = new Nodes.Union(subnode, sql("topright"));
      expect(compile(node)).toBe("( left UNION right UNION topright )");
      subnode = new Nodes.Union(sql("left"), sql("right"));
      node = new Nodes.Union(sql("topleft"), subnode);
      expect(compile(node)).toBe("( topleft UNION left UNION right )");
    });

    it("encloses SELECT statements with parentheses", () => {
      const left = table.where(table.get("name").eq(0)).take(1).ast;
      const right = table.where(table.get("name").eq(1)).take(1).ast;
      const node = new Nodes.Union(left, right);
      expect(compile(node)).toMatch(/LIMIT 1\) UNION \(/);
    });
  });

  describe("Nodes::Union with ORDER/LIMIT/OFFSET operands", () => {
    // Mirrors Rails `grouping_parentheses(..., false)` + `require_parentheses?`:
    // SELECTs that carry orders/limit/offset are wrapped to disambiguate.
    it("wraps a SELECT operand with ORDER BY", () => {
      const a = users.project(star);
      const b = users.project(star).order(users.get("id"));
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" UNION (SELECT * FROM "users" ORDER BY "users"."id") )',
      );
    });

    it("wraps a SELECT operand with LIMIT", () => {
      const a = users.project(star);
      const b = users.project(star).take(5);
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe('( SELECT * FROM "users" UNION (SELECT * FROM "users" LIMIT 5) )');
    });

    it("wraps a SELECT operand with OFFSET", () => {
      const a = users.project(star);
      const b = users.project(star).skip(10);
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe('( SELECT * FROM "users" UNION (SELECT * FROM "users" OFFSET 10) )');
    });
  });

  describe("Nodes::Intersect", () => {
    it("flattens nested intersects", () => {
      const a = users.project(star);
      const b = users.project(star);
      const c = users.project(star);
      const node = new Nodes.Intersect(a.ast, new Nodes.Intersect(b.ast, c.ast));
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" INTERSECT ( SELECT * FROM "users" INTERSECT SELECT * FROM "users" ) )',
      );
    });
  });

  describe("Nodes::Except", () => {
    it("flattens nested excepts", () => {
      const a = users.project(star);
      const b = users.project(star);
      const c = users.project(star);
      const node = new Nodes.Except(a.ast, new Nodes.Except(b.ast, c.ast));
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" EXCEPT ( SELECT * FROM "users" EXCEPT SELECT * FROM "users" ) )',
      );
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("supports other bound literals as binds", () => {
      // Rails to_sql_test.rb: `Arel.sql("?", [1, 2, Arel.sql("?", 3)])` — one
      // `?` bound to a mixed scalar/Arel-node list. The nested bound literal is
      // visited (its own `?`), the scalars each `add_bind` → `?, ?, ?`.
      const inner = new Nodes.BoundSqlLiteral("?", [3], {});
      const node = new Nodes.BoundSqlLiteral("?", [[1, 2, inner]], {});
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("?, ?, ?");
    });
  });

  describe("Nodes::Case", () => {
    it("supports simple case expressions", () => {
      const node = new Nodes.Case(table.get("name")).when("foo").then(1).else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 ELSE 0 END`),
      );
    });

    it("supports extended case expressions", () => {
      const node = new Nodes.Case()
        .when(table.get("name").in(["foo", "bar"]))
        .then(1)
        .else(0);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE WHEN "users"."name" IN ('foo', 'bar') THEN 1 ELSE 0 END`),
      );
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("will only consider named binds starting with a letter", () => {
      const node = new Nodes.BoundSqlLiteral("id = :0abc", [], { "0abc": 1 });
      expect(mustBeLike(compile(node))).toBe(mustBeLike("id = :0abc"));
    });
  });

  it("works with BindParams", () => {
    const node = new Nodes.BindParam(1);
    expect(mustBeLike(compile(node))).toBe(mustBeLike("?"));
  });

  it("compileWithBinds extracts bind values", () => {
    const v = new Visitors.ToSql(testConnection);
    const table = new Table("users");
    const mgr = table.project(star).where(table.get("id").eq(new Nodes.BindParam(42)));
    const [sql, binds] = compileWithBinds(v, mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("42");
    expect(binds).toEqual([42]);
  });

  it("compileWithBinds handles multiple bind params", () => {
    const v = new Visitors.ToSql(testConnection);
    const table = new Table("users");
    const mgr = table
      .project(star)
      .where(table.get("name").eq(new Nodes.BindParam("alice")))
      .where(table.get("age").gt(new Nodes.BindParam(21)));
    const [sql, binds] = compileWithBinds(v, mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("alice");
    expect(sql).not.toContain("21");
    expect(binds).toEqual(["alice", 21]);
  });

  it("compileWithBinds with undefined BindParam", () => {
    const v = new Visitors.ToSql(testConnection);
    const node = new Nodes.BindParam();
    const [sql, binds] = compileWithBinds(v, node);
    expect(sql).toBe("?");
    expect(binds).toHaveLength(1);
  });

  it("accept accepts external collector", () => {
    const v = new Visitors.ToSql(testConnection);
    const table = new Table("users");
    const mgr = table.project(star).where(table.get("name").eq("alice"));

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

    v.accept(mgr.ast, collector);
    // Casted values inline their quoted literal directly (mirrors Rails
    // visit_Arel_Nodes_Casted, to_sql.rb:87-88) — no addBind, no placeholder.
    expect(binds).toHaveLength(0);
    expect(parts.some((p) => typeof p === "string" && p.includes("'alice'"))).toBe(true);
    expect(parts.some((p) => typeof p === "string" && p.includes("users"))).toBe(true);
  });

  it("works with lists", () => {
    const fn = new Nodes.NamedFunction("omg", [star, star]);
    expect(compile(fn)).toBe("omg(*, *)");
  });

  describe("Nodes::ValuesList row dispatch", () => {
    // Rails' `case` (to_sql.rb:106-114) visits only SqlLiteral/BindParam/
    // ActiveModel::Attribute; everything else — including a Casted/Quoted —
    // falls to `quote()`. Routing is asserted through a connection whose
    // `quote` is distinguishable, so this pins which branch each row takes
    // rather than just the rendered text.
    const probe = {
      quoteTableName: (n: string) => `"${n}"`,
      quoteColumnName: (n: string) => `"${n}"`,
      quoteString: (s: string) => s,
      quote: (v: unknown) => `Q(${String(v)})`,
      quotedBinary: (v: unknown) => `'${String(v)}'`,
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v: string) => v,
    } as unknown as Visitors.ArelConnection;

    it("quotes a raw row value instead of visiting it", () => {
      const sql = new Visitors.ToSql(probe).compile(new Nodes.ValuesList([[1, "a"]]));
      expect(sql).toBe("VALUES (Q(1), Q(a))");
    });

    it("visits a SqlLiteral row without quoting it", () => {
      const sql = new Visitors.ToSql(probe).compile(
        new Nodes.ValuesList([[new Nodes.SqlLiteral("DEFAULT")]]),
      );
      expect(sql).toBe("VALUES (DEFAULT)");
    });

    it("sends a Quoted row to quote(), which is where Rails raises TypeError", () => {
      // Rails: quote(Quoted) → to_sql.rb:867-870 → quoting.rb:86
      // `else raise TypeError, "can't quote Arel::Nodes::Quoted"`. Trails'
      // adapter quote does the same (abstract/quoting.ts:151), so a connection
      // that raises proves the row reaches quote() rather than visit.
      const raising = {
        ...probe,
        quote: (v: unknown) => {
          throw new TypeError(`can't quote ${(v as object)?.constructor?.name}`);
        },
      } as unknown as Visitors.ArelConnection;
      expect(() =>
        new Visitors.ToSql(raising).compile(new Nodes.ValuesList([[new Nodes.Quoted(1)]])),
      ).toThrow(/can't quote Quoted/);
    });

    it("visits an ActiveModel::Attribute row instead of quoting it", () => {
      const attr = AMAttribute.fromUser("id", 1, new ValueType());
      const sql = new Visitors.ToSql(probe).compile(new Nodes.ValuesList([[attr]]));
      expect(sql).toBe("VALUES (?)");
    });

    // Rails' `when` at to_sql.rb:110 dispatches on the class, so an object that
    // merely looks like an ActiveModel::Attribute is not one and reaches quote().
    it("quotes an ActiveModel::Attribute duck-type instead of visiting it", () => {
      const sql = new Visitors.ToSql(probe).compile(
        new Nodes.ValuesList([[{ name: "id", valueForDatabase: 1 }]]),
      );
      expect(sql).toBe("VALUES (Q([object Object]))");
    });
  });

  describe("Nodes::BoundSqlLiteral", () => {
    it("works with positional binds", () => {
      const node = new Nodes.BoundSqlLiteral("id = ?", [1]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      // Rails: `add_bind` emits the placeholder (BIND_BLOCK = proc { "?" }) into
      // a plain SQLString collector, so `compile` renders `id = ?`, not the
      // inlined value (to_sql_test.rb).
      expect(sql).toBe("id = ?");
    });

    it("works with named binds", () => {
      const node = new Nodes.BoundSqlLiteral("id = :id", [], { id: 1 });
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("id = ?");
    });

    it("works with array values", () => {
      // Rails to_sql_test.rb: a single positional `?` bound to an array expands
      // through `add_binds` to one placeholder per element.
      const node = new Nodes.BoundSqlLiteral("id IN (?)", [[1, 2, 3]], {});
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("id IN (?, ?, ?)");
    });
  });

  describe("Nodes::Grouping", () => {
    it("wraps nested groupings in brackets only once", () => {
      const compiled = compile(new Nodes.Grouping(new Nodes.Grouping(buildQuoted("foo"))));
      expect(compiled).toBe("('foo')");
    });
  });

  describe("Nodes::Case", () => {
    it("works without default branch", () => {
      const node = new Nodes.Case(table.get("name")).when("foo").then(1);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 END`),
      );
    });

    it("supports #when with two arguments and no #then", () => {
      const node = new Nodes.Case(table.get("name"));
      for (const [condition, result] of Object.entries({ foo: 1, bar: 0 })) {
        node.when(condition, result);
      }
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CASE "users"."name" WHEN 'foo' THEN 1 WHEN 'bar' THEN 0 END`),
      );
    });
  });

  describe("Nodes::Matches", () => {
    it("should know how to visit", () => {
      const node = table.get("name").matches("foo%");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" LIKE 'foo%'`));
    });

    it("can handle ESCAPE", () => {
      const node = table.get("name").matches("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" LIKE 'foo!%' ESCAPE '!'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").matches("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" LIKE 'foo%')`),
      );
    });
  });

  describe("Nodes::NotEqual", () => {
    it("should handle false", () => {
      const val = buildQuoted(false, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("active"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."active" != 'f'`));
    });

    it("should handle nil", () => {
      const val = buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.NotEqual(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NOT NULL`));
    });
  });

  describe("BindParam unboundable short-circuit", () => {
    const unboundable = (sign: 1 | -1) => new Nodes.BindParam({ isUnboundable: () => sign });

    it("GreaterThan short-circuits to 1=0 for positive unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("GreaterThan short-circuits to 1=1 for negative unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("GreaterThanOrEqual short-circuits to 1=0 for positive unboundable", () => {
      const node = new Nodes.GreaterThanOrEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("GreaterThanOrEqual short-circuits to 1=1 for negative unboundable", () => {
      const node = new Nodes.GreaterThanOrEqual(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("LessThanOrEqual short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThanOrEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("LessThanOrEqual short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThanOrEqual(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("Equality short-circuits to 1=0 for any unboundable", () => {
      const node = new Nodes.Equality(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("NotEqual short-circuits to 1=1 for any unboundable", () => {
      const node = new Nodes.NotEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });
  });

  // `BindParam#unboundable?` (bind_param.rb:39-40) delegates to its value's
  // `unboundable?`; the visitor never consults `infinite?` (bind_param.rb:35-37),
  // which exists for `Predications#open_ended?` (predications.rb:248).
  describe("BindParam unboundable short-circuit", () => {
    const unboundable = (sign: 1 | -1) => new Nodes.BindParam({ isUnboundable: () => sign });

    it("GreaterThan short-circuits to 1=0 for positive unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("GreaterThan short-circuits to 1=1 for negative unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("1=0");
    });

    it("an infinite-but-bounded BindParam does not short-circuit", () => {
      const node = new Nodes.GreaterThan(users.get("id"), new Nodes.BindParam(Infinity));
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"users"."id" > ?');
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
    const make = (): ToSqlInternals =>
      new Visitors.ToSql(testConnection) as unknown as ToSqlInternals;

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
      const weird = new Table('we"ird');
      const sql = new Visitors.ToSql(testConnection).compile(weird.get('co"l').eq(1));
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
      const sql = new Table("users").project().toSql();
      expect(sql).toBe('SELECT FROM "users"');
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("GROUP BY");
    });
  });

  describe("Nodes::OptimizerHints (visit)", () => {
    it("emits /*+ HINT */ for an OptimizerHints node with array expr", () => {
      const node = new Nodes.OptimizerHints(["IDX(t1)", "MAX_EXEC_TIME(1000)"]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("/*+ IDX(t1) MAX_EXEC_TIME(1000) */");
    });

    it("strips embedded comment delimiters from each hint (Rails parity)", () => {
      // Mirrors Rails: sanitize_as_sql_comment removes /* and */ so a hint
      // can't escape the surrounding comment block. The literal SQL inside
      // is preserved as comment text — it's still inside /*+ ... */.
      const node = new Nodes.OptimizerHints(["A */ DROP /*"]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("/*+ A DROP */");
      expect(sql.match(/\*\//g)?.length).toBe(1);
    });

    it("accepts SqlLiteral hints (passes through unchanged)", () => {
      const node = new Nodes.OptimizerHints([new Nodes.SqlLiteral("FORCE INDEX (t)")]);
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe("/*+ FORCE INDEX (t) */");
    });
  });

  describe("Nodes::Comment placement", () => {
    it("emits exactly one space before each comment in SelectCore (no double space)", () => {
      const tbl = new Table("users");
      const sql = tbl.project(tbl.get("id")).comment("hi", "bye").toSql();
      expect(sql).toBe('SELECT "users"."id" FROM "users" /* hi */ /* bye */');
      expect(sql).not.toContain("  /*");
    });
  });

  describe("schema-qualified table identifier", () => {
    it("quotes each segment of a schema.table name in SELECT and column refs", () => {
      const tbl = new Table("schema.table");
      const sql = new Visitors.ToSql(testConnection).compile(tbl.project(tbl.get("col")).ast);
      expect(sql).toBe('SELECT "schema"."table"."col" FROM "schema"."table"');
    });
  });

  describe("identifier-escape consistency (helper-routed quoting)", () => {
    it("UPDATE SET column quotes embedded double-quotes", () => {
      const tbl = new Table('tab"le');
      const mgr = new UpdateManager().table(tbl).set([[tbl.get('co"l'), 1]]);
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain('"co""l" = 1');
    });

    it("CTE name escapes embedded double-quotes", () => {
      const inner = new Table("users");
      const cte = new Nodes.Cte('w"in', new SelectManager(inner).project(inner.get("a")).ast);
      const sql = new Visitors.ToSql(testConnection).compile(cte);
      expect(sql).toContain('"w""in" AS');
    });
  });

  describe("Rails-mirrored to_sql tail helpers", () => {
    interface ToSqlInternals {
      isUnboundable(value: unknown): boolean;
      hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean;
      bindBlock(): (index: number) => string;
    }
    const make = () => new Visitors.ToSql(testConnection) as unknown as ToSqlInternals;

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
      const v = new NumberedVisitor(testConnection);
      // Only BindParam routes through addBind (and therefore bindBlock); Casted
      // and Quoted values inline their quoted literal (Rails to_sql.rb:87-88).
      const [sql] = compileWithBinds(
        v,
        tbl
          .where(tbl.get("id").eq(new Nodes.BindParam(1)))
          .where(tbl.get("name").eq(new Nodes.Casted("hi", tbl.get("name"))))
          .project(tbl.get("id")).ast,
      );
      expect(sql).toContain("$1");
      expect(sql).toContain("'hi'");
      expect(sql).not.toContain("?");
    });

    it("visitActiveModelAttribute routes through bindBlock (Rails parity)", () => {
      // ActiveModel::Attribute isn't a Node ctor so it's not reachable
      // through standard dispatch — exercise the visitor method directly
      // to confirm Rails' add_bind(o, &bind_block) shape is preserved.
      class NumberedVisitor extends Visitors.ToSql {
        idx = 0;
        protected override bindBlock(): (i: number) => string {
          return (i: number) => `$${i}`;
        }
      }
      const v = new NumberedVisitor(testConnection);
      const collector = new Collectors.SQLString();
      (
        v as unknown as { visitActiveModelAttribute(o: AMAttribute, c: Collectors.SQLString): void }
      ).visitActiveModelAttribute(
        AMAttribute.fromDatabase("name", "x", new StringType()),
        collector,
      );
      expect(collector.value).toBe("$1");
    });

    it("visitArelSelectManager wraps the manager's AST in parens", () => {
      // Called directly — SelectManager isn't in the dispatch table because
      // it's a TreeManager, not a Node. Mirrors Rails' `visit_Arel_SelectManager`
      // which is invoked when the visitor encounters a SelectManager value.
      const tbl = new Table("users");
      const mgr = new SelectManager(tbl).project(tbl.get("id"));
      const v = new Visitors.ToSql(testConnection);
      const collector = new Collectors.SQLString();
      (
        v as unknown as { visitArelSelectManager(o: { ast: Nodes.Node }, c: unknown): void }
      ).visitArelSelectManager({ ast: mgr.ast as unknown as Nodes.Node }, collector);
      expect(collector.value).toMatch(/^\(SELECT.*\)$/);
    });

    it("visitArelNodesWhen / Else are reachable as standalone visits (Case still works)", () => {
      const tbl = new Table("users");
      const node = new Nodes.Case(tbl.get("status")).when("ok", 1).when("warn", 2)["else"](0);
      const sql = new Visitors.ToSql(testConnection).compile(node);
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
      expect(new Visitors.ToSql(testConnection).compile(whenNode)).toBe(
        'WHEN "users"."status" THEN 1',
      );
      expect(new Visitors.ToSql(testConnection).compile(elseNode)).toBe("ELSE 0");
    });

    // Mirrors Rails to_sql.rb#visit_Arel_Nodes_{Equality,NotEqual,GreaterThan,
    // GreaterThanOrEqual,LessThan,LessThanOrEqual,In,NotIn} short-circuits
    // when the right operand reports `unboundable?` (±Float::INFINITY).
    describe("unboundable short-circuits", () => {
      const tbl = new Table("users");
      const compile = (n: Nodes.Node) => new Visitors.ToSql(testConnection).compile(n);
      const id = tbl.get("id");
      // Rails' `unboundable?` is duck-typed (to_sql.rb:905-907) and only
      // BindParam / QueryAttribute answer it. A raw `Float::INFINITY` — or a
      // Quoted/Casted wrapping one — is *bounded* to the visitor, so it renders
      // as a value instead of collapsing.
      const unbounded = (sign: 1 | -1) => new Nodes.BindParam({ isUnboundable: () => sign });

      it("Equality with an unboundable bind collapses to 1=0", () => {
        expect(compile(id.eq(unbounded(1)))).toBe("1=0");
        expect(compile(id.eq(unbounded(-1)))).toBe("1=0");
      });
      it("NotEqual with an unboundable bind collapses to 1=1", () => {
        expect(compile(id.notEq(unbounded(1)))).toBe("1=1");
        expect(compile(id.notEq(unbounded(-1)))).toBe("1=1");
      });
      it("GreaterThan +1 → 1=0; -1 → 1=1", () => {
        expect(compile(id.gt(unbounded(1)))).toBe("1=0");
        expect(compile(id.gt(unbounded(-1)))).toBe("1=1");
      });
      it("GreaterThanOrEqual +1 → 1=0; -1 → 1=1", () => {
        expect(compile(id.gteq(unbounded(1)))).toBe("1=0");
        expect(compile(id.gteq(unbounded(-1)))).toBe("1=1");
      });
      it("LessThan +1 → 1=1; -1 → 1=0", () => {
        expect(compile(id.lt(unbounded(1)))).toBe("1=1");
        expect(compile(id.lt(unbounded(-1)))).toBe("1=0");
      });
      it("LessThanOrEqual +1 → 1=1; -1 → 1=0", () => {
        expect(compile(id.lteq(unbounded(1)))).toBe("1=1");
        expect(compile(id.lteq(unbounded(-1)))).toBe("1=0");
      });
      it("In filters unboundable values; all-unboundable collapses to 1=0", () => {
        expect(compile(id.in([unbounded(1), unbounded(-1)]))).toBe("1=0");
      });
      it("In retains bounded values when mixed with unboundable", () => {
        expect(compile(id.in([1, unbounded(1), 2]))).toBe('"users"."id" IN (1, 2)');
      });
      it("NotIn filters unboundable values; all-unboundable collapses to 1=1", () => {
        expect(compile(id.notIn([unbounded(1), unbounded(-1)]))).toBe("1=1");
      });
      it("NotIn retains bounded values when mixed with unboundable", () => {
        expect(compile(id.notIn([1, unbounded(1), 2]))).toBe('"users"."id" NOT IN (1, 2)');
      });

      it("a raw Float::INFINITY is bounded and renders as a value", () => {
        // Rails: Float has no `unboundable?`, so `attr.eq(Float::INFINITY)`
        // builds Casted(INFINITY) and renders `= Infinity` via `quote` →
        // `when Numeric then value.to_s` (abstract/quoting.rb:82), which is what
        // the abstract AR adapter path emits. The connection-less default quoter
        // mirrors that and renders non-finite numbers bare; only PostgreSQL's
        // adapter string-quotes them (postgresql/quoting.rb:111-115).
        expect(compile(id.eq(Infinity))).toBe('"users"."id" = Infinity');
        expect(compile(id.gt(-Infinity))).toBe('"users"."id" > -Infinity');
        expect(compile(id.in([1, Infinity, 2]))).toBe('"users"."id" IN (1, Infinity, 2)');
      });

      it("Quoted wrapping INFINITY is bounded too (Quoted has no unboundable?)", () => {
        const eq = new Nodes.Equality(id, new Nodes.Quoted(Infinity));
        expect(compile(eq)).toBe('"users"."id" = Infinity');
      });

      it("bounded comparisons are unaffected", () => {
        expect(compile(id.gt(5))).toBe('"users"."id" > 5');
        expect(compile(id.lt(5))).toBe('"users"."id" < 5');
        expect(compile(id.eq(5))).toBe('"users"."id" = 5');
      });

      it("Equality with null still emits IS NULL (not the unboundable branch)", () => {
        expect(compile(id.eq(null))).toBe('"users"."id" IS NULL');
        expect(compile(id.notEq(null))).toBe('"users"."id" IS NOT NULL');
      });
    });

    describe("unboundableSign protocol", () => {
      interface Internals {
        unboundableSign(v: unknown): 1 | -1 | 0;
        isUnboundable(v: unknown): boolean;
      }
      const v = () => new Visitors.ToSql(testConnection) as unknown as Internals;

      it("returns 0 for values that do not respond to isUnboundable", () => {
        // to_sql.rb:905 — `value.respond_to?(:unboundable?) && value.unboundable?`.
        expect(v().unboundableSign(Infinity)).toBe(0);
        expect(v().unboundableSign(-Infinity)).toBe(0);
        expect(v().unboundableSign(0)).toBe(0);
        expect(v().unboundableSign(null)).toBe(0);
        expect(v().unboundableSign(undefined)).toBe(0);
        expect(v().unboundableSign("foo")).toBe(0);
      });

      it("does not consult isInfinite(), which is a different predicate", () => {
        // `infinite?` serves `Predications#open_ended?` (predications.rb:256-258);
        // the visitor never calls it, and neither Quoted nor Casted defines
        // `unboundable?`. It is defined on Quoted (casted.rb:43-45 — the Quoted
        // class lives in casted.rb) and NOT on Casted (casted.rb:5-35), which is
        // why Casted answers 0 below on both predicates.
        expect(v().unboundableSign(new Nodes.Quoted(Infinity))).toBe(0);
        expect(v().unboundableSign(new Nodes.Quoted(-Infinity))).toBe(0);
        expect(v().unboundableSign({ isInfinite: () => 1 })).toBe(0);
        const casted = new Nodes.Casted(Infinity, new Table("users").get("id"));
        expect(v().unboundableSign(casted)).toBe(0);
      });

      it("BindParam delegates isUnboundable to its value (bind_param.rb:39-40)", () => {
        expect(v().unboundableSign(new Nodes.BindParam({ isUnboundable: () => -1 }))).toBe(-1);
        expect(v().unboundableSign(new Nodes.BindParam(Infinity))).toBe(0);
      });

      it("honours an isUnboundable() protocol returning a sign or boolean", () => {
        // Rails `case`s on the sign (`when 1` / `when -1`, to_sql.rb:438-475),
        // so only those two values collapse. Every producer returns
        // `1 | -1 | false`: QueryAttribute yields `value <=> 0`
        // (query_attribute.rb:46-51) and BindParam delegates.
        expect(v().unboundableSign({ isUnboundable: () => 1 })).toBe(1);
        expect(v().unboundableSign({ isUnboundable: () => -1 })).toBe(-1);
        expect(v().unboundableSign({ isUnboundable: () => false })).toBe(0);
      });

      it("isUnboundable is the truthy wrapper of unboundableSign", () => {
        expect(v().isUnboundable({ isUnboundable: () => 1 })).toBe(true);
        expect(v().isUnboundable({ isUnboundable: () => -1 })).toBe(true);
        expect(v().isUnboundable(Infinity)).toBe(false);
        expect(v().isUnboundable(5)).toBe(false);
        expect(v().isUnboundable(null)).toBe(false);
      });
    });

    it("visitArray handles a mix of Node and primitive entries", () => {
      const tbl = new Table("users");
      const v = new Visitors.ToSql(testConnection);
      const collector = new Collectors.SQLString();
      const visitArray = (
        v as unknown as { visitArray(a: ReadonlyArray<unknown>, c: unknown): void }
      ).visitArray;
      // Rails' `visit_Array` is `inject_join` (to_sql.rb:858-860): each entry
      // goes through `visit`, so a Node and an Integer render while a raw
      // String hits `visit_String` and raises.
      visitArray.call(v, [tbl.get("a"), 1], collector);
      expect(collector.value).toBe('"users"."a", 1');
      expect(() => visitArray.call(v, ["text"], new Collectors.SQLString())).toThrow(
        Visitors.UnsupportedVisitError,
      );
    });
  });

  describe("Quoted/Casted collapse", () => {
    it("Quoted inlines via quote(valueForDatabase) when not extracting binds", () => {
      const visitor = new Visitors.ToSql(testConnection);
      expect(visitor.compile(new Nodes.Quoted("hi"))).toBe("'hi'");
    });

    it("Quoted Temporal.Instant binds through unified addBind path under extractBinds", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const instant = Temporal.Instant.from("2026-04-30T12:34:56.000Z");
      const [sql, binds] = compileWithBinds(visitor, new Nodes.Quoted(instant));
      expect(sql).toContain("2026-04-30");
      expect(sql).not.toContain("?");
      expect(binds).toHaveLength(0);
    });

    it("Quoted non-Date inlines under extractBinds=false", () => {
      const visitor = new Visitors.ToSql(testConnection);
      expect(visitor.compile(new Nodes.Quoted(42))).toBe("42");
    });

    it("Quoted string binds raw under extractBinds", () => {
      const [sql, binds] = compileWithBinds(
        new Visitors.ToSql(testConnection),
        new Nodes.Quoted("hi"),
      );
      expect(sql).toBe("'hi'");
      expect(binds).toHaveLength(0);
    });

    it("Quoted number binds raw under extractBinds", () => {
      const [sql, binds] = compileWithBinds(
        new Visitors.ToSql(testConnection),
        new Nodes.Quoted(42),
      );
      expect(sql).toBe("42");
      expect(binds).toHaveLength(0);
    });

    it("Quoted toISOString-bearing object binds raw under extractBinds", () => {
      const value = Temporal.Instant.from("2026-04-30T00:00:00.000Z");
      const [sql, binds] = compileWithBinds(
        new Visitors.ToSql(testConnection),
        new Nodes.Quoted(value),
      );
      expect(sql).toBe("'2026-04-30 00:00:00'");
      expect(binds).toHaveLength(0);
    });
  });

  describe("Nodes::Lock", () => {
    it("visits the inner expr (no FOR UPDATE fallback)", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = new Nodes.Lock(new Nodes.SqlLiteral("FOR SHARE"));
      expect(visitor.compile(node)).toBe("FOR SHARE");
    });

    it("SelectManager#lock wraps default in SqlLiteral", () => {
      expect(users.project(star).lock().toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
    });

    it("SelectManager#lock with custom string wraps in SqlLiteral", () => {
      expect(users.project(star).lock("FOR SHARE").toSql()).toBe('SELECT * FROM "users" FOR SHARE');
    });
  });

  describe("OuterJoin guard", () => {
    it("OuterJoin without an ON throws", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = new Nodes.OuterJoin(users, null);
      expect(() => visitor.compile(node)).toThrow();
    });

    it("RightOuterJoin without an ON throws", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = new Nodes.RightOuterJoin(users, null);
      expect(() => visitor.compile(node)).toThrow();
    });

    it("FullOuterJoin without an ON throws", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = new Nodes.FullOuterJoin(users, null);
      expect(() => visitor.compile(node)).toThrow();
    });
  });

  describe("Table with Node name", () => {
    it("visits the Node when name is an Arel Node", () => {
      const tbl = new Table("ignored");
      (tbl as unknown as { name: Nodes.Node }).name = new Nodes.SqlLiteral("my_subq");
      expect(new Visitors.ToSql(testConnection).compile(tbl)).toBe("my_subq");
    });
  });

  describe("UpdateManager subselect", () => {
    it("renders WHERE pk IN (SELECT pk ...) when limit is present", () => {
      const um = new UpdateManager();
      um.table(users);
      um.set([[users.get("name"), "x"]]);
      um.take(1);
      um.key = users.get("id");
      const sql = new Visitors.ToSql(testConnection).compile(um.ast);
      expect(sql).toContain('IN (SELECT "users"."id"');
    });
  });

  describe("DeleteManager subselect", () => {
    it("renders WHERE pk IN (SELECT pk ...) when limit is present", () => {
      const dm = new DeleteManager();
      dm.from(users);
      dm.take(1);
      dm.key = users.get("id");
      const sql = new Visitors.ToSql(testConnection).compile(dm.ast);
      expect(sql).toContain('IN (SELECT "users"."id"');
    });
  });
});

describe("ArelQuoter / defaultQuoter wiring", () => {
  const users = new Table("users");

  it("default quoter emits double-quoted identifiers", () => {
    const sql = new Visitors.ToSql(testConnection).compile(users.get("id").eq(1));
    expect(sql).toContain('"users"."id"');
  });

  it("default quoter: schema-qualified name is split and each part double-quoted", () => {
    const t = new Table("test_schema.things");
    const sql = new Visitors.ToSql(testConnection).compile(t.project(t.star).ast);
    expect(sql).toContain('"test_schema"."things".*');
    expect(sql).toContain('FROM "test_schema"."things"');
  });

  it("default quoter: quoted table name with dot is preserved as single identifier", () => {
    const t = new Table('test_schema."things.table"');
    const sql = new Visitors.ToSql(testConnection).compile(t.project(t.star).ast);
    expect(sql).toContain('"test_schema"."things.table".*');
    expect(sql).toContain('FROM "test_schema"."things.table"');
  });

  it("stub quoter: quoteTableName output appears in compiled SQL", () => {
    const stubQuoter: Visitors.ArelConnection = {
      quoteTableName: (name) => `<<${name}>>`,
      quoteColumnName: (name) => `<<${name}>>`,
      quoteString: (s) => s.replace(/'/g, "''"),
      quote: (v) => (v === null ? "NULL" : `'${v}'`),
      quotedBinary: (v) => `'${v}'`,
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v) => v,
      castBoundValue: (v) => v,
    };
    const sql = new Visitors.ToSql(stubQuoter).compile(users.get("id").eq(1));
    expect(sql).toContain("<<users>>");
  });

  it("Uint8Array in value position is routed through quoter.quote(), not String()", () => {
    // Guards against the String(Uint8Array) → comma-joined decimals ('31,139')
    // corruption path. The visitor hands the raw value to `connection.quote`
    // (to_sql.rb:867-870); the connection dispatches binary to quotedBinary and
    // emits the correct dialect binary literal.
    const received: unknown[] = [];
    const stubQuoter: Visitors.ArelConnection = {
      quoteTableName: (name) => `"${name}"`,
      quoteColumnName: (name) => `"${name}"`,
      quoteString: (s) => s.replace(/'/g, "''"),
      quote: (v) => (v instanceof Uint8Array ? stubQuoter.quotedBinary(v) : `'${v}'`),
      quotedBinary: (v) => {
        received.push(v);
        return v instanceof Uint8Array ? `'\\x${Buffer.from(v).toString("hex")}'` : `'${v}'`;
      },
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v) => v,
      castBoundValue: (v) => v,
    };
    const bytes = new Uint8Array([0x1f, 0x8b]);
    const node = users.get("payload").eq(bytes);
    new Visitors.ToSql(stubQuoter).compile(node);
    expect(received).toContain(bytes);
  });

  it("integers in raw value position bypass quote(), matching Rails visit_Integer", () => {
    // Rails' raw-value dispatch sends an Integer to `visit_Integer`, which is
    // `collector << o.to_s` (to_sql.rb:824-826) — the connection is never
    // consulted. `quote` governs the Casted-node path (to_sql.rb:87-90), not
    // this one. A quoter that mangles everything must therefore not be able to
    // reach an integer here.
    const quoted: unknown[] = [];
    class RecordingToSql extends Visitors.ToSql {
      protected override quote(value: unknown): string {
        quoted.push(value);
        return `<<${String(value)}>>`;
      }
    }
    // A raw JS number reaches the visitor only when placed directly into a
    // node; `.in([1, 2])` instead wraps each value in a Casted node via
    // `quotedNode`, which is the to_sql.rb:87-90 path and does route through
    // quote(). InfixOperation carries the raw value through unwrapped.
    const sql = new RecordingToSql(testConnection).compile(
      new Nodes.InfixOperation(
        "+",
        new Nodes.InfixOperation("+", users.get("id"), 1),
        9007199254740993n,
      ),
    );
    expect(quoted).toEqual([]);
    expect(sql).toContain("+ 1");
    expect(sql).toContain("+ 9007199254740993");
  });

  it("Casted values do route through quote(), unlike raw integers", () => {
    // The companion to the guard above: to_sql.rb:87-90 sends a Casted /
    // Quoted node's value through quote(), so the two paths must differ.
    const quoted: unknown[] = [];
    class RecordingToSql extends Visitors.ToSql {
      protected override quote(value: unknown): string {
        quoted.push(value);
        return super.quote(value);
      }
    }
    new RecordingToSql(testConnection).compile(users.get("id").in([1, 2]));
    expect(quoted).toEqual([1, 2]);
  });
});
